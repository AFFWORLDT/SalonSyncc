import { HttpError } from "../core/errors";
import { originGuard } from "../core/pipeline";
import { issueSession } from "../core/session";
import { normalizeSlug, slugFromHost } from "../core/tenant";
import { adminRepo } from "../data/admin";
import { platformRepo } from "../data/platform";
import { tenantRepo } from "../data/tenant";
import { sha256 } from "../lib/hash";
import { auth } from "./auth";
import { SUPPORT_SESSION_MS } from "./admin";

/**
 * POST /api/auth/support {code, org?} — "Log in as salon": exchanges a super admin's 60-second support code, once, on the
 * salon's own host, for a 2-hour session as the salon's owner marked `sp` (support mode banner). Audited.
 */
auth.post("/support", originGuard, async (c) => {
  let b: { code?: unknown; org?: unknown } = {};
  try {
    b = (await c.req.json()) ?? {};
  } catch {
    /* refused below */
  }
  const fail = (code?: string) => new HttpError(401, "This support link has expired. Open a new one from the admin panel.", code);
  if (typeof b.code !== "string" || b.code.length > 100) throw fail();
  const host = slugFromHost(new URL(c.req.url).host, c.env.ROOT_DOMAIN, c.env.ADMIN_HOST);
  const slug = host.kind === "tenant" ? host.slug : host.kind === "none" && typeof b.org === "string" ? normalizeSlug(b.org) : "";
  const org = slug ? await platformRepo(c.env.DB).orgBySlug(slug) : null;
  if (!org || org.status === "deactivated" || org.status === "deleted") throw fail();
  const repo = adminRepo(c.env.DB);
  const used = await repo.consumeSupport(await sha256(b.code), Date.now());
  if (!used) throw fail();
  if (used.orgId !== org.id) throw fail("wrong_org");
  const owner = await c.env.DB.prepare("SELECT owner_user_id AS id FROM orgs WHERE id = ?").bind(org.id).first<{ id: number | null }>();
  const user = owner?.id ? await tenantRepo(c.env.DB, org.id).userById(owner.id) : null;
  const pu = await repo.userById(used.pid);
  if (!user || !user.active || !pu) throw fail();
  await repo.audit({ who: pu.email, action: "support_login", orgId: org.id, after: { as: user.username }, at: Date.now() }).run();
  await issueSession(c, { uid: user.id, orgId: org.id, v: user.session_version, sp: pu.id }, SUPPORT_SESSION_MS);
  return c.json({ ok: true, slug: org.slug });
});
