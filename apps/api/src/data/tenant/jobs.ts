/**
 * The cron's per-org bookkeeping (Plan 2b Task 11). Every statement is org_id scoped (test/sql-guard.test.ts).
 * Statement costs are part of the cron's free-plan budget (jobs/hourly.ts): each method is exactly 1 D1 statement.
 */
export function jobRunsRepo(db: D1Database, orgId: string) {
  return {
    /**
     * Claims `job` for business day `day`: true for exactly one caller (the first INSERT), false once it already ran.
     * 1 statement.
     */
    async claim(job: string, day: string, at: number): Promise<boolean> {
      const r = await db.prepare("INSERT OR IGNORE INTO job_runs (org_id, job, day, created_at) VALUES (?, ?, ?, ?)").bind(orgId, job, day, at).run();
      return r.meta.changes === 1;
    },

    /** Active barbers with no live sale on `day` (FM scheduled.ts barber reminder). 1 statement. */
    async idleBarbers(day: string): Promise<number[]> {
      const { results } = await db
        .prepare(
          `SELECT u.id FROM users u WHERE u.org_id = ?1 AND u.role = 'barber' AND u.active = 1
             AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.org_id = ?1 AND s.barber_id = u.id AND s.day = ?2 AND s.deleted_at IS NULL)
           ORDER BY u.id`,
        )
        .bind(orgId, day)
        .all<{ id: number }>();
      return results.map((r) => r.id);
    },
  };
}
