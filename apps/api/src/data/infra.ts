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
] as const;

/**
 * The cron's prune (R5), 3 D1 statements in one batch: rate_hits windows that ended more than 5 minutes ago (public
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
  ]);
}
