import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { requireFeature } from "../../core/pipeline";
import { requireAdmin } from "../../core/roles";
import { clockOf, reportsRepo, settingsRepo } from "../../data/tenant";
import { businessDay } from "../../lib/clock";
import { MONTH_RE } from "../../lib/money";

/** The org's clock and the current moment, read once per request. */
async function ctx(c: { env: AppEnv["Bindings"]; var: AppEnv["Variables"] }) {
  const { org } = c.var.tenant;
  const clock = clockOf(await settingsRepo(c.env.DB, org.id).get());
  const now = Date.now();
  return { repo: reportsRepo(c.env.DB, org.id), slug: org.slug, clock, now, today: businessDay(now, clock) };
}

// Features are gated per route (a router-level use("*") would leak onto sibling routes).
export const reports = new Hono<AppEnv>();

// core_sales: /me (anyone: a barber sees only their own; an admin sees their own as a barber) and /overview (admin).
reports.get("/me", requireFeature("core_sales"), async (c) => {
  const { repo, clock, now, today } = await ctx(c);
  const month = c.req.query("month");
  return c.json(await repo.myReport(clock, now, c.var.tenant.user.id, month && MONTH_RE.test(month) ? month : today.slice(0, 7)));
});
reports.get("/overview", requireFeature("core_sales"), requireAdmin, async (c) => {
  const { repo, slug, clock, now } = await ctx(c);
  return c.json(await repo.overview(slug, clock, now, c.req.query("from"), c.req.query("to")));
});
reports.get("/daily", requireFeature("daily_sheet"), requireAdmin, async (c) => {
  const { repo, slug, today } = await ctx(c);
  const month = c.req.query("month");
  return c.json(await repo.dailySheet(slug, month && MONTH_RE.test(month) ? month : today.slice(0, 7)));
});
reports.get("/monthly", requireFeature("reports_advanced"), requireAdmin, async (c) => {
  const { repo, slug, today } = await ctx(c);
  const year = c.req.query("year");
  return c.json(await repo.monthlyReport(slug, year && /^\d{4}$/.test(year) ? year : today.slice(0, 4)));
});
