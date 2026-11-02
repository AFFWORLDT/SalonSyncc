import { PLAN_DEFAULTS, type FeatureKey, type PlanId } from "@ss/features";

export { FEATURE_LABELS } from "@ss/features";

const ORDER: PlanId[] = ["free", "pro", "pro_max"];

/** The cheapest standard plan that includes the feature (catalog defaults; sales can agree other deals). */
export function cheapestPlanWith(f: FeatureKey): { id: PlanId; name: string } | null {
  const id = ORDER.find((p) => PLAN_DEFAULTS[p].features.includes(f));
  return id ? { id, name: PLAN_DEFAULTS[id].name } : null;
}

export function planName(id: string): string {
  return (PLAN_DEFAULTS as Record<string, { name: string }>)[id]?.name ?? id;
}
