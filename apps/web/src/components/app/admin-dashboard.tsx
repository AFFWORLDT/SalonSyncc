"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUp, BarChart3, CalendarDays, Check, Minus, Percent, Plus, TrendingUp, Wallet } from "lucide-react";
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
import { HomePushPrompt } from "./push-prompt";
import { SaleListSkeleton, SaleRow } from "./sale-row";
import { UserAvatar } from "./user-avatar";
import { useSaleSheet } from "./sale-sheet";

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

/** The change against the previous period in a mint pill on the green hero ("↑ 233% vs yesterday"). */
function DeltaChip({ now, before, label }: { now: number; before: number; label: string }) {
  const d = deltaPercent(now, before);
  if (d === null) return null;
  const up = d >= 0;
  return (
    <span className={cn("num inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold", up ? "bg-[#7FE3B0]/15 text-[#7FE3B0]" : "bg-[#FF8A80]/15 text-[#FFB4AB]")}>
      {up ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
      {Math.abs(d).toFixed(Math.abs(d) < 10 ? 1 : 0)}% vs {label}
    </span>
  );
}

/** One of the three figures under the hero's line: an icon in a soft circle, a label and the amount. */
function HeroStat({
  icon,
  label,
  value,
  hint,
  action,
  negative,
  divider,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | null;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  negative?: boolean;
  divider?: boolean;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5 pr-2 sm:pr-3", divider && "border-l border-white/15 pl-2.5 sm:pl-5")}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/12 text-[#7FE3B0] sm:size-9">{icon}</span>
        {action}
      </div>
      <p className="text-xs leading-snug text-white/75 sm:text-sm">{label}</p>
      {value === null ? (
        <Skeleton className="h-6 w-20 bg-white/15" />
      ) : (
        <p className={cn("num text-base leading-tight font-extrabold [overflow-wrap:anywhere] sm:text-2xl", negative ? "text-[#FF8A80]" : "text-white")}>{money(value)}</p>
      )}
      {hint && <p className="text-[11px] leading-snug text-white/70 sm:text-xs [&_.text-success]:text-[#7FE3B0] [&_.text-destructive]:text-[#FFB4AB]">{hint}</p>}
    </div>
  );
}

/** A range choice: a white pill with a hairline, or deep green when picked. */
function RangePill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        "num inline-flex h-10 min-w-14 items-center justify-center gap-1.5 rounded-full border px-4 text-sm font-bold transition-colors",
        on ? "border-transparent bg-primary text-primary-foreground shadow-[0_6px_14px_-6px_color-mix(in_oklab,var(--primary)_70%,transparent)]" : "border-border bg-card text-foreground hover:bg-muted"
      )}
    >
      {children}
    </button>
  );
}

