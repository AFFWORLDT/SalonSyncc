"use client";

import Link from "next/link";
import { ErrorState } from "@/components/admin/states";
import { PageHeader } from "@/components/admin/page-header";
import { StatCard, deltaPercent } from "@/components/admin/stat-card";
import { ChartCard } from "@/components/admin/chart-card";
import { RangePicker, RankList, dayLabel, useRange } from "@/components/platform/insights-ui";
import { usePapi } from "@/lib/platform";

interface Ai {
  range: number;
  tiles: { calls?: number; errors?: number; avg_ms?: number; salons?: number; calls_prev?: number; connections?: number };
  per_day: { day: string; ok: number; failed: number }[];
  salons: { org_id: string; salon: string; slug: string; calls: number; errors: number; last_at: number }[];
  tools: { tool: string; calls: number; errors: number }[];
}

/** AI connect (salons' Claude / ChatGPT connections, MCP) across every salon. Calls are kept 30 days. */
export default function AiPage() {
  const [range, setRange] = useRange();
  const { data, error, reload } = usePapi<Ai>(`/insights/ai?range=${range}`);
  const d = data?.range === range ? data : null;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  const t = d?.tiles ?? {};
  const calls = t.calls ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="AI connect" description="Salons asking Claude or ChatGPT about their business through SalonKit." actions={<RangePicker value={range} onChange={setRange} />} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Calls" value={calls} delta={deltaPercent(calls, t.calls_prev)} sparkline={d?.per_day.map((r) => r.ok + r.failed)} />
        <StatCard label="Error rate" value={calls ? ((t.errors ?? 0) / calls) * 100 : 0} format={(n) => `${n.toFixed(1)}%`} />
        <StatCard label="Avg answer time" value={t.avg_ms ?? 0} format={(n) => `${Math.round(n)} ms`} />
        <StatCard label="Salons using it" value={t.salons ?? 0} format={(n) => `${n} · ${t.connections ?? 0} live keys`} />
      </div>
      <ChartCard
        title="Calls per day"
        description="Answered vs failed"
        kind="bar"
        stacked
        data={d?.per_day.map((r) => ({ label: dayLabel(r.day), ok: r.ok, failed: r.failed })) ?? []}
        config={{ ok: { label: "Answered", color: "var(--chart-1)" }, failed: { label: "Failed", color: "var(--destructive)" } }}
        loading={!d}
      />
      <div className="grid gap-3 lg:grid-cols-2">
        <RankList
          title="Top salons"
          rows={(d?.salons ?? []).map((s) => ({
            key: s.org_id,
            label: (
              <Link href={`/platform/salons/view/?id=${encodeURIComponent(s.org_id)}`} className="hover:underline">
                {s.salon}
              </Link>
            ),
            value: s.calls,
            sub: s.errors ? `${s.errors} failed` : undefined,
          }))}
        />
        <RankList title="Top tools" rows={(d?.tools ?? []).map((x) => ({ key: x.tool, label: <span className="font-mono text-xs">{x.tool}</span>, value: x.calls, sub: x.errors ? `${x.errors} failed` : undefined }))} />
      </div>
      {range === 90 && <p className="text-xs text-muted-foreground">AI connect calls are kept 30 days, so the 90-day view shows the last 30.</p>}
    </div>
  );
}
