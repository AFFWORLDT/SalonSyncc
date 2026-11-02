"use client";

import Link from "next/link";
import { Clock, TriangleAlert } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { planName } from "@/lib/plans";
import { SUPPORT_EMAIL } from "@/lib/brand";
import { cn } from "@/lib/utils";

const DAY = 86_400_000;
/** Whole days left until `at` (at least 0; a part day counts as one). */
export function daysLeft(at: number | null, now = Date.now()): number {
  return at === null ? 0 : Math.max(0, Math.ceil((at - now) / DAY));
}
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** The line the banner shows for a subscription, or null when there is nothing to say. */
export function bannerText(sub: { status: string; trialEndsAt: number | null; graceEndsAt: number | null }, now = Date.now()): { tone: "info" | "danger"; text: string } | null {
  if (sub.status === "trial") return { tone: "info", text: `${plural(daysLeft(sub.trialEndsAt, now), "day")} left in your free trial` };
  if (sub.status === "grace" || sub.status === "past_due") {
    const n = daysLeft(sub.graceEndsAt, now);
    return { tone: "danger", text: `Your trial has ended — upgrade within ${plural(n, "day")} to keep using everything` };
  }
  return null;
}

/** Trial countdown (calm) or grace warning (red) under the top bar. Admins get a link to the plan page. */
export function SubscriptionBanner() {
  const { me, isAdmin } = useAuth();
  if (!me) return null;
  const b = bannerText(me.subscription);
  if (!b) return null;
  return (
    <div
      role="status"
      className={cn(
        "flex items-center justify-center gap-2 px-4 py-1.5 text-center text-xs font-medium",
        b.tone === "danger" ? "bg-destructive text-white" : "bg-primary/10 text-foreground"
      )}
    >
      {b.tone === "danger" ? <TriangleAlert className="size-3.5 shrink-0" /> : <Clock className="size-3.5 shrink-0" />}
      <span>{b.text}</span>
      {isAdmin && (
        <Link href="/plan/" className="underline underline-offset-2">
          See plans
        </Link>
      )}
    </div>
  );
}

/** Full screen for a salon whose subscription lapsed: data stays readable, changes are blocked until it upgrades. */
export function ExpiredScreen() {
  const { me, logout } = useAuth();
  return (
    <Card data-testid="expired-screen" className="mx-auto mt-8 max-w-lg items-center gap-3 p-8 text-center">
      <TriangleAlert className="size-8 text-destructive" />
      <p className="text-lg font-semibold">Upgrade to continue</p>
      <p className="text-sm text-muted-foreground">
        {me?.settings.display_name}&apos;s {me ? planName(me.subscription.planId) : ""} subscription has ended. Your data is safe: you can still open
        reports and export them, but new sales and changes are paused until you upgrade.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button nativeButton={false} render={<Link href="/sheet/" />} variant="outline">
          Open reports
        </Button>
        {SUPPORT_EMAIL && (
          <Button nativeButton={false} render={<a href={`mailto:${SUPPORT_EMAIL}?subject=Upgrade`} />}>
            Contact us to upgrade
          </Button>
        )}
        <Button variant="ghost" onClick={() => logout()}>
          Sign out
        </Button>
      </div>
    </Card>
  );
}
