"use client";

import { useEffect, useState } from "react";
import { Globe, Smartphone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type Range = 7 | 30 | 90;
const RANGES: Range[] = [7, 30, 90];
const RANGE_KEY = "atlantic_range";

/** The 7 / 30 / 90-day choice, remembered in this browser across the portal's pages. */
export function useRange(): [Range, (r: Range) => void] {
  const [range, setRange] = useState<Range>(7);
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(RANGE_KEY));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if ((RANGES as number[]).includes(v)) setRange(v as Range);
    } catch {
      /* private mode */
    }
  }, []);
  const set = (r: Range) => {
    setRange(r);
    try {
      localStorage.setItem(RANGE_KEY, String(r));
    } catch {
      /* ignore */
    }
  };
  return [range, set];
}

/** Segmented 7 / 30 / 90 days (UTC days ending today). */
export function RangePicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div role="radiogroup" aria-label="Period" className="inline-flex rounded-lg border border-border bg-card p-0.5">
      {RANGES.map((r) => (
        <button
          key={r}
          type="button"
          role="radio"
          aria-checked={value === r}
          onClick={() => onChange(r)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground",
            value === r && "bg-background font-medium text-foreground shadow-sm",
          )}
        >
          {r} days
        </button>
      ))}
    </div>
  );
}

/** "2026-11-09" -> "Nov 9" (the charts' x axis). */
export function dayLabel(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Sum of a day series. */
export const total = (s: { n: number }[]) => s.reduce((a, r) => a + r.n, 0);

/** The platforms' validated series colours (dataviz categorical slots 1-3, light and dark steps). */
export const PLATFORM_COLORS = {
  web: { label: "Web", theme: { light: "#2a78d6", dark: "#3987e5" } },
  ios: { label: "iOS", theme: { light: "#eb6834", dark: "#d95926" } },
  android: { label: "Android", theme: { light: "#1baf7a", dark: "#199e70" } },
} as const;

export function PlatformBadge({ platform, version }: { platform: string | null | undefined; version?: string | null }) {
  if (!platform) return <span className="text-xs text-muted-foreground">—</span>;
  const Icon = platform === "web" ? Globe : Smartphone;
  const label = platform === "ios" ? "iOS" : platform === "android" ? "Android" : "Web";
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      <Icon className="size-3" />
      {label}
      {version && platform !== "web" ? <span className="num">{version}</span> : null}
    </span>
  );
}

/**
 * A ranked list with a thin bar per row (platforms, versions, top salons, tools): the value is always printed, so the
 * bar is never the only way to read it.
 */
export function RankList({
  title,
  description,
  rows,
  empty = "Nothing in this period",
  right,
}: {
  title: string;
  description?: string;
  rows: { key: string; label: React.ReactNode; value: number; sub?: React.ReactNode; color?: string }[];
  empty?: string;
  right?: React.ReactNode;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Card className="gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {right}
      </div>
      {rows.length ? (
        <ul className="flex flex-col gap-2.5">
          {rows.map((r) => (
            <li key={r.key} className="grid gap-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{r.label}</span>
                <span className="num shrink-0 font-medium">
                  {r.value.toLocaleString()}
                  {r.sub ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">{r.sub}</span> : null}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted">
                <div className="h-1.5 rounded-full" style={{ width: `${(r.value / max) * 100}%`, minWidth: r.value ? 4 : 0, background: r.color ?? "var(--chart-1)" }} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>
      )}
    </Card>
  );
}
