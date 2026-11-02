import type { DailySheet, MonthlyReport, ShopLedger } from "./types";
import { getFormat, monthLabel, timeLabel } from "./format";

/** Minor units -> a plain number in the salon currency (2550 -> 25.5; KWD keeps 3 decimals). */
export const moneyNum = (minor: number) => Math.round(minor) / getFormat().minor;

/** "<salon> <what>.xlsx", or just "<what>.xlsx" when the salon has no name. */
export function workbookName(salonName: string, what: string): string {
  const clean = salonName.replace(/[\\/:*?"<>|]+/g, " ").trim();
  return `${clean ? `${clean} ` : ""}${what}.xlsx`;
}

/** Excel serial date for a YYYY-MM-DD (what their sheets use in the Dates column). */
function excelDate(day: string): number {
  return Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / 86_400_000 + 25569;
}

/**
 * Daily sheet in the classic salon record layout:
 * Dates | Details | <Barber> | Commission | … | Total Sale | Expense | Total Commission | Total Profit,
 * then a totals row and the "<MONTH> SALE RECORD" title. A second sheet lists each barber's expenses.
 */
export async function exportDailySheet(sheet: DailySheet, salonName: string) {
  const XLSX = await import("xlsx");
  const header = ["Dates", "Details", ...sheet.barbers.flatMap((b) => [b.name, "Commission"]), "Total Sale", "Expense", "Total Commission", "Total Profit"];
  const rows: (string | number | null)[][] = [header];
  for (const r of sheet.rows) {
    if (!r.sales && !r.expense) continue;
    rows.push([
      excelDate(r.day),
      "SALE/COM",
      ...sheet.barbers.flatMap((b) => [moneyNum(r.cells[b.id]?.sales ?? 0), moneyNum(r.cells[b.id]?.commission ?? 0)]),
      moneyNum(r.sales),
      moneyNum(r.expense),
      moneyNum(r.commission),
      moneyNum(r.profit),
    ]);
  }
  const t = sheet.totals;
  rows.push([
    null,
    "TOTAL",
    ...sheet.barbers.flatMap((b) => [moneyNum(t.cells[b.id]?.sales ?? 0), moneyNum(t.cells[b.id]?.commission ?? 0)]),
    moneyNum(t.sales),
    moneyNum(t.expense),
    moneyNum(t.commission),
    moneyNum(t.profit),
  ]);
  rows.push([]);
  rows.push([null, `${monthLabel(sheet.month).toUpperCase()} SALE RECORD — ${salonName}`]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  for (let i = 1; i < rows.length; i++) {
    const cell = ws[XLSX.utils.encode_cell({ r: i, c: 0 })];
    if (cell && typeof cell.v === "number") cell.z = "dd-mmm-yy";
  }
  ws["!cols"] = header.map((h, i) => ({ wch: i === 0 ? 11 : i === 1 ? 10 : Math.max(10, String(h).length + 2) }));
  ws["!freeze"] = { xSplit: 2, ySplit: 1 };

  const exp: (string | number | null)[][] = [["Dates", ...sheet.barbers.map((b) => b.name), "Company", "Total"]];
  for (const r of sheet.rows) {
    if (!r.expense) continue;
    exp.push([excelDate(r.day), ...sheet.barbers.map((b) => moneyNum(r.cells[b.id]?.expense ?? 0)), moneyNum(r.company_expense), moneyNum(r.expense)]);
  }
  exp.push([null, ...sheet.barbers.map((b) => moneyNum(t.cells[b.id]?.expense ?? 0)), moneyNum(t.company_expense), moneyNum(t.expense)]);
  const ws2 = XLSX.utils.aoa_to_sheet(exp);
  for (let i = 1; i < exp.length; i++) {
    const cell = ws2[XLSX.utils.encode_cell({ r: i, c: 0 })];
    if (cell && typeof cell.v === "number") cell.z = "dd-mmm-yy";
  }

  const wb = XLSX.utils.book_new();
  const name = `${monthLabel(sheet.month).toUpperCase()} SALE RECORD`.slice(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, name);
  XLSX.utils.book_append_sheet(wb, ws2, "EXPENSES");
  XLSX.writeFile(wb, workbookName(salonName, monthLabel(sheet.month)));
}

/** Year summary: one row per month, sales per barber, then shop totals. */
export async function exportMonthly(report: MonthlyReport, salonName: string) {
  const XLSX = await import("xlsx");
  const header = ["Month", ...report.barbers.flatMap((b) => [b.name, "Commission", "Expense"]), "Total Sale", "Expense", "Total Commission", "Total Profit"];
  const rows: (string | number)[][] = [header];
  for (const m of report.months) {
    if (!m.totals.sales && !m.totals.expense) continue;
    rows.push([
      monthLabel(m.month),
      ...report.barbers.flatMap((b) => [moneyNum(m.cells[b.id]?.sales ?? 0), moneyNum(m.cells[b.id]?.commission ?? 0), moneyNum(m.cells[b.id]?.expense ?? 0)]),
      moneyNum(m.totals.sales),
      moneyNum(m.totals.expense),
      moneyNum(m.totals.commission),
      moneyNum(m.totals.profit),
    ]);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = header.map((h) => ({ wch: Math.max(10, String(h).length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `${report.year} SUMMARY`);
  XLSX.writeFile(wb, workbookName(salonName, `${report.year} summary`));
}

/** The shop book for a range: one row per line with the running balance, opening and closing on top. */
export async function exportShopLedger(l: ShopLedger, salonName: string) {
  const XLSX = await import("xlsx");
  const label = l.account === "all" ? "Cash + Bank" : l.account === "cash" ? "Cash drawer" : "Bank";
  const openingBal = l.account === "all" ? l.opening.cash + l.opening.bank : l.opening[l.account];
  const rows: (string | number | null)[][] = [
    [`Shop ledger · ${label} · ${l.from} to ${l.to}`],
    [],
    ["Date", "Time", "Account", "Type", "Ref", "Memo", "In", "Out", "Balance"],
    [null, null, null, "Opening", null, null, null, null, moneyNum(openingBal)],
  ];
  for (const x of l.lines) {
    rows.push([
      excelDate(x.day),
      timeLabel(x.at),
      x.account === "bank" ? "Bank" : "Cash",
      x.kind,
      x.ref,
      x.memo,
      x.amount > 0 ? moneyNum(x.amount) : null,
      x.amount < 0 ? moneyNum(-x.amount) : null,
      moneyNum(x.balance),
    ]);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  for (let i = 4; i < rows.length; i++) {
    const cell = ws[XLSX.utils.encode_cell({ r: i, c: 0 })];
    if (cell && typeof cell.v === "number") cell.z = "dd-mmm-yy";
  }
  ws["!cols"] = [11, 7, 8, 14, 18, 40, 10, 10, 12].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "LEDGER");
  XLSX.writeFile(wb, workbookName(salonName, `ledger ${l.from} to ${l.to}`));
}
