import { Hono, type Context, type MiddlewareHandler } from "hono";
import type { AppEnv } from "../env";
import { HttpError } from "./errors";
import { slugFromHost } from "./tenant";
import { platformRepo, type Org } from "../data/platform";
import { rateHit } from "../data/infra";
import { PUBLIC_LIMITS, minuteWindow } from "../lib/limits";
import { ratingsRepo, salesRepo, settingsRepo } from "../data/tenant";
import { featuresFor } from "./features-cache";
import { orgAppUrl } from "./links";
import { notifyUsers } from "../tenant/notifications/notify";
import { notificationsRepo } from "../data/tenant";
import { firstName } from "../lib/names";
import type { FeedbackInput, FeedbackPage, Receipt, Sale, Settings } from "@ss/contract";

/** Public (no session) routes. Mounted at /api/public BEFORE the tenant router; every route here is public by design. */
export const publicApi = new Hono<AppEnv>();

/**
 * The org a public request is for: the host's tenant slug, else `?org=<slug>` when ROOT_DOMAIN is empty (workers.dev).
 * Null for unknown, deactivated or deleted orgs. A tenant host never falls back to ?org=.
 */
export async function resolvePublicOrg(c: Context<AppEnv>): Promise<Org | null> {
  const url = new URL(c.req.url);
  const host = slugFromHost(url.host, c.env.ROOT_DOMAIN, c.env.ADMIN_HOST);
  let slug: string | null = null;
  if (host.kind === "tenant") slug = host.slug;
  else if (host.kind === "none" && !c.env.ROOT_DOMAIN) slug = url.searchParams.get("org");
  if (!slug) return null;
  const org = await platformRepo(c.env.DB).orgBySlug(slug);
  if (!org || org.status === "deactivated" || org.status === "deleted") return null;
  return org;
}

/** Per-IP fixed-window limiter backed by the global rate_hits table. */
export function publicRateLimit(bucket: keyof typeof PUBLIC_LIMITS): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
    const at = Date.now();
    const n = await rateHit(c.env.DB, `${bucket}:${ip}`, minuteWindow(at));
    if (n > PUBLIC_LIMITS[bucket]) {
      c.header("Retry-After", String(60 - Math.floor((at % 60_000) / 1000)));
      throw new HttpError(429, "Too many requests");
    }
    await next();
  };
}

// Test-only probes (checked per request because env is per-request in Workers).
const probe = (c: Context<AppEnv>, org: Org | null) =>
  c.env.ENVIRONMENT === "test" ? c.json({ org: org?.slug ?? null }) : c.json({ error: "Not found" }, 404);
publicApi.get("/_probe", publicRateLimit("pub"), async (c) => probe(c, await resolvePublicOrg(c)));
publicApi.get("/_probe/pdf", publicRateLimit("pdf"), async (c) => probe(c, await resolvePublicOrg(c)));

/** FM receiptOf: the printable bill. No ids, token, commission or cost fields. */
export function receiptOf(sale: Sale, s: Settings): Receipt {
  return {
    sale: {
      bill_no: sale.bill_no,
      day: sale.day,
      barber_name: sale.barber_name,
      customer_label: sale.customer_label,
      customer_phone: sale.customer_phone,
      amount: sale.amount,
      payment_mode: sale.payment_mode,
      vat_rate: sale.vat_rate,
      vat_amount: sale.vat_amount,
      created_at: sale.created_at,
      items: sale.items,
      note: sale.note,
    },
    salon: {
      salon_name: s.display_name,
      display_name: s.display_name,
      salon_name_ar: s.salon_name_ar,
      tagline: s.tagline,
      address: s.address,
      phone: s.phone,
      trn: s.trn,
      licence_no: s.licence_no,
      receipt_footer: s.receipt_footer,
      logo_url: s.logo_url,
      currency: s.currency,
      currency_minor: s.currency_minor,
      locale: s.locale,
      timezone: s.timezone,
    },
  };
}

const TOKEN_RE = /^[A-Za-z0-9_-]{8,64}$/;

/** Public receipt. The org comes from the token's sale row, not the host: the token is the capability. */
publicApi.get("/receipt/:token", publicRateLimit("pub"), async (c) => {
  const token = c.req.param("token");
  const notFound = () => c.json({ error: "Not found" }, 404);
  if (!TOKEN_RE.test(token)) return notFound();
  const org = await platformRepo(c.env.DB).orgBySaleToken(token);
  if (!org || org.status === "deactivated" || org.status === "deleted") return notFound();
  const sale = await salesRepo(c.env.DB, org.id).byToken(token);
  if (!sale) return notFound();
  return c.json(receiptOf(sale, await settingsRepo(c.env.DB, org.id).get()));
});

