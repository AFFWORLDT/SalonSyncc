/** Global infra tables (no org_id, not tenant data, outside the tenant SQL guard by design). */

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
