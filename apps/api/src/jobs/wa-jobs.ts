/**
 * WhatsApp jobs per org (FM wa-jobs.ts runReminders / runFeedback / runFeedbackReminders): the visit reminder
 * `wa_reminder_days` business days after the last visit, the rating request a while after a bill, and its one reminder.
 *
 * Budget (Workers free plan, D19): every job takes a shared `budget: { left }` of outbound Graph calls. `left` is
 * decremented BEFORE each Graph call and a job stops (leaving the rest due for the next run) when it reaches 0.
 * Overlapping runs (admin double-click, cron vs manual, cron vs the inline hook) never double-send: after the due
 * SELECT each job BULK-claims the rows in one UPDATE ... RETURNING id (stamp = `at`) and only messages the ids it won.
 * D1 cost per job (for Task 11's per-invocation query budget):
 *   setup: org lookup 1 + features (0 when cached, else 2-3) + org_whatsapp 1 + settings 1, then the due list 1
 *     (one SELECT ... LIMIT `limit`) + the claim 1 (skipped when nothing is due); 0 queries when `budget.left` is 0.
 *   per sent/failed/test-skipped item: exactly 1 D1 round trip (the wa_messages log row, batched with a failed
 *     reminder's claim release); a rating request skipped by the 20 h rule costs 0.
 *   on a budget stop: 1 more (one UPDATE releasing every claimed-but-unsent row).
 * Opted-out customers are excluded by the due queries (RF3); a phone outside the org's test list is logged "skipped"
 * without a Graph call (and without spending budget).
 * The claims (wa_reminded_at, wa_feedback_at, wa_feedback_reminded_at) are stamped with the run time `at`.
 * Like FM, the jobs don't check wa_*_enabled or the hour (the cron does, Task 11; the manual run routes don't).
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

/** FM's batch: interactive runs (manual routes) send at most 40. */
export const WA_BATCH = 40;
const DAY_MS = 86_400_000;
const RECENT_MS = 20 * 3_600_000;

/** Rating requests only go out at a polite hour, in the org's local time; a late bill is asked the next morning (cron). */
export const FEEDBACK_HOURS = { from: 9, to: 22 };
export function inFeedbackHours(at: number, s: Pick<Settings, "timezone" | "day_start_hour">): boolean {
  const h = localHour(at, clockOf(s));
  return h >= FEEDBACK_HOURS.from && h < FEEDBACK_HOURS.to;
}

export type Budget = { left: number };
const empty = (): WaReminderRun => ({ due: 0, sent: 0, failed: 0, skipped: 0 });

/** "Ali" for a real name; "Customer" for "Dear …" greetings when there is none. */
const dearName = (label: string | null) => (firstName(label) === "there" ? "Customer" : firstName(label));

type Picture = "rating" | "rating-reminder" | "fresh-cut";
const PICTURE_SETTING = {
  rating: "wa_rating_image_url",
  "rating-reminder": "wa_rating_reminder_image_url",
  "fresh-cut": "wa_fresh_cut_image_url",
} as const satisfies Record<Picture, keyof Settings>;

/** The image header: the org's own picture, else the generic SalonStation one on APP_ORIGIN. */
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
  cfg: WaConfig;
  s: Settings;
  jobs: ReturnType<typeof waJobsRepo>;
  log: ReturnType<typeof waMessagesRepo>;
}

/** The org's WhatsApp setup and settings, or null when the org is gone or not WA-ready (no feature / no number). */
async function setup(env: Env, orgId: string): Promise<JobCtx | null> {
  const org = await platformRepo(env.DB).orgById(orgId);
  if (!org) return null;
  const cfg = await waSetup(env, org);
  if (!cfg) return null;
  return { cfg, s: await settingsRepo(env.DB, orgId).get(), jobs: waJobsRepo(env.DB, orgId), log: waMessagesRepo(env.DB, orgId) };
}

/**
 * One attempt: "skipped" for a phone outside the test list (no Graph call, no budget), null when the budget is spent
 * (the caller stops), else the Graph result after taking one from the budget.
 */
async function attempt(env: Env, j: JobCtx, budget: Budget, phone: string, template: string, params: WaValue[]): Promise<SendResult | null> {
  if (!allowedRecipient(j.cfg.testNumbers, phone, j.cfg.callingCode)) return { status: "skipped", error: "not in test numbers" };
  if (budget.left <= 0) return null;
  budget.left--;
  return services(env).wa.sendTemplate(j.cfg, phone, template, j.s.wa_language, params);
}

/**
 * Customers whose last visit was exactly `wa_reminder_days` business days ago (org clock) and who have not been
 * reminded since, each sent the reminder template once. The claim stamps wa_reminded_at; a failed send restores the
 * previous value in the same batch as its log row, so it is tried again next run (FM); sent or skipped ones are done.
 */
