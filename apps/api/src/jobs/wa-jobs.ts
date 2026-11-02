/**
 * WhatsApp jobs per org (FM wa-jobs.ts runReminders / runFeedback / runFeedbackReminders): the visit reminder
 * `wa_reminder_days` business days after the last visit, the rating request a while after a bill, and its one reminder.
 *
 * Budget (Workers free plan, D19): every job takes a shared `budget: { left }` of outbound Graph calls. `left` is
 * decremented BEFORE each Graph call and a job stops (leaving the rest due for the next run) when it reaches 0.
 * Overlapping runs (admin double-click, cron vs manual, cron vs the inline hook) never double-send: after the due
 * SELECT each job BULK-claims the rows in one UPDATE ... RETURNING id (stamp = `at`) and only messages the ids it won.
 * D1 cost per job, in STATEMENTS (what the free plan counts; the cron's budget, jobs/hourly.ts):
 *   setup without `pre`: org lookup 1 + features (0 when cached, else 1-3) + org_whatsapp 1 + settings 1; with the
 *     cron's `pre` (settings from its org loader, lazy WA config): 0, plus org_whatsapp 1 on first need (only once
 *     something is due). Then the due list 1 (one SELECT ... LIMIT `limit`) + the claim 1 (skipped when nothing is
 *     due); 0 statements when `budget.left` is 0.
 *   per sent/failed/test-skipped item: exactly 1 D1 round trip: the wa_messages log row (1 statement), batched with
 *     the claim release for a FAILED visit reminder (2 statements); a rating request skipped by the 20 h rule costs 0.
 *   on a budget stop: 1 more (one UPDATE releasing every claimed-but-unsent row).
 *   So with `pre`, worst case: runReminders 3 + 2*limit (+1 WA config), runFeedback / runFeedbackReminders
 *   3 + limit (+1 WA config).
 * Opted-out customers are excluded by the due queries (RF3); a phone outside the org's test list is logged "skipped"
 * without a Graph call (and without spending budget).
 * The claims (wa_reminded_at, wa_feedback_at, wa_feedback_reminded_at) are stamped with the run time `at`.
 * Like FM, the jobs don't check wa_*_enabled or the hour (the cron does, Task 11; the manual run routes don't). Callers
 * size `limit` with reminderLimit / ratingLimit from a metered budget (lib/metered): the cron and the manual routes.
 */
import type { Settings, WaCampaign, WaParam, WaReminderRun } from "@ss/contract";
import type { Env } from "../env";
import { platformRepo } from "../data/platform";
import { clockOf, settingsRepo, waCampaignsRepo, waJobsRepo, waMessagesRepo, type CampaignRow, type RatingDueRow } from "../data/tenant";
import { services, type SendResult, type WaConfig } from "../core/services";
import { addDays, businessDay, businessDayStart, localHour, type OrgClock } from "../lib/clock";
import { allowedRecipient, bodyParams, firstName, visitTime, type WaValue } from "../lib/whatsapp";
import { waSetup } from "../tenant/whatsapp/ready";
import { featuresFor } from "../core/features-cache";

/** FM's batch: at most 40 sends per job run (the cron and the manual routes cap it further by statements). */
export const WA_BATCH = 40;

/** A job run's fixed worst-case statements with `pre` (due list 1, claim 1, release 1 on a budget stop). */
export const JOB_FIXED_STMTS = 3;
type Counters = { left: number; stmts: number };
/** Visit reminders that fit both counters: 3 + 2L statements (a failed send also releases its claim), `extra` reserved. */
export const reminderLimit = (b: Counters, extra = 0): number =>
  Math.max(0, Math.min(WA_BATCH, b.left, Math.floor((b.stmts - extra - JOB_FIXED_STMTS) / 2)));
