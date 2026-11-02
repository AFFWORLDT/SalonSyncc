"use client";

import { useState } from "react";
import { useApi } from "@/hooks/use-api";
import { money, currencyCode, dayLabel, businessToday, num } from "@/lib/format";
import type { MyReport } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/admin/states";
import { MonthPicker } from "@/components/app/month-picker";
import { MoneyTile } from "@/components/app/money-tile";

/** A barber's own month: totals and one card per working day. */
export default function HistoryPage() {
  const [month, setMonth] = useState(businessToday().slice(0, 7));
  const { data, error, reload } = useApi<MyReport>(`/api/reports/me?month=${month}`);
  const t = data?.totals;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl">My history</h1>
        <MonthPicker month={month} onChange={setMonth} />
      </div>

      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <MoneyTile label="Sales" value={t?.sales ?? null} hint={t ? `${t.count} customers` : undefined} className="bg-primary/5" />
            <MoneyTile label="Expense" value={t?.expense ?? null} />
            <MoneyTile label="Sales − expense" value={t?.net ?? null} tone="success" />
          </div>

          <Card className="gap-0 p-0">
            <div className="grid grid-cols-[1fr_repeat(2,minmax(0,4.5rem))] gap-2 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground">
              <span>Day</span>
              <span className="text-right">Sales</span>
              <span className="text-right">Exp.</span>
            </div>
            {!data ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-9" />
                ))}
              </div>
            ) : data.days.length ? (
              <ul className="divide-y">
                {data.days.map((d) => (
                  <li key={d.day} className="grid grid-cols-[1fr_repeat(2,minmax(0,4.5rem))] items-center gap-2 px-4 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{dayLabel(d.day)}</span>
                      <span className="block text-xs text-muted-foreground">{d.count} customers</span>
                    </span>
                    <span className="num text-right font-semibold">{num(d.sales, true)}</span>
                    <span className="num text-right">{num(d.expense, true)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing recorded in this month.</p>
            )}
            {data && data.days.length > 0 && (
              <p className="border-t px-4 py-2.5 text-right text-xs text-muted-foreground">All amounts in {currencyCode()} · month total {money(data.totals.sales)}</p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
