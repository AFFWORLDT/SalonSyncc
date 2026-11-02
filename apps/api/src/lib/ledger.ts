/**
 * The ledger: every money movement as a line that is never rewritten.
 * Shop book: + money in, − money out, per account (cash drawer / bank).
 * Barber book: + owed to the barber (commission), − paid to them.
 * An edit reverses the source's live lines and posts new ones; a delete only reverses.
 * Pure line builders only; the SQL that posts and reverses them lives in data/tenant/ledger.ts.
 */
export type Account = "cash" | "bank";
export type LedgerSource = "sale" | "expense" | "company_expense" | "payout" | "transfer" | "opening";

export interface Line {
  book: "shop" | "barber";
  account: Account | null; // shop book only
  barber_id: number | null; // barber book only
  amount: number; // signed minor units
  kind: string;
  day: string;
  memo: string;
}

const shop = (day: string, account: Account, amount: number, kind: string, memo: string): Line => ({
  book: "shop",
  account,
  barber_id: null,
  amount,
  kind,
  day,
  memo,
});
const barber = (day: string, barberId: number, amount: number, kind: string, memo: string): Line => ({
  book: "barber",
  account: null,
  barber_id: barberId,
  amount,
  kind,
  day,
  memo,
});

export function saleLines(s: {
  day: string;
  amount: number;
  payment_mode: "cash" | "card";
  barber_id: number;
  commission: number;
  bill_no: string;
  customer_label: string;
}): Line[] {
  const lines = [shop(s.day, s.payment_mode === "card" ? "bank" : "cash", s.amount, "sale", `Bill ${s.bill_no} · ${s.customer_label}`)];
  if (s.commission > 0) lines.push(barber(s.day, s.barber_id, s.commission, "commission", `Commission · ${s.bill_no}`));
  return lines;
}

/** Barber expenses come out of the day's cash. */
export function expenseLines(e: { day: string; amount: number; barber_name: string; note: string | null }): Line[] {
  return [shop(e.day, "cash", -e.amount, "expense", `Expense · ${e.barber_name}${e.note ? ` · ${e.note}` : ""}`)];
}

export function companyExpenseLines(e: { day: string; amount: number; paid_from: Account; note: string }): Line[] {
  return [shop(e.day, e.paid_from, -e.amount, "company_expense", `Company · ${e.note}`)];
}

export function payoutLines(p: { day: string; amount: number; paid_from: Account; barber_id: number; barber_name: string }): Line[] {
  return [shop(p.day, p.paid_from, -p.amount, "payout", `Paid ${p.barber_name}`), barber(p.day, p.barber_id, -p.amount, "payout", "Payout")];
}

export function transferLines(t: { day: string; amount: number; from_account: Account; to_account: Account }): Line[] {
  const name = (a: Account) => (a === "cash" ? "cash drawer" : "bank");
  return [
    shop(t.day, t.from_account, -t.amount, "transfer", `Moved to ${name(t.to_account)}`),
    shop(t.day, t.to_account, t.amount, "transfer", `Moved from ${name(t.from_account)}`),
  ];
}

/** Adjustments that bring each balance to what the admin counted. Zero lines are skipped. */
export function openingLines(o: { day: string; cash: number; bank: number; barbers: Record<number, number> }): Line[] {
  const lines: Line[] = [];
  if (o.cash) lines.push(shop(o.day, "cash", o.cash, "opening", "Balance set"));
  if (o.bank) lines.push(shop(o.day, "bank", o.bank, "opening", "Balance set"));
  for (const [id, amount] of Object.entries(o.barbers)) if (amount) lines.push(barber(o.day, Number(id), amount, "opening", "Balance set"));
  return lines;
}

/** True when the money lines differ (memo-only changes, like a new customer name, don't repost). */
export function needsRepost(old: Line[], next: Line[]): boolean {
  const key = (ls: Line[]) =>
    ls
      .map((l) => JSON.stringify([l.book, l.account, l.barber_id, l.amount, l.day]))
      .sort()
      .join("|");
  return key(old) !== key(next);
}