/** Rating requests or rating reminders that fit both counters: 3 + L statements, `extra` reserved. */
export const ratingLimit = (b: Counters, extra = 0): number => Math.max(0, Math.min(WA_BATCH, b.left, b.stmts - extra - JOB_FIXED_STMTS));
const DAY_MS = 86_400_000;
const RECENT_MS = 20 * 3_600_000;

/** Rating requests only go out at a polite hour, in the org's local time; a late bill is asked the next morning (cron). */
export const FEEDBACK_HOURS = { from: 9, to: 22 };
export function inFeedbackHours(at: number, s: Pick<Settings, "timezone" | "day_start_hour">): boolean {
  const h = localHour(at, clockOf(s));
  return h >= FEEDBACK_HOURS.from && h < FEEDBACK_HOURS.to;
}

/**
 * Shared per-run budget: `left` = outbound Graph/FCM calls (decremented before each one). `stmts` = D1 statements
 * left, set by the cron and the HTTP routes that run jobs, decremented by lib/metered.ts (the jobs never read it; the
 * callers size `limit` from it).
 */
export type Budget = { left: number; stmts?: number };

/** The cron's per-org context: settings from its one org-loader statement and the WA config, loaded on first use. */
export interface JobPre {
  s: Settings;
  cfg: () => Promise<WaConfig | null>;
}
const empty = (): WaReminderRun => ({ due: 0, sent: 0, failed: 0, skipped: 0 });

/** "Ali" for a real name; "Customer" for "Dear …" greetings when there is none. */
const dearName = (label: string | null) => (firstName(label) === "there" ? "Customer" : firstName(label));

type Picture = "rating" | "rating-reminder" | "fresh-cut";
const PICTURE_SETTING = {
  rating: "wa_rating_image_url",
  "rating-reminder": "wa_rating_reminder_image_url",
  "fresh-cut": "wa_fresh_cut_image_url",
} as const satisfies Record<Picture, keyof Settings>;

/** The image header: the org's own picture, else the generic SalonKit one on APP_ORIGIN. */
function picture(env: Env, s: Settings, kind: Picture): WaValue {
  const own = s[PICTURE_SETTING[kind]];
  return { part: "header", key: "media", media: "image", text: own || `${env.APP_ORIGIN.replace(/\/+$/, "")}/wa/${kind}.jpg` };
}

/** The rating templates (always picture style): image, name, services, barber, visit time, and the button link suffix = token. */
function ratingParams(env: Env, s: Settings, clock: OrgClock, kind: Picture, r: RatingDueRow): WaValue[] {
  const services = r.services ? (r.services.length > 120 ? `${r.services.slice(0, 117)}...` : r.services) : "visit";
  return [picture(env, s, kind), dearName(r.name), services, r.barber_name, visitTime(r.created_at, clock, s.locale), { part: "button", index: 0, text: r.token }];
}

interface JobCtx {
  /** Resolved before setup returns (no `pre`) or on first call (cron `pre`): called only once something is due. */
  cfg: () => Promise<WaConfig | null>;
  s: Settings;
  jobs: ReturnType<typeof waJobsRepo>;
  log: ReturnType<typeof waMessagesRepo>;
}

/**
 * The org's WhatsApp setup and settings, or null when the org is gone or not WA-ready (no feature / no number). With
 * the cron's `pre` nothing is read here: the cron already checked the feature and the number (its org loader).
 */
async function setup(env: Env, orgId: string, pre?: JobPre): Promise<JobCtx | null> {
  const repos = { jobs: waJobsRepo(env.DB, orgId), log: waMessagesRepo(env.DB, orgId) };
  if (pre) return { cfg: pre.cfg, s: pre.s, ...repos };
  const org = await platformRepo(env.DB).orgById(orgId);
  if (!org) return null;
  const cfg = await waSetup(env, org);
  if (!cfg) return null;
  return { cfg: async () => cfg, s: await settingsRepo(env.DB, orgId).get(), ...repos };
}

/**
 * One attempt: "skipped" for a phone outside the test list (no Graph call, no budget), null when the budget is spent
 * (the caller stops), else the Graph result after taking one from the budget.
 */
