"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Empty } from "./states";

export type ChartRow = Record<string, string | number | null>;

const PALETTE = [1, 2, 3, 4, 5].map((n) => `var(--chart-${n})`);

/** Fills in --chart-1..5 for any config entry without an explicit colour/theme. */
function withColors(config: ChartConfig): ChartConfig {
  return Object.fromEntries(
    Object.entries(config).map(([k, v], i) => [k, v.color || v.theme ? v : { ...v, color: PALETTE[i % PALETTE.length] }]),
  );
}

/**
 * Chart in a card.
 * - "area" / "bar": `data` rows share an x field (`xKey`, default "label"); every
 *   other key listed in `config` becomes a series. `stacked` stacks them.
 * - "donut": `data` rows are `{ name, value }`; `config` is keyed by each name.
 * Colours default to --chart-1..5 so they follow the accent and mode.
 */
export function ChartCard({
  title,
  description,
  kind,
  data,
  config,
  xKey = "label",
  stacked,
  height = 240,
  loading,
  emptyText = "No data for this period",
  className,
}: {
  title: string;
  description?: string;
  kind: "area" | "bar" | "donut";
  data: ChartRow[];
  config: ChartConfig;
  xKey?: string;
  stacked?: boolean;
  height?: number;
  loading?: boolean;
  emptyText?: string;
  className?: string;
}) {
  const cfg = withColors(config);
  const keys = Object.keys(cfg);
  const hasData =
    kind === "donut"
      ? data.some((d) => Number(d.value) > 0)
      : data.some((d) => keys.some((k) => Number(d[k]) > 0));

  return (
    <Card className={cn("gap-3", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton style={{ height }} className="w-full" />
        ) : !hasData ? (
          <div style={{ height }} className="flex items-center justify-center">
            <Empty title={emptyText} />
          </div>
        ) : (
          <ChartContainer config={cfg} className="aspect-auto w-full" style={{ height }}>
            {kind === "area" ? (
              <AreaChart data={data} margin={{ left: 0, right: 8, top: 4 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                {keys.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
                {keys.map((k) => (
                  <Area
                    key={k}
                    dataKey={k}
                    type="monotone"
                    stroke={`var(--color-${k})`}
                    fill={`var(--color-${k})`}
                    fillOpacity={0.15}
                    strokeWidth={2}
                    stackId={stacked ? "a" : undefined}
                  />
                ))}
              </AreaChart>
            ) : kind === "bar" ? (
              <BarChart data={data} margin={{ left: 0, right: 8, top: 4 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                {keys.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
                {keys.map((k) => (
                  <Bar key={k} dataKey={k} fill={`var(--color-${k})`} radius={4} stackId={stacked ? "a" : undefined} />
                ))}
              </BarChart>
            ) : (
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="name" />} />
                <Pie data={data} dataKey="value" nameKey="name" innerRadius="60%" strokeWidth={2}>
                  {data.map((d) => (
                    <Cell key={String(d.name)} fill={`var(--color-${String(d.name)})`} />
                  ))}
                </Pie>
                <ChartLegend content={<ChartLegendContent nameKey="name" />} />
              </PieChart>
            )}
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
