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

/** Trial orgs get the trial plan's set (minus TRIAL_EXCLUDED); others their plan's. Then the org's overrides. */
function compute(org: Org, planFeatures: string[], planLimits: Limits, overrides: { feature_key: string; enabled: 0 | 1 }[]): OrgFeatures {
  let features = planFeatures;
  let limits = planLimits;
  if (org.status === "trial") {
    const trial = PLAN_DEFAULTS[TRIAL_PLAN];
    features = trial.features.filter((f) => !TRIAL_EXCLUDED.includes(f));
    limits = { ...trial.limits };
  }
  return {
    features: Object.freeze(effectiveFeatures(features, overrides)) as FeatureKey[],
    limits: Object.freeze(limits),
  };
}

export async function featuresFor(db: D1Database, org: Org): Promise<OrgFeatures> {
  const hit = cache.get(org.id);
  if (hit && Date.now() - hit.at < TTL_MS && hit.status === org.status && hit.planId === org.planId) return hit.value;

  const platform = platformRepo(db);
  let planFeatures: string[] = [];
  let limits: Limits = { max_staff: 0 };
  if (org.status !== "trial") [planFeatures, limits] = await Promise.all([platform.planFeatures(org.planId), platform.planLimits(org.planId)]);
  return prime(org, compute(org, planFeatures, limits, await platform.overrides(org.id)));
}

function prime(org: Org, value: OrgFeatures): OrgFeatures {
  cache.set(org.id, { at: Date.now(), status: org.status, planId: org.planId, value });
  return value;
}

/**
 * The cron (jobs/hourly.ts) reads every org's plan features, limits and overrides in its one org-loader statement and
 * primes the per-isolate cache with them, so the jobs' featuresFor calls (waSetup, notify) cost no D1 statements.
 */
export function primeFeatures(org: Org, planFeatures: string[], limits: Limits, overrides: { feature_key: string; enabled: 0 | 1 }[]): OrgFeatures {
  return prime(org, compute(org, planFeatures, limits, overrides));
}
