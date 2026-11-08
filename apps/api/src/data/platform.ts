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
  /** Super admin override of the plan's limits (orgs.limits_override_json); null/absent = the plan's. */
  limitsOverride?: { max_staff: number | null } | null;
}

interface OrgRow {
  id: string;
  slug: string;
  name: string;
  status: OrgStatus;
  plan_id: PlanId;
  trial_ends_at: number | null;
  grace_ends_at: number | null;
  limits_override_json?: string | null;
}

const toOrg = (r: OrgRow): Org => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  status: r.status,
  planId: r.plan_id,
  trialEndsAt: r.trial_ends_at,
  graceEndsAt: r.grace_ends_at,
  limitsOverride: r.limits_override_json ? parseLimits(r.limits_override_json) : null,
});

const ORG_COLS = "id, slug, name, status, plan_id, trial_ends_at, grace_ends_at, limits_override_json";

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
  /** Raw feature inputs for core/features-cache computeFeatures (no per-org features lookups). */
  planFeatures: string[];
  limits: { max_staff: number | null };
  overrides: { feature_key: string; enabled: 0 | 1 }[];
  /** job_runs claimed since the loader's `since`, as "job day" (so a job already run today costs no statement). */
  doneRuns: Set<string>;
}

/** The org behind a webhook phone_number_id, with what the webhook needs, from one statement. */
export interface WebhookOrg {
  org: Org;
  /** org_settings.phone_country, to canonicalise STOP phones. */
  phoneCountry: string;
  planFeatures: string[];
  limits: { max_staff: number | null };
  overrides: { feature_key: string; enabled: 0 | 1 }[];
}

/**
 * The cron org loader: ONE D1 statement for every served org with its settings, WhatsApp presence, open campaign and
 * feature inputs (R3). Platform-level on purpose (it is what finds the orgs, like orgByPhoneNumberId); each correlated
 * subselect and the settings join are tied to the outer org row's id. Ordered by id for the cron's rotation.
 */
