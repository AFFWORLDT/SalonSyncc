"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { FeedbackPage } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * "Rate your visit" from WhatsApp (/rate/?t=<bill token>): the customer gives 1-5 stars and an optional comment
 * (GET/POST /api/public/feedback/:token). Every customer, whatever they rated, is then invited to review the salon on
 * Google through /api/public/review/:token, which notes the tap and redirects: Google's review policy forbids asking
 * only happy customers (review gating). The stars and comment still go privately to the salon. The link is only
 * shown when the salon has a Google review URL, so it can never bounce back here.
 */
export default function RatePage() {
  const [token, setToken] = useState<string | null>(null);
  const [page, setPage] = useState<FeedbackPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t") ?? "";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(t);
    if (!t) return setError("This link is incomplete.");
    api<FeedbackPage>(`/api/public/feedback/${encodeURIComponent(t)}`, { redirectOn401: false })
      .then((p) => {
        setPage(p);
        if (p.stars) setStars(p.stars);
        if (p.comment) setComment(p.comment);
        document.title = `Rate your visit — ${p.salon_name}`;
      })
      .catch((e) => setError(e?.status === 404 ? "This link has expired." : errorMessage(e)));
  }, []);

  async function send() {
    if (!token || !stars) return;
    setSending(true);
    try {
      const p = await api<FeedbackPage>(`/api/public/feedback/${encodeURIComponent(token)}`, { body: { stars, comment: comment.trim() || null }, redirectOn401: false });
      setPage(p);
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  const google = done && page?.google_review_url && token ? `/api/public/review/${encodeURIComponent(token)}` : null;

  return (
    <div className="flex min-h-full justify-center bg-gradient-to-b from-zinc-900 via-zinc-900 to-background px-4 pt-16 pb-12">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
        {error ? (
          <p role="alert" className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
            {error}
          </p>
        ) : !page ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : done ? (
          <div className="flex w-full flex-col items-center gap-3 rounded-xl bg-card p-6" data-testid="rate-thanks">
            <p className="text-lg font-semibold">Thank you{page.first_name ? `, ${page.first_name}` : ""}!</p>
            <p className="text-sm text-muted-foreground">Your rating helps {page.salon_name} get better.</p>
            {google && (
              <Button className="w-full" nativeButton={false} render={<a href={google} />}>
                Review us on Google
              </Button>
            )}
          </div>
        ) : (
          <div className="flex w-full flex-col items-center gap-4 rounded-xl bg-card p-6">
            <p className="text-sm font-semibold">{page.salon_name}</p>
            <p className="text-lg font-semibold">How was your visit{page.first_name ? `, ${page.first_name}` : ""}?</p>
            <p className="text-xs text-muted-foreground">
              Bill {page.bill_no} · {page.barber_name}
            </p>
            <div className="flex gap-1" role="radiogroup" aria-label="Stars">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setStars(n)} className="p-1">
                  <Star className={cn("size-9", n <= stars ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
                </button>
              ))}
            </div>
            <Textarea placeholder="Anything we should know? (optional)" value={comment} maxLength={500} onChange={(e) => setComment(e.target.value)} rows={3} />
            <Button className="w-full" disabled={!stars || sending} onClick={send}>
              {sending ? "Sending…" : "Send rating"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
