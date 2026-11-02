import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { HttpError } from "../../core/errors";
import { requireAdmin } from "../../core/roles";
import { requireFeature } from "../../core/pipeline";
import { announcementsRepo } from "../../data/tenant";
import { notifyUsers } from "../notifications/notify";

/**
 * Staff announcements (FM routes.ts 483-530), admin only, feature `announcements`. The gate is on each route (the router is
 * mounted at "/"), so unknown paths still fall through to the JSON 404.
 */
export const announcements = new Hono<AppEnv>();
const gate = [requireFeature("announcements"), requireAdmin] as const;
const bad = (m: string) => new HttpError(400, m);

const TITLE_MAX = 80;
const BODY_MAX = 500;
const clean = (v: unknown, max: number): string => (typeof v === "string" || typeof v === "number" ? String(v).trim().slice(0, max) : "");

announcements.get("/announcements", ...gate, async (c) => c.json(await announcementsRepo(c.env.DB, c.var.tenant.org.id).list()));

announcements.post("/announcements", ...gate, async (c) => {
  const { org, user } = c.var.tenant;
  const raw = await c.req.json().catch(() => null);
  const b: Record<string, unknown> = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const title = clean(b.title, TITLE_MAX);
  const body = clean(b.body, BODY_MAX);
  if (!title) throw bad("Add a title");
  if (!body) throw bad("Add a message");
  if (b.audience !== "all" && b.audience !== "barber") throw bad("Choose who to send it to");

  const repo = announcementsRepo(c.env.DB, org.id);
  let targetId: number | null = null;
  let recipientIds: number[];
  if (b.audience === "barber") {
    const n = Number(b.barber_id ?? b.target_id);
    if (!Number.isInteger(n) || n <= 0 || !(await repo.activeUserExists(n))) throw bad("Pick a barber to send it to");
    targetId = n;
    recipientIds = [n];
  } else {
    recipientIds = await repo.activeIdsExcept(user.id);
  }

  const out = await repo.create({ senderId: user.id, audience: b.audience, targetId, title, body, recipients: recipientIds.length });
  // Feed rows + push only when the org has `push` (notifyUsers checks); otherwise the announcement is just stored.
  await notifyUsers(c, org.id, recipientIds, { title, body, path: "/", tag: `announcement-${out.id}` });
  return c.json(out, 201);
});