/** A section's bold title with a green link on the right ("Barbers today · Daily sheet →"). */
function SectionTitle({ title, href, link }: { title: string; href: string; link: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-1">
      <h2 className="min-w-0 truncate text-xl font-extrabold tracking-tight">{title}</h2>
      <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-primary hover:underline">
        {link}
        <ArrowRight className="size-4" />
      </Link>
    </div>
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
  const { openNew } = useSaleSheet();
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

  const top = data ? Math.max(1, ...data.per_barber.map((b) => b.sales)) : 1;

  return (
    <div className="flex flex-col gap-6">
      {has("push") && !readOnly && <HomePushPrompt />}
      <SetupChecklist />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-tight sm:text-[32px]">Dashboard</h1>
          <p className="mt-1 flex items-center gap-2 text-[15px] text-muted-foreground">
            {rangeLabel}
            {to === today && (
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-success" aria-hidden />
                Live
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Range">
            {presets.map((x) => (
              <RangePill key={x.id} on={preset === x.id} onClick={() => choose(x)}>
                {x.label}
              </RangePill>
            ))}
            <RangePill on={preset === "custom"} onClick={() => setPreset("custom")}>
              <CalendarDays className="size-4" />
              Custom
            </RangePill>
          </div>
          {preset === "custom" && (
            <div className="flex items-center gap-2">
              <DateInput aria-label="From" max={to} value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className="h-10 w-40" />
              <span className="text-sm text-muted-foreground">to</span>
              <DateInput aria-label="To" min={from} max={today} value={to} onChange={(e) => e.target.value && setTo(e.target.value)} className="h-10 w-40" />
            </div>
          )}
        </div>
      </div>

      {/* The hero: sales on deep green, as in the phone app; expense, commission and profit underneath. */}
      <section className="relative overflow-hidden rounded-[26px] bg-linear-to-br from-[#0E5A48] to-[#0A3E32] p-5 text-white shadow-[0_18px_40px_-18px_rgb(10_62_50/0.6)] sm:p-7">
        <div className="pointer-events-none absolute -top-24 -right-20 size-72 rounded-full bg-white/[0.06]" aria-hidden />
        <div className="relative flex items-start justify-between gap-3">
          <p className="text-lg font-bold">Sales {word}</p>
          <BarChart3 className="size-6 text-white/90" aria-hidden />
        </div>
        {t ? (
          <p className="num relative mt-2 text-[40px] leading-none font-extrabold tracking-tight sm:text-[52px]">{money(t.sales)}</p>
        ) : (
          <Skeleton className="relative mt-3 h-12 w-48 bg-white/15" />
        )}
        <div className="relative mt-4 flex flex-wrap items-center gap-3">
          {t && p && <DeltaChip now={t.sales} before={p.sales} label={vs} />}
          {t && <span className="text-[15px] text-white/80">{t.count} customers</span>}
        </div>
        <div className="relative mt-5 grid grid-cols-3 border-t border-white/15 pt-5">
          <HeroStat
            icon={<Wallet className="size-4" />}
            label={`Expense ${word}`}
            value={t?.expense ?? null}
            hint={t?.company_expense ? `incl. ${money(t.company_expense)} company` : undefined}
            action={
              has("expenses") && !readOnly ? (
                <button
                  type="button"
                  aria-label="Add company expense"
                  onClick={() => setAddExpense(true)}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/12 text-white transition-colors hover:bg-white/20"
                >
                  <Plus className="size-4" />
                </button>
              ) : undefined
            }
          />
          <HeroStat icon={<Percent className="size-4" />} label={`Commission ${word}`} value={t?.commission ?? null} divider />
          <HeroStat
            icon={<TrendingUp className="size-4" />}
            label={`Profit ${word}`}
            value={t?.profit ?? null}
            negative={!!t && t.profit < 0}
            hint={t && p ? <Delta now={t.profit} before={p.profit} label={vs} /> : undefined}
            divider
          />
        </div>
      </section>

      {!readOnly && (
        <Button size="lg" className="h-14 w-full text-base lg:hidden" onClick={() => openNew()}>
          <Plus />
          New sale
        </Button>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section className="flex min-w-0 flex-col gap-3">
          <SectionTitle title={`Barbers ${word}`} href={`/sheet?month=${to.slice(0, 7)}`} link="Daily sheet" />
          {!data ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-20 rounded-[22px]" />
              ))}
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.per_barber.map((b) => (
                <li key={b.id}>
                  <Card className="flex-row items-center gap-3 px-4 py-4 sm:gap-4">
                    <UserAvatar name={b.name} url={b.avatar_url} size={44} className="shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate text-base font-bold">{b.name}</p>
                        <p className="num shrink-0 text-base font-extrabold">{money(b.sales)}</p>
                      </div>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
                        <span className="num">{b.count} cust</span>
                        <span aria-hidden>•</span>
                        <span className="num">Comm {num(b.commission, true)}</span>
                        <span aria-hidden>•</span>
                        {b.expense_entered ? (
                          <span className="num inline-flex items-center gap-1">
                            exp {num(b.expense)}
                            {single && <Check className="size-3.5 text-success" />}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            exp <Minus className="size-3.5" />
                          </span>
                        )}
                      </p>
                      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${b.sales > 0 ? Math.max(4, (b.sales / top) * 100) : 0}%` }} />
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex min-w-0 flex-col gap-3">
          <SectionTitle title={`Latest sales ${word}`} href={single ? `/sales?day=${from}` : "/sales"} link="All sales" />
          <Card className="gap-0 p-0">
            {!data ? (
              <SaleListSkeleton rows={5} />
            ) : data.recent.length ? (
              <ul className="flex flex-col divide-y p-1.5">
                {data.recent.map((s) => (
                  <SaleRow key={s.id} sale={s} editable showBarber showDay={!single} />
                ))}
              </ul>
            ) : (
              <p className="px-4 py-10 text-center text-[15px] text-muted-foreground">No sales {word}.</p>
            )}
          </Card>
        </section>
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
