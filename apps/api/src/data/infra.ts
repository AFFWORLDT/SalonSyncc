/** Global infra tables (no org_id, not tenant data, outside the tenant SQL guard by design). */
import { loginWindow, minuteWindow, hourWindow } from "../lib/limits";

/** Counts one hit on `key` in fixed window `window` and returns the count inside that window. */
export async function rateHit(db: D1Database, key: string, window: number): Promise<number> {
  const r = await db
    .prepare(
      `INSERT INTO rate_hits (key, window, n) VALUES (?, ?, 1)
       ON CONFLICT(key) DO UPDATE SET n = CASE WHEN window = excluded.window THEN n + 1 ELSE 1 END, window = excluded.window
       RETURNING n`,
    )
    .bind(key, window)
    .first<{ n: number }>();
  return r?.n ?? 0;
}

/** Current count for `key` inside fixed window `window` (0 if none or the stored window is older). Does not count a hit. */
export async function rateCount(db: D1Database, key: string, window: number): Promise<number> {
  const r = await db.prepare("SELECT n FROM rate_hits WHERE key = ? AND window = ?").bind(key, window).first<{ n: number }>();
  return r?.n ?? 0;
}

/**
 * Retention deletes on tenant tables that are deliberately NOT org-scoped: pure age-based cleanup across every salon,
 * run by the cron (jobs/prune.ts). They read nothing and only ever remove expired rows, so no org can see or change
 * another's data through them. test/sql-guard.test.ts allows exactly these statements in this file.
 */
export const GLOBAL_RETENTION_SQL = [
  "DELETE FROM login_failures WHERE at < ?",
  "DELETE FROM job_runs WHERE created_at < ?",
  "DELETE FROM mcp_calls WHERE at < ?",
  "DELETE FROM mcp_auth_requests WHERE expires_at < ?",
  "DELETE FROM mcp_tokens WHERE expires_at < ?",
  "DELETE FROM mcp_tokens WHERE revoked_at < ?",
] as const;

/**
 * The cron's prune (R5), 9 D1 statements in one batch: rate_hits windows that ended more than 5 minutes ago (public
 * limiter keys count in minutes, `login-ip:` device keys in 15-minute windows, `signup:` keys in hours, so each is compared in its own unit),
 * login_failures older than 24 hours and job_runs older than 7 days.
 */
export async function pruneInfra(db: D1Database, at: number): Promise<void> {
  const cutoff = at - 5 * 60_000;
  await db.batch([
    db
      .prepare(
        "DELETE FROM rate_hits WHERE window < CASE WHEN substr(key, 1, 9) = 'login-ip:' THEN ?2 WHEN substr(key, 1, 7) = 'signup:' THEN ?3 ELSE ?1 END",
      )
      .bind(minuteWindow(cutoff), loginWindow(cutoff), hourWindow(at - 3_600_000)),
    db.prepare(GLOBAL_RETENTION_SQL[0]).bind(at - 86_400_000),
    db.prepare(GLOBAL_RETENTION_SQL[1]).bind(at - 7 * 86_400_000),
    // AI connect: calls kept 30 days; approvals once expired; credentials 7 days after they expired or were revoked
    // (a rotated refresh token stays that long so its reuse is still detected and revokes the connection).
    db.prepare(GLOBAL_RETENTION_SQL[2]).bind(at - 30 * 86_400_000),
    db.prepare(GLOBAL_RETENTION_SQL[3]).bind(at),
    db.prepare(GLOBAL_RETENTION_SQL[4]).bind(at - 7 * 86_400_000),
    db.prepare(GLOBAL_RETENTION_SQL[5]).bind(at - 7 * 86_400_000),
    // OAuth app registrations unused for 90 days (a live connection refreshes, and so marks its app, at least every 30 days).
    db.prepare("DELETE FROM mcp_clients WHERE last_used_at < ?").bind(at - MCP_CLIENT_IDLE_MS),
    // Portal usage statistics: 180 days.
    db.prepare("DELETE FROM activity_daily WHERE day < ?").bind(new Date(at - 180 * 86_400_000).toISOString().slice(0, 10)),
  ]);
}

// ---------- AI connect OAuth clients (dynamic client registration happens before any salon is chosen) ----------

export const MCP_CLIENT_IDLE_MS = 90 * 86_400_000;

export interface McpClient {
  id: string;
  name: string;
  redirect_uris: string[];
}

export async function mcpClientCreate(db: D1Database, c: McpClient): Promise<void> {
  await db
    .prepare("INSERT INTO mcp_clients (id, name, redirect_uris_json, created_at, last_used_at) VALUES (?1, ?2, ?3, ?4, ?4)")
    .bind(c.id, c.name, JSON.stringify(c.redirect_uris), Date.now())
    .run();
}

export async function mcpClientById(db: D1Database, id: string): Promise<McpClient | null> {
  const r = await db.prepare("SELECT id, name, redirect_uris_json FROM mcp_clients WHERE id = ?").bind(id).first<{ id: string; name: string; redirect_uris_json: string }>();
  return r ? { id: r.id, name: r.name, redirect_uris: JSON.parse(r.redirect_uris_json) as string[] } : null;
}

/** Marks an OAuth client as in use (authorize, code exchange, refresh). */
export async function mcpClientTouch(db: D1Database, id: string, now = Date.now()): Promise<void> {
  await db.prepare("UPDATE mcp_clients SET last_used_at = ? WHERE id = ?").bind(now, id).run();
}
