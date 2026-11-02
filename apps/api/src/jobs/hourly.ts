/**
 * The cron (FM scheduled.ts hourly, per org). wrangler.jsonc triggers it every 10 minutes (R1); each invocation:
 *   1. prune (minute-0 tick only, before org work): jobs/prune.ts;
 *   2. loads every served org (trial/active/grace/past_due) with settings and feature inputs in ONE statement;
 *   3. visits them in id order from offset (tickIndex(at) * 7) % n, wrapping round, so the start rotates per tick;
 *   4. per org, in its local hour (lib/clock), in two passes over that order: first the push jobs (the admins'
 *      summary and the barber reminder, due in their target hour and the next, once per business day:
 *      jobs/push-jobs.ts), then WhatsApp (one open campaign batch, visit reminders from wa_reminder_hour, rating
 *      requests and their reminder in FEEDBACK_HOURS). Push first: its window is two hours, WhatsApp work stays due.
 * Every step is wrapped in try/catch: one org (or one step) failing never stops the others.
 *
 * Free-plan budget (R2), two counters per invocation, shared by every org:
 *   left  = CRON_BUDGET outbound subrequests (WhatsApp Graph calls; FCM = 1 per token + 1 OAuth, R4);
 *   stmts = CRON_STMTS D1 statements, every statement inside a batch included, counted exactly by lib/metered.ts.
 * Before each step its worst-case statement cost is computed from the step's documented formula; the step is skipped
 * (left due for a later tick) when it would cross either counter, and each job's `limit` is derived from both:
 *   org loader 1 (prune 3 on minute 0) | WA config 1, once per org, only once something is due
 *   campaign drain: 6 + 2N (campaign row 1, claim 2, 2 per send, 1 per skipped row, finish 1, view 1, release 1)
 *   visit reminders: 3 + 2L (due 1, claim 1, 1 per item + 1 more for a failed one's release, release 1)
 *   rating requests / rating reminders: 3 + L each (due 1, claim 1, 1 per item, release 1)
 *   summary: SUMMARY_STMTS (7) | barber reminder: BARBER_REMINDER_STMTS (5); 0 once already run today
 * Due work the budget cannot reach stays due: the jobs' claims make every step safe to run again on the next tick.
 */
import type { Env } from "../env";
import { platformRepo, type CronOrg } from "../data/platform";
import { clockOf, PUSH_MAX_TOKENS } from "../data/tenant";
import { primeFeatures } from "../core/features-cache";
import type { WaConfig } from "../core/services";
import { waSetup } from "../tenant/whatsapp/ready";
import { localHour } from "../lib/clock";
import { meteredEnv } from "../lib/metered";
import { CAMPAIGN_BATCH, WA_BATCH, drainCampaign, inFeedbackHours, runFeedback, runFeedbackReminders, runReminders, type Budget, type JobPre } from "./wa-jobs";
import { BARBER_REMINDER_STMTS, SUMMARY_STMTS, pushDueDay, runBarberReminder, runSummary } from "./push-jobs";
import { PRUNE_STMTS, prune } from "./prune";

/** Outbound subrequests per invocation, across all orgs (D19; the free plan allows 50). */
export const CRON_BUDGET = 40;
/** D1 statements per invocation, across all orgs (the free plan counts each one, ~50; our ceiling). */
export const CRON_STMTS = 45;
/** The cron interval (wrangler.jsonc "*\/10 * * * *"). */
export const TICK_MS = 600_000;
export const tickIndex = (at: number): number => Math.floor(at / TICK_MS);

/** Devices per cron push: one full push (tokens + OAuth) fits a fresh budget. */
const TOKEN_CAP = Math.min(PUSH_MAX_TOKENS, CRON_BUDGET - 1);
const ORG_LOADER_STMTS = 1;
const CAMPAIGN_FIXED_STMTS = 6;
const JOB_FIXED_STMTS = 3;
/** The cheapest step's worst case (a rating job with limit 1, WA config loaded): below this nothing more fits. */
const MIN_STEP_STMTS = JOB_FIXED_STMTS + 1;
/** job_runs rows newer than this are read with the orgs (a target+1 run is at most ~2 days after its day starts). */
const DONE_RUNS_WINDOW_MS = 3 * 86_400_000;

export interface HourlyResult {
  /** Orgs the loader returned (served statuses). */
  orgs: number;
  /** Outbound subrequests used (WhatsApp sends + FCM tokens + OAuth). */
  sent: number;
  budgetLeft: number;
  stmtsLeft: number;
}

type CronBudget = Budget & { stmts: number };

async function guarded(what: string, orgId: string | null, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`cron ${what} failed`, orgId ?? "", err);
  }
}

