import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { requireFeature } from "../../core/pipeline";
import { requireAdmin } from "../../core/roles";
import { clockOf, ratingsRepo, settingsRepo } from "../../data/tenant";
import { businessDay } from "../../lib/clock";
import { DAY_RE } from "../../lib/money";

/** GET /ratings?from&to (FM routes.ts 1556-1596): admin, feature `ratings`. Gated per route (router mounted at "/"). */
export const ratings = new Hono<AppEnv>();

ratings.get("/ratings", requireFeature("ratings"), requireAdmin, async (c) => {
  const { org } = c.var.tenant;
  const today = businessDay(Date.now(), clockOf(await settingsRepo(c.env.DB, org.id).get()));
  const q = (k: string) => {
    const v = c.req.query(k) ?? "";
    return DAY_RE.test(v) ? v : null;
  };
  const from = q("from") ?? `${today.slice(0, 7)}-01`;
  const to = q("to") ?? today;
  return c.json(await ratingsRepo(c.env.DB, org.id).report(from, to));
});
