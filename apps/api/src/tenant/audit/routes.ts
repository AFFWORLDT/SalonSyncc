import { Hono } from "hono";
import type { AuditEntry, Paged } from "@ss/contract";
import type { AppEnv } from "../../env";
import { HttpError } from "../../core/errors";
import { requireAdmin } from "../../core/roles";
import { requireFeature } from "../../core/pipeline";
import { auditViewRepo, clockOf, settingsRepo } from "../../data/tenant";
import { addDays, businessDayStart } from "../../lib/clock";
import { DAY_RE, clampPage } from "../../lib/money";

/**
 * Audit viewer (FM routes.ts 1612-1671). Admin only, feature `audit_log`. The gate is on each route (the router is
 * mounted at "/"), so unknown paths still fall through to the JSON 404.
 */
export const audit = new Hono<AppEnv>();
const gate = [requireFeature("audit_log"), requireAdmin] as const;

audit.get("/audit", ...gate, async (c) => {
  const q = c.req.query();
  const orgId = c.var.tenant.org.id;
  const page = clampPage(q.page);
  const page_size = Math.min(200, Math.max(1, Math.floor(Number(q.page_size)) || 50));
  const clock = clockOf(await settingsRepo(c.env.DB, orgId).get());
  const f: Parameters<ReturnType<typeof auditViewRepo>["list"]>[0] = {};
  if (q.entity) f.entity = q.entity.slice(0, 40);
  if (q.actor_id) {
    const n = Number(q.actor_id);
    f.actorId = Number.isInteger(n) && n > 0 ? n : null;
  }
  if (q.from && DAY_RE.test(q.from)) f.fromAt = businessDayStart(q.from, clock);
  // End of the `to` business day = the next day's start (DST-safe, unlike +24h).
  if (q.to && DAY_RE.test(q.to)) f.toAt = businessDayStart(addDays(q.to, 1), clock);
  if (q.q?.trim()) f.q = q.q.trim().slice(0, 80);
  const r = await auditViewRepo(c.env.DB, orgId).list(f, page, page_size);
  const body: Paged<AuditEntry> = { items: r.items, total: r.total, page, page_size };
  return c.json(body);
});

audit.get("/sales/:id/history", ...gate, async (c) => {
  const n = Number(c.req.param("id"));
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, "Invalid id");
  const h = await auditViewRepo(c.env.DB, c.var.tenant.org.id).saleHistory(n);
  if (!h) throw new HttpError(404, "Not found");
  return c.json(h);
});