export async function runReminders(env: Env, orgId: string, at: number, limit: number, budget: Budget): Promise<WaReminderRun> {
  const out = empty();
  if (budget.left <= 0) return out;
  const j = await setup(env, orgId);
  if (!j) return out;
  const clock = clockOf(j.s);
  const day = addDays(businessDay(at, clock), -j.s.wa_reminder_days);
  const found = await j.jobs.visitRemindersDue(businessDayStart(day, clock), businessDayStart(addDays(day, 1), clock), limit);
  const won = await j.jobs.claimReminders(found.map((c) => c.id), at);
  const due = found.filter((c) => won.has(c.id));
  out.due = due.length;
  const template = j.s.wa_reminder_template;
  for (let k = 0; k < due.length; k++) {
    const c = due[k]!;
    const params: WaValue[] = [picture(env, j.s, "fresh-cut"), dearName(c.name), String(j.s.wa_reminder_days)];
    const r = await attempt(env, j, budget, c.phone, template, params);
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
export async function runFeedback(env: Env, orgId: string, at: number, limit: number, budget: Budget, saleId?: number): Promise<WaReminderRun> {
  const out = empty();
  if (budget.left <= 0) return out;
  const j = await setup(env, orgId);
  if (!j) return out;
  const clock = clockOf(j.s);
  const cutoff = at - j.s.wa_feedback_delay_min * 60_000;
  const found = await j.jobs.feedbackDue(at - RECENT_MS, cutoff, cutoff - DAY_MS, saleId ?? null, limit);
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
    const r = await attempt(env, j, budget, row.phone, template, params);
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
export async function runFeedbackReminders(env: Env, orgId: string, at: number, limit: number, budget: Budget): Promise<WaReminderRun> {
  const out = empty();
  if (budget.left <= 0) return out;
  const j = await setup(env, orgId);
  if (!j || !j.s.wa_feedback_reminder_min) return out;
  const clock = clockOf(j.s);
  const cutoff = at - j.s.wa_feedback_reminder_min * 60_000;
  const found = await j.jobs.ratingReminderDue(cutoff, cutoff - DAY_MS, j.s.wa_feedback_template, limit);
  const won = await j.jobs.claimFeedbackReminder(found.map((r) => r.id), at);
  const due = found.filter((r) => won.has(r.id));
  out.due = due.length;
  const template = j.s.wa_feedback_reminder_template;
  for (let k = 0; k < due.length; k++) {
    const row = due[k]!;
    const params = ratingParams(env, j.s, clock, "rating-reminder", row);
    const r = await attempt(env, j, budget, row.phone, template, params);
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
 * Sends the next batch of one campaign of org `orgId` (FM wa-jobs drainCampaign): POST /api/wa/campaigns/:id/next
 * (limit and budget 40) and the cron (Task 11, shared budget). Null when this org has no such campaign; the campaign
 * as the API shows it otherwise (unchanged when finished, out of budget or the org is not WA-ready).
 *
 * The claim (data/tenant waCampaignsRepo.claim) stamps sent_at on up to `limit` queued rows in ONE UPDATE ... RETURNING,
 * so overlapping drains get disjoint rows and never send a message twice; a claim older than 5 minutes (a crashed drain)
 * is taken over. Each result write only applies while this drain's claim is in place. A customer who opted out after the
 * campaign was queued is logged "skipped" (RF3), as is a phone outside the org's test list; neither calls Graph nor
 * spends budget. On a budget stop the unsent claims are released (queued, unclaimed) for the next drain. The campaign is
 * finished (finished_at) once no queued row remains.
 *
 * D1 cost (round trips; for Task 11's per-invocation query budget): campaign row 1 (0 when `pre.row` is given) + WA
 * setup when `pre.cfg` is not given (org 1 + features 0-3, cached + org_whatsapp 1; skipped without whatsapp_campaigns) + claim 1 + exactly 1 per Graph send (its
 * result, batched with any skipped rows' results before it) + 1 final batch (remaining skipped results, the release,
 * the finish check and the campaign view: up to 4 statements). Finished, unknown or budget-0: row 1 + view 1.
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
    let r: SendResult;
    if (m.opted_out) r = { status: "skipped", error: "opted out" };
    else if (!allowedRecipient(cfg.testNumbers, m.phone, cfg.callingCode)) r = { status: "skipped", error: "not in test numbers" };
    else {
      if (budget.left <= 0) {
        pending.push(repo.releaseStatement(claimed.slice(i).map((x) => x.id), claim));
        break;
      }
      budget.left--;
      r = await services(env).wa.sendTemplate(cfg, m.phone, k.template, k.language, params);
      await repo.run([...pending, repo.resultStatement(m.id, claim, r, params)]);
      pending = [];
      continue;
    }
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
