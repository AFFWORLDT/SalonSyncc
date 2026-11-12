/**
 * The site newsletter (salonkit.online footer), double opt-in:
 *   POST /api/public/newsletter               {email, lang?, website?}  stores a pending row and emails a confirm link
 *   GET  /api/public/newsletter/confirm?t=     confirms, then redirects to /newsletter/?s=confirmed (or /ar/newsletter/)
 *   GET|POST /api/public/newsletter/unsubscribe?t=   unsubscribes (POST = one-click from mail apps), then redirects
 * Always answers {ok:true} for a valid email, so it never tells whether an address is already on the list.
 * Limits: 5 sign-ups per IP per hour, and one confirmation email per address per 24 hours.
 */
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { HttpError } from "../core/errors";
import { originGuard } from "../core/pipeline";
import { publicApi } from "../core/public";
import { randomToken } from "../core/crypto";
import { services } from "../core/services";
import { rateHit } from "../data/infra";
import { hourWindow } from "../lib/limits";
import { newsletterConfirmEmail } from "../emails/newsletter";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const NEWSLETTER_PER_IP_HOUR = 5;
const DAY = 86_400_000;

type Row = { email: string; lang: string; status: string; token: string; created_at: number };

const siteOf = (c: Context<AppEnv>) => (c.env.ROOT_DOMAIN ? `https://${c.env.ROOT_DOMAIN}` : new URL(c.req.url).origin);
const page = (c: Context<AppEnv>, lang: string, s: string) => `${siteOf(c)}${lang === "ar" ? "/ar" : ""}/newsletter/?s=${s}`;

publicApi.post("/newsletter", originGuard, async (c) => {
  let b: { email?: unknown; lang?: unknown; website?: unknown } = {};
  try {
    const parsed = await c.req.json();
    if (parsed && typeof parsed === "object") b = parsed;
  } catch {
    /* falls through to the email check */
  }
  // Hidden field: only bots fill it. Pretend it worked.
  if (typeof b.website === "string" && b.website.trim()) return c.json({ ok: true });
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 254) throw new HttpError(400, b.lang === "ar" ? "أدخل بريدًا إلكترونيًا صحيحًا" : "Enter a valid email address", "email");
  const lang = b.lang === "ar" ? "ar" : "en";
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const at = Date.now();
  if ((await rateHit(c.env.DB, `nl-ip:${ip}`, hourWindow(at))) > NEWSLETTER_PER_IP_HOUR) {
    c.header("Retry-After", "3600");
    throw new HttpError(429, lang === "ar" ? "محاولات كثيرة. حاول بعد ساعة." : "Too many sign-ups from here. Try again in an hour.");
  }
  const db = c.env.DB;
  const row = await db.prepare("SELECT * FROM newsletter_subscribers WHERE email = ?").bind(email).first<Row>();
  if (row?.status === "confirmed") return c.json({ ok: true });
  // At most one confirmation email per address per day (so the form can't be used to flood someone's inbox).
  if (row?.status === "pending" && at - row.created_at < DAY) return c.json({ ok: true });
  const token = randomToken(18);
  await db
    .prepare(
      `INSERT INTO newsletter_subscribers (email, lang, status, token, created_at) VALUES (?, ?, 'pending', ?, ?)
       ON CONFLICT(email) DO UPDATE SET lang = excluded.lang, status = 'pending', token = excluded.token, created_at = excluded.created_at, confirmed_at = NULL, unsubscribed_at = NULL`,
    )
    .bind(email, lang, token, at)
    .run();
  const api = `${new URL(c.req.url).origin}/api/public/newsletter`;
  const mail = newsletterConfirmEmail({
    brand: c.env.BRAND_NAME,
    siteUrl: siteOf(c),
    confirmUrl: `${api}/confirm?t=${token}`,
    unsubscribeUrl: `${api}/unsubscribe?t=${token}`,
    lang,
  });
  c.executionCtx.waitUntil(services(c.env).mail.send(c.env, { to: email, ...mail }));
  return c.json({ ok: true });
});

async function byToken(c: Context<AppEnv>): Promise<Row | null> {
  const t = c.req.query("t") ?? "";
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(t)) return null;
  return c.env.DB.prepare("SELECT * FROM newsletter_subscribers WHERE token = ?").bind(t).first<Row>();
}

publicApi.get("/newsletter/confirm", async (c) => {
  const row = await byToken(c);
  if (!row) return c.redirect(page(c, "en", "invalid"), 302);
  if (row.status !== "confirmed") await c.env.DB.prepare("UPDATE newsletter_subscribers SET status = 'confirmed', confirmed_at = ?, unsubscribed_at = NULL WHERE email = ?").bind(Date.now(), row.email).run();
  return c.redirect(page(c, row.lang, "confirmed"), 302);
});

const unsubscribe = async (c: Context<AppEnv>) => {
  const row = await byToken(c);
  if (row && row.status !== "unsubscribed") await c.env.DB.prepare("UPDATE newsletter_subscribers SET status = 'unsubscribed', unsubscribed_at = ? WHERE email = ?").bind(Date.now(), row.email).run();
  return c.req.method === "POST" ? c.json({ ok: true }) : c.redirect(page(c, row?.lang ?? "en", row ? "unsubscribed" : "invalid"), 302);
};
publicApi.get("/newsletter/unsubscribe", unsubscribe);
publicApi.post("/newsletter/unsubscribe", unsubscribe);
