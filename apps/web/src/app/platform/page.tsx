"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/admin/states";
import { PageHeader } from "@/components/admin/page-header";
import { StatCard, deltaPercent } from "@/components/admin/stat-card";
import { ChartCard } from "@/components/admin/chart-card";
import { RangePicker, dayLabel, useRange } from "@/components/platform/insights-ui";
import { relDays, STATUS_LABEL, statusClass, usePapi } from "@/lib/platform";
import { cn } from "@/lib/utils";

interface Overview {
  byStatus: Record<string, number>;
  trialsEnding: { id: string; slug: string; name: string; at: number }[];
  inGrace: { id: string; slug: string; name: string; at: number }[];
  mrr: number;
  currency: string;
}

type Day = { day: string; n: number };
interface Dashboard {
  range: number;
  currency: string;
  tiles: Record<string, number>;
  series: { active: Day[]; signups: Day[]; sales: Day[]; sales_value: Day[]; ai_calls: Day[] };
}

/** Workers free plan: fine up to about this many busy salons (see the deploy notes). */
const FREE_PLAN_SALONS = 8;

const rows = (s: Day[]) => s.map((r) => ({ label: dayLabel(r.day), n: r.n }));
const minor = (n: number) => n / 100;

export default function PlatformOverview() {
  const [range, setRange] = useRange();
  const ov = usePapi<Overview>("/overview");
  const db = usePapi<Dashboard>(`/insights/dashboard?range=${range}`);
  const d = db.data?.range === range ? db.data : null;
  const err = ov.error ?? db.error;
  if (err && !ov.data && !db.data) return <ErrorState message={err} onRetry={() => (ov.reload(), db.reload())} />;

  const live = ov.data ? ["trial", "active", "grace", "past_due"].reduce((n, s) => n + (ov.data!.byStatus[s] ?? 0), 0) : 0;
  const t = d?.tiles ?? {};
  const cur = d?.currency || ov.data?.currency || "";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Dashboard" description="Live snapshot across every salon on SalonKit." actions={<RangePicker value={range} onChange={setRange} />} />

      {d && ov.data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label={`Live salons (free plan ~${FREE_PLAN_SALONS})`} value={live} />
          <StatCard label="Active today" value={t.active_today ?? 0} />
          <StatCard label={`Active (${range} days)`} value={t.active ?? 0} delta={deltaPercent(t.active ?? 0, t.active_prev)} sparkline={d.series.active.map((r) => r.n)} />
          <StatCard label="Signups" value={t.signups ?? 0} delta={deltaPercent(t.signups ?? 0, t.signups_prev)} sparkline={d.series.signups.map((r) => r.n)} />
          <StatCard label="Bills" value={t.sales ?? 0} delta={deltaPercent(t.sales ?? 0, t.sales_prev)} sparkline={d.series.sales.map((r) => r.n)} />
          <StatCard
            label={`Billed (${cur})`}
            value={minor(t.sales_value ?? 0)}
            format={(n) => Math.round(n).toLocaleString()}
            delta={deltaPercent(t.sales_value ?? 0, t.sales_value_prev)}
            sparkline={d.series.sales_value.map((r) => r.n)}
          />
          <StatCard label="AI connect calls" value={t.ai_calls ?? 0} delta={deltaPercent(t.ai_calls ?? 0, t.ai_calls_prev)} sparkline={d.series.ai_calls.map((r) => r.n)} />
          <StatCard label={`Revenue / month (${cur})`} value={ov.data.mrr} format={(n) => n.toLocaleString()} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard title="Active people" description="Distinct staff who used SalonKit, per day" kind="area" data={d ? rows(d.series.active) : []} config={{ n: { label: "People" } }} loading={!d} />
        <ChartCard title="Signups" description="New salons per day" kind="bar" data={d ? rows(d.series.signups) : []} config={{ n: { label: "Salons" } }} loading={!d} />
        <ChartCard title="Bills" description="Bills rung up across all salons, per day" kind="bar" data={d ? rows(d.series.sales) : []} config={{ n: { label: "Bills" } }} loading={!d} />
        <ChartCard
          title={`Billed (${cur})`}
          description="Value of those bills, per day"
          kind="area"
          data={d ? d.series.sales_value.map((r) => ({ label: dayLabel(r.day), n: Math.round(minor(r.n)) })) : []}
          config={{ n: { label: cur || "Billed" } }}
          loading={!d}
        />
      </div>

      {ov.data && (
        <Card className="gap-3 p-4">
          <p className="text-sm font-semibold">Salons by status</p>
          <div className="flex flex-wrap gap-2">
            {Object.keys(STATUS_LABEL).map((s) => (
              <Link key={s} href={`/platform/salons/?status=${s}`} className={cn("rounded-full px-3 py-1 text-sm font-medium", statusClass(s))}>
                {STATUS_LABEL[s]} <span className="num">{ov.data!.byStatus[s] ?? 0}</span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {ov.data && (
        <div className="grid gap-3 lg:grid-cols-2">
          <OrgList title="Trials ending this week" items={ov.data.trialsEnding} empty="No trials end this week." />
          <OrgList title="In grace (payment needed)" items={ov.data.inGrace} empty="Nobody is in grace." />
        </div>
      )}
    </div>
  );
}

function OrgList({ title, items, empty }: { title: string; items: { id: string; slug: string; name: string; at: number }[]; empty: string }) {
  return (
    <Card className="gap-0 p-0">
      <p className="border-b px-4 py-3 text-sm font-semibold">{title}</p>
      {items.length ? (
        <ul className="divide-y">
          {items.map((o) => (
            <li key={o.id}>
              <Link href={`/platform/salons/view/?id=${encodeURIComponent(o.id)}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{o.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{o.slug}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{relDays(o.at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">{empty}</p>
      )}
    </Card>
  );
}
