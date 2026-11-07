/**
 * Scheduled emails to staff who have an email address (users.email), so each barber knows how they are doing:
 *   - daily: their own day (customers, sales, commission, vs the day before) at the salon's summary_hour
 *     (settings.email_staff_daily);
 *   - monthly: last month's totals on the 1st at MONTHLY_HOUR local time (settings.email_staff_monthly).
 * Same schedule rules as the push jobs (pushDueDay: due in the target hour and the next, at most once per org per
 * business day via job_runs). One Resend batch request carries every email for the org (MAIL_BATCH caps it at 100).
 * Budget: STAFF_EMAIL_STMTS D1 statements (report 1 + claim 1) and 1 subrequest per job.
 */
import type { Settings } from "@ss/contract";
import type { Env } from "../env";
import type { Org } from "../data/platform";
import { jobRunsRepo, reportsRepo } from "../data/tenant";
import { services } from "../core/services";
import { orgAppUrl } from "../core/links";
import { moneyText } from "../lib/money";
import { staffDailyEmail, staffMonthlyEmail, type StaffEmailBase } from "../emails/staff";
import { pushDueDay, type PushJobResult } from "./push-jobs";
import type { Budget } from "./wa-jobs";

export const STAFF_EMAIL_STMTS = 2;
/** The monthly report goes out on the 1st at this local hour (morning, so the month is closed). */
export const MONTHLY_HOUR = 10;

const DAY = 86_400_000;
const ymdPlus = (ymd: string, days: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const dayLabel = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const monthLabel = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

function base(env: Env, org: Org, s: Settings, to: string, name: string): StaffEmailBase {
  const site = env.ROOT_DOMAIN ? `https://${env.ROOT_DOMAIN}` : orgAppUrl(env, org);
  return { brand: env.BRAND_NAME, siteUrl: site, salonName: s.display_name || org.name, appUrl: orgAppUrl(env, org), to, name };
}

/** The day the daily staff email is due for at `at`, else null. */
export const staffDailyDue = (at: number, s: Settings) => (s.email_staff_daily ? pushDueDay(at, s, s.summary_hour) : null);

/** The 1st of the month the monthly staff email is due on at `at`, else null. */
export function staffMonthlyDue(at: number, s: Settings): string | null {
  if (!s.email_staff_monthly) return null;
  const day = pushDueDay(at, s, MONTHLY_HOUR);
  return day && day.endsWith("-01") ? day : null;
}

/** Each barber's own day, once for `day`. "budget": no subrequest left (retried next tick). */
export async function runStaffDaily(env: Env, org: Org, s: Settings, day: string, at: number, budget: Budget): Promise<PushJobResult> {
  if (budget.left < 1) return "budget";
  const rows = await reportsRepo(env.DB, org.id).staffDay(day, ymdPlus(day, -1));
  if (!(await jobRunsRepo(env.DB, org.id).claim("staff_daily", day, at))) return "done";
  if (!rows.length) return "done";
  const money = (m: number) => moneyText(m, s);
  const mails = rows.map((r) => {
    const vs = r.prev_sales > 0 ? `${r.sales >= r.prev_sales ? "▲" : "▼"} ${Math.round((Math.abs(r.sales - r.prev_sales) / r.prev_sales) * 100)}% vs yesterday` : null;
    return staffDailyEmail({ ...base(env, org, s, r.email, r.name), dayLabel: dayLabel(day), count: r.count, sales: money(r.sales), commission: money(r.commission), vs });
  });
  budget.left -= 1;
  await services(env).mail.sendBatch(env, mails);
  return "sent";
}

/** Each barber's last month, once, on the 1st (`first`). */
export async function runStaffMonthly(env: Env, org: Org, s: Settings, first: string, at: number, budget: Budget): Promise<PushJobResult> {
  if (budget.left < 1) return "budget";
  const to = ymdPlus(first, -1);
  const from = `${to.slice(0, 7)}-01`;
  const rows = await reportsRepo(env.DB, org.id).staffMonth(from, to);
  if (!(await jobRunsRepo(env.DB, org.id).claim("staff_monthly", first, at))) return "done";
  if (!rows.length) return "done";
  const money = (m: number) => moneyText(m, s);
  const mails = rows.map((r) =>
    staffMonthlyEmail({
      ...base(env, org, s, r.email, r.name),
      monthLabel: monthLabel(from),
      count: r.count,
      sales: money(r.sales),
      commission: money(r.commission),
      days: r.days,
      best: r.best_day ? `${dayLabel(r.best_day)} (${money(r.best_sales)})` : null,
    }),
  );
  budget.left -= 1;
  await services(env).mail.sendBatch(env, mails);
  return "sent";
}
