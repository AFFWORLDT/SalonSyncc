"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { qs } from "@/lib/api";
import { aed, dateTimeLabel, phoneLabel, whatsappDigits } from "@/lib/format";
import type { Customer, Paged } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/admin/states";
import { WhatsAppIcon } from "@/components/app/whatsapp-icon";

export default function CustomersPage() {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [pages, setPages] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(text.trim());
      setPages(1);
    }, 250);
    return () => clearTimeout(t);
  }, [text]);
  const { data, stale, error, reload } = useApi<Paged<Customer>>(`/api/customers${qs({ q, page_size: 50 * pages })}`);
  const shown = data ?? stale;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl">Customers</h1>
        <p className="text-sm text-muted-foreground">Saved automatically when a barber enters a mobile number. Tap one for their visit history.</p>
      </div>
      <div className="relative max-w-md">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search name or mobile" value={text} onChange={(e) => setText(e.target.value)} className="h-10 pl-9" />
      </div>
      <Card className="gap-0 p-0">
        <div className="border-b px-4 py-3 text-sm font-semibold">{shown ? `${shown.total} customers` : "Customers"}</div>
        {error && !shown ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !shown ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : shown.items.length ? (
          <ul className="divide-y">
            {shown.items.map((c) => (
              <li key={c.id} className="flex items-center gap-1 pr-3">
                {/* Tap a customer for their profile and every visit. */}
                <Link href={`/customers/view/?id=${c.id}`} className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-1 active:bg-muted hover:bg-muted/40">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.name || "—"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {phoneLabel(c.phone)} · {c.visits} visit{c.visits === 1 ? "" : "s"}
                      {c.last_visit_at ? ` · last ${dateTimeLabel(c.last_visit_at)}` : ""}
                    </p>
                  </div>
                  <p className="num text-sm font-semibold">{aed(c.spent)}</p>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
                {c.phone && (
                  <a
                    href={`https://wa.me/${whatsappDigits(c.phone)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`WhatsApp ${c.name ?? c.phone}`}
                    className="flex size-9 items-center justify-center rounded-full text-[#25D366] active:bg-muted"
                  >
                    <WhatsAppIcon className="size-6" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">{q ? "No match." : "No customers yet."}</p>
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