async function attempt(env: Env, j: JobCtx, cfg: WaConfig, budget: Budget, phone: string, template: string, params: WaValue[]): Promise<SendResult | null> {
  if (!allowedRecipient(cfg.testNumbers, phone, cfg.callingCode)) return { status: "skipped", error: "not in test numbers" };
  if (budget.left <= 0) return null;
  budget.left--;
  return services(env).wa.sendTemplate(cfg, phone, template, j.s.wa_language, params);
}

/**
 * Customers whose last visit was exactly `wa_reminder_days` business days ago (org clock) and who have not been
 * reminded since, each sent the reminder template once. The claim stamps wa_reminded_at; a failed send restores the
 * previous value in the same batch as its log row, so it is tried again next run (FM); sent or skipped ones are done.
 */
export async function runReminders(env: Env, orgId: string, at: number, limit: number, budget: Budget, pre?: JobPre): Promise<WaReminderRun> {
  const out = empty();
  if (budget.left <= 0) return out;
  const j = await setup(env, orgId, pre);
  if (!j) return out;
  const clock = clockOf(j.s);
  const day = addDays(businessDay(at, clock), -j.s.wa_reminder_days);
  const found = await j.jobs.visitRemindersDue(businessDayStart(day, clock), businessDayStart(addDays(day, 1), clock), limit);
  const cfg = found.length ? await j.cfg() : null;
  if (!cfg) return out;
  const won = await j.jobs.claimReminders(found.map((c) => c.id), at);
  const due = found.filter((c) => won.has(c.id));
  out.due = due.length;
  const template = j.s.wa_reminder_template;
  for (let k = 0; k < due.length; k++) {
    const c = due[k]!;
    const params: WaValue[] = [picture(env, j.s, "fresh-cut"), dearName(c.name), String(j.s.wa_reminder_days)];
    const r = await attempt(env, j, cfg, budget, c.phone, template, params);
    if (!r) {
      await j.jobs.run([j.jobs.releaseReminders(due.slice(k).map((x) => [x.id, x.wa_reminded_at]), at)]);
      break;
    }
    const log = j.log.logStatement({ kind: "reminder", phone: c.phone, template, params, customerId: c.id }, r);
    await j.jobs.run(r.status === "failed" ? [log, j.jobs.releaseReminders([[c.id, c.wa_reminded_at]], at)] : [log]);
    out[r.status]++;
  }
  return out;
}

/**
 * Asks for a rating on bills made `wa_feedback_delay_min` ago or more (within the last day), or only `saleId`
 * (the inline request right after a sale). The claim marks each bill asked (sent, skipped or failed: FM keeps a
 * failed request done), and a customer is asked at most once per 20 hours: their other bills are done without a message.
 */
export async function runFeedback(env: Env, orgId: string, at: number, limit: number, budget: Budget, saleId?: number, pre?: JobPre): Promise<WaReminderRun> {
  const out = empty();
  if (budget.left <= 0) return out;
  const j = await setup(env, orgId, pre);
  if (!j) return out;
  const clock = clockOf(j.s);
  const cutoff = at - j.s.wa_feedback_delay_min * 60_000;
  const found = await j.jobs.feedbackDue(at - RECENT_MS, cutoff, cutoff - DAY_MS, saleId ?? null, limit);
  const cfg = found.length ? await j.cfg() : null;
  if (!cfg) return out;
  const won = await j.jobs.claimFeedback(found.map((r) => r.id), at);
  const due = found.filter((r) => won.has(r.id));
  out.due = due.length;
  const template = j.s.wa_feedback_template;
  const asked = new Set<number>();
  for (let k = 0; k < due.length; k++) {
    const row = due[k]!;
    if (row.recent || asked.has(row.customer_id)) {
      out.skipped++; // already claimed = done; nothing to write
      continue;
    }
    const params = ratingParams(env, j.s, clock, "rating", row);
    const r = await attempt(env, j, cfg, budget, row.phone, template, params);
    if (!r) {
      // Unsent bills go back to due; ones skipped above for the 20 h rule stay done (FM marks them too).
      const unsent = due.slice(k).filter((x) => !x.recent && !asked.has(x.customer_id)).map((x) => x.id);
      await j.jobs.run([j.jobs.releaseFeedback(unsent, at)]);
      break;
    }
    asked.add(row.customer_id);
    await j.jobs.run([j.log.logStatement({ kind: "feedback", phone: row.phone, template, params, customerId: row.customer_id, saleId: row.id }, r)]);
    out[r.status]++;
  }
  return out;
}

