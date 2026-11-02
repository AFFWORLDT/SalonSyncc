import type { Env } from "../env";
import { pruneInfra } from "../data/infra";

/** D1 statements one prune costs (one batch of 3), counted in the cron's budget. */
export const PRUNE_STMTS = 3;

/**
 * Old throttling and bookkeeping rows (R5, FM scheduled.ts "throttle cleanup"): rate_hits windows that ended over
 * 5 minutes ago, login_failures over 24 hours old, job_runs over 7 days old. The cron runs it on its minute-0 tick only.
 */
export async function prune(env: Env, at: number): Promise<void> {
  await pruneInfra(env.DB, at);
}