// ---- Ratings (feature `ratings`): the org comes from the token's sale row, like the receipt ----

const COMMENT_MAX = 500;

interface RatedSale {
  org: Org;
  sale: Sale;
}

/** The live sale and its org for a public ratings route; null (-> 404) for a bad token, deleted sale, lapsed org or no `ratings`. */
async function ratedSale(c: Context<AppEnv>, token: string): Promise<RatedSale | null> {
  if (!TOKEN_RE.test(token)) return null;
  const org = await platformRepo(c.env.DB).orgBySaleToken(token);
  if (!org || org.status === "deactivated" || org.status === "deleted") return null;
  if (!(await featuresFor(c.env.DB, org)).features.includes("ratings")) return null;
  const sale = await salesRepo(c.env.DB, org.id).byToken(token);
  return sale ? { org, sale } : null;
}

async function feedbackPage(c: Context<AppEnv>, { org, sale }: RatedSale): Promise<FeedbackPage> {
  const ratings = ratingsRepo(c.env.DB, org.id);
  const [s, r, name] = await Promise.all([
    settingsRepo(c.env.DB, org.id).get(),
    ratings.forSale(sale.id),
    sale.customer_id ? ratings.customerName(sale.customer_id) : null,
  ]);
  const first = firstName(name ?? sale.customer_label);
  return {
    first_name: first === "there" ? "" : first,
    barber_name: sale.barber_name,
    bill_no: sale.bill_no,
    day: sale.day,
    salon_name: s.display_name,
    phone: s.phone,
    google_review_url: s.google_review_url,
    instagram_url: s.instagram_url,
    stars: r?.stars ?? null,
    comment: r?.comment ?? null,
  };
}

/** The public rating page's data for a bill (/rate/?t=<token>). */
publicApi.get("/feedback/:token", publicRateLimit("pub"), async (c) => {
  const rs = await ratedSale(c, c.req.param("token"));
  if (!rs) return c.json({ error: "Not found" }, 404);
  return c.json(await feedbackPage(c, rs));
});

/**
 * Saves the customer's rating (one per bill; sending again updates it). Stars 3 or fewer alert this org's admins, but only
 * for a first rating or when it drops from 4+ to 3-, so repeated edits do not spam them.
 */
publicApi.post("/feedback/:token", publicRateLimit("pub"), async (c) => {
  const rs = await ratedSale(c, c.req.param("token"));
  if (!rs) return c.json({ error: "Not found" }, 404);
  const { org, sale } = rs;
  const raw = await c.req.json().catch(() => null);
  const b: Partial<FeedbackInput> = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const stars = typeof b.stars === "number" || typeof b.stars === "string" ? Number(b.stars) : NaN;
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new HttpError(400, "Pick 1 to 5 stars");
  const comment = typeof b.comment === "string" ? b.comment.trim().slice(0, COMMENT_MAX).trim() || null : null;

  const repo = ratingsRepo(c.env.DB, org.id);
  const before = await repo.forSale(sale.id);
  await repo.upsert(sale, stars, comment);
  if (stars <= 3 && (!before || before.stars > 3)) {
    const ids = await notificationsRepo(c.env.DB, org.id).adminIds();
    await notifyUsers(c.env, org.id, ids, {
      title: `${"★".repeat(stars)}${"☆".repeat(5 - stars)} from ${sale.customer_label} · ${sale.barber_name}`,
      body: comment ? comment.slice(0, 140) : `Bill ${sale.bill_no}: call the customer to make it right.`,
      path: "/ratings/",
      tag: `rating-${sale.id}`,
    });
  }
  return c.json(await feedbackPage(c, rs));
});

/**
 * "Rate your visit" (from /rate/?t=<token>): notes the first tap so the reminder skips this customer, then sends the browser
 * to the org's Google review page (https only), else back to the org's own rating page.
 */
publicApi.get("/review/:token", publicRateLimit("pub"), async (c) => {
  const token = c.req.param("token");
  const rs = await ratedSale(c, token);
  if (!rs) return c.json({ error: "Not found" }, 404);
  const { org } = rs;
  const [s] = await Promise.all([settingsRepo(c.env.DB, org.id).get(), ratingsRepo(c.env.DB, org.id).markReviewClicked(token)]);
  const url = /^https:\/\//i.test(s.google_review_url ?? "") ? s.google_review_url! : `${orgAppUrl(c.env, org)}/rate/?t=${token}`;
  c.header("Cache-Control", "no-store");
  return c.redirect(url, 302);
});
