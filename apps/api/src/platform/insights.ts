/**
 * Atlantic Portal insights (the deHertz admin's Overview / App usage / People / AI / Notifications, for salons):
 * read-only statistics across every salon, plus push broadcasts. Registered on platformApi after its auth and
 * owner-only middleware (imported from index.ts after ./admin), so every route here needs a platform session and
 * writes need the owner role.
 *
 * Windows are UTC calendar days ending today: range=7 is today and the 6 days before; "previous" is the 7 days before
 * that. Each endpoint is one D1 batch (a handful of statements), well inside the free plan's per-request budget.
 */
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { HttpError } from "../core/errors";
import { services } from "../core/services";
import { adminRepo } from "../data/admin";
import { utcDay } from "../core/activity";
import { platformApi } from "./admin";

type PC = Context<AppEnv>;
const DAY = 86_400_000;
export const RANGES = [7, 30, 90] as const;
/** Pushes sent per request: FCM is one subrequest each (+1 for the access token) under the free plan's 50. */
export const BROADCAST_SLICE = 30;

export function rangeOf(c: PC): number {
  const r = Number(c.req.query("range") ?? 7);
  return (RANGES as readonly number[]).includes(r) ? r : 7;
}

/** The UTC day windows for a range: [from, today] and the same length before it. */
export function windows(days: number, now: number) {
  const todayStart = Date.parse(utcDay(now) + "T00:00:00Z");
  const fromMs = todayStart - (days - 1) * DAY;
  const prevMs = fromMs - days * DAY;
  return { today: utcDay(now), from: utcDay(fromMs), prev: utcDay(prevMs), fromMs, prevMs, days };
}

/** Every day of the window, oldest first, with the counts filled in (0 when absent). */
export function series(w: { fromMs: number; days: number }, rows: { d: string; n: number }[]): { day: string; n: number }[] {
  const m = new Map(rows.map((r) => [r.d, Number(r.n) || 0]));
  return Array.from({ length: w.days }, (_, i) => {
    const day = utcDay(w.fromMs + i * DAY);
    return { day, n: m.get(day) ?? 0 };
  });
}

const all = <T>(r: D1Result<unknown>) => (r.results ?? []) as T[];
const msDay = (col: string) => `date(${col} / 1000, 'unixepoch')`;

// ---------------------------------------------------------------- Overview (dashboard)