/**
 * The one reminder: bills whose rating request was sent `wa_feedback_reminder_min` ago or more (within a day) and
 * whose customer neither rated nor tapped through to Google reviews. Each bill is reminded at most once (the claim).
 */
export async function runFeedbackReminders(env: Env, orgId: string, at: number, limit: number, budget: Budget, pre?: JobPre): Promise<WaReminderRun> {
  const out = empty();
  if (budget.left <= 0) return out;
  const j = await setup(env, orgId, pre);
  if (!j || !j.s.wa_feedback_reminder_min) return out;
  const clock = clockOf(j.s);
  const cutoff = at - j.s.wa_feedback_reminder_min * 60_000;
  const found = await j.jobs.ratingReminderDue(cutoff, cutoff - DAY_MS, j.s.wa_feedback_template, limit);
  const cfg = found.length ? await j.cfg() : null;
  if (!cfg) return out;
  const won = await j.jobs.claimFeedbackReminder(found.map((r) => r.id), at);
  const due = found.filter((r) => won.has(r.id));
  out.due = due.length;
  const template = j.s.wa_feedback_reminder_template;
  for (let k = 0; k < due.length; k++) {
    const row = due[k]!;
    const params = ratingParams(env, j.s, clock, "rating-reminder", row);
    const r = await attempt(env, j, cfg, budget, row.phone, template, params);
    if (!r) {
      await j.jobs.run([j.jobs.releaseFeedbackReminder(due.slice(k).map((x) => x.id), at)]);
      break;
    }
    await j.jobs.run([j.log.logStatement({ kind: "feedback", phone: row.phone, template, params, customerId: row.customer_id, saleId: row.id }, r)]);
    out[r.status]++;
  }
  return out;
}

/**
 * Campaign sends per drain call (/next, and the cron's per-campaign batch; Task 11 imports it). The free plan counts
 * EVERY D1 statement (each one inside a batch too) toward ~50 per invocation; our ceiling is 45. A cold /next costs
 * about 11 + 2N statements (N sends), so N = 15 is about 41. Free-plan limit: raise on upgrade.
 */
export const CAMPAIGN_BATCH = 15;
/** drainCampaign's fixed worst-case statements when given `pre.row` and `pre.cfg`: claim 2, finish 1, view 1, release 1. */
export const DRAIN_FIXED_STMTS = 5;

