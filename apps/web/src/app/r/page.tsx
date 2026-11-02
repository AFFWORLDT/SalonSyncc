"use client";

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { setFormat, getFormat } from "@/lib/format";
import type { Receipt } from "@/lib/types";
import { Bill, printBill } from "@/components/app/bill";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** Public bill for the customer: /r/?t=<token>. Same <Bill> as in the app, so the shared bill looks identical. */
export default function ReceiptPage() {
  const [data, setData] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t");
    if (!t) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError("This receipt link is incomplete.");
      return;
    }
    api<Receipt>(`/api/public/receipt/${encodeURIComponent(t)}`, { redirectOn401: false })
      .then((r) => {
        // A public page has no session: format with the receipt's own salon (currency, decimals, time zone).
        const sl = r.salon;
        setFormat({ currency: sl.currency, minor: sl.currency_minor || 1, locale: sl.locale || "en-GB", timezone: sl.timezone || "UTC", dayStartHour: 0, phoneCountry: getFormat().phoneCountry });
        setData(r);
      })
      .catch((e) => setError(e?.status === 404 ? "This receipt link has expired or is wrong." : errorMessage(e)));
  }, []);

  useEffect(() => {
    if (data) document.title = `Receipt ${data.sale.bill_no} — ${data.salon.display_name}`;
  }, [data]);

  return (
    <div className="flex min-h-full justify-center bg-muted/40 px-4 py-8 print:bg-white print:p-0">
      <div className="w-full max-w-md">
        {error ? (
          <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">{error}</p>
        ) : !data ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-6" aria-busy="true">
            <Skeleton className="size-24 rounded-full" />
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-36" />
            <Skeleton className="mt-4 h-24 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <Bill sale={data.sale} settings={data.salon} />
        )}
        {data && (
          <Button variant="outline" className="mt-4 h-11 w-full print:hidden" onClick={printBill}>
            <Printer />
            Print / save PDF
          </Button>
        )}
      </div>
    </div>
  );
}