export async function hourly(rawEnv: Env, at: number): Promise<HourlyResult> {
  const budget: CronBudget = { left: CRON_BUDGET, stmts: CRON_STMTS };
  const env = meteredEnv(rawEnv, budget);
  if (new Date(at).getUTCMinutes() === 0 && budget.stmts >= PRUNE_STMTS) await guarded("prune", null, () => prune(env, at));

  let orgs: CronOrg[] = [];
  if (budget.stmts >= ORG_LOADER_STMTS) {
    try {
      orgs = await platformRepo(env.DB).cronOrgs(at - DONE_RUNS_WINDOW_MS);
    } catch (err) {
      console.error("cron org loader failed", err);
    }
  }
  const n = orgs.length;
  const start = n ? (tickIndex(at) * 7) % n : 0;
  const rotated = Array.from({ length: n }, (_, i) => orgs[(start + i) % n]!);
  const ctxs = new Map<string, OrgCtx>();
  const ctxOf = (o: CronOrg) => ctxs.get(o.org.id) ?? ctxs.set(o.org.id, orgCtx(env, o, at)).get(o.org.id)!;
  // Pass 1, the hour-targeted push jobs: they are due for two hours a day only (and cost nothing once done), while
  // WhatsApp work stays due until sent, so a long campaign never crowds a salon's summary out of its window.
  for (const o of rotated) {
    if (budget.stmts < BARBER_REMINDER_STMTS) break;
    await guarded("push jobs", o.org.id, () => runPushJobs(env, ctxOf(o), at, budget));
  }
  // Pass 2, WhatsApp: open campaign batch, visit reminders, rating requests and their reminder.
  for (const o of rotated) {
    if (budget.stmts < MIN_STEP_STMTS || budget.left <= 0) break;
    await guarded("whatsapp jobs", o.org.id, () => runWaJobs(env, ctxOf(o), at, budget));
  }
  return { orgs: n, sent: CRON_BUDGET - budget.left, budgetLeft: budget.left, stmtsLeft: budget.stmts };
}

interface OrgCtx {
  o: CronOrg;
  features: readonly string[];
  hour: number;
  /** WA-ready: the `whatsapp` feature and an org_whatsapp row. */
  wa: boolean;
  pre: JobPre;
  /** D1 statements loading the WA config would still cost (1 until the first load). */
  cfgCost: () => number;
}

function orgCtx(env: Env, o: CronOrg, at: number): OrgCtx {
  const features = primeFeatures(o.org, o.planFeatures, o.limits, o.overrides).features; // waSetup then costs 0 for features
  let cfgP: Promise<WaConfig | null> | null = null;
  return {
    o,
    features,
    hour: localHour(at, clockOf(o.settings)),
    wa: o.hasWa && features.includes("whatsapp"),
    pre: { s: o.settings, cfg: () => (cfgP ??= waSetup(env, o.org)) },
    cfgCost: () => (cfgP ? 0 : 1),
  };
}

/** Summary and barber reminder (push), each in its target hour or the next, once per business day. */
async function runPushJobs(env: Env, c: OrgCtx, at: number, budget: CronBudget): Promise<void> {
  const { org, settings: s, doneRuns } = c.o;
  if (!c.features.includes("push")) return;
  const due = (target: number, job: string) => {
    const day = pushDueDay(at, s, target);
    return day && !doneRuns.has(`${job} ${day}`) ? day : null;
  };
  const summaryDay = s.notify_summary ? due(s.summary_hour, "summary") : null;
  if (summaryDay && budget.stmts >= SUMMARY_STMTS) {
    await guarded("summary", org.id, () => runSummary(env, org, s, summaryDay, at, budget, TOKEN_CAP));
  }
  const reminderDay = s.notify_reminder ? due(s.reminder_hour, "barber_reminder") : null;
  if (reminderDay && budget.stmts >= BARBER_REMINDER_STMTS) {
    await guarded("barber reminder", org.id, () => runBarberReminder(env, org, reminderDay, at, budget, TOKEN_CAP));
  }
}

/** One open campaign batch, visit reminders (hour >= wa_reminder_hour), rating requests + reminders (FEEDBACK_HOURS). */
async function runWaJobs(env: Env, c: OrgCtx, at: number, budget: CronBudget): Promise<void> {
  const { org, settings: s, openCampaign } = c.o;
  if (!c.wa) return;
  const step = (what: string, fn: () => Promise<unknown>) => guarded(what, org.id, fn);

  if (openCampaign !== null && c.features.includes("whatsapp_campaigns")) {
    await step("campaign", async () => {
      const limit = Math.min(CAMPAIGN_BATCH, budget.left, Math.floor((budget.stmts - c.cfgCost() - CAMPAIGN_FIXED_STMTS) / 2));
      if (limit < 1) return;
      const cfg = await c.pre.cfg();
      if (cfg) await drainCampaign(env, org.id, openCampaign, limit, budget, { cfg });
    });
  }

  if (s.wa_reminder_enabled && c.hour >= s.wa_reminder_hour) {
    await step("reminders", async () => {
      const limit = Math.min(WA_BATCH, budget.left, Math.floor((budget.stmts - c.cfgCost() - JOB_FIXED_STMTS) / 2));
      if (limit >= 1) await runReminders(env, org.id, at, limit, budget, c.pre);
    });
  }

  if (s.wa_feedback_enabled && inFeedbackHours(at, s)) {
    const limit = () => Math.min(WA_BATCH, budget.left, budget.stmts - c.cfgCost() - JOB_FIXED_STMTS);
    await step("rating requests", async () => {
      const l = limit();
      if (l >= 1) await runFeedback(env, org.id, at, l, budget, undefined, c.pre);
    });
    await step("rating reminders", async () => {
      const l = limit();
      if (l >= 1) await runFeedbackReminders(env, org.id, at, l, budget, c.pre);
    });
  }
}
