"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Sparkles, TriangleAlert, X } from "lucide-react";
import { PLAN_DEFAULTS } from "@ss/features";
import { useAuth } from "@/lib/auth-context";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { daysLeft } from "@/components/app/subscription";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface Promo {
  tone: "promo" | "danger";
  /** Leading line, e.g. "5 days left in your free trial". */
  lead: string;
  /** The offer: the Pro plan and its monthly price. */
  offer: string;
  cta: string;
  /** An overdue payment can't be hidden. */
  dismissible: boolean;
}

type Sub = { status: string; planId: string; trialEndsAt: number | null; graceEndsAt: number | null };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/**
 * What the top bar says until the salon subscribes, or null when it has a paid plan (or the viewer can't pay).
 * `price` is the Pro plan's monthly price label (currency and amount).
 */
export function promoFor(sub: Sub, opts: { isAdmin: boolean; price: string; now?: number }): Promo | null {
  if (!opts.isAdmin) return null;
  const offer = `Start Pro from ${opts.price}/month`;
  const now = opts.now ?? Date.now();
  if (sub.status === "trial") {
    return { tone: "promo", lead: `${plural(daysLeft(sub.trialEndsAt, now), "day")} left in your free trial`, offer, cta: "Subscribe", dismissible: true };
  }
  if (sub.status === "grace" || sub.status === "past_due") {
    const n = daysLeft(sub.graceEndsAt, now);
    return { tone: "danger", lead: sub.status === "past_due" ? "Your payment is due" : "Your trial has ended", offer: `Subscribe within ${plural(n, "day")} to keep everything`, cta: sub.status === "past_due" ? "Fix billing" : "Subscribe", dismissible: false };
  }
  if (sub.status === "active" && sub.planId === "free") {
    return { tone: "promo", lead: "Unlock customers, reports and WhatsApp", offer, cta: "Subscribe", dismissible: true };
  }
  return null;
}

const dismissKey = (slug: string) => `ss_promo_dismissed:${slug}`;
function dismissedToday(slug: string, today: string): boolean {
  try {
    return localStorage.getItem(dismissKey(slug)) === today;
  } catch {
    return false;
  }
}

interface BillingPlans {
  plans: { id: string; price_monthly: number; currency: string; can_checkout: boolean }[];
}

/** The promo for the signed-in salon, with the Pro price from the plan catalogue (falls back to the defaults). */
export function usePromo(): { promo: Promo | null; dismiss: () => void; subscribe: () => Promise<void>; busy: boolean } {
  const { me, isAdmin, org } = useAuth();
  const router = useRouter();
  const st = me?.subscription.status;
  const wants = !!me && isAdmin && !me.support && (st === "trial" || st === "grace" || st === "past_due" || (st === "active" && me.subscription.planId === "free"));
  const { data: billing } = useApi<BillingPlans>(wants ? "/api/billing" : null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const slug = org?.slug ?? "";
  const today = me?.today ?? "";
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (slug && today) setHidden(dismissedToday(slug, today));
  }, [slug, today]);

  const pro = billing?.plans.find((p) => p.id === "pro");
  const price = pro ? `${pro.currency} ${pro.price_monthly}` : `${PLAN_DEFAULTS.pro.currency} ${PLAN_DEFAULTS.pro.priceMonthly}`;
  const raw = me && wants ? promoFor(me.subscription, { isAdmin, price }) : null;
  const promo = raw && raw.dismissible && hidden ? null : raw;

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(dismissKey(slug), today);
    } catch {
      /* private mode: hidden for this visit only */
    }
  };

  const subscribe = async () => {
    // Overdue Stripe payments are fixed in the billing portal; everything else starts Pro checkout when it's available.
    if (me?.subscription.status === "past_due") {
      router.push("/plan/");
      return;
    }
    if (!pro?.can_checkout) {
      router.push("/plan/");
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ url: string }>("/api/billing/checkout", { method: "POST", body: { plan_id: "pro" } });
      window.location.href = r.url;
    } catch (e) {
      setBusy(false);
      toast.error((e as Error).message || "Couldn't open checkout");
      router.push("/plan/");
    }
  };

  return { promo, dismiss, subscribe, busy };
}

/** Full-width bar above the header until the salon subscribes (ElevenLabs-style), with the Subscribe button on the right. */
export function PromoBar({ promo, onDismiss, onSubscribe, busy }: { promo: Promo; onDismiss: () => void; onSubscribe: () => void; busy?: boolean }) {
  const danger = promo.tone === "danger";
  return (
    <div
      role="status"
      data-testid="promo-bar"
      className={cn(
        "relative flex shrink-0 items-center justify-center gap-x-3 gap-y-1 overflow-hidden px-10 pt-[calc(env(safe-area-inset-top)+0.45rem)] pb-[0.45rem] text-center text-[13px] text-white",
        danger ? "bg-destructive" : "bg-[linear-gradient(100deg,#155c50_0%,#1f7a6a_45%,#2a9d88_70%,#b8935a_130%)]"
      )}
    >
      {!danger && <div aria-hidden className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 animate-[promo-sheen_6s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/15 to-transparent" />}
      <span className="relative flex min-w-0 flex-wrap items-center justify-center gap-x-2">
        {danger ? <TriangleAlert className="size-4 shrink-0" aria-hidden /> : <Sparkles className="size-4 shrink-0 text-[#f3dfb6]" aria-hidden />}
        <span className="font-medium">{promo.lead}</span>
        <span className="hidden text-white/60 sm:inline">·</span>
        <span className="text-white/90">{promo.offer}</span>
      </span>
      <button
        type="button"
        onClick={onSubscribe}
        disabled={busy}
        className={cn(
          "relative inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-white px-3.5 text-xs font-semibold shadow-sm transition-transform active:scale-[0.97] disabled:opacity-70",
          danger ? "text-destructive" : "text-[#155c50]"
        )}
      >
        {busy ? "Opening…" : promo.cta}
        <ArrowRight className="size-3.5" aria-hidden />
      </button>
      {promo.dismissible && (
        <button type="button" onClick={onDismiss} aria-label="Hide until tomorrow" className="absolute top-[calc(env(safe-area-inset-top)+0.45rem)] right-2 grid size-7 place-items-center rounded-full text-white/80 hover:bg-white/15 hover:text-white">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
