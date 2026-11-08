"use client";

import Link from "next/link";
import { ErrorState } from "@/components/admin/states";
import { PageHeader } from "@/components/admin/page-header";
import { StatCard, deltaPercent } from "@/components/admin/stat-card";
import { ChartCard } from "@/components/admin/chart-card";
import { RangePicker, RankList, dayLabel, useRange } from "@/components/platform/insights-ui";
import { usePapi } from "@/lib/platform";

interface Wa {
  range: number;
  tiles: { sent?: number; failed?: number; delivered?: number; read?: number; salons?: number; sent_prev?: number };
  per_day: { day: string; sent: number; failed: number }[];
  kinds: { kind: string; n: number }[];
  salons: { org_id: string; salon: string; slug: string; sent: number; failed: number }[];
}

const KIND: Record<string, string> = { bill: "Bills", reminder: "Reminders", announcement: "Announcements", feedback: "Rating requests", test: "Tests" };
const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0);

/** WhatsApp messages salons send through their own WhatsApp Business numbers, across SalonKit. */
export default function WhatsAppPage() {
  const [range, setRange] = useRange();
  const { data, error, reload } = usePapi<Wa>(`/insights/whatsapp?range=${range}`);
  const d = data?.range === range ? data : null;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  const t = d?.tiles ?? {};
  const sent = t.sent ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="WhatsApp" description="Bills, reminders and campaigns salons send on WhatsApp." actions={<RangePicker value={range} onChange={setRange} />} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Sent" value={sent} delta={deltaPercent(sent, t.sent_prev)} sparkline={d?.per_day.map((r) => r.sent)} />
        <StatCard label="Delivered" value={pct(t.delivered ?? 0, sent)} format={(n) => `${n.toFixed(0)}%`} />
        <StatCard label="Read" value={pct(t.read ?? 0, sent)} format={(n) => `${n.toFixed(0)}%`} />
        <StatCard label="Failed" value={t.failed ?? 0} format={(n) => `${n} · ${t.salons ?? 0} salons`} />
      </div>
      <ChartCard
        title="Messages per day"
        kind="bar"
        stacked
        data={d?.per_day.map((r) => ({ label: dayLabel(r.day), sent: r.sent, failed: r.failed })) ?? []}
        config={{ sent: { label: "Sent", color: "var(--chart-1)" }, failed: { label: "Failed", color: "var(--destructive)" } }}
        loading={!d}
      />
      <div className="grid gap-3 lg:grid-cols-2">
        <RankList title="What was sent" rows={(d?.kinds ?? []).map((k) => ({ key: k.kind, label: KIND[k.kind] ?? k.kind, value: k.n }))} />
        <RankList
          title="Top salons"
          rows={(d?.salons ?? []).map((s) => ({
            key: s.org_id,
            label: (
              <Link href={`/platform/salons/view/?id=${encodeURIComponent(s.org_id)}`} className="hover:underline">
                {s.salon}
              </Link>
            ),
            value: s.sent,
            sub: s.failed ? `${s.failed} failed` : undefined,
          }))}
        />
      </div>
    </div>
  );
}