platformApi.get("/insights/dashboard", async (c) => {
  const w = windows(rangeOf(c), Date.now());
  const db = c.env.DB;
  const [tot, signups, sales, active, mcp] = await db.batch([
    db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM orgs WHERE status IN ('trial','active','grace','past_due')) AS live,
          (SELECT COUNT(*) FROM users u JOIN orgs o ON o.id = u.org_id WHERE u.active = 1 AND o.status IN ('trial','active','grace','past_due')) AS staff,
          (SELECT COUNT(DISTINCT user_id) FROM activity_daily WHERE day = ?1) AS active_today,
          (SELECT COUNT(DISTINCT user_id) FROM activity_daily WHERE day >= ?2) AS active,
          (SELECT COUNT(DISTINCT user_id) FROM activity_daily WHERE day >= ?3 AND day < ?2) AS active_prev,
          (SELECT COUNT(*) FROM orgs WHERE created_at >= ?4) AS signups,
          (SELECT COUNT(*) FROM orgs WHERE created_at >= ?5 AND created_at < ?4) AS signups_prev,
          (SELECT COUNT(*) FROM sales WHERE deleted_at IS NULL AND created_at >= ?4) AS sales,
          (SELECT COUNT(*) FROM sales WHERE deleted_at IS NULL AND created_at >= ?5 AND created_at < ?4) AS sales_prev,
          (SELECT COALESCE(SUM(amount), 0) FROM sales WHERE deleted_at IS NULL AND created_at >= ?4) AS sales_value,
          (SELECT COALESCE(SUM(amount), 0) FROM sales WHERE deleted_at IS NULL AND created_at >= ?5 AND created_at < ?4) AS sales_value_prev,
          (SELECT COUNT(*) FROM mcp_calls WHERE at >= ?4) AS ai_calls,
          (SELECT COUNT(*) FROM mcp_calls WHERE at >= ?5 AND at < ?4) AS ai_calls_prev,
          (SELECT COUNT(*) FROM wa_messages WHERE status = 'sent' AND created_at >= ?4) AS wa_sent,
          (SELECT COUNT(*) FROM wa_messages WHERE status = 'sent' AND created_at >= ?5 AND created_at < ?4) AS wa_sent_prev,
          (SELECT currency FROM plans ORDER BY sort LIMIT 1) AS currency`,
      )
      .bind(w.today, w.from, w.prev, w.fromMs, w.prevMs),
    db.prepare(`SELECT ${msDay("created_at")} AS d, COUNT(*) AS n FROM orgs WHERE created_at >= ? GROUP BY d`).bind(w.fromMs),
    db.prepare(`SELECT ${msDay("created_at")} AS d, COUNT(*) AS n, COALESCE(SUM(amount), 0) AS v FROM sales WHERE deleted_at IS NULL AND created_at >= ? GROUP BY d`).bind(w.fromMs),
    db.prepare("SELECT day AS d, COUNT(DISTINCT user_id) AS n FROM activity_daily WHERE day >= ? GROUP BY day").bind(w.from),
    db.prepare(`SELECT ${msDay("at")} AS d, COUNT(*) AS n FROM mcp_calls WHERE at >= ? GROUP BY d`).bind(w.fromMs),
  ]);
  const t = (all<Record<string, number | string | null>>(tot)[0] ?? {}) as Record<string, number | string | null>;
  const salesRows = all<{ d: string; n: number; v: number }>(sales);
  return c.json({
    range: w.days,
    currency: t.currency ?? "",
    tiles: t,
    series: {
      active: series(w, all(active)),
      signups: series(w, all(signups)),
      sales: series(w, salesRows),
      sales_value: series(w, salesRows.map((r) => ({ d: r.d, n: r.v }))),
      ai_calls: series(w, all(mcp)),
    },
  });
});

// ---------------------------------------------------------------- App usage

platformApi.get("/insights/usage", async (c) => {
  const w = windows(rangeOf(c), Date.now());
  const db = c.env.DB;
  const recentFrom = utcDay(Date.now() - 14 * DAY);
  const [dau, byPlatform, wau, platforms, versions, features, recent] = await db.batch([
    db.prepare("SELECT day AS d, COUNT(DISTINCT user_id) AS n FROM activity_daily WHERE day >= ? GROUP BY day").bind(w.from),
    db.prepare("SELECT day AS d, platform, COUNT(DISTINCT user_id) AS n FROM activity_daily WHERE day >= ? GROUP BY day, platform").bind(w.from),
    // Weekly active: distinct people in the 7 days ending on each day.
    db
      .prepare(
        `WITH RECURSIVE days(d) AS (SELECT ?1 UNION ALL SELECT date(d, '+1 day') FROM days WHERE d < ?2)
         SELECT d, (SELECT COUNT(DISTINCT user_id) FROM activity_daily WHERE day BETWEEN date(d, '-6 day') AND d) AS n FROM days`,
      )
      .bind(w.from, w.today),
    db.prepare("SELECT platform, COUNT(DISTINCT user_id) AS n FROM activity_daily WHERE day >= ? GROUP BY platform ORDER BY n DESC").bind(w.from),
    db
      .prepare("SELECT platform, COALESCE(app_version, 'unknown') AS version, COUNT(DISTINCT user_id) AS n FROM activity_daily WHERE day >= ? AND platform <> 'web' GROUP BY platform, version ORDER BY n DESC")
      .bind(w.from),
    // What salons do in SalonKit, this period vs the one before.
    db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM sales WHERE deleted_at IS NULL AND created_at >= ?1) AS bills,
          (SELECT COUNT(*) FROM sales WHERE deleted_at IS NULL AND created_at >= ?2 AND created_at < ?1) AS bills_prev,
          (SELECT COUNT(*) FROM expenses WHERE created_at >= ?1) AS expenses,
          (SELECT COUNT(*) FROM expenses WHERE created_at >= ?2 AND created_at < ?1) AS expenses_prev,
          (SELECT COUNT(*) FROM customers WHERE created_at >= ?1) AS customers,
          (SELECT COUNT(*) FROM customers WHERE created_at >= ?2 AND created_at < ?1) AS customers_prev,
          (SELECT COUNT(*) FROM ratings WHERE created_at >= ?1) AS ratings,
          (SELECT COUNT(*) FROM ratings WHERE created_at >= ?2 AND created_at < ?1) AS ratings_prev,
          (SELECT COUNT(*) FROM wa_messages WHERE status = 'sent' AND created_at >= ?1) AS whatsapp,
          (SELECT COUNT(*) FROM wa_messages WHERE status = 'sent' AND created_at >= ?2 AND created_at < ?1) AS whatsapp_prev,
          (SELECT COUNT(*) FROM mcp_calls WHERE at >= ?1) AS ai_calls,
          (SELECT COUNT(*) FROM mcp_calls WHERE at >= ?2 AND at < ?1) AS ai_calls_prev,
          (SELECT COUNT(*) FROM notifications WHERE created_at >= ?1) AS notifications,
          (SELECT COUNT(*) FROM notifications WHERE created_at >= ?2 AND created_at < ?1) AS notifications_prev`,
      )
      .bind(w.fromMs, w.prevMs),
    db
      .prepare(
        `SELECT a.user_id, u.name, u.role, o.name AS salon, o.slug, a.platform, a.app_version, MAX(a.last_at) AS last_at
         FROM activity_daily a JOIN users u ON u.id = a.user_id JOIN orgs o ON o.id = a.org_id
         WHERE a.day >= ? GROUP BY a.user_id ORDER BY last_at DESC LIMIT 15`,
      )
      .bind(recentFrom),
  ]);
  const plat: Record<string, { d: string; n: number }[]> = { web: [], ios: [], android: [] };
  for (const r of all<{ d: string; platform: string; n: number }>(byPlatform)) (plat[r.platform] ??= []).push(r);
  return c.json({
    range: w.days,
    dau: series(w, all(dau)),
    wau: series(w, all(wau)),
    by_platform: Object.fromEntries(Object.entries(plat).map(([k, v]) => [k, series(w, v)])),
    platforms: all(platforms),
    versions: all(versions),
    features: all(features)[0] ?? {},
    recent: all(recent),
  });
});

