"use client";

import { Lock } from "lucide-react";
import type { FeatureKey } from "@ss/features";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FEATURE_LABELS, cheapestPlanWith } from "@/lib/plans";
import { SUPPORT_EMAIL } from "@/lib/brand";

/** Shown instead of a page or section the salon's plan doesn't include. Billing arrives later, so it says how to ask. */
export function UpgradeCard({ feature }: { feature: FeatureKey }) {
  const plan = cheapestPlanWith(feature);
  return (
    <Card data-testid="upgrade-card" className="items-center gap-2 p-8 text-center">
      <Lock className="size-7 text-muted-foreground" />
      <p className="text-base font-semibold">Upgrade to unlock {FEATURE_LABELS[feature]}</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {plan ? `${FEATURE_LABELS[feature]} is part of the ${plan.name} plan.` : "This isn't part of your plan."} Contact us to upgrade.
      </p>
      {SUPPORT_EMAIL && (
        <Button variant="outline" nativeButton={false} render={<a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Upgrade: ${FEATURE_LABELS[feature]}`)}`} />}>
          Contact us
        </Button>
      )}
    </Card>
  );
}
