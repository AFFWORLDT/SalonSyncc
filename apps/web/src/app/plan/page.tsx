"use client";

import { useEffect, useState } from "react";
import { Check, CreditCard, Lock } from "lucide-react";
import { toast } from "sonner";
import { FEATURE_KEYS, OVERRIDE_ONLY, PLAN_DEFAULTS, type PlanId } from "@ss/features";
import { useAuth } from "@/lib/auth-context";
import { useApi } from "@/hooks/use-api";
import { api, errorMessage } from "@/lib/api";
import { FEATURE_LABELS, planName } from "@/lib/plans";
import { PageHeader } from "@/components/admin/page-header";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { bannerText } from "@/components/app/subscription";
import { SUPPORT_EMAIL } from "@/lib/brand";

interface BillingInfo {
  enabled: boolean;
  provider: "none" | "stripe" | "manual";
  stripe_status: string | null;
  current_period_end: number | null;
  cancel_at: number | null;
  can_manage: boolean;
  plans: { id: string; name: string; price_monthly: number; currency: string; can_checkout: boolean }[];
}

const dateLabel = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** The salon's plan, what it includes, and the plans to choose from (Stripe Checkout when billing is on). */
export default function PlanPage() {
  const { me, refresh } = useAuth();
  const { data: billing } = useApi<BillingInfo>(me ? "/api/billing" : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [freeOpen, setFreeOpen] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("paid") !== "1") return;
    toast.success("Payment received. Your plan updates in a few seconds.");
    window.history.replaceState(null, "", window.location.pathname);
    // Stripe tells us by webhook; give it a moment, then reload the plan.
    const t = setTimeout(() => void refresh(), 4000);
    return () => clearTimeout(t);
  }, [refresh]);
  if (!me) return null;
  const b = bannerText(me.subscription);
  const staff = me.limits.max_staff;
  const current = me.subscription.planId;
  const paying = billing?.provider === "stripe" && ["active", "trialing", "past_due", "unpaid"].includes(billing.stripe_status ?? "");
  const isOwner = me.user.role === "owner";
  const plans =
    billing?.plans ??
    (Object.keys(PLAN_DEFAULTS) as PlanId[]).map((id) => ({ id, name: PLAN_DEFAULTS[id].name, price_monthly: PLAN_DEFAULTS[id].priceMonthly, currency: PLAN_DEFAULTS[id].currency as string, can_checkout: false }));

  async function go(path: string, body?: Record<string, unknown>) {
    setBusy(path + (body?.plan_id ?? ""));
    try {
      const r = await api<{ url: string }>(`/api/billing${path}`, { body: body ?? {} });
      window.location.href = r.url;
    } catch (e) {
      toast.error(errorMessage(e));
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Plan" description={`You're on ${planName(current)}${b ? ` · ${b.text}` : ""}`} />
      {billing && (paying || billing.can_manage) && (
        <Card className="flex-row flex-wrap items-center gap-3 p-4">
          <CreditCard className="size-5 text-muted-foreground" />
          <p className="min-w-0 flex-1 text-sm">
            {paying ? (
              <>
                Paid by card
                {billing.cancel_at ? ` · ends ${dateLabel(billing.cancel_at)}` : billing.current_period_end ? ` · renews ${dateLabel(billing.current_period_end)}` : ""}
                {billing.stripe_status === "past_due" ? " · the last payment failed, please update your card" : ""}
              </>
            ) : (
              "Card details and invoices"
            )}
          </p>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => go("/portal")}>
            Manage billing
          </Button>
        </Card>
      )}
      <Card className="gap-3 p-5">
        <p className="text-sm font-semibold">Included in your plan</p>
        <p className="text-sm text-muted-foreground">Staff: {staff === null ? "unlimited" : `up to ${staff}`}</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {FEATURE_KEYS.map((f) => {
            const on = me.features.includes(f);
            return (
              <li key={f} className={`flex items-center gap-2 text-sm ${on ? "" : "text-muted-foreground"}`}>
                {on ? <Check className="size-4 text-success" /> : <Lock className="size-4" />}
                {FEATURE_LABELS[f]}
                {!on && OVERRIDE_ONLY.includes(f) ? <span className="text-xs">(on request)</span> : null}
              </li>
            );
          })}
        </ul>
      </Card>
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => {
          const def = (PLAN_DEFAULTS as Record<string, (typeof PLAN_DEFAULTS)[PlanId]>)[p.id];
          const max = def?.limits.max_staff;
          const isCurrent = p.id === current && me.subscription.status !== "trial";
          return (
            <Card key={p.id} className="gap-2 p-5">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{p.name}</p>
                {p.id === current && <Badge>{me.subscription.status === "trial" ? "Your trial" : "Current"}</Badge>}
              </div>
              <p className="text-2xl font-semibold">
                {p.price_monthly ? `${p.currency} ${p.price_monthly}` : "Free"}
                {p.price_monthly ? <span className="text-sm font-normal text-muted-foreground"> / month</span> : null}
              </p>
              {max !== undefined && <p className="text-xs text-muted-foreground">Staff: {max === null ? "unlimited" : `up to ${max}`}</p>}
              {!isCurrent && !paying && p.can_checkout && (
                <Button className="mt-2" disabled={!!busy} onClick={() => go("/checkout", { plan_id: p.id })}>
                  {busy === `/checkout${p.id}` ? "Opening…" : `Choose ${p.name}`}
                </Button>
              )}
              {!isCurrent && !paying && p.price_monthly === 0 && isOwner && (
                <Button className="mt-2" variant="outline" disabled={!!busy} onClick={() => setFreeOpen(true)}>
                  Stay on Free
                </Button>
              )}
            </Card>
          );
        })}
      </div>
      {(!billing || !billing.enabled) && (
        <p className="text-sm text-muted-foreground">
          To change your plan, contact us{SUPPORT_EMAIL ? ` at ${SUPPORT_EMAIL}` : ""}. Other plans can be agreed with our team.
        </p>
      )}
      <ConfirmDialog
        open={freeOpen}
        onOpenChange={setFreeOpen}
        title="Switch to Free?"
        description="Free is yours to keep: sales, bills, expenses and the daily sheet. Other features are locked (nothing is deleted) and up to 2 staff stay active."
        confirmLabel="Switch to Free"
        onConfirm={async () => {
          try {
            await api("/api/billing/free", { body: {} });
            toast.success("You're on Free");
            await refresh();
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
    </div>
  );
}