const CRON_ORGS_SQL = `SELECT o.id AS o_id, o.slug AS slug, o.name AS o_name, o.status AS o_status, o.plan_id AS o_plan,
       o.trial_ends_at AS o_trial, o.grace_ends_at AS o_grace, o.limits_override_json AS o_limits,
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
    /**
     * The salon an email belongs to (one email = one person in one salon, idx_users_email). Deliberately not org scoped:
     * this is the lookup that finds the org for "sign in with just your email". Only active users of live salons.
     */
    async orgOfEmail(email: string): Promise<Org | null> {
      const r = await db
        .prepare(
          `SELECT ${ORG_COLS.split(",").map((c) => `o.${c.trim()}`).join(", ")} FROM users u JOIN orgs o ON o.id = u.org_id
           WHERE lower(u.email) = lower(?) AND u.active = 1 AND o.status NOT IN ('deactivated', 'deleted')`,
        )
        .bind(email)
        .first<OrgRow>();
      return r ? toOrg(r) : null;
    },
    /** The salon name of an inactive person with this email (live salon), for "your account is turned off". */
    async inactiveSalonOfEmail(email: string): Promise<string | null> {
      const r = await db
        .prepare(
          `SELECT o.name FROM users u JOIN orgs o ON o.id = u.org_id
           WHERE lower(u.email) = lower(?) AND u.active = 0 AND o.status NOT IN ('deactivated', 'deleted')`,
        )
        .bind(email)
        .first<{ name: string }>();
      return r?.name ?? null;
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
          `SELECT o.id, o.slug, o.name, o.status, o.plan_id, o.trial_ends_at, o.grace_ends_at, o.limits_override_json
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
          `SELECT o.id, o.slug, o.name, o.status, o.plan_id, o.trial_ends_at, o.grace_ends_at, o.limits_override_json
           FROM org_whatsapp w JOIN orgs o ON o.id = w.org_id WHERE w.phone_number_id = ?`,
        )
        .bind(phoneNumberId)
        .first<OrgRow>();
      return r ? toOrg(r) : null;
    },
    /**
     * The webhook's org lookup in ONE statement (I3: a payload costs a fixed number of statements per number): the org
     * owning a phone_number_id, its calling code (for STOP phones) and its feature inputs for computeFeatures, as the
     * cron's loader reads them. Platform-level like orgByPhoneNumberId; every subselect is tied to the found org's row.
     */
    async webhookOrg(phoneNumberId: string): Promise<WebhookOrg | null> {
      const r = await db
        .prepare(
          `SELECT o.id, o.slug, o.name, o.status, o.plan_id, o.trial_ends_at, o.grace_ends_at, o.limits_override_json,
             (SELECT phone_country FROM org_settings WHERE org_id = o.id) AS cc,
             (SELECT json_group_array(feature_key) FROM plan_features WHERE plan_id = o.plan_id) AS plan_features,
             (SELECT limits_json FROM plans WHERE id = o.plan_id) AS limits_json,
             (SELECT json_group_array(json_object('feature_key', feature_key, 'enabled', enabled)) FROM org_feature_overrides WHERE org_id = o.id) AS overrides
           FROM org_whatsapp w JOIN orgs o ON o.id = w.org_id WHERE w.phone_number_id = ?`,
        )
        .bind(phoneNumberId)
        .first<OrgRow & { cc: string | null; plan_features: string | null; limits_json: string | null; overrides: string | null }>();
      if (!r) return null;
      return {
        org: toOrg(r),
        phoneCountry: r.cc ?? "971",
        planFeatures: JSON.parse(r.plan_features ?? "[]") as string[],
        limits: parseLimits(r.limits_json ?? null),
        overrides: JSON.parse(r.overrides ?? "[]") as { feature_key: string; enabled: 0 | 1 }[],
      };
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
        org: toOrg({ id: r.o_id, slug: r.slug, name: r.o_name, status: r.o_status, plan_id: r.o_plan, trial_ends_at: r.o_trial, grace_ends_at: r.o_grace, limits_override_json: r.o_limits }),
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

// ---------- signup (Plan 4) ----------

export interface SignupInput {
  orgId: string;
  slug: string;
  salonName: string;
  ownerName: string;
  ownerUsername: string;
  ownerEmail: string;
  ownerPhone: string | null;
  passwordHash: string;
  country: string;
  defaults: { currency: string; currency_minor: number; timezone: string; locale: string; phone_country: string };
  billPrefix: string;
  handoffHash: string;
  now: number;
  trialEndsAt: number;
  graceEndsAt: number;
  handoffExpiresAt: number;
}

/** Why a salon ID can't be used, or null when it is free. */
export type SlugProblem = "reserved" | "taken" | null;

export function signupRepo(db: D1Database) {
  return {
    async slugProblem(slug: string): Promise<SlugProblem> {
      const r = await db
        .prepare("SELECT (SELECT 1 FROM reserved_slugs WHERE slug = ?1) AS reserved, (SELECT 1 FROM orgs WHERE slug = ?1) AS taken")
        .bind(slug)
        .first<{ reserved: number | null; taken: number | null }>();
      return r?.reserved ? "reserved" : r?.taken ? "taken" : null;
    },
    async emailTaken(email: string): Promise<boolean> {
      // Also anyone's staff email: one email = one person in one salon.
      return !!(await db
        .prepare("SELECT 1 FROM orgs WHERE lower(owner_email) = lower(?1) AND deleted_at IS NULL UNION ALL SELECT 1 FROM users WHERE lower(email) = lower(?1)")
        .bind(email)
        .first());
    },
    /**
     * Creates the salon in ONE batch (all or nothing): org (trial), settings (country defaults), subscription row, owner,
     * owner link, the handoff token and the queued welcome email. 7 statements. Throws on a duplicate slug/email (UNIQUE) with nothing written.
     */
    async create(i: SignupInput): Promise<void> {
      const d = i.defaults;
      await db.batch([
        db
          .prepare(
            "INSERT INTO orgs(id,slug,name,status,plan_id,trial_ends_at,grace_ends_at,country,created_at,owner_email,owner_phone) VALUES(?,?,?,'trial','pro_max',?,?,?,?,?,?)",
          )
          .bind(i.orgId, i.slug, i.salonName, i.trialEndsAt, i.graceEndsAt, i.country, i.now, i.ownerEmail, i.ownerPhone),
        db
          .prepare(
            "INSERT INTO org_settings(org_id,display_name,currency,currency_minor,locale,timezone,phone_country,bill_prefix) VALUES(?,?,?,?,?,?,?,?)",
          )
          .bind(i.orgId, i.salonName, d.currency, d.currency_minor, d.locale, d.timezone, d.phone_country, i.billPrefix),
        db.prepare("INSERT INTO subscriptions(org_id) VALUES(?)").bind(i.orgId),
        db
          .prepare("INSERT INTO users(org_id,username,name,role,password_hash,created_at,email) VALUES(?,?,?,'owner',?,?,?)")
          .bind(i.orgId, i.ownerUsername, i.ownerName, i.passwordHash, i.now, i.ownerEmail.toLowerCase()),
        db
          .prepare("UPDATE orgs SET owner_user_id = (SELECT id FROM users WHERE org_id = ?1 AND username = ?2) WHERE id = ?1")
          .bind(i.orgId, i.ownerUsername),
        db
          .prepare(
            "INSERT INTO login_handoffs(token_hash,org_id,user_id,expires_at) VALUES(?1,?2,(SELECT id FROM users WHERE org_id = ?2 AND username = ?3),?4)",
          )
          .bind(i.handoffHash, i.orgId, i.ownerUsername, i.handoffExpiresAt),
        db.prepare(`INSERT INTO email_log(org_id,kind,"to",status) VALUES(?,'welcome',?,'queued')`).bind(i.orgId, i.ownerEmail),
      ]);
    },
    /** Records how the welcome email went (sent / failed / skipped); the cron retries failed ones in Plan 6. */
    async markEmail(orgId: string, kind: string, status: "sent" | "failed" | "skipped", at: number): Promise<void> {
      await db.prepare("UPDATE email_log SET status = ?3, sent_at = CASE WHEN ?3 = 'sent' THEN ?4 ELSE sent_at END WHERE org_id = ?1 AND kind = ?2").bind(orgId, kind, status, at).run();
    },
    /** Uses a handoff token once: returns its org and user, or null if unknown, used or expired. 1 statement. */
    async consumeHandoff(tokenHash: string, now: number): Promise<{ orgId: string; userId: number } | null> {
      const r = await db
        .prepare("UPDATE login_handoffs SET used_at = ?2 WHERE token_hash = ?1 AND used_at IS NULL AND expires_at > ?2 RETURNING org_id, user_id")
        .bind(tokenHash, now)
        .first<{ org_id: string; user_id: number }>();
      return r ? { orgId: r.org_id, userId: r.user_id } : null;
    },
  };
}
