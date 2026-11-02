/** Money in integer minor units of the org's currency (fils, paise, cents...). Pure. */

/** A user-typed amount (number or "25.5") -> minor units. Null unless positive, within the minor unit's precision, and at most 1,000,000 major units. */
export function toMinor(v: unknown, minor = 100): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.trim()) : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) return null;
  const m = Math.round(n * minor);
  if (Math.abs(m - n * minor) > 1e-6) return null;
  return m;
}

/** Like toMinor, but 0 and negatives are allowed (an empty balance, or a barber who owes an advance back). */
export function signedMinor(v: unknown, minor = 100): number | null {
  if (v === 0 || (typeof v === "string" && Number(v.trim()) === 0 && v.trim() !== "")) return 0;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.trim()) : NaN;
  if (!Number.isFinite(n)) return null;
  const abs = toMinor(Math.abs(n), minor);
  return abs === null ? null : n < 0 ? -abs : abs;
}

/** Commission on a sale: amount x pct%, rounded to the minor unit. */
export function commissionOf(amount: number, pct: number): number {
  return Math.round((amount * pct) / 100);
}

/** VAT inside a VAT-inclusive amount, rate in percent (5 = 5%): amount x r / (100 + r), rounded. 0 when rate is 0. */
export function vatOf(amount: number, ratePct: number): number {
  if (!ratePct) return 0;
  return Math.round((amount * ratePct) / (100 + ratePct));
}

export const DAY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface DayTotals {
  sales: number;
  commission: number;
  expense: number;
}

/** What the barber keeps track of: sales minus their expense. */
export function barberNet(t: DayTotals): number {
  return t.sales - t.expense;
}

/** The Excel "Total Profit" column: sales minus expenses minus commissions. */
export function shopProfit(t: DayTotals): number {
  return t.sales - t.expense - t.commission;
}

/** `?page=` as a safe 1-based page: junk -> 1, capped so (page-1)*size never overflows SQLite's integer range. */
export function clampPage(raw: unknown): number {
  return Math.min(100_000, Math.max(1, Math.floor(Number(raw)) || 1));
}
