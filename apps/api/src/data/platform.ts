import type { PlanId } from "@ss/features";
import type { Settings } from "@ss/contract";
import { SETTINGS_COLS, toSettings } from "./tenant/settings";

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

/** Org statuses the cron serves (expired, deactivated and deleted orgs are skipped). */
export const CRON_STATUSES = ["trial", "active", "grace", "past_due"] as const satisfies readonly OrgStatus[];

/** plans.limits_json -> max_staff (null = unlimited); junk reads as unlimited, as planLimits always did. */
export function parseLimits(json: string | null): { max_staff: number | null } {
  if (json === null) return { max_staff: 0 }; // fail closed: unknown plan allows no staff
  let v: unknown;
  try {
    v = (JSON.parse(json) as { max_staff?: unknown } | null)?.max_staff;
  } catch {
    v = undefined;
  }
  return { max_staff: typeof v === "number" ? v : null };
}

/** One org as the cron sees it: everything it needs to decide what is due, read in the org loader's single statement. */
export interface CronOrg {
  org: Org;
  settings: Settings;
  /** The org has an org_whatsapp row (WA-ready once it also has the `whatsapp` feature). */
  hasWa: boolean;
  /** Its oldest unfinished WhatsApp campaign, if any. */
  openCampaign: number | null;
  /** Raw feature inputs for core/features-cache primeFeatures (no per-org features lookups). */
  planFeatures: string[];
  limits: { max_staff: number | null };
  overrides: { feature_key: string; enabled: 0 | 1 }[];
  /** job_runs claimed since the loader's `since`, as "job day" (so a job already run today costs no statement). */
  doneRuns: Set<string>;
}

/**
 * The cron org loader: ONE D1 statement for every served org with its settings, WhatsApp presence, open campaign and
 * feature inputs (R3). Platform-level on purpose (it is what finds the orgs, like orgByPhoneNumberId); each correlated
 * subselect and the settings join are tied to the outer org row's id. Ordered by id for the cron's rotation.
 */
const CRON_ORGS_SQL = `SELECT o.id AS o_id, o.slug AS slug, o.name AS o_name, o.status AS o_status, o.plan_id AS o_plan,
       o.trial_ends_at AS o_trial, o.grace_ends_at AS o_grace,
       ${SETTINGS_COLS.split(", ").map((c) => `st.${c.trim()}`).join(", ")},
       (SELECT v FROM org_assets WHERE org_id = o.id AND kind = 'logo') AS logo_v,
       EXISTS (SELECT 1 FROM org_whatsapp WHERE org_id = o.id) AS has_wa,
       (SELECT id FROM wa_campaigns WHERE org_id = o.id AND finished_at IS NULL ORDER BY id LIMIT 1) AS open_campaign,
       (SELECT json_group_array(feature_key) FROM plan_features WHERE plan_id = o.plan_id) AS plan_features,
       (SELECT limits_json FROM plans WHERE id = o.plan_id) AS limits_json,
       (SELECT json_group_array(json_object('feature_key', feature_key, 'enabled', enabled)) FROM org_feature_overrides WHERE org_id = o.id) AS overrides,
       (SELECT json_group_array(job || ' ' || day) FROM job_runs WHERE org_id = o.id AND created_at >= ?1) AS done_runs
     FROM orgs o JOIN org_settings st ON st.org_id = o.id
     WHERE o.status IN (${CRON_STATUSES.map((x) => `'${x}'`).join(", ")})
     ORDER BY o.id`;

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
    /**
     * The org a public receipt token belongs to (tokens are globally unique; the token is the capability).
     * Deliberately not org scoped: this is the one lookup that finds the org. The sale itself is then read through the
     * org-scoped salesRepo. Null when no live sale has this token.
     */
    async orgBySaleToken(token: string): Promise<Org | null> {
      const r = await db
        .prepare(
          `SELECT o.id, o.slug, o.name, o.status, o.plan_id, o.trial_ends_at, o.grace_ends_at
           FROM sales s JOIN orgs o ON o.id = s.org_id WHERE s.token = ? AND s.deleted_at IS NULL`,
        )
        .bind(token)
        .first<OrgRow>();
      return r ? toOrg(r) : null;
    },
    /**
     * The org a WhatsApp phone_number_id belongs to (globally UNIQUE). Platform-level on purpose: only the webhook uses
     * it, to find the org for Meta's callback before any org-scoped work. Never reads the token.
     */
    async orgByPhoneNumberId(phoneNumberId: string): Promise<Org | null> {
      const r = await db
        .prepare(
          `SELECT o.id, o.slug, o.name, o.status, o.plan_id, o.trial_ends_at, o.grace_ends_at
           FROM org_whatsapp w JOIN orgs o ON o.id = w.org_id WHERE w.phone_number_id = ?`,
        )
        .bind(phoneNumberId)
        .first<OrgRow>();
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
      return parseLimits(r ? r.limits_json : null);
    },
    /** Every org the cron serves (CRON_STATUSES), ordered by id, with its job_runs since `since`. 1 D1 statement however many orgs. */
    async cronOrgs(since: number): Promise<CronOrg[]> {
      const { results } = await db.prepare(CRON_ORGS_SQL).bind(since).all<Record<string, any>>();
      return results.map((r) => ({
        org: toOrg({ id: r.o_id, slug: r.slug, name: r.o_name, status: r.o_status, plan_id: r.o_plan, trial_ends_at: r.o_trial, grace_ends_at: r.o_grace }),
        settings: toSettings(r),
        hasWa: r.has_wa === 1,
        openCampaign: r.open_campaign ?? null,
        planFeatures: JSON.parse(r.plan_features ?? "[]") as string[],
        limits: parseLimits(r.limits_json ?? null),
        overrides: JSON.parse(r.overrides ?? "[]") as { feature_key: string; enabled: 0 | 1 }[],
        doneRuns: new Set(JSON.parse(r.done_runs ?? "[]") as string[]),
      }));
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
