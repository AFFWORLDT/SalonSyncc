"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { qs } from "@/lib/api";
import { businessToday, dateTimeLabel, dayLabel } from "@/lib/format";
import type { RatingsReport } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/admin/states";
import { DateInput } from "@/components/app/date-input";
import { SimpleSelect } from "@/components/app/simple-select";

const SHOW = [
  { value: "all", label: "All ratings" },
  { value: "low", label: "1-3 stars" },
  { value: "comments", label: "With a comment" },
];

function Stars({ n, className }: { n: number; className?: string }) {
  return (
    <span className={cn("inline-flex gap-0.5", className)} aria-label={`${n} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn("size-3.5", i <= Math.round(n) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")} />
      ))}
    </span>
  );
}

const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "—");

/**
 * After a visit, WhatsApp's "Rate your visit" sends the customer to Google reviews: how many were asked and how
 * many tapped through, overall and per barber. Star ratings from the old in-app page show below when there are any.
 */
export default function RatingsPage() {
  const today = businessToday();
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [show, setShow] = useState("all");
  const { data, error, reload } = useApi<RatingsReport>(`/api/ratings${qs({ from, to })}`);
  const list = (data?.ratings ?? []).filter((r) => (show === "low" ? r.stars <= 3 : show === "comments" ? !!r.comment : true));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <DateInput aria-label="From" max={to} value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className="h-9 w-36" />
        <span className="text-sm text-muted-foreground">to</span>
        <DateInput aria-label="To" min={from} max={today} value={to} onChange={(e) => e.target.value && setTo(e.target.value)} className="h-9 w-36" />
      </div>

      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : (
        <>
          <Card className="flex flex-row items-center gap-5 p-5">
            <div className="text-center">
              <p className="num text-4xl font-semibold">{data.google.clicked}</p>
              <p className="mt-1 text-xs text-muted-foreground">to Google</p>
            </div>
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground">
                {data.google.clicked} of {data.google.asked} customer{data.google.asked === 1 ? "" : "s"} tapped &ldquo;Rate your visit&rdquo; ({pct(data.google.clicked, data.google.asked)})
              </p>
              <p>They land on the salon&apos;s Google review page. Google doesn&apos;t say who posted, so this counts taps.</p>
            </div>
          </Card>

          {data.google.barbers.length > 0 && (
            <Card className="gap-0 p-0">
              <p className="border-b px-4 py-3 text-sm font-semibold">Google taps by barber</p>
              <ul className="divide-y">
                {data.google.barbers.map((b) => (
                  <li key={b.barber_id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{b.barber_name}</span>
                    <span className="num text-sm font-semibold">
                      {b.clicked}/{b.asked}
                    </span>
                    <span className="num w-12 text-right text-xs text-muted-foreground">{pct(b.clicked, b.asked)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {data.count > 0 && (
            <>
            <Card className="flex flex-row items-center gap-5 p-5">
              <div className="text-center">
                <p className="num text-4xl font-semibold">{data.average ? data.average.toFixed(1) : "—"}</p>
                <Stars n={data.average ?? 0} className="mt-1" />
              </div>
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground">
                  {data.count} rating{data.count === 1 ? "" : "s"}
                </p>
                <p>Star ratings from the in-app page used before Google reviews.</p>
              </div>
            </Card>

            {data.barbers.length > 0 && (
              <Card className="gap-0 p-0">
                <p className="border-b px-4 py-3 text-sm font-semibold">By barber</p>
                <ul className="divide-y">
                  {data.barbers.map((b) => (
                    <li key={b.barber_id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{b.barber_name}</span>
                      <Stars n={b.average} />
                      <span className="num w-10 text-right text-sm font-semibold">{b.average.toFixed(1)}</span>
                      <span className="w-16 text-right text-xs text-muted-foreground">
                        {b.count} rating{b.count === 1 ? "" : "s"}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Latest</p>
              <SimpleSelect label="Show" value={show} onChange={setShow} options={SHOW} className="h-9 w-44" />
            </div>
            <div className="flex flex-col gap-2">
              {list.map((r) => (
                <Card key={r.id} className={cn("gap-1.5 p-3.5", r.stars <= 2 && "border-destructive/40 bg-destructive/5")}>
                  <div className="flex items-center gap-2">
                    <Stars n={r.stars} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.customer_label}</span>
                    <span className="text-xs text-muted-foreground">{dateTimeLabel(r.updated_at)}</span>
                  </div>
                  {r.comment && <p className="text-sm whitespace-pre-wrap">&ldquo;{r.comment}&rdquo;</p>}
                  <p className="text-xs text-muted-foreground">
                    {r.barber_name} · bill {r.bill_no} · {dayLabel(r.day)}
                  </p>
                </Card>
              ))}
            </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
