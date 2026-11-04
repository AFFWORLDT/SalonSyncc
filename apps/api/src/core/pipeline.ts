import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../env";
import { HttpError } from "./errors";
import { readSession } from "./session";
import { slugFromHost } from "./tenant";
import { platformRepo } from "../data/platform";
import { featuresFor } from "./features-cache";
import { tenantRepo } from "../data/tenant";
import type { OrgStatus } from "../data/platform";
import type { FeatureKey } from "@ss/features";

/**
 * Cross-site write protection. Sibling salon subdomains are same-site, so SameSite=Lax alone does not stop them.
 * Rejects when Origin is present and its host differs from the request host (or is the literal "null"), or when
 * Sec-Fetch-Site is present and not same-origin/none. Requests with neither header (curl, server-to-server) pass.
 */
/** True when `origin` exactly matches one entry of the comma-separated dev allow-list. */
function devAllowed(list: string | undefined, origin: string): boolean {
  if (!list) return false;
  return list.split(",").map((x) => x.trim()).filter(Boolean).includes(origin);
}

export const originGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  const bad = () => new HttpError(403, "Cross-site request blocked", "bad_origin");
  const origin = c.req.header("origin");
  if (origin !== undefined) {
    let host: string | null = null;
    try {
      host = new URL(origin).host;
    } catch {
      /* unparseable, including "null" */
    }
    if (host === null) throw bad();
    if (host !== new URL(c.req.url).host) {
      // Local `next dev` (localhost:3000 proxying to wrangler) only: DEV_ALLOWED_ORIGINS is never set in wrangler vars.
      if (!devAllowed(c.env.DEV_ALLOWED_ORIGINS, origin)) throw bad();
      await next();
      return;
    }
  }
  const site = c.req.header("sec-fetch-site");
  if (site !== undefined && site !== "same-origin" && site !== "none") throw bad();
  await next();
};

/**
 * D1 statements tenantAuth costs at most (unmetered, before a route runs): host org 1 + org 1 + user 1 + features 3
 * on a cold cache (plan features, plan limits, overrides) + 1 platform user check in support mode. Routes metering their own work reserve this first.
 */
export const TENANT_AUTH_STMTS = 7;

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
  const row = await repo.userById(session.uid);
  if (!row || row.org_id !== org.id || !row.active || row.session_version !== session.v) {
    throw new HttpError(401, "Please sign in");
  }
  // AI connect's in-process calls (mcp/server.ts): the audit actor reads "<name> via AI connect (<connection>)".
  const user = c.env.MCP_VIA ? { ...row, name: `${row.name} via ${c.env.MCP_VIA}`.slice(0, 160) } : row;

  // Support mode ends the moment the platform user is removed or changes their password.
  if (session.sp !== undefined) {
    const pu = await c.env.DB.prepare("SELECT session_version FROM platform_users WHERE id = ?").bind(session.sp).first<{ session_version: number }>();
    if (!pu || pu.session_version !== session.spv) throw new HttpError(401, "Please sign in");
  }

  const { features, limits } = await featuresFor(c.env.DB, org);
  c.set("tenant", { org, user, repo, features, limits, supportBy: session.sp ?? null });
  await next();
};

/** Per-route: 403 unless the org's plan includes the feature. Must run after tenantAuth (the tenant guard). */
export const requireFeature =
  (key: FeatureKey): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    if (!c.var.tenant.features.includes(key)) {
      throw new HttpError(403, "This feature isn't in your plan", "feature_disabled");
    }
    await next();
  };

export const WRITE_OK: OrgStatus[] = ["trial", "active", "grace", "past_due"];

export const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const WRITE_ALLOW_PREFIXES = ["/api/auth/", "/api/mobile/", "/api/billing/"];
/**
 * Exact method + path writes a lapsed org may still make: a device signing out of pushes, and marking the bell read.
 * Both are session- and org-scoped and touch no business data.
 */
const WRITE_ALLOW_EXACT = new Set(["DELETE /api/push/tokens", "POST /api/notifications/read"]);
const isWriteAllowed = (method: string, path: string) =>
  WRITE_ALLOW_PREFIXES.some((p) => path.startsWith(p)) || path === "/api/me" || path.startsWith("/api/me/") || WRITE_ALLOW_EXACT.has(`${method} ${path}`);

/** Blocks writes for orgs whose subscription is inactive. Reads/exports always pass. Runs after tenantAuth. */
export const writeGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (WRITE_METHODS.has(c.req.method.toUpperCase()) && !WRITE_OK.includes(c.var.tenant.org.status) && !isWriteAllowed(c.req.method.toUpperCase(), new URL(c.req.url).pathname)) {
    throw new HttpError(402, "Your subscription is inactive. Upgrade to continue.", "subscription_inactive");
  }
  await next();
};