// ---------------------------------------------------------------- People (every salon's staff)

export const PEOPLE_PAGE = 25;

platformApi.get("/insights/people", async (c) => {
  const q = (c.req.query("q") ?? "").trim().toLowerCase().slice(0, 60);
  const role = c.req.query("role") ?? "";
  const platform = c.req.query("platform") ?? "";
  const inactive = Number(c.req.query("inactive") ?? 0);
  const offset = Math.max(0, Math.min(10_000, Number(c.req.query("offset") ?? 0) || 0));
  const where: string[] = ["o.deleted_at IS NULL"];
  const args: unknown[] = [];
  if (q) {
    where.push("(lower(u.name) LIKE ? OR lower(COALESCE(u.email, '')) LIKE ? OR lower(u.username) LIKE ? OR lower(o.name) LIKE ? OR o.slug LIKE ?)");
    const like = `%${q.replace(/[%_]/g, "")}%`;
    args.push(like, like, like, like, like);
  }
  if (["owner", "admin", "barber"].includes(role)) (where.push("u.role = ?"), args.push(role));
  if (["web", "ios", "android"].includes(platform)) (where.push("a.platform = ?"), args.push(platform));
  if ([7, 30, 90].includes(inactive)) (where.push("(a.last_at IS NULL OR a.last_at < ?)"), args.push(Date.now() - inactive * DAY));
  // Last activity per person and the platform it was on (SQLite: the bare columns come from the MAX row).
  const base = `FROM users u JOIN orgs o ON o.id = u.org_id
    LEFT JOIN (SELECT user_id, platform, app_version, MAX(last_at) AS last_at FROM activity_daily GROUP BY user_id) a ON a.user_id = u.id
    WHERE ${where.join(" AND ")}`;
  const [rows, count] = await c.env.DB.batch([
    c.env.DB
      .prepare(
        `SELECT u.id, u.name, u.username, u.email, u.role, u.active, u.created_at, o.id AS org_id, o.name AS salon, o.slug, o.status AS salon_status,
           a.platform, a.app_version, a.last_at,
           (SELECT COUNT(*) FROM push_tokens p WHERE p.org_id = u.org_id AND p.user_id = u.id) AS push_devices
         ${base} ORDER BY a.last_at IS NULL, a.last_at DESC, u.id DESC LIMIT ${PEOPLE_PAGE} OFFSET ${offset}`,
      )
      .bind(...args),
    c.env.DB.prepare(`SELECT COUNT(*) AS n ${base}`).bind(...args),
  ]);
  return c.json({ people: all(rows), total: Number(all<{ n: number }>(count)[0]?.n ?? 0), page_size: PEOPLE_PAGE });
});

