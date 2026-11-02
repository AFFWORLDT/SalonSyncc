"use client";

import { Check, Lock } from "lucide-react";
import { FEATURE_KEYS, PLAN_DEFAULTS, type PlanId } from "@ss/features";
import { useAuth } from "@/lib/auth-context";
import { FEATURE_LABELS, planName } from "@/lib/plans";
import { PageHeader } from "@/components/admin/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { bannerText } from "@/components/app/subscription";
import { SUPPORT_EMAIL } from "@/lib/brand";

/** The salon's plan, what it includes, and the standard plans. Changes go through us until billing exists. */
export default function PlanPage() {
  const { me } = useAuth();
  if (!me) return null;
  const b = bannerText(me.subscription);
  const staff = me.limits.max_staff;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Plan" description={`You're on ${planName(me.subscription.planId)}${b ? ` · ${b.text}` : ""}`} />
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
              </li>
            );
          })}
        </ul>
      </Card>
      <div className="grid gap-4 md:grid-cols-3">
        {(Object.keys(PLAN_DEFAULTS) as PlanId[]).map((id) => {
          const p = PLAN_DEFAULTS[id];
          return (
            <Card key={id} className="gap-2 p-5">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{p.name}</p>
                {id === me.subscription.planId && <Badge>Current</Badge>}
              </div>
              <p className="text-2xl font-semibold">
                {p.priceMonthly ? `${p.currency} ${p.priceMonthly}` : "Free"}
                {p.priceMonthly ? <span className="text-sm font-normal text-muted-foreground"> / month</span> : null}
              </p>
              <p className="text-xs text-muted-foreground">Staff: {p.limits.max_staff === null ? "unlimited" : `up to ${p.limits.max_staff}`}</p>
            </Card>
          );
        })}
      </div>
      <p className="text-sm text-muted-foreground">
        To change your plan, contact us{SUPPORT_EMAIL ? ` at ${SUPPORT_EMAIL}` : ""}. Other plans can be agreed with our team.
      </p>
    </div>
  );
}
