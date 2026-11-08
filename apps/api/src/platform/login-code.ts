/**
 * Sign in with an emailed code instead of a password, after the salon ID (web and phone app):
 *   POST /api/auth/code         {org?, email}        emails a 6-digit code to the staff member with that email
 *   POST /api/auth/code/verify  {org?, email, code}  web: a session cookie, like /login
 * The phone app sends {email, code} to POST /api/mobile/session instead of a password (see mobile.ts).
 * Asking always answers {ok:true}, so it never tells whether an email belongs to the salon.
 */
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { HttpError } from "../core/errors";
import { originGuard } from "../core/pipeline";
import { issueSession } from "../core/session";
import { normalizeSlug, slugFromHost } from "../core/tenant";
import { services } from "../core/services";
import { orgAppUrl } from "../core/links";
import { platformRepo, type Org } from "../data/platform";
import { tenantRepo, type UserRow } from "../data/tenant";
import { rateCount, rateHit } from "../data/infra";
import { sha256 } from "../lib/hash";
import { LOGIN_WINDOW_MS, hourWindow, isLocked, loginLimits, loginWindow } from "../lib/limits";
import { loginCodeEmail } from "../emails/login-code";
import { auth } from "./auth";

export const CODE_TTL_MS = 10 * 60_000;
export const CODE_MAX_TRIES = 5;
/** Codes asked for: per device per 15 minutes, and per email address per hour. */
export const CODE_ASKS = { ip: 10, email: 5 } as const;

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const BAD_CODE = "That code is wrong or has expired";
const LOCKED = "Too many attempts. Try again in a few minutes.";

auth.use("/code", originGuard);
auth.use("/code/verify", originGuard);

async function body(c: Context<AppEnv>): Promise<Record<string, unknown>> {
  const b = await c.req.json().catch(() => null);
  return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
}

const emailOf = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");

/** The live salon this request is for: the host's, or body.org off a salon host (as for the password sign-in). */
async function orgFor(c: Context<AppEnv>, org: unknown): Promise<Org | null> {
  const host = slugFromHost(new URL(c.req.url).host, c.env.ROOT_DOMAIN, c.env.ADMIN_HOST);
  const slug = host.kind === "tenant" ? host.slug : host.kind === "none" && typeof org === "string" ? normalizeSlug(org) : "";
  const o = slug ? await platformRepo(c.env.DB).orgBySlug(slug) : null;
  return o && o.status !== "deactivated" && o.status !== "deleted" ? o : null;
}

/** A code is hashed with its salon and user, so the same digits for someone else never match. */
const codeHash = (orgId: string, userId: number, code: string) => sha256(`login-code:${orgId}:${userId}:${code}`);

function sixDigits(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000;
  return String(n).padStart(6, "0");
}

auth.post("/code", async (c) => {
  const b = await body(c);
  const email = emailOf(b.email);
  if (!EMAIL_RE.test(email) || email.length > 254) throw new HttpError(400, "Enter the email address on your staff profile");
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const at = Date.now();
  const org = await orgFor(c, b.org);
  const [byIp, byEmail] = await Promise.all([
    rateHit(c.env.DB, `code-ip:${ip}`, loginWindow(at)),
    rateHit(c.env.DB, `code-email:${org?.id ?? "-"}:${encodeURIComponent(email)}`, hourWindow(at)),
  ]);
  if (byIp > CODE_ASKS.ip || byEmail > CODE_ASKS.email) throw new HttpError(429, LOCKED);
  const repo = org ? tenantRepo(c.env.DB, org.id) : null;
  const user = repo ? await repo.userByEmail(email) : null;
  if (org && repo && user) {
    const code = sixDigits();
    await repo.putLoginCode(user.id, await codeHash(org.id, user.id, code), at + CODE_TTL_MS);
    const s = await repo.settings();
    const site = c.env.ROOT_DOMAIN ? `https://${c.env.ROOT_DOMAIN}` : orgAppUrl(c.env, org);
    const mail = loginCodeEmail({ brand: c.env.BRAND_NAME, siteUrl: site, salonName: s.displayName || org.name, to: email, name: user.name, code, minutes: CODE_TTL_MS / 60_000 });
    // After the response, so a known and an unknown email answer equally fast.
    c.executionCtx.waitUntil(services(c.env).mail.send(c.env, mail).then((ok) => (ok ? undefined : console.error("login code email not sent"))));
  }
  return c.json({ ok: true });
});

/** Checks {org?, email, code} with the password sign-in's throttling; the code works once. Throws 401/429 like verifyLogin. */
export async function verifyCode(c: Context<AppEnv>, b: Record<string, unknown>): Promise<{ org: Org; user: UserRow }> {
  const email = emailOf(b.email);
  const code = typeof b.code === "string" ? b.code.replace(/\s+/g, "") : "";
  const org = await orgFor(c, b.org);
  const repo = org ? tenantRepo(c.env.DB, org.id) : null;
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const at = Date.now();
  const [dev, perDevice, anywhere] = loginLimits(org?.id ?? "", email, ip) as [{ key: string; max: number }, { key: string; max: number }, { key: string; max: number }];
  const keys = [perDevice.key, anywhere.key];
  const [ipCount, deviceUser, anyUser] = await Promise.all([
    rateCount(c.env.DB, dev.key, loginWindow(at)),
    repo && email ? repo.loginFailureCount(perDevice.key, at - LOGIN_WINDOW_MS) : 0,
    repo && email ? repo.loginFailureCount(anywhere.key, at - LOGIN_WINDOW_MS) : 0,
  ]);
  if (isLocked(ipCount, dev.max) || isLocked(deviceUser, perDevice.max) || isLocked(anyUser, anywhere.max)) throw new HttpError(429, LOCKED);

  const user = repo && EMAIL_RE.test(email) ? await repo.userByEmail(email) : null;
  const row = repo && user && /^\d{6}$/.test(code) ? await repo.loginCode(user.id) : null;
  const live = row && row.expires_at > at && row.attempts < CODE_MAX_TRIES ? row : null;
  const hash = org && user ? await codeHash(org.id, user.id, code) : "";
  const ok = !!(live && repo && user && live.code_hash === hash && (await repo.useLoginCode(user.id, hash)));
  if (!ok || !org || !repo || !user) {
    await rateHit(c.env.DB, dev.key, loginWindow(at));
    if (repo && email) await repo.recordLoginFailure(keys, at, at - LOGIN_WINDOW_MS);
    if (row && repo && user) await repo.loginCodeMiss(user.id);
    throw new HttpError(401, BAD_CODE);
  }
  await repo.clearLoginFailures(keys);
  return { org, user };
}

auth.post("/code/verify", async (c) => {
  const { org, user } = await verifyCode(c, await body(c));
  await issueSession(c, { uid: user.id, orgId: org.id, v: user.session_version });
  return c.json({ ok: true, slug: org.slug });
});