/**
 * Sends the next batch of one campaign of org `orgId` (FM wa-jobs drainCampaign): POST /api/wa/campaigns/:id/next
 * (limit and budget CAMPAIGN_BATCH) and the cron (Task 11, shared budget). Null when this org has no such campaign; the
 * campaign as the API shows it otherwise (unchanged when finished, out of budget or the org is not WA-ready).
 *
 * Claim: data/tenant waCampaignsRepo.claim stamps sent_at on up to `limit` queued rows in ONE UPDATE ... RETURNING, so
 * overlapping drains get disjoint rows. AT-MOST-ONCE (as the Task 9 jobs): right before each Graph call the row is
 * marked SENDING (error column, batched with the previous row's result), and the send only happens when that mark
 * applied (this drain still holds the claim). If the drain dies after that (request killed mid-loop, D1 cap hit), the
 * next drain to come along after 5 minutes marks the row failed "interrupted, may have been sent" instead of sending it
 * again; claimed rows that were never attempted are simply claimed again. Each result write only applies while this
 * drain's claim is in place.
 *
 * Opt-out (RF3): the customer's wa_opt_out is read at CLAIM time (in the claim's RETURNING), so a customer who opted out
 * after the campaign was queued is logged "skipped / opted out". Tolerance: a STOP that lands between the claim and
 * the send (seconds; at most one batch) is not seen by this batch. A phone outside the org's test list is skipped too;
 * neither calls Graph nor spends budget. On a budget stop the unsent claims are released (queued, unclaimed). The
 * campaign is finished (finished_at) once no queued row remains.
 *
 * D1 cost in STATEMENTS (what the free plan counts, batched or not; for Task 11's per-invocation budget): campaign
 * row 1 (0 when `pre.row` is given) + WA setup when `pre.cfg` is not given (org 1 + features 0-3, cached + org_whatsapp
 * 1; skipped without whatsapp_campaigns) + claim 2 + 2 per Graph send (its SENDING mark and its result) + 1 per skipped
 * row (its result) + finish 1 + view 1 (+ release 1 on a budget stop). Round trips: claim 1, 1 per send, final batch 1.
 * Finished, unknown or budget-0: row 1 + view 1. A cold /next with 15 sends, session auth included: about 41.
 */
export async function drainCampaign(
  env: Env,
  orgId: string,
  campaignId: number,
  limit: number,
  budget: Budget,
  pre: { cfg?: WaConfig; row?: CampaignRow } = {},
): Promise<WaCampaign | null> {
  const repo = waCampaignsRepo(env.DB, orgId);
  const k = pre.row ?? (await repo.row(campaignId));
  if (!k) return null;
  if (k.finished_at || budget.left <= 0) return repo.view(k.id);
  const cfg = pre.cfg ?? (await orgWa(env, orgId));
  if (!cfg) return repo.view(k.id);
  const claim = Date.now();
  const claimed = await repo.claim(k.id, claim, limit);
  const spec = JSON.parse(k.params) as WaParam[];
  let pending: D1PreparedStatement[] = [];
  for (let i = 0; i < claimed.length; i++) {
    const m = claimed[i]!;
    const params = bodyParams(spec, m.name);
    if (m.opted_out) {
      pending.push(repo.resultStatement(m.id, claim, { status: "skipped", error: "opted out" }, params));
      continue;
    }
    if (!allowedRecipient(cfg.testNumbers, m.phone, cfg.callingCode)) {
      pending.push(repo.resultStatement(m.id, claim, { status: "skipped", error: "not in test numbers" }, params));
      continue;
    }
    if (budget.left <= 0) {
      pending.push(repo.releaseStatement(claimed.slice(i).map((x) => x.id), claim));
      break;
    }
    // Earlier results + this row's SENDING mark in one round trip; no mark (claim lost) = no send.
    const res = await repo.run([...pending, repo.sendingStatement(m.id, claim)]);
    pending = [];
    if (res[res.length - 1]!.meta.changes !== 1) continue;
    budget.left--;
    const r = await services(env).wa.sendTemplate(cfg, m.phone, k.template, k.language, params);
    pending.push(repo.resultStatement(m.id, claim, r, params));
  }
  const res = await repo.run([...pending, repo.finishStatement(k.id), repo.viewStatement(k.id)]);
  return (res[res.length - 1]!.results[0] as WaCampaign | undefined) ?? null;
}

/** No session (cron): the org's WhatsApp config when it has `whatsapp_campaigns` and is WA-ready, else null (silently skipped). */
async function orgWa(env: Env, orgId: string): Promise<WaConfig | null> {
  const org = await platformRepo(env.DB).orgById(orgId);
  if (!org || !(await featuresFor(env.DB, org)).features.includes("whatsapp_campaigns")) return null;
  return waSetup(env, org); // features are cached per isolate: no second lookup
}
