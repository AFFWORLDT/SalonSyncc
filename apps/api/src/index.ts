import { Hono } from "hono";
import type { AppEnv } from "./env";
import { HttpError } from "./core/errors";
import { tenantAuth } from "./core/pipeline";
import { auth } from "./platform/auth";

const app = new Hono<AppEnv>();

app.get("/api/health", (c) => c.json({ ok: true, brand: c.env.BRAND_NAME }));

app.route("/api/auth", auth);

// Tenant routes: tenantAuth is attached per route (Hono's route() would otherwise run a "*" middleware for
// every /api path, turning unknown paths into 401 instead of the JSON 404). Task 7 wraps this in a helper.
const tenantApi = new Hono<AppEnv>();

// Test-only probe; checked per request because env is per-request in Workers.
tenantApi.get(
  "/_whoami",
  async (c, next) => (c.env.ENVIRONMENT === "test" ? next() : c.json({ error: "Not found" }, 404)),
  tenantAuth,
  (c) => c.json({ orgId: c.var.tenant.org.id, uid: c.var.tenant.user.id }),
);
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
