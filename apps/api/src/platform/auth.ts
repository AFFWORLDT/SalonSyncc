import { Hono } from "hono";
import type { AppEnv } from "../env";
import { HttpError } from "../core/errors";
import { checkPassword, hashPassword } from "../core/crypto";
import { originGuard } from "../core/pipeline";
import { clearSession, issueSession } from "../core/session";
import { normalizeSlug, slugFromHost } from "../core/tenant";
import { platformRepo } from "../data/platform";
import { tenantRepo } from "../data/tenant";
import { rateCount, rateHit } from "../data/infra";
import { LOGIN_WINDOW_MS, isLocked, loginLimits, loginWindow } from "../lib/limits";

const FAIL = "Wrong salon ID, username or password";
type LL = { key: string; max: number };
const LOCKED = "Too many attempts. Try again in a few minutes.";

let dummy: Promise<string> | null = null;
/** A real hash made once per isolate, so "no such user/salon" costs the same as a wrong password. */
const dummyHash = () => (dummy ??= hashPassword(crypto.randomUUID()));

export const auth = new Hono<AppEnv>();
auth.use("/login", originGuard);
auth.use("/logout", originGuard);

auth.post("/login", async (c) => {
  let body: { org?: unknown; username?: unknown; password?: unknown } = {};
  try {
    const parsed = await c.req.json();
    if (parsed && typeof parsed === "object") body = parsed;
  } catch {
    /* falls through to the generic failure */
  }
  let username = typeof body.username === "string" ? body.username.trim() : "";
  if (username.length > 60) username = ""; // too long to be real: same 401 as not found, no failure row beyond the IP hit
  const password = typeof body.password === "string" ? body.password : "";

  const host = slugFromHost(new URL(c.req.url).host, c.env.ROOT_DOMAIN, c.env.ADMIN_HOST);
  let slug = "";
  if (host.kind === "tenant") slug = host.slug; // the host wins; body.org is ignored
  else if (host.kind === "none") slug = typeof body.org === "string" ? normalizeSlug(body.org) : "";
  // host.kind === "admin": no salon, generic failure below

  const org = slug ? await platformRepo(c.env.DB).orgBySlug(slug) : null;
  const live = org && org.status !== "deactivated" && org.status !== "deleted" ? org : null;
  const repo = live ? tenantRepo(c.env.DB, live.id) : null;

  // Throttle before looking at the password, so a locked username answers the same whatever is typed.
  // Three counters (see lib/limits.ts): the device, the username on that device, the username from anywhere.
  // The username counters are org-scoped login_failures rows and only exist for a real salon.
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const at = Date.now();
  const [dev, perDevice, anywhere] = loginLimits(live?.id ?? "", username, ip) as [LL, LL, LL];
  const userKeys = [perDevice.key, anywhere.key];
  const tracked = repo && username ? repo : null;
  const [ipCount, deviceUser, anyUser] = await Promise.all([
    rateCount(c.env.DB, dev.key, loginWindow(at)),
    tracked ? tracked.loginFailureCount(perDevice.key, at - LOGIN_WINDOW_MS) : 0,
    tracked ? tracked.loginFailureCount(anywhere.key, at - LOGIN_WINDOW_MS) : 0,
  ]);
  if (isLocked(ipCount, dev.max) || isLocked(deviceUser, perDevice.max) || isLocked(anyUser, anywhere.max)) throw new HttpError(429, LOCKED);

  const user = repo && username ? await repo.userByUsername(username) : null;

  const ok = await checkPassword(password, user?.password_hash ?? (await dummyHash()));
  if (!live || !repo || !user || !user.active || !ok) {
    await rateHit(c.env.DB, dev.key, loginWindow(at));
    if (tracked) await tracked.recordLoginFailure(userKeys, at, at - LOGIN_WINDOW_MS);
    throw new HttpError(401, FAIL);
  }
  await repo.clearLoginFailures(userKeys);

  await issueSession(c, { uid: user.id, orgId: live.id, v: user.session_version });
  return c.json({ ok: true, slug: live.slug });
});

auth.post("/logout", (c) => {
  clearSession(c);
  return c.json({ ok: true });
});
