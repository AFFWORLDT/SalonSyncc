import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../env";
import { HttpError } from "./errors";
import { readSession } from "./session";
import { slugFromHost } from "./tenant";
import { platformRepo } from "../data/platform";
import { tenantRepo } from "../data/tenant";

/**
 * Binds the request to exactly one org, taken ONLY from the signed session (and checked against the host).
 * Never reads the org from a query string, header or body.
 */
export const tenantAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const session = await readSession(c);
  if (!session) throw new HttpError(401, "Please sign in");

  const platform = platformRepo(c.env.DB);
  const host = slugFromHost(new URL(c.req.url).host, c.env.ROOT_DOMAIN, c.env.ADMIN_HOST);
  if (host.kind === "admin") throw new HttpError(401, "Please sign in", "wrong_org");
  if (host.kind === "tenant") {
    const hostOrg = await platform.orgBySlug(host.slug);
    if (!hostOrg || hostOrg.id !== session.orgId) throw new HttpError(401, "Please sign in", "wrong_org");
  }

  const org = await platform.orgById(session.orgId);
  if (!org || org.status === "deactivated" || org.status === "deleted") throw new HttpError(401, "Please sign in");

  const repo = tenantRepo(c.env.DB, org.id);
  const user = await repo.userById(session.uid);
  if (!user || user.org_id !== org.id || !user.active || user.session_version !== session.v) {
    throw new HttpError(401, "Please sign in");
  }

  c.set("tenant", { org, user, repo });
  await next();
};
