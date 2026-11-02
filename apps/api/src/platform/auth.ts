import { Hono } from "hono";
import type { AppEnv } from "../env";
import { HttpError } from "../core/errors";
import { checkPassword, hashPassword } from "../core/crypto";
import { originGuard } from "../core/pipeline";
import { clearSession, issueSession } from "../core/session";
import { normalizeSlug, slugFromHost } from "../core/tenant";
import { platformRepo } from "../data/platform";
import { tenantRepo } from "../data/tenant";

const FAIL = "Wrong salon ID, username or password";

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
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  const host = slugFromHost(new URL(c.req.url).host, c.env.ROOT_DOMAIN, c.env.ADMIN_HOST);
  let slug = "";
  if (host.kind === "tenant") slug = host.slug; // the host wins; body.org is ignored
  else if (host.kind === "none") slug = typeof body.org === "string" ? normalizeSlug(body.org) : "";
  // host.kind === "admin": no salon, generic failure below

  const org = slug ? await platformRepo(c.env.DB).orgBySlug(slug) : null;
  const live = org && org.status !== "deactivated" && org.status !== "deleted" ? org : null;
  const user = live && username ? await tenantRepo(c.env.DB, live.id).userByUsername(username) : null;

  const ok = await checkPassword(password, user?.password_hash ?? (await dummyHash()));
  if (!live || !user || !user.active || !ok) throw new HttpError(401, FAIL);

  await issueSession(c, { uid: user.id, orgId: live.id, v: user.session_version });
  return c.json({ ok: true, slug: live.slug });
});

auth.post("/logout", (c) => {
  clearSession(c);
  return c.json({ ok: true });
});
