import { describe, expect, it } from "vitest";
import { companyExpenseLines, expenseLines, needsRepost, openingLines, payoutLines, saleLines, transferLines } from "../../src/lib/ledger";

const sale = { day: "2026-10-25", amount: 1000, payment_mode: "cash" as const, barber_id: 8, commission: 200, bill_no: "FM-1", customer_label: "Naveed" };

describe("ledger lines", () => {
  it("saleLines cash", () => {
    const l = saleLines(sale);
    expect(l.length).toBe(2);
    expect(l.map((x) => [x.book, x.account, x.barber_id, x.amount, x.kind, x.day])).toEqual([
      ["shop", "cash", null, 1000, "sale", "2026-10-25"],
      ["barber", null, 8, 200, "commission", "2026-10-25"],
    ]);
    expect(l[0]!.memo).toBe("Bill FM-1 · Naveed");
    expect(l[1]!.memo).toBe("Commission · FM-1");
  });
  it("card goes to bank; no commission line at 0", () => {
    const l = saleLines({ ...sale, payment_mode: "card", commission: 0 });
    expect(l.length).toBe(1);
    expect(l[0]!.account).toBe("bank");
  });
  it("needsRepost", () => {
    expect(needsRepost(saleLines(sale), saleLines({ ...sale, barber_id: 9 }))).toBe(true);
    expect(needsRepost(saleLines(sale), saleLines({ ...sale, amount: 1500, commission: 300 }))).toBe(true);
    expect(needsRepost(saleLines(sale), saleLines({ ...sale, payment_mode: "card" }))).toBe(true);
    expect(needsRepost(saleLines(sale), saleLines({ ...sale, customer_label: "Someone else" }))).toBe(false);
  });
  it("a day change reposts and old lines keep the old day", () => {
    const old = saleLines(sale);
    expect(needsRepost(old, saleLines({ ...sale, day: "2026-10-26" }))).toBe(true);
    expect(old.every((x) => x.day === "2026-10-25")).toBe(true);
  });
  it("expense lines come out of cash; removal reposts", () => {
    const e = expenseLines({ day: "2026-10-25", amount: 2000, barber_name: "Sonu", note: null });
    expect(e.map((x) => [x.book, x.account, x.amount, x.kind])).toEqual([["shop", "cash", -2000, "expense"]]);
    expect(e[0]!.memo).toBe("Expense · Sonu");
    expect(expenseLines({ day: "d", amount: 1, barber_name: "Sonu", note: "tea" })[0]!.memo).toBe("Expense · Sonu · tea");
    expect(needsRepost(e, [])).toBe(true);
  });
  it("company expense from bank", () => {
    const l = companyExpenseLines({ day: "2026-10-25", amount: 50000, paid_from: "bank", note: "rent" });
    expect(l.map((x) => [x.account, x.amount, x.kind])).toEqual([["bank", -50000, "company_expense"]]);
    expect(l[0]!.memo).toBe("Company · rent");
  });
  it("transfer lines sum to 0", () => {
    const t = transferLines({ day: "2026-10-25", amount: 200000, from_account: "cash", to_account: "bank" });
    expect(t.map((x) => [x.account, x.amount])).toEqual([["cash", -200000], ["bank", 200000]]);
    expect(t.reduce((a, x) => a + x.amount, 0)).toBe(0);
    expect(t.map((x) => x.memo)).toEqual(["Moved to bank", "Moved from cash drawer"]);
  });
  it("openingLines skips zeros", () => {
    const o = openingLines({ day: "2026-10-26", cash: 5000, bank: 0, barbers: { 8: 1200, 9: 0 } });
    expect(o.map((x) => [x.book, x.account, x.barber_id, x.amount, x.kind])).toEqual([
      ["shop", "cash", null, 5000, "opening"],
      ["barber", null, 8, 1200, "opening"],
    ]);
  });
  it("payoutLines", () => {
    const p = payoutLines({ day: "2026-10-25", amount: 30000, paid_from: "cash", barber_id: 8, barber_name: "Nadeem" });
    expect(p.map((x) => [x.book, x.account, x.barber_id, x.amount])).toEqual([
      ["shop", "cash", null, -30000],
      ["barber", null, 8, -30000],
    ]);
    expect(p.map((x) => x.memo)).toEqual(["Paid Nadeem", "Payout"]);
  });
});
