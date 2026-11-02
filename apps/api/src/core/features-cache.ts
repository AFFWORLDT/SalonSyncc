import { PLAN_DEFAULTS, TRIAL_EXCLUDED, TRIAL_PLAN, effectiveFeatures, type FeatureKey } from "@ss/features";
import { platformRepo, type Org } from "../data/platform";

export type Limits = { max_staff: number | null };
export interface OrgFeatures {
  features: FeatureKey[];
  limits: Limits;
}

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; status: string; planId: string; value: OrgFeatures }>();

export function invalidateFeatures(orgId: string): void {
  cache.delete(orgId);
}

export async function featuresFor(db: D1Database, org: Org): Promise<OrgFeatures> {
  const hit = cache.get(org.id);
  if (hit && Date.now() - hit.at < TTL_MS && hit.status === org.status && hit.planId === org.planId) return hit.value;

  const platform = platformRepo(db);
  let planFeatures: string[];
  let limits: Limits;
  if (org.status === "trial") {
    const trial = PLAN_DEFAULTS[TRIAL_PLAN];
    planFeatures = trial.features.filter((f) => !TRIAL_EXCLUDED.includes(f));
    limits = { ...trial.limits };
  } else {
    [planFeatures, limits] = await Promise.all([platform.planFeatures(org.planId), platform.planLimits(org.planId)]);
  }
  const overrides = await platform.overrides(org.id);
  const value: OrgFeatures = {
    features: Object.freeze(effectiveFeatures(planFeatures, overrides)) as FeatureKey[],
    limits: Object.freeze(limits),
  };
  cache.set(org.id, { at: Date.now(), status: org.status, planId: org.planId, value });
  return value;
}
