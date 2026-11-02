"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Minus, Plus } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { qs } from "@/lib/api";
import { money, dateLabel, businessToday, getFormat, monthShort, num } from "@/lib/format";
import type { Overview } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartCard } from "@/components/admin/chart-card";
import { ErrorState } from "@/components/admin/states";
import { deltaPercent } from "@/components/admin/stat-card";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CompanyExpenseDialog } from "./company-expenses";
import { useAuth } from "@/lib/auth-context";
import { SetupChecklist } from "./setup-checklist";
import { DateInput } from "./date-input";
import { MoneyTile } from "./money-tile";
import { HomePushPrompt } from "./push-prompt";
import { SaleListSkeleton, SaleRow } from "./sale-row";
import { UserAvatar } from "./user-avatar";

type Preset = "1d" | "7d" | "30d" | "1y" | "custom";
const PRESETS: { id: Preset; label: string; days: number }[] = [
  { id: "1d", label: "1D", days: 1 },
  { id: "7d", label: "7D", days: 7 },
  { id: "30d", label: "30D", days: 30 },
  { id: "1y", label: "1Y", days: 365 },
];

function shift(day: string, delta: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function Delta({ now, before, label, sep }: { now: number; before: number; label: string; sep?: boolean }) {
  const d = deltaPercent(now, before);
  if (d === null) return null;
  return (
    <span className={cn("num", d >= 0 ? "text-success" : "text-destructive")}>
      {sep && <span className="text-muted-foreground"> · </span>}
      {d >= 0 ? "+" : ""}
      {d.toFixed(Math.abs(d) < 10 ? 1 : 0)}% vs {label}
    </span>
  );
}

export function AdminDashboard() {
  const today = businessToday();
  // Opens on today (owner, 2026-10-28); 7D, 30D and 1Y are one tap away.
  const [preset, setPreset] = useState<Preset>("1d");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [addExpense, setAddExpense] = useState(false);
  const { has, readOnly } = useAuth();
  // Longer ranges are part of the advanced reports feature (spec: "dashboard ranges").
  const presets = has("reports_advanced") ? PRESETS : PRESETS.slice(0, 1);

  function choose(p: (typeof PRESETS)[number]) {
    setPreset(p.id);
    setFrom(shift(today, -(p.days - 1)));
    setTo(today);
  }

  const { data, error, reload } = useApi<Overview>(`/api/reports/overview${qs({ from, to })}`);
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  const t = data?.totals;
  const p = data?.prev_totals;
  const single = from === to;
  const rangeLabel = single ? (from === today ? `Today, ${dateLabel(from)}` : dateLabel(from)) : `${dateLabel(from)} – ${dateLabel(to)}`;
  const vs = preset === "1d" ? "yesterday" : "previous period";
  const word = single ? (from === today ? "today" : "that day") : "in range";

  return (
    <div className="flex flex-col gap-5">
      {has("push") && !readOnly && <HomePushPrompt />}
      <SetupChecklist />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {rangeLabel}
            {to === today ? " · live" : ""}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <div className="flex rounded-lg bg-muted p-1" role="radiogroup" aria-label="Range">
            {presets.map((x) => (
              <button
                key={x.id}
                type="button"
                role="radio"
                aria-checked={preset === x.id}
                onClick={() => choose(x)}
                className={cn(
                  "num h-8 min-w-11 rounded-md px-3 text-sm font-semibold transition-colors",
                  preset === x.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                )}
              >
                {x.label}
              </button>
            ))}
            <button
              type="button"
              role="radio"
              aria-checked={preset === "custom"}
              onClick={() => setPreset("custom")}
              className={cn(
                "h-8 rounded-md px-3 text-sm font-semibold transition-colors",
                preset === "custom" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              Custom
            </button>
          </div>
          {preset === "custom" && (
            <div className="flex items-center gap-2">
              <DateInput aria-label="From" max={to} value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className="h-9 w-40" />
              <span className="text-sm text-muted-foreground">to</span>
              <DateInput aria-label="To" min={from} max={today} value={to} onChange={(e) => e.target.value && setTo(e.target.value)} className="h-9 w-40" />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MoneyTile
          label={`Sales ${word}`}
          value={t?.sales ?? null}
          hint={t ? <>{t.count} customers{p && <Delta now={t.sales} before={p.sales} label={vs} sep />}</> : undefined}
          big
          className="col-span-2 bg-primary/5 lg:col-span-1"
        />
        <MoneyTile
          label={`Expense ${word}`}
          value={t?.expense ?? null}
          hint={t?.company_expense ? `incl. ${money(t.company_expense)} company` : undefined}
          action={
            has("expenses") && !readOnly ? (
              <Button size="icon-sm" variant="outline" aria-label="Add company expense" className="-my-1.5 -mr-1.5 rounded-full" onClick={() => setAddExpense(true)}>
                <Plus />
              </Button>
            ) : undefined
          }
        />
        <MoneyTile label={`Commission ${word}`} value={t?.commission ?? null} />
        <MoneyTile
          label={`Profit ${word}`}
          value={t?.profit ?? null}
          tone={t && t.profit < 0 ? "destructive" : "success"}
          hint={t && p ? <Delta now={t.profit} before={p.profit} label={vs} /> : undefined}
          className="col-span-2 lg:col-span-1"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <Card className="gap-0 p-0">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="text-sm font-semibold">Barbers {word}</p>
            <Link href={`/sheet?month=${to.slice(0, 7)}`} className="text-xs font-medium text-primary">
              Daily sheet →
            </Link>
          </div>
          {!data ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-8" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Barber</th>
                    <th className="px-2 py-2 text-right font-medium">Cust.</th>
                    <th className="px-2 py-2 text-right font-medium">Sales</th>
                    <th className="px-2 py-2 text-right font-medium">Comm.</th>
                    <th className="px-4 py-2 text-right font-medium">Exp.</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.per_barber.map((b) => (
                    <tr key={b.id}>
                      <td className="px-4 py-2 font-medium">
                        <span className="flex items-center gap-2.5">
                          <UserAvatar name={b.name} url={b.avatar_url} size={28} />
                          {b.name}
                        </span>
                      </td>
                      <td className="num px-2 py-2.5 text-right text-muted-foreground">{b.count || "–"}</td>
                      <td className="num px-2 py-2.5 text-right font-semibold">{num(b.sales, true)}</td>
                      <td className="num px-2 py-2.5 text-right">{num(b.commission, true)}</td>
                      <td className="num px-4 py-2.5 text-right">
                        {b.expense_entered ? (
                          <span className="inline-flex items-center gap-1">
                            {num(b.expense)}
                            {single && <Check className="size-3.5 text-success" />}
                          </span>
                        ) : (
                          <Minus className="ml-auto size-3.5 text-muted-foreground" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="gap-0 p-0">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="text-sm font-semibold">Latest sales {word}</p>
            <Link href={single ? `/sales?day=${from}` : "/sales"} className="text-xs font-medium text-primary">
              All sales →
            </Link>
          </div>
          {!data ? (
            <SaleListSkeleton rows={5} />
          ) : data.recent.length ? (
            <ul className="flex flex-col divide-y p-1">
              {data.recent.map((s) => (
                <SaleRow key={s.id} sale={s} editable showBarber showDay={!single} />
              ))}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No sales {word}.</p>
          )}
        </Card>
      </div>

      {data && data.series.length > 1 && (
        <ChartCard
          title={data.series_by === "month" ? "By month" : "By day"}
          description={t ? `${money(t.sales)} sales, ${money(t.profit)} profit` : undefined}
          kind="area"
          data={data.series.map((d) => ({
            label: data.series_by === "month" ? monthShort(d.key) : d.key.slice(8),
            sales: d.sales / getFormat().minor,
            profit: d.profit / getFormat().minor,
          }))}
          config={{ sales: { label: "Sales" }, profit: { label: "Profit" } }}
          height={220}
        />
      )}
      <CompanyExpenseDialog open={addExpense} onOpenChange={setAddExpense} />
    </div>
  );
}
