import type { PlanId } from "@ss/features";

export type OrgStatus = "trial" | "active" | "grace" | "past_due" | "expired" | "deactivated" | "deleted";

export interface Org {
  id: string;
  slug: string;
  name: string;
  status: OrgStatus;
  planId: PlanId;
  trialEndsAt: number | null;
  graceEndsAt: number | null;
}

interface OrgRow {
  id: string;
  slug: string;
  name: string;
  status: OrgStatus;
  plan_id: PlanId;
  trial_ends_at: number | null;
  grace_ends_at: number | null;
}

const toOrg = (r: OrgRow): Org => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  status: r.status,
  planId: r.plan_id,
  trialEndsAt: r.trial_ends_at,
  graceEndsAt: r.grace_ends_at,
});

const ORG_COLS = "id, slug, name, status, plan_id, trial_ends_at, grace_ends_at";

/** Platform-level data: not salon rows, so not org_id scoped. */
export function platformRepo(db: D1Database) {
  return {
    async orgBySlug(slug: string): Promise<Org | null> {
      const r = await db.prepare(`SELECT ${ORG_COLS} FROM orgs WHERE slug = ?`).bind(slug).first<OrgRow>();
      return r ? toOrg(r) : null;
    },
    async orgById(id: string): Promise<Org | null> {
      const r = await db.prepare(`SELECT ${ORG_COLS} FROM orgs WHERE id = ?`).bind(id).first<OrgRow>();
      return r ? toOrg(r) : null;
    },
    async planFeatures(planId: string): Promise<string[]> {
      const { results } = await db
        .prepare("SELECT feature_key FROM plan_features WHERE plan_id = ?")
        .bind(planId)
        .all<{ feature_key: string }>();
      return results.map((r) => r.feature_key);
    },
    async planLimits(planId: string): Promise<{ max_staff: number | null }> {
      const r = await db
        .prepare("SELECT limits_json FROM plans WHERE id = ?")
        .bind(planId)
        .first<{ limits_json: string }>();
      return r ? JSON.parse(r.limits_json) : { max_staff: null };
    },
    async overrides(orgId: string): Promise<{ feature_key: string; enabled: 0 | 1 }[]> {
      const { results } = await db
        .prepare("SELECT feature_key, enabled FROM org_feature_overrides WHERE org_id = ?")
        .bind(orgId)
        .all<{ feature_key: string; enabled: 0 | 1 }>();
      return results;
    },
  };
}
