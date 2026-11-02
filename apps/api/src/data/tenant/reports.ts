import type { BarberCol, DailySheet, MonthlyReport, MyReport, Overview, Totals } from "@ss/contract";
import type { OrgClock } from "../../lib/clock";
import { addDays, businessDay, daysOfMonth } from "../../lib/clock";
import { DAY_RE, barberNet, shopProfit } from "../../lib/money";
import { avatarUrl } from "./users";
import { salesRepo } from "./sales";

// Port of FM reports.ts. Every query is scoped by org_id (test/sql-guard.test.ts enforces it); deleted sales never count.
// No clock reads in here: callers pass `now` (ms) so tests are deterministic.

interface SaleAgg {
  key: string; // day or month
  barber_id: number;
  sales: number;
  commission: number;
  count: number;
}
interface ExpAgg {
  key: string;
  barber_id: number;
  expense: number;
}
type Cell = { sales: number; commission: number; expense: number; count: number };
type Range = Totals & { profit: number; company_expense: number };

const zero = (): Totals => ({ sales: 0, count: 0, commission: 0, expense: 0 });

function add(t: Totals, s: Partial<Totals>) {
  t.sales += s.sales ?? 0;
  t.count += s.count ?? 0;
  t.commission += s.commission ?? 0;
  t.expense += s.expense ?? 0;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

function nextMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return mo === 12 ? `${y! + 1}-01` : `${y}-${String(mo! + 1).padStart(2, "0")}`;
}

const MAX_RANGE_DAYS = 731;
const DAILY_SERIES_MAX_DAYS = 92;
const RECENT = 8;