// ---------------------------------------------------------------- AI connect (MCP) across salons

platformApi.get("/insights/ai", async (c) => {
  const w = windows(rangeOf(c), Date.now());
  const db = c.env.DB;
  const [tot, perDay, salons, tools, conns] = await db.batch([
    db
      .prepare(
        `SELECT COUNT(*) AS calls, COALESCE(SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END), 0) AS errors, COALESCE(AVG(ms), 0) AS avg_ms,
           COUNT(DISTINCT org_id) AS salons,
           (SELECT COUNT(*) FROM mcp_calls WHERE at >= ?2 AND at < ?1) AS calls_prev
         FROM mcp_calls WHERE at >= ?1`,
      )
      .bind(w.fromMs, w.prevMs),
    db.prepare(`SELECT ${msDay("at")} AS d, SUM(CASE WHEN ok = 1 THEN 1 ELSE 0 END) AS ok, SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS failed FROM mcp_calls WHERE at >= ? GROUP BY d`).bind(w.fromMs),
    db
      .prepare(
        `SELECT m.org_id, o.name AS salon, o.slug, COUNT(*) AS calls, SUM(CASE WHEN m.ok = 0 THEN 1 ELSE 0 END) AS errors, MAX(m.at) AS last_at
         FROM mcp_calls m JOIN orgs o ON o.id = m.org_id WHERE m.at >= ? GROUP BY m.org_id ORDER BY calls DESC LIMIT 10`,
      )
      .bind(w.fromMs),
    db.prepare("SELECT tool, COUNT(*) AS calls, SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS errors FROM mcp_calls WHERE at >= ? GROUP BY tool ORDER BY calls DESC LIMIT 10").bind(w.fromMs),
    db.prepare("SELECT COUNT(*) AS n FROM mcp_tokens WHERE revoked_at IS NULL AND expires_at > ?").bind(Date.now()),
  ]);
  const days = all<{ d: string; ok: number; failed: number }>(perDay);
  const okS = series(w, days.map((r) => ({ d: r.d, n: r.ok })));
  const failS = series(w, days.map((r) => ({ d: r.d, n: r.failed })));
  return c.json({
    range: w.days,
    tiles: { ...(all<Record<string, number>>(tot)[0] ?? {}), connections: Number(all<{ n: number }>(conns)[0]?.n ?? 0) },
    per_day: okS.map((r, i) => ({ day: r.day, ok: r.n, failed: failS[i]!.n })),
    salons: all(salons),
    tools: all(tools),
  });
});

// ---------------------------------------------------------------- WhatsApp across salons

