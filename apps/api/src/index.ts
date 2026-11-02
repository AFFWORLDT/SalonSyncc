import { Hono, type MiddlewareHandler } from "hono";
import { matchedRoutes } from "hono/route";
import type { AppEnv } from "./env";
import { HttpError } from "./core/errors";
import { tenantAuth, writeGuard, requireFeature, originGuard, WRITE_METHODS } from "./core/pipeline";
import { registerMe } from "./platform/me";
import { auth } from "./platform/auth";
import { publicApi } from "./core/public";
import { settings } from "./tenant/settings/routes";
import { staff, avatarPublic } from "./tenant/staff/routes";

const app = new Hono<AppEnv>();

app.get("/api/health", (c) => c.json({ ok: true, brand: c.env.BRAND_NAME }));

app.route("/api/auth", auth);

// Public (no session) routes, before the tenant router so its guard never sees them.
publicApi.route("/avatar", avatarPublic);
app.route("/api/public", publicApi);

// Tenant routes. FAIL-CLOSED: the router-level guard runs tenantAuth whenever a real (non-middleware) handler
// matched this request, so a route added here without its own auth is still protected. Paths that match no
// tenant handler fall through (next) to the JSON 404 instead of 401.
const tenantApi = new Hono<AppEnv>();
// NOTE: do not add tenantApi.onError(...). Hono wraps every handler when a sub-app has onError, so the identity
// check below would treat every path as matched (fails closed: unknown paths would become 401 instead of 404).
export const tenantGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  // Any matched handler other than this guard (including method ALL) counts as a real tenant route.
  if (!matchedRoutes(c).some((r) => r.handler !== tenantGuard)) return next();
  const run = () => tenantAuth(c, async () => { await writeGuard(c, next); });
  const runGuarded = async () => { await run(); };
  // origin check (writes only) -> tenantAuth -> writeGuard -> handler
  if (WRITE_METHODS.has(c.req.method.toUpperCase())) return originGuard(c, runGuarded);
  return run();
};
tenantApi.use("*", tenantGuard);

// Test-only probe; checked per request because env is per-request in Workers.
tenantApi.get("/_whoami", (c) =>
  c.env.ENVIRONMENT === "test"
    ? c.json({ orgId: c.var.tenant.org.id, uid: c.var.tenant.user.id })
    : c.json({ error: "Not found" }, 404),
);
tenantApi.get("/_probe/ledger", requireFeature("ledger"), (c) =>
  c.env.ENVIRONMENT === "test" ? c.json({ ok: true }) : c.json({ error: "Not found" }, 404),
);
tenantApi.post("/_probe/write", (c) =>
  c.env.ENVIRONMENT === "test" ? c.json({ ok: true }) : c.json({ error: "Not found" }, 404),
);
registerMe(tenantApi);
tenantApi.route("/settings", settings);
tenantApi.route("/", staff);
app.route("/api", tenantApi);

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json(err.code ? { error: err.message, code: err.code } : { error: err.message }, err.status);
  }
  console.error(err);
  return c.json({ error: "Something went wrong" }, 500);
});

export default app;
