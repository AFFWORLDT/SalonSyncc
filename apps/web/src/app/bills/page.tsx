"use client";

import { useEffect, useState } from "react";
import { ReceiptText, Search, X } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { qs } from "@/lib/api";
import { money, dateTimeLabel, businessToday } from "@/lib/format";
import type { Paged, Sale } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/app/date-input";
import { ErrorState } from "@/components/admin/states";
import { SaleListSkeleton } from "@/components/app/sale-row";
import { useSaleSheet } from "@/components/app/sale-sheet";
import { useAuth } from "@/lib/auth-context";

/** Every bill, newest first. Search by bill number, customer name or mobile; tap to open and print. */
export default function BillsPage() {
  const { openBill } = useSaleSheet();
  const { isAdmin } = useAuth();
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [day, setDay] = useState("");
  const [pages, setPages] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(text.trim());
      setPages(1);
    }, 250);
    return () => clearTimeout(t);
  }, [text]);

  const { data, stale, error, reload } = useApi<Paged<Sale>>(`/api/sales${qs({ q, day, page_size: 50 * pages })}`);
  const shown = data ?? stale;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl">{isAdmin ? "Bills" : "My bills"}</h1>
        <p className="text-sm text-muted-foreground">
          {isAdmin ? "Every sale makes a bill. Open one to see or print it." : "Bills for your customers only. Open one to see or print it."}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center">
        <div className="relative sm:w-80">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Bill no., name or mobile" value={text} onChange={(e) => setText(e.target.value)} className="h-10 pl-9" />
        </div>
        <div className="relative">
          <DateInput aria-label="Day" max={businessToday()} value={day} onChange={(e) => (setDay(e.target.value), setPages(1))} className="h-10 sm:w-44" />
          {day && (
            <button type="button" onClick={() => setDay("")} className="absolute top-1/2 right-9 -translate-y-1/2 text-muted-foreground" aria-label="All days">
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      <Card className="gap-0 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">{shown ? `${shown.total} bill${shown.total === 1 ? "" : "s"}` : "Bills"}</p>
          {shown && <p className="num text-sm font-semibold">{money(shown.sum ?? 0)}</p>}
        </div>
        {error && !shown ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !shown ? (
          <SaleListSkeleton rows={8} />
        ) : shown.items.length ? (
          <ul className="divide-y">
            {shown.items.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => openBill(s)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-muted hover:bg-muted/50">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <ReceiptText className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="num truncate text-sm font-semibold">{s.bill_no}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {s.customer_label}
                      {isAdmin ? ` · ${s.barber_name}` : ""} · {dateTimeLabel(s.created_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="num text-sm font-semibold">{money(s.amount)}</p>
                    <p className="text-xs text-muted-foreground">{s.payment_mode === "cash" ? "Cash" : "Card"}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">No bills match.</p>
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