export function reportsRepo(db: D1Database, orgId: string) {
  /** Sales and barber expenses grouped by (day or month) x barber, for days in [from, to]. */
  async function aggregate(from: string, to: string, by: "day" | "month", barberId?: number) {
    const key = by === "day" ? "day" : "substr(day, 1, 7)";
    const who = barberId ? " AND barber_id = ?" : "";
    const binds = barberId ? [orgId, from, to, barberId] : [orgId, from, to];
    const [sales, exps] = await db.batch([
      db
        .prepare(
          `SELECT ${key} AS key, barber_id, SUM(amount) AS sales, SUM(commission) AS commission, COUNT(*) AS count
           FROM sales WHERE org_id = ? AND deleted_at IS NULL AND day BETWEEN ? AND ?${who} GROUP BY ${key}, barber_id`,
        )
        .bind(...binds),
      db
        .prepare(`SELECT ${key} AS key, barber_id, SUM(amount) AS expense FROM expenses WHERE org_id = ? AND day BETWEEN ? AND ?${who} GROUP BY ${key}, barber_id`)
        .bind(...binds),
    ]);
    return { sales: sales!.results as unknown as SaleAgg[], exps: exps!.results as unknown as ExpAgg[] };
  }

  /** Company (shop-level) expenses per day or month in [from, to]. */
  async function companyBy(from: string, to: string, by: "day" | "month"): Promise<Map<string, number>> {
    const key = by === "day" ? "day" : "substr(day, 1, 7)";
    const { results } = await db
      .prepare(`SELECT ${key} AS key, SUM(amount) AS amount FROM company_expenses WHERE org_id = ? AND day BETWEEN ? AND ? GROUP BY ${key}`)
      .bind(orgId, from, to)
      .all<{ key: string; amount: number }>();
    return new Map(results.map((r) => [r.key, r.amount]));
  }

  /** Sheet columns: active barbers plus anyone (even inactive, or an owner/admin) with data in range. */
  async function barberCols(slug: string, withData: Set<number>): Promise<BarberCol[]> {
    const { results } = await db
      .prepare("SELECT id, name, role, active, avatar_v FROM users WHERE org_id = ? ORDER BY sort_order, name")
      .bind(orgId)
      .all<{ id: number; name: string; role: string; active: number; avatar_v: number }>();
    return results
      .filter((u) => (u.role === "barber" && u.active) || withData.has(u.id))
      .map((u) => ({ id: u.id, name: u.name, active: !!u.active, avatar_url: avatarUrl(u.id, u.avatar_v, slug) }));
  }

  async function totalsBetween(from: string, to: string): Promise<Range> {
    const [s, e, ce] = await db.batch([
      db
        .prepare(
          "SELECT COALESCE(SUM(amount),0) AS sales, COALESCE(SUM(commission),0) AS commission, COUNT(*) AS count FROM sales WHERE org_id = ? AND deleted_at IS NULL AND day BETWEEN ? AND ?",
        )
        .bind(orgId, from, to),
      db.prepare("SELECT COALESCE(SUM(amount),0) AS expense FROM expenses WHERE org_id = ? AND day BETWEEN ? AND ?").bind(orgId, from, to),
      db.prepare("SELECT COALESCE(SUM(amount),0) AS expense FROM company_expenses WHERE org_id = ? AND day BETWEEN ? AND ?").bind(orgId, from, to),
    ]);
    const company = (ce!.results[0] as { expense: number }).expense;
    const t = { ...(s!.results[0] as Omit<Totals, "expense">), expense: (e!.results[0] as { expense: number }).expense + company };
    return { ...t, company_expense: company, profit: shopProfit(t) };
  }

  return {
    /** One user's own report for a month; today (in the org's clock) is always included. */
    async myReport(clock: OrgClock, now: number, barberId: number, month: string): Promise<MyReport> {
      const days = daysOfMonth(month);
      const today = businessDay(now, clock);
      const { sales, exps } = await aggregate(days[0]!, days[days.length - 1]!, "day", barberId);
      const map = new Map<string, Totals>();
      for (const s of sales) add(map.get(s.key) ?? map.set(s.key, zero()).get(s.key)!, s);
      for (const e of exps) add(map.get(e.key) ?? map.set(e.key, zero()).get(e.key)!, { expense: e.expense });

      const totals = zero();
      const rows = [...map.entries()]
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([day, t]) => {
          add(totals, t);
          return { day, ...t, net: barberNet(t) };
        });

      const [todaySales, todayExp] = await db.batch([
        db
          .prepare(
            "SELECT COALESCE(SUM(amount),0) AS sales, COALESCE(SUM(commission),0) AS commission, COUNT(*) AS count FROM sales WHERE org_id = ? AND deleted_at IS NULL AND day = ? AND barber_id = ?",
          )
          .bind(orgId, today, barberId),
        db.prepare("SELECT amount, note FROM expenses WHERE org_id = ? AND day = ? AND barber_id = ?").bind(orgId, today, barberId),
      ]);
      const ts = todaySales!.results[0] as { sales: number; commission: number; count: number };
      const te = todayExp!.results[0] as { amount: number; note: string | null } | undefined;
      const t = { sales: ts.sales, commission: ts.commission, count: ts.count, expense: te?.amount ?? 0 };
      return { month, days: rows, totals: { ...totals, net: barberNet(totals) }, today: { ...t, net: barberNet(t), expense_note: te?.note ?? null } };
    },

    async dailySheet(slug: string, month: string): Promise<DailySheet> {
      const days = daysOfMonth(month);
      const from = days[0]!;
      const to = days[days.length - 1]!;
      const [{ sales, exps }, company] = await Promise.all([aggregate(from, to, "day"), companyBy(from, to, "day")]);
      const barbers = await barberCols(slug, new Set([...sales.map((s) => s.barber_id), ...exps.map((e) => e.barber_id)]));

      const cells = new Map<string, Record<number, Cell>>();
      const cell = (day: string, id: number) => {
        const row = cells.get(day) ?? cells.set(day, {}).get(day)!;
        return (row[id] ??= { sales: 0, commission: 0, expense: 0, count: 0 });
      };
      for (const s of sales) Object.assign(cell(s.key, s.barber_id), { sales: s.sales, commission: s.commission, count: s.count });
      for (const e of exps) cell(e.key, e.barber_id).expense = e.expense;

      const totalCells: Record<number, Cell> = {};
      const grand = zero();
      let grandCompany = 0;
      const rows = days.map((day) => {
        const row = cells.get(day) ?? {};
        const t = zero();
        for (const [id, c] of Object.entries(row)) {
          add(t, c);
          const tc = (totalCells[Number(id)] ??= { sales: 0, commission: 0, expense: 0, count: 0 });
          tc.sales += c.sales;
          tc.commission += c.commission;
          tc.expense += c.expense;
          tc.count += c.count;
        }
        const companyExpense = company.get(day) ?? 0;
        t.expense += companyExpense;
        grandCompany += companyExpense;
        add(grand, t);
        return { day, cells: row, sales: t.sales, expense: t.expense, company_expense: companyExpense, commission: t.commission, profit: shopProfit(t) };
      });
      return {
        month,
        barbers,
        rows,
        totals: { cells: totalCells, sales: grand.sales, expense: grand.expense, company_expense: grandCompany, commission: grand.commission, profit: shopProfit(grand) },
      };
    },

    async monthlyReport(slug: string, year: string): Promise<MonthlyReport> {
      const [{ sales, exps }, company] = await Promise.all([
        aggregate(`${year}-01-01`, `${year}-12-31`, "month"),
        companyBy(`${year}-01-01`, `${year}-12-31`, "month"),
      ]);
      const barbers = await barberCols(slug, new Set([...sales.map((s) => s.barber_id), ...exps.map((e) => e.barber_id)]));
      const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`).map((month) => {
        const cells: Record<number, Totals> = {};
        const totals = zero();
        for (const s of sales.filter((x) => x.key === month)) {
          add((cells[s.barber_id] ??= zero()), s);
          add(totals, s);
        }
        for (const e of exps.filter((x) => x.key === month)) {
          add((cells[e.barber_id] ??= zero()), { expense: e.expense });
          add(totals, { expense: e.expense });
        }
        const companyExpense = company.get(month) ?? 0;
        add(totals, { expense: companyExpense });
        return { month, cells, totals: { ...totals, company_expense: companyExpense, profit: shopProfit(totals) } };
      });
      return { year, barbers, months };
    },

    /** Dashboard for a date range (default: today), compared with the same number of days just before it. */
    async overview(slug: string, clock: OrgClock, now: number, fromQ?: string, toQ?: string): Promise<Overview> {
      const today = businessDay(now, clock);
      const to = toQ && DAY_RE.test(toQ) && toQ <= today ? toQ : today;
      let from = fromQ && DAY_RE.test(fromQ) ? fromQ : to;
      let hi = to;
      if (from > hi) [from, hi] = [hi, from];
      if (daysBetween(from, hi) > MAX_RANGE_DAYS) from = addDays(hi, -(MAX_RANGE_DAYS - 1)); // at most two years
      const len = daysBetween(from, hi);
      const prevTo = addDays(from, -1);
      const prevFrom = addDays(from, -len);
      const by = len > DAILY_SERIES_MAX_DAYS ? "month" : "day";

      const [totals, prevTotals, perBarber, series, company, recent] = await Promise.all([
        totalsBetween(from, hi),
        totalsBetween(prevFrom, prevTo),
        db
          .batch([
            db
              .prepare(
                "SELECT barber_id, SUM(amount) AS sales, SUM(commission) AS commission, COUNT(*) AS count FROM sales WHERE org_id = ? AND deleted_at IS NULL AND day BETWEEN ? AND ? GROUP BY barber_id",
              )
              .bind(orgId, from, hi),
            db
              .prepare("SELECT barber_id, SUM(amount) AS expense, COUNT(*) AS n FROM expenses WHERE org_id = ? AND day BETWEEN ? AND ? GROUP BY barber_id")
              .bind(orgId, from, hi),
          ])
          .then(([s, e]) => ({
            sales: s!.results as unknown as { barber_id: number; sales: number; commission: number; count: number }[],
            exps: e!.results as unknown as { barber_id: number; expense: number; n: number }[],
          })),
        aggregate(from, hi, by),
        companyBy(from, hi, by),
        salesRepo(db, orgId).list({ from, to: hi }, 1, RECENT),
      ]);

      const cols = await barberCols(slug, new Set([...perBarber.sales.map((s) => s.barber_id), ...perBarber.exps.map((e) => e.barber_id)]));
      const per_barber = cols.map((b) => {
        const s = perBarber.sales.find((x) => x.barber_id === b.id);
        const e = perBarber.exps.find((x) => x.barber_id === b.id);
        return {
          id: b.id,
          name: b.name,
          avatar_url: b.avatar_url,
          sales: s?.sales ?? 0,
          count: s?.count ?? 0,
          commission: s?.commission ?? 0,
          expense: e?.expense ?? 0,
          expense_entered: !!e,
        };
      });

      const byKey = new Map<string, Totals>();
      for (const s of series.sales) add(byKey.get(s.key) ?? byKey.set(s.key, zero()).get(s.key)!, s);
      for (const e of series.exps) add(byKey.get(e.key) ?? byKey.set(e.key, zero()).get(e.key)!, { expense: e.expense });
      for (const [key, amount] of company) add(byKey.get(key) ?? byKey.set(key, zero()).get(key)!, { expense: amount });
      const keys: string[] = [];
      if (by === "day") for (let i = 0; i < len; i++) keys.push(addDays(from, i));
      else for (let m = from.slice(0, 7); m <= hi.slice(0, 7); m = nextMonth(m)) keys.push(m);
      const seriesOut = keys.map((key) => {
        const t = byKey.get(key) ?? zero();
        return { key, sales: t.sales, profit: shopProfit(t) };
      });

      return { today, from, to: hi, totals, prev_totals: prevTotals, per_barber, series: seriesOut, series_by: by, recent: recent.items };
    },
  };
}
