import { Hono, type MiddlewareHandler } from "hono";
import { matchedRoutes } from "hono/route";
import type { AppEnv } from "./env";
import { HttpError } from "./core/errors";
import { tenantAuth, writeGuard, requireFeature, originGuard, WRITE_METHODS } from "./core/pipeline";
import { registerMe } from "./platform/me";
import { auth } from "./platform/auth";
import { publicApi } from "./core/public";
import { settings, logoPublic } from "./tenant/settings/routes";
import { staff, avatarPublic } from "./tenant/staff/routes";
import { services, servicesPublic } from "./tenant/services/routes";
import { sales } from "./tenant/sales/routes";
import { customers } from "./tenant/customers/routes";
import { reports } from "./tenant/reports/routes";
import { expenses, companyExpenses } from "./tenant/expenses/routes";
import { ledger } from "./tenant/ledger/routes";
import { audit } from "./tenant/audit/routes";
import { notifications } from "./tenant/notifications/routes";
import { announcements } from "./tenant/announcements/routes";
import { ratings } from "./tenant/ratings/routes";
import { whatsapp } from "./tenant/whatsapp/routes";
import { campaigns } from "./tenant/campaigns/routes";
import { waWebhook } from "./integrations/wa-webhook";
import { hourly } from "./jobs/hourly";
import type { Env } from "./env";

/** The Hono app (also exported by name: tests read its route table). */
export const app = new Hono<AppEnv>();

app.get("/api/health", (c) => c.json({ ok: true, brand: c.env.BRAND_NAME }));

app.route("/api/auth", auth);

// Public (no session) routes, before the tenant router so its guard never sees them.
publicApi.route("/avatar", avatarPublic);
publicApi.route("/services", servicesPublic);
publicApi.route("/logo", logoPublic);
app.route("/api/public", publicApi);

// Meta's WhatsApp webhook: no session (signature-checked), not behind the public rate limiter; the org comes from each
// change's phone_number_id. Registered before the tenant router so its guard never sees it.
app.route("/api/wa/webhook", waWebhook);

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
tenantApi.route("/services", services);
tenantApi.route("/sales", sales);
tenantApi.route("/customers", customers);
tenantApi.route("/reports", reports);
tenantApi.route("/expenses", expenses);
tenantApi.route("/company-expenses", companyExpenses);
// /transfers, /ledger/*, /payouts (FM paths); gated per route.
tenantApi.route("/", ledger);
// /audit, /sales/:id/history; gated per route.
tenantApi.route("/", audit);
// /push/tokens, /notifications, /notifications/read; gated per route (feature push).
tenantApi.route("/", notifications);
// /announcements; gated per route (feature announcements, admin).
tenantApi.route("/", announcements);
// /ratings; gated per route (feature ratings, admin).
tenantApi.route("/", ratings);
// /whatsapp/config; gated per route (feature whatsapp, admin).
tenantApi.route("/", whatsapp);
// /wa/templates, /wa/test, /wa/audience, /wa/campaigns(/:id/next), /wa/media; gated per route (feature whatsapp_campaigns, admin, WA-ready).
tenantApi.route("/", campaigns);
app.route("/api", tenantApi);

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json(err.code ? { error: err.message, code: err.code } : { error: err.message }, err.status);
  }
  console.error(err);
  return c.json({ error: "Something went wrong" }, 500);
});

// The Worker: HTTP through Hono, and the cron (wrangler.jsonc triggers, every 10 minutes) through jobs/hourly.ts.
export default {
  fetch: app.fetch,
  scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(hourly(env, event.scheduledTime).catch((err) => console.error("cron failed", err)));
  },
};
