/**
 * The cron's hour-targeted push jobs (FM scheduled.ts): the admins' end-of-day summary at `summary_hour` and the
 * "no sales yet" nudge to idle barbers at `reminder_hour`, both in the org's local time (lib/clock, not FM's UTC+4).
 *
 * Schedule (R1): the cron ticks every 10 minutes; a job is due while the org-local hour is its target or target+1, and
 * runs at most once per org per business day: job_runs (data/tenant/jobs.ts) is claimed with INSERT OR IGNORE right
 * before the writes, and only the tick whose insert applied sends. The day is the business day of the target hour, so
 * a summary at 23:00 caught up at 00:10 is still that day's summary.
 *
 * Budget (R2/R4): FCM costs one subrequest per device token plus 1 for the OAuth token (counted always: the isolate
 * may be cold). A cron push goes to at most `tokenCap` devices (CRON_BUDGET - 1, so a full push fits a fresh budget);
 * if it does not fit what is left, the job is not claimed and the next tick tries again.
 * D1 STATEMENTS, worst case (recipients <= 90; more cost 1 per extra 90 in both the token read and nothing else):
 *   summary: day totals 2 (one batch) + admins 1 + tokens 1 + claim 1 + feed rows 1 + dead tokens 1 = SUMMARY_STMTS (7)
 *   barber reminder: idle barbers 1 + tokens 1 + claim 1 + feed rows 1 + dead tokens 1 = BARBER_REMINDER_STMTS (5)
 *   Without FCM_SERVICE_ACCOUNT the token read and the dead-token delete are skipped (feed rows only, as notifyUsers).
 */
import type { Settings } from "@ss/contract";
import type { Env } from "../env";
import type { Org } from "../data/platform";
import { clockOf, jobRunsRepo, notificationsRepo, reportsRepo } from "../data/tenant";
import { services, type Push } from "../core/services";
import { orgAppUrl } from "../core/links";
import { businessDay, localHour } from "../lib/clock";
import { moneyText } from "../lib/money";
import type { Budget } from "./wa-jobs";

const HOUR = 3_600_000;
/** tokensFor / deleteTokens chunk ids by 90 (D1's bound-parameter cap). */
const ID_CHUNK = 90;

export const SUMMARY_STMTS = 7;
export const BARBER_REMINDER_STMTS = 5;

export type PushJobResult = "sent" | "done" | "budget";

/**
 * The business day an hour-targeted job is due for at `at` (org-local hour = target or target+1), else null.
 */
export function pushDueDay(at: number, s: Pick<Settings, "timezone" | "day_start_hour">, target: number): string | null {
  const clock = clockOf(s);
  const late = (localHour(at, clock) - target + 24) % 24;
  if (late > 1) return null;
  return businessDay(at - late * HOUR, clock);
}

/**
 * Records `push` in the feed of `ids` and sends it to their devices, once for (`job`, `day`). "budget": it did not
 * fit (not claimed, retried next tick); "done": already ran today, or nobody to tell (claimed); "sent": done now.
 */
async function pushOnce(env: Env, org: Org, job: string, day: string, at: number, ids: number[], push: Push, budget: Budget, tokenCap: number): Promise<PushJobResult> {
  const repo = notificationsRepo(env.DB, org.id);
  const fcm = !!env.FCM_SERVICE_ACCOUNT && ids.length > 0;
  const chunks = Math.ceil(ids.length / ID_CHUNK);
  const need = (fcm ? chunks + 1 : 0) + 2; // tokens + dead tokens, claim + feed rows
  if (budget.stmts !== undefined && budget.stmts < need) return "budget";
  const tokens = fcm ? await repo.tokensFor(ids, tokenCap) : [];
  const cost = tokens.length ? tokens.length + 1 : 0; // one fetch per token + the OAuth token
  if (cost > budget.left) return "budget";
  if (!(await jobRunsRepo(env.DB, org.id).claim(job, day, at))) return "done";
  if (!ids.length) return "done";
  await repo.record(ids, push); // feed first, so the bell has it even if the push fails
  if (!tokens.length) return "sent";
  budget.left -= cost;
  const link = new URL(push.path ?? "/", `${orgAppUrl(env, org)}/`).toString();
  try {
    const { dead } = await services(env).push.send(env, tokens, { ...push, link });
    if (dead.length) await repo.deleteTokens(dead);
  } catch (err) {
    console.error("cron push failed", org.id, job, err);
  }
  return "sent";
}

/** FM's end-of-day summary to the org's active owner and admins, money in the org's currency. */
export async function runSummary(env: Env, org: Org, s: Settings, day: string, at: number, budget: Budget, tokenCap: number): Promise<PushJobResult> {
  const t = await reportsRepo(env.DB, org.id).daySummary(day);
  const money = (minor: number) => moneyText(minor, s);
  const admins = await notificationsRepo(env.DB, org.id).adminIds();
  const push: Push = {
    title: `Today: ${money(t.sales)} · ${t.count} customer${t.count === 1 ? "" : "s"}`,
    body: `Profit ${money(t.profit)} · expense ${money(t.expense)} · commission ${money(t.commission)}${t.top ? ` · top: ${t.top.name} ${money(t.top.sales)}` : ""}`,
    path: "/",
    tag: `summary-${day}`,
  };
  return pushOnce(env, org, "summary", day, at, admins, push, budget, tokenCap);
}

/** FM's nudge to active barbers with no sale logged yet on `day`. */
export async function runBarberReminder(env: Env, org: Org, day: string, at: number, budget: Budget, tokenCap: number): Promise<PushJobResult> {
  const idle = await jobRunsRepo(env.DB, org.id).idleBarbers(day);
  const push: Push = { title: "No sales logged yet today", body: "Add each customer as you finish, so today's sheet stays right.", path: "/", tag: `reminder-${day}` };
  return pushOnce(env, org, "barber_reminder", day, at, idle, push, budget, tokenCap);
}
