"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { toast } from "sonner";
import { useApi } from "@/hooks/use-api";
import { aed, businessToday, monthShort, num } from "@/lib/format";
import { exportMonthly } from "@/lib/excel";
import type { MonthlyReport, Totals } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/admin/states";
import { MoneyTile } from "@/components/app/money-tile";
import { cn } from "@/lib/utils";

const td = "num px-2 py-2.5 text-right whitespace-nowrap";

export default function MonthlyPage() {
  const thisYear = businessToday().slice(0, 4);
  const [year, setYear] = useState(thisYear);
  const { data, error, reload } = useApi<MonthlyReport>(`/api/reports/monthly?year=${year}`);
  const months = (data?.months ?? []).filter((m) => m.totals.sales || m.totals.expense);

  const yearTotals = months.reduce(
    (a, m) => ({
      sales: a.sales + m.totals.sales,
      expense: a.expense + m.totals.expense,
      company: a.company + m.totals.company_expense,
      commission: a.commission + m.totals.commission,
      profit: a.profit + m.totals.profit,
    }),
    { sales: 0, expense: 0, company: 0, commission: 0, profit: 0 }
  );
  const perBarber = (id: number): Totals =>
    months.reduce((a, m) => {
      const c = m.cells[id];
      return c ? { sales: a.sales + c.sales, count: a.count + c.count, commission: a.commission + c.commission, expense: a.expense + c.expense } : a;
    }, { sales: 0, count: 0, commission: 0, expense: 0 });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl">Monthly</h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={() => setYear(String(+year - 1))} aria-label="Previous year">
              <ChevronLeft />
            </Button>
            <span className="num min-w-14 text-center text-sm font-semibold">{year}</span>
            <Button variant="outline" size="icon" disabled={year >= thisYear} onClick={() => setYear(String(+year + 1))} aria-label="Next year">
              <ChevronRight />
            </Button>
          </div>
          <Button
            variant="outline"
            disabled={!data}
            onClick={() => data && exportMonthly(data).catch(() => toast.error("Couldn't create the Excel file"))}
          >
            <Download />
            Excel
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MoneyTile label={`Sales ${year}`} value={data ? yearTotals.sales : null} className="bg-primary/5" />
        <MoneyTile label="Expense" value={data ? yearTotals.expense : null} hint={yearTotals.company ? `incl. ${aed(yearTotals.company)} company` : undefined} />
        <MoneyTile label="Commission" value={data ? yearTotals.commission : null} />
        <MoneyTile label="Profit" value={data ? yearTotals.profit : null} tone="success" />
      </div>

      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <Card className="gap-2 p-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-9" />
          ))}
        </Card>
      ) : (
        <>
          <Card className="gap-0 p-0">
            <p className="border-b px-4 py-3 text-sm font-semibold">Per barber, {year}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Barber</th>
                    <th className="px-2 py-2 text-right font-medium">Cust.</th>
                    <th className="px-2 py-2 text-right font-medium">Sales</th>
                    <th className="px-2 py-2 text-right font-medium">Comm.</th>
                    <th className="px-2 py-2 text-right font-medium">Exp.</th>
                    <th className="px-4 py-2 text-right font-medium">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.barbers.map((b) => {
                    const t = perBarber(b.id);
                    return (
                      <tr key={b.id} className={cn(!b.active && "text-muted-foreground")}>
                        <td className="px-4 py-2.5 font-medium">{b.name}</td>
                        <td className={td}>{t.count || "–"}</td>
                        <td className={cn(td, "font-semibold")}>{num(t.sales, true)}</td>
                        <td className={td}>{num(t.commission, true)}</td>
                        <td className={td}>{num(t.expense, true)}</td>
                        <td className={cn(td, "pr-4")}>{num(t.sales - t.expense, true)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="gap-0 p-0">
            <p className="border-b px-4 py-3 text-sm font-semibold">Month by month</p>
            {months.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">No records in {year}.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="sticky left-0 bg-card px-4 py-2 text-left font-medium">Month</th>
                      {data.barbers.map((b) => (
                        <th key={b.id} className="px-2 py-2 text-right font-medium whitespace-nowrap">
                          {b.name}
                        </th>
                      ))}
                      <th className="border-l px-2 py-2 text-right font-medium">Sale</th>
                      <th className="px-2 py-2 text-right font-medium">Exp.</th>
                      <th className="px-2 py-2 text-right font-medium">Com.</th>
                      <th className="px-4 py-2 text-right font-medium">Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {months.map((m) => (
                      <tr key={m.month}>
                        <td className="sticky left-0 bg-card px-4 py-2.5 font-medium">
                          <Link href={`/sheet?month=${m.month}`}>{monthShort(m.month)}</Link>
                        </td>
                        {data.barbers.map((b) => (
                          <td key={b.id} className={td}>
                            {num(m.cells[b.id]?.sales ?? 0, true)}
                          </td>
                        ))}
                        <td className={cn(td, "border-l font-semibold")}>{num(m.totals.sales)}</td>
                        <td className={td}>{num(m.totals.expense)}</td>
                        <td className={td}>{num(m.totals.commission)}</td>
                        <td className={cn(td, "pr-4 font-semibold text-success")}>{num(m.totals.profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
      <p className="text-xs text-muted-foreground">All amounts in AED. Barber columns show sales.</p>
    </div>
  );
}
