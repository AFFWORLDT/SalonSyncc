import { PLAN_DEFAULTS, TRIAL_EXCLUDED, TRIAL_PLAN, effectiveFeatures, type FeatureKey } from "@ss/features";
import { platformRepo, type Org } from "../data/platform";

export type Limits = { max_staff: number | null };
export interface OrgFeatures {
  features: FeatureKey[];
  limits: Limits;
}

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: OrgFeatures }>();

export function invalidateFeatures(orgId: string): void {
  cache.delete(orgId);
}

export async function featuresFor(db: D1Database, org: Org): Promise<OrgFeatures> {
  const hit = cache.get(org.id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const platform = platformRepo(db);
  let planFeatures: string[];
  let limits: Limits;
  if (org.status === "trial") {
    const trial = PLAN_DEFAULTS[TRIAL_PLAN];
    planFeatures = trial.features.filter((f) => !TRIAL_EXCLUDED.includes(f));
    limits = trial.limits;
  } else {
    [planFeatures, limits] = await Promise.all([platform.planFeatures(org.planId), platform.planLimits(org.planId)]);
  }
  const overrides = await platform.overrides(org.id);
  const value = { features: effectiveFeatures(planFeatures, overrides), limits };
  cache.set(org.id, { at: Date.now(), value });
  return value;
}