platformApi.get("/insights/whatsapp", async (c) => {
  const w = windows(rangeOf(c), Date.now());
  const db = c.env.DB;
  const [tot, perDay, kinds, salons] = await db.batch([
    db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END), 0) AS sent,
           COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS failed,
           COALESCE(SUM(CASE WHEN delivered_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS delivered,
           COALESCE(SUM(CASE WHEN read_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS read,
           COUNT(DISTINCT org_id) AS salons,
           (SELECT COUNT(*) FROM wa_messages WHERE status = 'sent' AND created_at >= ?2 AND created_at < ?1) AS sent_prev
         FROM wa_messages WHERE created_at >= ?1`,
      )
      .bind(w.fromMs, w.prevMs),
    db
      .prepare(`SELECT ${msDay("created_at")} AS d, SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent, SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed FROM wa_messages WHERE created_at >= ? GROUP BY d`)
      .bind(w.fromMs),
    db.prepare("SELECT kind, COUNT(*) AS n FROM wa_messages WHERE created_at >= ? AND status = 'sent' GROUP BY kind ORDER BY n DESC").bind(w.fromMs),
    db
      .prepare(
        `SELECT m.org_id, o.name AS salon, o.slug, SUM(CASE WHEN m.status = 'sent' THEN 1 ELSE 0 END) AS sent, SUM(CASE WHEN m.status = 'failed' THEN 1 ELSE 0 END) AS failed
         FROM wa_messages m JOIN orgs o ON o.id = m.org_id WHERE m.created_at >= ? GROUP BY m.org_id ORDER BY sent DESC LIMIT 10`,
      )
      .bind(w.fromMs),
  ]);
  const days = all<{ d: string; sent: number; failed: number }>(perDay);
  const sentS = series(w, days.map((r) => ({ d: r.d, n: r.sent })));
  const failS = series(w, days.map((r) => ({ d: r.d, n: r.failed })));
  return c.json({
    range: w.days,
    tiles: all<Record<string, number>>(tot)[0] ?? {},
    per_day: sentS.map((r, i) => ({ day: r.day, sent: r.n, failed: failS[i]!.n })),
    kinds: all(kinds),
    salons: all(salons),
  });
});

// ---------------------------------------------------------------- ⌘K search

platformApi.get("/search", async (c) => {
  const q = (c.req.query("q") ?? "").trim().toLowerCase().replace(/[%_]/g, "").slice(0, 60);
  if (q.length < 2) return c.json({ salons: [], people: [] });
  const like = `%${q}%`;
  const [salons, people] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT id, name, slug, status FROM orgs WHERE deleted_at IS NULL AND (lower(name) LIKE ?1 OR slug LIKE ?1 OR lower(COALESCE(owner_email, '')) LIKE ?1) ORDER BY name LIMIT 6").bind(like),
    c.env.DB
      .prepare(
        `SELECT u.id, u.name, u.email, u.role, o.id AS org_id, o.name AS salon FROM users u JOIN orgs o ON o.id = u.org_id
         WHERE o.deleted_at IS NULL AND (lower(u.name) LIKE ?1 OR lower(COALESCE(u.email, '')) LIKE ?1) ORDER BY u.name LIMIT 6`,
      )
      .bind(like),
  ]);
  return c.json({ salons: all(salons), people: all(people) });
});

// ---------------------------------------------------------------- Notifications (push broadcast)

type Target = { target: "all" | "org" | "user"; orgId: string | null; userId: number | null };

/** Which push_tokens a broadcast reaches (live salons only; a token row is one phone or browser). */
function targetSql(t: Target): { where: string; args: unknown[] } {
  const live = "p.org_id IN (SELECT id FROM orgs WHERE status IN ('trial','active','grace','past_due'))";
  if (t.target === "org") return { where: `${live} AND p.org_id = ?`, args: [t.orgId] };
  if (t.target === "user") return { where: `${live} AND p.org_id = ? AND p.user_id = ?`, args: [t.orgId, t.userId] };
  return { where: live, args: [] };
}

platformApi.get("/notifications/stats", async (c) => {
  const r = await c.env.DB
    .prepare(
      `SELECT COUNT(*) AS devices, COUNT(DISTINCT p.org_id || ':' || p.user_id) AS people,
         COALESCE(SUM(CASE WHEN m.platform = 'ios' THEN 1 ELSE 0 END), 0) AS ios,
         COALESCE(SUM(CASE WHEN m.platform = 'android' THEN 1 ELSE 0 END), 0) AS android,
         COALESCE(SUM(CASE WHEN p.mobile_session_id IS NULL THEN 1 ELSE 0 END), 0) AS web
       FROM push_tokens p LEFT JOIN mobile_sessions m ON m.id = p.mobile_session_id`,
    )
    .first();
  return c.json({ ...(r ?? {}), configured: !!c.env.FCM_SERVICE_ACCOUNT });
});

platformApi.get("/notifications/history", async (c) => {
  const r = await c.env.DB.prepare("SELECT * FROM push_broadcasts ORDER BY id DESC LIMIT 50").all();
  return c.json({ broadcasts: r.results });
});

/** Sends the next slice of a broadcast (BROADCAST_SLICE pushes) and moves its cursor; done when none are left. */
async function sendSlice(c: PC, id: number) {
  const db = c.env.DB;
  const b = await db.prepare("SELECT * FROM push_broadcasts WHERE id = ?").bind(id).first<{
    id: number; title: string; body: string; target: Target["target"]; org_id: string | null; user_id: number | null; cursor: string | null; done: number; sent: number; failed: number;
  }>();
  if (!b) throw new HttpError(404, "Not found");
  if (b.done) return b;
  const t = targetSql({ target: b.target, orgId: b.org_id, userId: b.user_id });
  const rows = (
    await db
      .prepare(`SELECT p.token, o.slug FROM push_tokens p JOIN orgs o ON o.id = p.org_id WHERE ${t.where} AND p.token > ? ORDER BY p.token LIMIT ${BROADCAST_SLICE}`)
      .bind(...t.args, b.cursor ?? "")
      .all<{ token: string; slug: string }>()
  ).results;
  let sent = 0;
  let failed = 0;
  const dead: string[] = [];
  // One send per salon, so a tap in a browser opens that salon's own address.
  const bySalon = new Map<string, string[]>();
  for (const r of rows) bySalon.set(r.slug, [...(bySalon.get(r.slug) ?? []), r.token]);
  for (const [slug, tokens] of bySalon) {
    const link = c.env.ROOT_DOMAIN ? `https://${slug}.${c.env.ROOT_DOMAIN}/` : undefined;
    try {
      const r = await services(c.env).push.send(c.env, tokens, { title: b.title, body: b.body, path: "/", tag: `broadcast-${b.id}`, link });
      dead.push(...r.dead);
      failed += r.dead.length;
      sent += tokens.length - r.dead.length;
    } catch (e) {
      console.error("broadcast slice failed", (e as Error).message);
      failed += tokens.length;
    }
  }
  const last = rows.at(-1)?.token ?? b.cursor;
  const done = rows.length < BROADCAST_SLICE ? 1 : 0;
  const stmts = [db.prepare("UPDATE push_broadcasts SET sent = sent + ?, failed = failed + ?, cursor = ?, done = ? WHERE id = ?").bind(sent, failed, last, done, b.id)];
  // Uninstalled apps / revoked permissions: forget those tokens (FM's rule, same as notifyUsers).
  if (dead.length) stmts.push(db.prepare(`DELETE FROM push_tokens WHERE token IN (${dead.map(() => "?").join(",")})`).bind(...dead));
  await db.batch(stmts);
  return db.prepare("SELECT * FROM push_broadcasts WHERE id = ?").bind(id).first();
}

platformApi.post("/notifications", async (c) => {
  const b = ((await c.req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const title = typeof b.title === "string" ? b.title.trim() : "";
  const text = typeof b.body === "string" ? b.body.trim() : "";
  const target = b.target === "org" || b.target === "user" ? b.target : "all";
  if (title.length < 2 || title.length > 80) throw new HttpError(400, "Title: 2 to 80 characters");
  if (text.length < 2 || text.length > 300) throw new HttpError(400, "Message: 2 to 300 characters");
  if (!c.env.FCM_SERVICE_ACCOUNT) throw new HttpError(503, "Push notifications aren't set up (FCM_SERVICE_ACCOUNT)");
  const db = c.env.DB;
  let orgId: string | null = null;
  let userId: number | null = null;
  let label = "Everyone";
  if (target !== "all") {
    orgId = typeof b.org_id === "string" ? b.org_id : null;
    const org = orgId ? await db.prepare("SELECT id, name FROM orgs WHERE id = ? AND deleted_at IS NULL").bind(orgId).first<{ id: string; name: string }>() : null;
    if (!org) throw new HttpError(400, "Pick a salon");
    label = org.name;
    if (target === "user") {
      userId = Number(b.user_id);
      const u = Number.isInteger(userId) ? await db.prepare("SELECT name FROM users WHERE id = ? AND org_id = ?").bind(userId, org.id).first<{ name: string }>() : null;
      if (!u) throw new HttpError(400, "Pick a person");
      label = `${u.name} · ${org.name}`;
    }
  }
  const t = targetSql({ target, orgId, userId });
  const n = await db.prepare(`SELECT COUNT(*) AS n FROM push_tokens p WHERE ${t.where}`).bind(...t.args).first<{ n: number }>();
  if (!n?.n) throw new HttpError(400, "Nobody there has notifications switched on");
  const now = Date.now();
  const [ins] = await db.batch([
    db
      .prepare("INSERT INTO push_broadcasts(title, body, target, org_id, user_id, target_label, recipients, sent_by, created_at) VALUES(?,?,?,?,?,?,?,?,?) RETURNING id")
      .bind(title, text, target, orgId, userId, label, n.n, c.var.platform.email, now),
    adminRepo(db).audit({ who: c.var.platform.email, action: "push_broadcast", orgId, after: { title, target: label, recipients: n.n }, at: now }),
  ]);
  const id = Number((ins!.results as { id: number }[])[0]!.id);
  return c.json(await sendSlice(c, id), 201);
});

/** The page calls this until done (each call is one slice: the free plan's subrequest cap). */
platformApi.post("/notifications/:id/continue", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HttpError(404, "Not found");
  return c.json(await sendSlice(c, id));
});
