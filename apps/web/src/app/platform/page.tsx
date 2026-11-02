"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/admin/states";
import { pDate, relDays, signupSeries, STATUS_LABEL, statusClass, usePapi } from "@/lib/platform";
import { cn } from "@/lib/utils";

interface Overview {
  byStatus: Record<string, number>;
  trialsEnding: { id: string; slug: string; name: string; at: number }[];
  inGrace: { id: string; slug: string; name: string; at: number }[];
  mrr: number;
  signups: Record<string, number>;
  salesLast24h: number;
  activeStaff: number;
  currency: string;
}

/** Workers free plan: fine up to about this many busy salons (see the deploy notes). */
const FREE_PLAN_SALONS = 8;

export default function PlatformOverview() {
  const { data, error, reload } = usePapi<Overview>("/overview");
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data)
    return (
      <div className="grid gap-3 sm:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  const live = ["trial", "active", "grace", "past_due"].reduce((n, s) => n + (data.byStatus[s] ?? 0), 0);
  const series = signupSeries(data.signups);
  const max = Math.max(1, ...series.map((s) => s.count));
  const total30 = series.reduce((n, s) => n + s.count, 0);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl">Overview</h1>
        <p className="text-sm text-muted-foreground">Every salon on SalonKit right now.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Live salons" value={live} hint={`${data.byStatus.active ?? 0} paid · ${data.byStatus.trial ?? 0} on trial`} />
        <Tile label="Monthly revenue" value={`${data.currency} ${data.mrr.toLocaleString()}`} hint="Paid salons × plan price" />
        <Tile label="Sales, last 24 h" value={data.salesLast24h} hint={`${data.activeStaff} active staff`} />
        <Tile label="Signups, 30 days" value={total30} hint={`${live} of ~${FREE_PLAN_SALONS} on the free Workers plan`} />
      </div>

      <Card className="gap-3 p-4">
        <p className="text-sm font-semibold">By status</p>
        <div className="flex flex-wrap gap-2">
          {Object.keys(STATUS_LABEL).map((s) => (
            <Link key={s} href={`/platform/salons/?status=${s}`} className={cn("rounded-full px-3 py-1 text-sm font-medium", statusClass(s))}>
              {STATUS_LABEL[s]} <span className="num">{data.byStatus[s] ?? 0}</span>
            </Link>
          ))}
        </div>
      </Card>

      <Card className="gap-3 p-4">
        <p className="text-sm font-semibold">Signups per day</p>
        <div className="flex h-28 items-end gap-1" role="img" aria-label={`${total30} signups in 30 days`}>
          {series.map((s) => (
            <div key={s.day} className="flex flex-1 flex-col items-center justify-end" title={`${s.day}: ${s.count}`}>
              <div className="w-full rounded-t bg-primary/70" style={{ height: `${(s.count / max) * 100}%`, minHeight: s.count ? 4 : 1 }} />
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{pDate(Date.parse(series[0]!.day))}</span>
          <span>Today</span>
        </div>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <OrgList title="Trials ending this week" items={data.trialsEnding} empty="No trials end this week." />
        <OrgList title="In grace (payment needed)" items={data.inGrace} empty="Nobody is in grace." />
      </div>
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card className="gap-1.5 p-4">
      <p className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="num text-2xl leading-none font-semibold">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </Card>
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
