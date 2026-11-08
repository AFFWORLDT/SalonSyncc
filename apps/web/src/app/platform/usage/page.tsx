"use client";

import Link from "next/link";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorState } from "@/components/admin/states";
import { PageHeader } from "@/components/admin/page-header";
import { ChartCard } from "@/components/admin/chart-card";
import { RelativeTime } from "@/components/admin/relative-time";
import { PLATFORM_COLORS, PlatformBadge, RangePicker, RankList, dayLabel, total, useRange } from "@/components/platform/insights-ui";
import { StatCard, deltaPercent } from "@/components/admin/stat-card";
import { usePapi } from "@/lib/platform";
import { useAppTheme } from "@/components/theme/theme-provider";
import { cn } from "@/lib/utils";

type Day = { day: string; n: number };
interface Usage {
  range: number;
  dau: Day[];
  wau: Day[];
  by_platform: Record<"web" | "ios" | "android", Day[]>;
  platforms: { platform: string; n: number }[];
  versions: { platform: string; version: string; n: number }[];
  features: Record<string, number>;
  recent: { user_id: number; name: string; role: string; salon: string; slug: string; platform: string; app_version: string | null; last_at: number }[];
}

/** What salons do in SalonKit (server: /insights/usage features), in the order shown. */
const FEATURES: { key: string; label: string }[] = [
  { key: "bills", label: "Bills rung up" },
  { key: "customers", label: "New customers" },
  { key: "expenses", label: "Expenses added" },
  { key: "ratings", label: "Ratings received" },
  { key: "whatsapp", label: "WhatsApp messages sent" },
  { key: "notifications", label: "Staff notifications" },
  { key: "ai_calls", label: "AI connect calls" },
];

const PLATFORM_LABEL: Record<string, string> = { web: "Web", ios: "iOS", android: "Android" };

export default function UsagePage() {
  const [range, setRange] = useRange();
  const { data, error, reload } = usePapi<Usage>(`/insights/usage?range=${range}`);
  const { resolved } = useAppTheme();
  const colorOf = (p: string) => (PLATFORM_COLORS as Record<string, { theme: { light: string; dark: string } }>)[p]?.theme[resolved];
  const d = data?.range === range ? data : null;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;

  const today = d?.dau.at(-1)?.n ?? 0;
  const avgDau = d ? Math.round((total(d.dau) / d.dau.length) * 10) / 10 : 0;
  const activeData = d?.dau.map((r, i) => ({ label: dayLabel(r.day), dau: r.n, wau: d.wau[i]?.n ?? 0 })) ?? [];
  const platformData = d?.dau.map((r, i) => ({ label: dayLabel(r.day), web: d.by_platform.web?.[i]?.n ?? 0, ios: d.by_platform.ios?.[i]?.n ?? 0, android: d.by_platform.android?.[i]?.n ?? 0 })) ?? [];
  const phones = d?.platforms.filter((p) => p.platform !== "web").reduce((a, p) => a + p.n, 0) ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="App usage" description="Who uses SalonKit, on web and the phone app." actions={<RangePicker value={range} onChange={setRange} />} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active today" value={today} />
        <StatCard label="Active this week" value={d?.wau.at(-1)?.n ?? 0} />
        <StatCard label="Average per day" value={avgDau} format={(n) => n.toLocaleString()} sparkline={d?.dau.map((r) => r.n)} />
        <StatCard label="On the phone app" value={phones} />
      </div>

      <ChartCard
        title="Active people"
        description="Daily: distinct staff that day. Weekly: distinct staff in the 7 days up to that day."
        kind="area"
        data={activeData}
        config={{ dau: { label: "Daily" }, wau: { label: "Weekly" } }}
        loading={!d}
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard
          title="Platforms per day"
          description="Distinct people on each platform (one person can use two)"
          kind="bar"
          stacked
          data={platformData}
          config={{ web: PLATFORM_COLORS.web, ios: PLATFORM_COLORS.ios, android: PLATFORM_COLORS.android }}
          loading={!d}
        />
        <div className="grid gap-3">
          <RankList
            title="Platforms"
            description={`Distinct people in ${range} days`}
            rows={(d?.platforms ?? []).map((p) => ({ key: p.platform, label: PLATFORM_LABEL[p.platform] ?? p.platform, value: p.n, color: colorOf(p.platform) }))}
          />
          <RankList
            title="Phone app versions"
            description="People per version in this period"
            rows={(d?.versions ?? []).map((v) => ({ key: `${v.platform}-${v.version}`, label: `${PLATFORM_LABEL[v.platform] ?? v.platform} ${v.version}`, value: v.n, color: colorOf(v.platform) }))}
            empty="Nobody used the phone app in this period"
          />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_1.1fr]">
        <Card className="gap-0 p-0">
          <p className="border-b px-4 py-3 text-sm font-semibold">Feature activity</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>What</TableHead>
                <TableHead className="text-right">{range} days</TableHead>
                <TableHead className="text-right">vs previous</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {FEATURES.map((f) => {
                const cur = d?.features[f.key] ?? 0;
                const pct = deltaPercent(cur, d?.features[`${f.key}_prev`]);
                return (
                  <TableRow key={f.key}>
                    <TableCell>{f.label}</TableCell>
                    <TableCell className="num text-right font-medium">{d ? cur.toLocaleString() : "…"}</TableCell>
                    <TableCell className="text-right">
                      {pct == null ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <span className={cn("inline-flex items-center gap-1 font-mono text-xs", pct === 0 ? "text-muted-foreground" : pct > 0 ? "text-success" : "text-destructive")}>
                          {pct !== 0 && (pct > 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />)}
                          {pct > 0 ? "+" : ""}
                          {pct.toFixed(Math.abs(pct) < 10 ? 1 : 0)}%
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>

        <Card className="gap-0 p-0">
          <p className="border-b px-4 py-3 text-sm font-semibold">Recently active</p>
          {d?.recent.length ? (
            <ul className="divide-y">
              {d.recent.map((r) => (
                <li key={r.user_id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      <span className="capitalize">{r.role}</span> ·{" "}
                      <Link href={`/platform/salons/?q=${encodeURIComponent(r.slug)}`} className="hover:underline">
                        {r.salon}
                      </Link>
                    </p>
                  </div>
                  <PlatformBadge platform={r.platform} version={r.app_version} />
                  <RelativeTime ms={r.last_at} className="w-20 shrink-0 text-right text-xs text-muted-foreground" />
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">{d ? "Nobody yet. Activity is recorded from today." : "Loading…"}</p>
          )}
        </Card>
      </div>
      <p className="text-xs text-muted-foreground">
        Activity counts staff signed in to a salon (web or phone app), recorded at most every 10 minutes per person. SalonKit support sessions are not counted.
      </p>
    </div>
  );
}
