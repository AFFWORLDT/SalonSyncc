/**
 * WhatsApp jobs per org (FM wa-jobs.ts runReminders / runFeedback / runFeedbackReminders): the visit reminder
 * `wa_reminder_days` business days after the last visit, the rating request a while after a bill, and its one reminder.
 *
 * Budget (Workers free plan, D19): every job takes a shared `budget: { left }` of outbound Graph calls. `left` is
 * decremented BEFORE each Graph call and a job stops (leaving the rest due for the next run) when it reaches 0.
 * D1 cost per job (for Task 11's per-invocation query budget):
 *   setup: org lookup 1 + features (0 when cached, else 2-3) + org_whatsapp 1 + settings 1, then the due list 1
 *     (one SELECT ... LIMIT `limit`); 0 queries in total when `budget.left` is already 0.
 *   per item: exactly 1 D1 round trip (the wa_messages log row batched with the item's "done" mark).
 * Opted-out customers are excluded by the due queries (RF3); a phone outside the org's test list is logged "skipped"
 * without a Graph call (and without spending budget).
 * "Done" marks (wa_reminded_at, wa_feedback_at, wa_feedback_reminded_at) are stamped with the run time `at`.
 * Like FM, the jobs don't check wa_*_enabled or the hour (the cron does, Task 11; the manual run routes don't).
 */
import type { Settings, WaReminderRun } from "@ss/contract";
import type { Env } from "../env";
import { platformRepo } from "../data/platform";
import { clockOf, settingsRepo, waJobsRepo, waMessagesRepo, type RatingDueRow } from "../data/tenant";
import { services, type SendResult, type WaConfig } from "../core/services";
import { addDays, businessDay, businessDayStart, localHour, type OrgClock } from "../lib/clock";
import { allowedRecipient, firstName, visitTime, type WaValue } from "../lib/whatsapp";
import { waSetup } from "../tenant/whatsapp/ready";

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
 * reminded since, each sent the reminder template once. A failed send is tried again on the next run; sent or
 * skipped ones are done.
 */
export async function runReminders(env: Env, orgId: string, at: number, limit: number, budget: Budget): Promise<WaReminderRun> {
  const out = empty();
  if (budget.left <= 0) return out;
  const j = await setup(env, orgId);
  if (!j) return out;
  const clock = clockOf(j.s);
  const day = addDays(businessDay(at, clock), -j.s.wa_reminder_days);
  const due = await j.jobs.visitRemindersDue(businessDayStart(day, clock), businessDayStart(addDays(day, 1), clock), limit);
  out.due = due.length;
  const template = j.s.wa_reminder_template;
  for (const c of due) {
    const params: WaValue[] = [picture(env, j.s, "fresh-cut"), dearName(c.name), String(j.s.wa_reminder_days)];
    const r = await attempt(env, j, budget, c.phone, template, params);
    if (!r) break;
    const log = j.log.logStatement({ kind: "reminder", phone: c.phone, template, params, customerId: c.id }, r);
    await j.jobs.run(r.status === "failed" ? [log] : [log, j.jobs.markReminded(c.id, at)]);
    out[r.status]++;
  }
  return out;
}

/**
 * Asks for a rating on bills made `wa_feedback_delay_min` ago or more (within the last day), or only `saleId`
 * (the inline request right after a sale). Each bill is asked once (sent, skipped or failed), and a customer at
 * most once per 20 hours: their other bills are marked done without a message.
 */
export async function runFeedback(env: Env, orgId: string, at: number, limit: number, budget: Budget, saleId?: number): Promise<WaReminderRun> {
  const out = empty();
  if (budget.left <= 0) return out;
  const j = await setup(env, orgId);
  if (!j) return out;
  const clock = clockOf(j.s);
  const cutoff = at - j.s.wa_feedback_delay_min * 60_000;
  const due = await j.jobs.feedbackDue(at - RECENT_MS, cutoff, cutoff - DAY_MS, saleId ?? null, limit);
  out.due = due.length;
  const template = j.s.wa_feedback_template;
  const asked = new Set<number>();
  for (const row of due) {
    const stmts: D1PreparedStatement[] = [];
    if (!row.recent && !asked.has(row.customer_id)) {
      const params = ratingParams(env, j.s, clock, "rating", row);
      const r = await attempt(env, j, budget, row.phone, template, params);
      if (!r) break;
      asked.add(row.customer_id);
      stmts.push(j.log.logStatement({ kind: "feedback", phone: row.phone, template, params, customerId: row.customer_id, saleId: row.id }, r));
      out[r.status]++;
    } else out.skipped++;
    stmts.push(j.jobs.markFeedback(row.id, at));
    await j.jobs.run(stmts);
  }
  return out;
}

/**
 * The one reminder: bills whose rating request was sent `wa_feedback_reminder_min` ago or more (within a day) and
 * whose customer neither rated nor tapped through to Google reviews. Each bill is reminded at most once.
 */
export async function runFeedbackReminders(env: Env, orgId: string, at: number, limit: number, budget: Budget): Promise<WaReminderRun> {
  const out = empty();
  if (budget.left <= 0) return out;
  const j = await setup(env, orgId);
  if (!j || !j.s.wa_feedback_reminder_min) return out;
  const clock = clockOf(j.s);
  const cutoff = at - j.s.wa_feedback_reminder_min * 60_000;
  const due = await j.jobs.ratingReminderDue(cutoff, cutoff - DAY_MS, j.s.wa_feedback_template, limit);
  out.due = due.length;
  const template = j.s.wa_feedback_reminder_template;
  for (const row of due) {
    const params = ratingParams(env, j.s, clock, "rating-reminder", row);
    const r = await attempt(env, j, budget, row.phone, template, params);
    if (!r) break;
    await j.jobs.run([
      j.log.logStatement({ kind: "feedback", phone: row.phone, template, params, customerId: row.customer_id, saleId: row.id }, r),
      j.jobs.markFeedbackReminded(row.id, at),
    ]);
    out[r.status]++;
  }
  return out;
}
