import { Hono } from "hono";
import type { AppEnv } from "./env";
import { HttpError } from "./core/errors";

const app = new Hono<AppEnv>();

app.get("/api/health", (c) => c.json({ ok: true, brand: c.env.BRAND_NAME }));

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json(err.code ? { error: err.message, code: err.code } : { error: err.message }, err.status);
  }
  console.error(err);
  return c.json({ error: "Something went wrong" }, 500);
});

export default app;
