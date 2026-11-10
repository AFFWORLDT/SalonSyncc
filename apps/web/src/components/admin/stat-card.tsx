"use client";

import { Area, AreaChart } from "recharts";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

const SPARK_CONFIG = { v: { label: "Value", color: "var(--chart-1)" } } satisfies ChartConfig;

/** Percentage change of `current` vs `previous`; null when it cannot be computed. */
export function deltaPercent(current: number, previous: number | null | undefined): number | null {
  if (previous == null) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/**
 * KPI tile. `delta` is the percentage change vs the previous period (use
 * deltaPercent(current, previous)); null/undefined hides it. `format` defaults
 * to a locale number. `sparkline` is a plain number series.
 */
export function StatCard({
  label,
  value,
  delta,
  sparkline,
  format = (n) => n.toLocaleString(),
  className,
}: {
  label: string;
  value: number;
  /** Percent change vs previous period; omit or null to hide. */
  delta?: number | null;
  sparkline?: number[];
  format?: (n: number) => string;
  className?: string;
}) {
  const pct = delta ?? null;
  const up = pct != null && pct >= 0;
  return (
    <Card className={cn("gap-2 p-5", className)}>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-3xl leading-none font-extrabold tracking-tight tabular-nums">{format(value)}</p>
          {pct != null && (
            <p
              className={cn(
                "mt-2 inline-flex items-center gap-1 font-mono text-xs",
                pct === 0 ? "text-muted-foreground" : up ? "text-success" : "text-destructive",
              )}
            >
              {pct !== 0 && (up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />)}
              {up && pct !== 0 ? "+" : ""}
              {pct.toFixed(Math.abs(pct) < 10 ? 1 : 0)}%
              <span className="font-sans text-muted-foreground">vs previous</span>
            </p>
          )}
        </div>
        {sparkline && sparkline.length > 1 && (
          <ChartContainer config={SPARK_CONFIG} className="aspect-auto h-12 w-24 shrink-0">
            <AreaChart data={sparkline.map((v, i) => ({ i, v }))} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
              <Area
                dataKey="v"
                type="monotone"
                stroke="var(--color-v)"
                fill="var(--color-v)"
                fillOpacity={0.15}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </div>
    </Card>
  );
}
