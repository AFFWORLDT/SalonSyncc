"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { aed, dateLabel, businessToday } from "@/lib/format";
import type { Paged, Sale, User } from "@/lib/types";
import { qs } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DateInput } from "@/components/app/date-input";
import { ErrorState } from "@/components/admin/states";
import { SimpleSelect } from "@/components/app/simple-select";
import { SaleListSkeleton, SaleRow } from "@/components/app/sale-row";

const PAGE = 50;

export default function SalesPage() {
  const [day, setDay] = useState(businessToday());
  const [barber, setBarber] = useState("all");
  const [mode, setMode] = useState("all");
  const [pages, setPages] = useState(1);
  const users = useApi<User[]>("/api/users");

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (p.has("day")) setDay(p.get("day") ?? "");
    if (p.get("barber_id")) setBarber(p.get("barber_id")!);
  }, []);

  const path = `/api/sales${qs({ day, barber_id: barber === "all" ? null : barber, payment_mode: mode === "all" ? null : mode, page_size: PAGE * pages })}`;
  const { data, stale, error, reload } = useApi<Paged<Sale>>(path);
  const shown = data ?? stale;

  const barberOptions = useMemo(
    () => [{ value: "all", label: "All barbers" }, ...(users.data ?? []).map((u) => ({ value: String(u.id), label: u.active ? u.name : `${u.name} (inactive)` }))],
    [users.data]
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl">Sales</h1>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <div className="relative col-span-2 sm:col-span-1">
          <DateInput
            aria-label="Day"
            max={businessToday()}
            value={day}
            onChange={(e) => {
              setDay(e.target.value);
              setPages(1);
            }}
            className="h-10 sm:w-44"
          />
          {day && (
            <button type="button" onClick={() => setDay("")} className="absolute top-1/2 right-9 -translate-y-1/2 text-muted-foreground" aria-label="All days">
              <X className="size-4" />
            </button>
          )}
        </div>
        <SimpleSelect label="Barber" value={barber} onChange={(v) => (setBarber(v), setPages(1))} options={barberOptions} className="h-10 w-full sm:w-44" />
        <SimpleSelect
          label="Payment"
          value={mode}
          onChange={(v) => (setMode(v), setPages(1))}
          options={[
            { value: "all", label: "Cash + card" },
            { value: "cash", label: "Cash" },
            { value: "card", label: "Card" },
          ]}
          className="h-10 w-full sm:w-36"
        />
      </div>

      <Card className="gap-0 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">{day ? dateLabel(day) : "All days"}</p>
          {shown && (
            <p className="num text-sm text-muted-foreground">
              {shown.total} sales · <span className="font-semibold text-foreground">{aed(shown.sum ?? 0)}</span>
            </p>
          )}
        </div>
        {error && !shown ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !shown ? (
          <SaleListSkeleton rows={8} />
        ) : shown.items.length ? (
          <ul className="flex flex-col divide-y p-1">
            {shown.items.map((s) => (
              <SaleRow key={s.id} sale={s} editable showBarber showDay={!day} />
            ))}
          </ul>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">No sales match.</p>
        )}
        {shown && shown.items.length < shown.total && (
          <div className="border-t p-3 text-center">
            <Button variant="outline" onClick={() => setPages((p) => p + 1)}>
              Show more
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
