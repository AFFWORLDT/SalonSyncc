"use client";

import { FeatureGate } from "@/components/app/feature-gate";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { useApi } from "@/hooks/use-api";
import { useAuth } from "@/lib/auth-context";
import { money, dayLabel, businessToday, num, currencyCode } from "@/lib/format";
import { exportDailySheet } from "@/lib/excel";
import type { DailySheet } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ErrorState } from "@/components/admin/states";
import { MonthPicker } from "@/components/app/month-picker";
import { MoneyTile } from "@/components/app/money-tile";
import { cn } from "@/lib/utils";

const th = "px-2 py-2 text-right font-medium whitespace-nowrap";
const td = "num px-2 py-2 text-right whitespace-nowrap";

function SheetPageInner() {
  const { settings, has } = useAuth();
  const today = businessToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [showExp, setShowExp] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { data, error, reload } = useApi<DailySheet>(`/api/reports/daily?month=${month}`);

  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get("month");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (m && /^\d{4}-\d{2}$/.test(m)) setMonth(m);
  }, []);

  const rows = (data?.rows ?? []).filter((r) => r.day <= today).reverse();
  const perBarber = showExp ? 3 : 2;

  async function download() {
    if (!data) return;
    setExporting(true);
    try {
      await exportDailySheet(data, settings?.display_name ?? "");
    } catch {
      toast.error("Couldn't create the Excel file");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl">Daily sheet</h1>
        <div className="flex flex-wrap items-center gap-2">
          <MonthPicker month={month} onChange={setMonth} />
          {has("excel_export") && (
            <Button variant="outline" onClick={download} disabled={!data || exporting}>
              <Download />
              {exporting ? "Preparing…" : "Excel"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MoneyTile label="Total sale" value={data?.totals.sales ?? null} className="bg-primary/5" />
        <MoneyTile
          label="Expense"
          value={data?.totals.expense ?? null}
          hint={data?.totals.company_expense ? `incl. ${money(data.totals.company_expense)} company` : undefined}
        />
        <MoneyTile label="Total commission" value={data?.totals.commission ?? null} />
        <MoneyTile label="Total profit" value={data?.totals.profit ?? null} tone="success" />
      </div>

      <div className="flex items-center gap-2">
        <Switch id="show-exp" checked={showExp} onCheckedChange={setShowExp} />
        <Label htmlFor="show-exp" className="text-sm text-muted-foreground">
          Show each barber&apos;s expense
        </Label>
      </div>

      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <Card className="gap-2 p-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-8" />
          ))}
        </Card>
      ) : (
        <Card className="gap-0 overflow-hidden p-0">
          <div className="max-h-[70dvh] overflow-auto">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead className="sticky top-0 z-20 bg-card text-xs text-muted-foreground">
                <tr>
                  <th rowSpan={2} className="sticky left-0 z-30 border-b border-r bg-card px-3 py-2 text-left font-medium">
                    Date
                  </th>
                  {data.barbers.map((b) => (
                    <th key={b.id} colSpan={perBarber} className={cn("border-b border-l px-2 pt-2 pb-1 text-center font-semibold text-foreground", !b.active && "opacity-60")}>
                      {b.name}
                    </th>
                  ))}
                  <th colSpan={4} className="border-b border-l px-2 pt-2 pb-1 text-center font-semibold text-foreground">
                    Shop
                  </th>
                </tr>
                <tr>
                  {data.barbers.map((b) => (
                    <SubHeads key={b.id} showExp={showExp} />
                  ))}
                  <th className={cn(th, "border-b border-l")}>Sale</th>
                  <th className={cn(th, "border-b")}>Exp.</th>
                  <th className={cn(th, "border-b")}>Com.</th>
                  <th className={cn(th, "border-b pr-3")}>Profit</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const empty = !r.sales && !r.expense;
                  return (
                    <tr key={r.day} className={cn(r.day === today && "bg-primary/5", empty && "text-muted-foreground")}>
                      <td className="sticky left-0 z-10 border-r border-b bg-card px-3 py-2 whitespace-nowrap">
                        <Link href={`/sales?day=${r.day}`} className="font-medium">
                          {dayLabel(r.day)}
                        </Link>
                      </td>
                      {data.barbers.map((b) => {
                        const c = r.cells[b.id];
                        return (
                          <Cells key={b.id} showExp={showExp} sales={c?.sales ?? 0} commission={c?.commission ?? 0} expense={c?.expense ?? 0} />
                        );
                      })}
                      <td className={cn(td, "border-b border-l font-semibold")}>{num(r.sales, true)}</td>
                      <td className={cn(td, "border-b")}>{num(r.expense, true)}</td>
                      <td className={cn(td, "border-b")}>{num(r.commission, true)}</td>
                      <td className={cn(td, "border-b pr-3 font-semibold", r.profit < 0 ? "text-destructive" : r.profit > 0 && "text-success")}>
                        {num(r.profit, true)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="sticky bottom-0 z-20 bg-muted text-sm font-semibold">
                <tr>
                  <td className="sticky left-0 z-30 border-r bg-muted px-3 py-2.5">Total</td>
                  {data.barbers.map((b) => {
                    const c = data.totals.cells[b.id];
                    return <Cells key={b.id} showExp={showExp} sales={c?.sales ?? 0} commission={c?.commission ?? 0} expense={c?.expense ?? 0} foot />;
                  })}
                  <td className={cn(td, "border-l")}>{num(data.totals.sales)}</td>
                  <td className={td}>{num(data.totals.expense)}</td>
                  <td className={td}>{num(data.totals.commission)}</td>
                  <td className={cn(td, "pr-3 text-success")}>{num(data.totals.profit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
      <p className="text-xs text-muted-foreground">All amounts in {currencyCode()}. Shop expense includes company expenses. Profit = sale − expense − commission. Tap a date to see its sales.</p>
    </div>
  );
}

function SubHeads({ showExp }: { showExp: boolean }) {
  return (
    <>
      <th className={cn(th, "border-b border-l")}>Sale</th>
      <th className={cn(th, "border-b")}>Com.</th>
      {showExp && <th className={cn(th, "border-b")}>Exp.</th>}
    </>
  );
}

function Cells({ showExp, sales, commission, expense, foot }: { showExp: boolean; sales: number; commission: number; expense: number; foot?: boolean }) {
  const b = foot ? "" : "border-b";
  return (
    <>
      <td className={cn(td, b, "border-l", !foot && "font-medium")}>{num(sales, true)}</td>
      <td className={cn(td, b, !foot && "text-muted-foreground")}>{num(commission, true)}</td>
      {showExp && <td className={cn(td, b, !foot && "text-muted-foreground")}>{num(expense, true)}</td>}
    </>
  );
}

/** Gated by the salon's plan: without "daily_sheet" the page shows the Upgrade card and makes no API calls. */
export default function SheetPage() {
  return (
    <FeatureGate feature="daily_sheet">
      <SheetPageInner />
    </FeatureGate>
  );
}
