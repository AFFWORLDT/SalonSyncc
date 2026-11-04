import { Hono, type MiddlewareHandler } from "hono";
import { matchedRoutes } from "hono/route";
import type { AppEnv } from "./env";
import { HttpError } from "./core/errors";
import { tenantAuth, writeGuard, requireFeature, originGuard, WRITE_METHODS } from "./core/pipeline";
import { registerMe } from "./platform/me";
import { auth } from "./platform/auth";
import { mobile } from "./platform/mobile";
import { publicApi } from "./core/public";
// Registers /api/public/slug, /api/public/signup and /api/auth/handoff (before the routers are mounted below).
import "./platform/signup";
import "./platform/support";
import { platformApi } from "./platform/admin";
import { settings, logoPublic, brandPublic } from "./tenant/settings/routes";
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
import { stripeWebhook } from "./integrations/stripe-webhook";
import { billing } from "./tenant/billing/routes";
import { mcp } from "./tenant/mcp/routes";
import { mcpHttp } from "./mcp/http";
import { hourly } from "./jobs/hourly";
import type { Env } from "./env";

/** The Hono app (also exported by name: tests read its route table). */
export const app = new Hono<AppEnv>();


app.get("/api/health", (c) => c.json({ ok: true, brand: c.env.BRAND_NAME }));

app.route("/api/auth", auth);
// The phone app's sign-in (bearer tokens, no cookie). Before the tenant router.
app.route("/api/mobile", mobile);
// The super admin panel's API (admin.<domain> only; its own ss_platform session). Before the tenant router.
app.route("/api/platform", platformApi);

// Public (no session) routes, before the tenant router so its guard never sees them.
publicApi.route("/avatar", avatarPublic);
publicApi.route("/services", servicesPublic);
publicApi.route("/logo", logoPublic);
publicApi.route("/brand", brandPublic);
app.route("/api/public", publicApi);

// Meta's WhatsApp webhook: no session (signature-checked), not behind the public rate limiter; the org comes from each
// change's phone_number_id. Registered before the tenant router so its guard never sees it.
app.route("/api/wa/webhook", waWebhook);
// Stripe's webhook: no session (signature-checked), before the tenant router.
app.route("/api/stripe/webhook", stripeWebhook);
// AI connect (MCP + OAuth) on the salon host, outside /api: bearer tokens, no session. Its tools call the tenant routes
// below in-process through app.fetch, as the token's user.
app.route("/", mcpHttp(async (req, env, ctx) => app.fetch(req, env, ctx)));

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
// /billing (admin): plan page data, Stripe Checkout / Portal, choose Free.
tenantApi.route("/billing", billing);
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
// /mcp, /mcp/keys, /mcp/connections/:id, /mcp/requests/:id (AI connect page and OAuth consent; admin, feature mcp_api).
tenantApi.route("/", mcp);
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
/**
 * Security headers on every API answer (FM index.ts). Added outside Hono: an app.use("/api/*") would count as a matched
 * route and defeat tenantGuard's "unknown path stays 404" check. Routes that set their own Cache-Control keep it.
 */
/** Salons that run their own app: every request on their SalonKit host goes to it (302, so it can be undone). */
export const MOVED_HOSTS: Record<string, string> = { "fmsalon.salonkit.online": "https://fm-salon.affworld0.workers.dev" };

async function fetchWithHeaders(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  const moved = MOVED_HOSTS[url.hostname];
  if (moved) return new Response(null, { status: 302, headers: { Location: moved + url.pathname + url.search, "Cache-Control": "no-store" } });
  const path = url.pathname;
  const workerPath = path.startsWith("/api/") || path === "/mcp" || path.startsWith("/oauth/") || path.startsWith("/.well-known/");
  // run_worker_first sends pages through the Worker (for MOVED_HOSTS); everything else is still the static site.
  if (!workerPath && env.ASSETS) return env.ASSETS.fetch(req);
  const res = await app.fetch(req, env, ctx);
  if (!workerPath) return res;
  const out = new Response(res.body, res);
  const h = out.headers;
  if (!h.has("Cache-Control")) h.set("Cache-Control", "no-store");
  h.set("X-Content-Type-Options", "nosniff");
  h.set("X-Frame-Options", "DENY");
  h.set("Referrer-Policy", "same-origin");
  return out;
}

export default {
  fetch: fetchWithHeaders,
  scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(hourly(env, event.scheduledTime).catch((err) => console.error("cron failed", err)));
  },
};
