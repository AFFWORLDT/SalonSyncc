"use client";

import { useEffect, useState } from "react";
import { CalendarCheck } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface BookingView {
  ref: string;
  salon: string;
  phone: string | null;
  when: string;
  staff: string;
  services: string[];
  total: number;
  currency: string;
  currency_minor: number;
  status: "confirmed" | "completed" | "no_show" | "cancelled";
  can_cancel: boolean;
}

const fmt = (b: BookingView) => `${b.currency} ${(b.total / b.currency_minor).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

/** The client's booking from the link in their confirmation (/book/?t=<token>): see it, or cancel it. No sign-in. */
export default function BookPage() {
  const [token, setToken] = useState<string | null>(null);
  const [b, setB] = useState<BookingView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t") ?? "";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(t);
    if (!t) return setError("This link is incomplete.");
    api<BookingView>(`/api/public/booking/b/${encodeURIComponent(t)}`, { redirectOn401: false })
      .then((v) => {
        setB(v);
        document.title = `Your booking — ${v.salon}`;
      })
      .catch((e) => setError(e?.status === 404 ? "We couldn't find this booking." : errorMessage(e)));
  }, []);

  async function cancel() {
    if (!token || !b || !confirm("Cancel this booking?")) return;
    setBusy(true);
    try {
      await api(`/api/public/booking/b/${encodeURIComponent(token)}/cancel`, { method: "POST", redirectOn401: false });
      setB({ ...b, status: "cancelled", can_cancel: false });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full justify-center bg-gradient-to-b from-zinc-900 via-zinc-900 to-background px-4 pt-16 pb-12">
      <div className="flex w-full max-w-sm flex-col gap-4">
        {error ? (
          <p role="alert" className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
            {error}
          </p>
        ) : !b ? (
          <Skeleton className="h-72 w-full rounded-xl" />
        ) : (
          <div className="flex flex-col gap-4 rounded-xl bg-card p-6">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-full bg-primary/10 text-primary">
                <CalendarCheck className="size-5" />
              </span>
              <div>
                <p className="text-sm text-muted-foreground">{b.salon}</p>
                <p className="text-lg font-semibold">{b.status === "cancelled" ? "Booking cancelled" : b.status === "confirmed" ? "You're booked" : "Your booking"}</p>
              </div>
            </div>
            <dl className="grid gap-2 text-sm">
              {[
                ["When", b.when],
                ["Services", b.services.join(", ")],
                ["With", b.staff],
                ["Total", fmt(b)],
                ["Reference", b.ref],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b pb-2">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            {b.can_cancel && (
              <Button variant="outline" disabled={busy} onClick={cancel}>
                {busy ? "Cancelling…" : "Cancel booking"}
              </Button>
            )}
            {b.phone && (
              <Button variant="ghost" nativeButton={false} render={<a href={`tel:${b.phone}`} />}>
                Call {b.salon}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
