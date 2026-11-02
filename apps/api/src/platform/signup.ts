import type { Context } from "hono";
import type { AppEnv } from "../env";
import { HttpError } from "../core/errors";
import { hashPassword, randomToken } from "../core/crypto";
import { originGuard } from "../core/pipeline";
import { publicApi, publicRateLimit } from "../core/public";
import { issueSession } from "../core/session";
import { isValidSlug, normalizeSlug, slugFromHost } from "../core/tenant";
import { services } from "../core/services";
import { platformRepo, signupRepo } from "../data/platform";
import { rateHit } from "../data/infra";
import { tenantRepo } from "../data/tenant";
import { billPrefixFor, countryDefaults } from "../lib/countries";
import { SIGNUP_PER_HOUR, hourWindow } from "../lib/limits";
import { auth } from "./auth";

const DAY = 86_400_000;
export const TRIAL_DAYS = 7;
export const GRACE_DAYS = 7;
/** How long the post-signup sign-in link works. */
export const HANDOFF_MS = 120_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const bad = (m: string) => new HttpError(400, m);
const ip = (c: Context<AppEnv>) => c.req.header("CF-Connecting-IP") ?? "unknown";

async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** GET /api/public/slug?s= — is this salon ID free? { slug, available, reason? } */
publicApi.get("/slug", publicRateLimit("slug"), async (c) => {
  const slug = normalizeSlug(c.req.query("s") ?? "");
  if (!isValidSlug(slug)) return c.json({ slug, available: false, reason: "invalid" });
  const problem = await signupRepo(c.env.DB).slugProblem(slug);
  return c.json(problem ? { slug, available: false, reason: problem } : { slug, available: true });
});

/**
 * POST /api/public/signup — a new salon on a 7-day Pro Max trial, created in one batch (all or nothing), plus a
 * single-use link that signs the owner in on their own subdomain. Same-origin only (the site posts from salonkit.online).
 */
publicApi.post("/signup", originGuard, async (c) => {
  const at = Date.now();
  if ((await rateHit(c.env.DB, `signup:${ip(c)}`, hourWindow(at))) > SIGNUP_PER_HOUR) {
    c.header("Retry-After", "3600");
    throw new HttpError(429, "Too many signups from here. Try again in an hour.");
  }
  let b: Record<string, unknown> = {};
  try {
    const parsed = await c.req.json();
    if (parsed && typeof parsed === "object") b = parsed as Record<string, unknown>;
  } catch {
    /* validation below */
  }
  const str = (k: string, max: number) => (typeof b[k] === "string" ? (b[k] as string).trim().slice(0, max + 1) : "");
  const salonName = str("salon_name", 80);
  const ownerName = str("owner_name", 80);
  const email = str("email", 120).toLowerCase();
  const phone = str("phone", 20);
  const country = str("country", 2).toUpperCase();
  const password = typeof b.password === "string" ? b.password : "";
  const slug = normalizeSlug(str("slug", 30));
  if (salonName.length < 2 || salonName.length > 80) throw bad("Enter your salon's name");
  if (ownerName.length < 2 || ownerName.length > 80) throw bad("Enter your name");
  if (!EMAIL_RE.test(email) || email.length > 120) throw bad("Enter a valid email");
  if (phone && !/^\+?[0-9 ]{6,20}$/.test(phone)) throw bad("Enter a valid mobile number");
  if (password.length < 8 || password.length > 200) throw bad("Password must be at least 8 characters");
  if (!isValidSlug(slug)) throw bad("Salon ID: 3-30 letters, numbers or dashes");

  if (c.env.TURNSTILE_SECRET) {
    const token = typeof b.turnstile === "string" ? b.turnstile : "";
    if (!token || !(await services(c.env).turnstile.verify(c.env.TURNSTILE_SECRET, token, ip(c)))) throw bad("Please complete the check");
  }

  const repo = signupRepo(c.env.DB);
  const problem = await repo.slugProblem(slug);
  if (problem) throw new HttpError(409, problem === "reserved" ? "That salon ID can't be used" : "That salon ID is taken", "slug_taken");
  if (await repo.emailTaken(email)) throw new HttpError(409, "There is already a salon with this email. Sign in instead.", "email_taken");

  const token = randomToken(24);
  const defaults = countryDefaults(country || "AE");
  try {
    await repo.create({
      orgId: `org_${randomToken(12)}`,
      slug,
      salonName,
      ownerName,
      ownerUsername: email,
      ownerEmail: email,
      ownerPhone: phone || null,
      passwordHash: await hashPassword(password),
      country: defaults.country,
      defaults,
      billPrefix: billPrefixFor(slug),
      handoffHash: await sha256(token),
      now: at,
      trialEndsAt: at + TRIAL_DAYS * DAY,
      graceEndsAt: at + (TRIAL_DAYS + GRACE_DAYS) * DAY,
      handoffExpiresAt: at + HANDOFF_MS,
    });
  } catch (e) {
    // A signup that raced ours to the same salon ID or email: the batch failed whole, nothing was written.
    if (/UNIQUE constraint failed/i.test(String((e as Error)?.message ?? e))) {
      const email = /owner_email/i.test(String((e as Error)?.message));
      throw new HttpError(409, email ? "There is already a salon with this email. Sign in instead." : "That salon ID is taken", email ? "email_taken" : "slug_taken");
    }
    throw e;
  }
  const root = c.env.ROOT_DOMAIN;
  const q = `handoff=${encodeURIComponent(token)}`;
  const handoff_url = root ? `https://${slug}.${root}/login/?${q}` : `/login/?org=${encodeURIComponent(slug)}&${q}`;
  return c.json({ slug, handoff_url }, 201);
});

/** POST /api/auth/handoff {token, org?} — exchanges a signup handoff for a session, once, on the salon's own host. */
auth.post("/handoff", originGuard, async (c) => {
  let b: { token?: unknown; org?: unknown } = {};
  try {
    b = (await c.req.json()) ?? {};
  } catch {
    /* refused below */
  }
  const fail = (code?: string) => new HttpError(401, "This sign-in link has expired. Sign in with your password.", code);
  if (typeof b.token !== "string" || b.token.length > 100) throw fail();
  const host = slugFromHost(new URL(c.req.url).host, c.env.ROOT_DOMAIN, c.env.ADMIN_HOST);
  const slug = host.kind === "tenant" ? host.slug : host.kind === "none" && typeof b.org === "string" ? normalizeSlug(b.org) : "";
  const org = slug ? await platformRepo(c.env.DB).orgBySlug(slug) : null;
  if (!org || org.status === "deactivated" || org.status === "deleted") throw fail();
  const used = await signupRepo(c.env.DB).consumeHandoff(await sha256(b.token), Date.now());
  if (!used) throw fail();
  if (used.orgId !== org.id) throw fail("wrong_org");
  const user = await tenantRepo(c.env.DB, org.id).userById(used.userId);
  if (!user || !user.active) throw fail();
  await issueSession(c, { uid: user.id, orgId: org.id, v: user.session_version });
  return c.json({ ok: true, slug: org.slug });
});
