"use client";

import type { FeatureKey } from "@ss/features";
import { useAuth } from "@/lib/auth-context";
import { UpgradeCard } from "./upgrade-card";

/** Renders children only when the salon has the feature; otherwise the Upgrade card. Children never mount (no API calls). */
export function FeatureGate({ feature, children }: { feature: FeatureKey; children: React.ReactNode }) {
  const { me, has } = useAuth();
  if (!me) return null;
  return has(feature) ? <>{children}</> : <UpgradeCard feature={feature} />;
}
