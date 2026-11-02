import type { OrgStatus } from "./platform";

/**
 * Super admin data (Plan 5). Platform-level on purpose: these queries read across salons, and only the platform router
 * (platform/admin/*, behind platformAuth) calls them. Each list is ONE statement; each change is ONE batch that also writes
 * its platform_audit row, so a change and its audit trail land together or not at all.
 */

export type PlatformRole = "owner" | "support";
export interface PlatformUser {
  id: number;
  email: string;
  password_hash: string;
  role: PlatformRole;
  session_version: number;
  created_at: number;
}

export interface AdminOrgRow {
  id: string;
  slug: string;
  name: string;
  status: OrgStatus;
  plan_id: string;
  trial_ends_at: number | null;
  grace_ends_at: number | null;
  created_at: number;
  deactivated_at: number | null;
  deleted_at: number | null;
  owner_email: string | null;
  owner_phone: string | null;
  country: string;
  limits_override_json: string | null;
  staff: number;
  sales_30d: number;
  last_sale_at: number | null;
}

export interface AuditInput {
  who: string;
  action: string;
  orgId: string | null;
  before?: unknown;
  after?: unknown;
  at: number;
}

const DAY = 86_400_000;
const ORG_LIST_COLS = `o.id, o.slug, o.name, o.status, o.plan_id, o.trial_ends_at, o.grace_ends_at, o.created_at, o.deactivated_at,
  o.deleted_at, o.owner_email, o.owner_phone, o.country, o.limits_override_json,
  (SELECT COUNT(*) FROM users u WHERE u.org_id = o.id AND u.active = 1) AS staff,
  (SELECT COUNT(*) FROM sales s WHERE s.org_id = o.id AND s.deleted_at IS NULL AND s.created_at >= ?1) AS sales_30d,
  (SELECT MAX(s.created_at) FROM sales s WHERE s.org_id = o.id) AS last_sale_at`;

export function adminRepo(db: D1Database) {
  const audit = (a: AuditInput) =>
    db
      .prepare("INSERT INTO platform_audit(who,action,org_id,before_json,after_json,at) VALUES(?,?,?,?,?,?)")
      .bind(a.who, a.action, a.orgId, a.before === undefined ? null : JSON.stringify(a.before), a.after === undefined ? null : JSON.stringify(a.after), a.at);

  return {
    audit,
    // ---------- platform users ----------
    async userByEmail(email: string): Promise<PlatformUser | null> {
      return db.prepare("SELECT * FROM platform_users WHERE lower(email) = lower(?)").bind(email).first<PlatformUser>();
    },
    async userById(id: number): Promise<PlatformUser | null> {
      return db.prepare("SELECT * FROM platform_users WHERE id = ?").bind(id).first<PlatformUser>();
    },
    async users(): Promise<Omit<PlatformUser, "password_hash" | "session_version">[]> {
      const { results } = await db.prepare("SELECT id, email, role, created_at FROM platform_users ORDER BY id").all<Omit<PlatformUser, "password_hash" | "session_version">>();
      return results;
    },
    async createUser(email: string, hash: string, role: PlatformRole, a: AuditInput): Promise<void> {
      await db.batch([
        db.prepare("INSERT INTO platform_users(email,password_hash,role,created_at) VALUES(?,?,?,?)").bind(email, hash, role, a.at),
        audit(a),
      ]);
    },
    async deleteUser(id: number, a: AuditInput): Promise<boolean> {
      const [del] = await db.batch([db.prepare("DELETE FROM platform_users WHERE id = ?").bind(id), audit(a)]);
      return (del!.meta.changes ?? 0) > 0;
    },
    /** New password and a bumped session_version (signs every other device out). Returns the new version. */
    async setUserPassword(id: number, hash: string, a: AuditInput): Promise<number> {
      const [r] = await db.batch([
        db.prepare("UPDATE platform_users SET password_hash = ?, session_version = session_version + 1 WHERE id = ? RETURNING session_version").bind(hash, id),
        audit(a),
      ]);
      return (r!.results[0] as { session_version: number }).session_version;
    },

    // ---------- salons ----------
    /** Salons for the table, newest first. Deleted salons only when asked for by status. 1 statement. */
    async orgs(f: { status?: string; plan?: string; q?: string; now: number }): Promise<AdminOrgRow[]> {
      const q = f.q ? `%${f.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%` : "";
      const { results } = await db
        .prepare(
          `SELECT ${ORG_LIST_COLS} FROM orgs o
           WHERE (?2 = '' AND o.status != 'deleted' OR o.status = ?2) AND (?3 = '' OR o.plan_id = ?3)
             AND (?4 = '' OR o.slug LIKE ?4 ESCAPE '\\' OR o.name LIKE ?4 ESCAPE '\\' OR o.owner_email LIKE ?4 ESCAPE '\\')
           ORDER BY o.created_at DESC LIMIT 500`,
        )
        .bind(f.now - 30 * DAY, f.status ?? "", f.plan ?? "", q)
        .all<AdminOrgRow>();
      return results;
    },
    async org(id: string, now: number): Promise<AdminOrgRow | null> {
      return db.prepare(`SELECT ${ORG_LIST_COLS} FROM orgs o WHERE o.id = ?2`).bind(now - 30 * DAY, id).first<AdminOrgRow>();
    },
    /** Everything the salon page shows beyond the row, in one batch (4 statements). */
    async orgExtras(id: string) {
      const [owner, overrides, emails, trail] = await db.batch([
        db
          .prepare(
            `SELECT u.id, u.name, u.username, st.display_name, st.contact_phone, st.address, st.currency, st.timezone, sub.provider, sub.current_period_end
             FROM orgs o LEFT JOIN users u ON u.org_id = o.id AND u.id = o.owner_user_id
             LEFT JOIN org_settings st ON st.org_id = o.id LEFT JOIN subscriptions sub ON sub.org_id = o.id WHERE o.id = ?`,
          )
          .bind(id),
        db.prepare("SELECT feature_key, enabled, reason, set_by, set_at FROM org_feature_overrides WHERE org_id = ? ORDER BY feature_key").bind(id),
        db.prepare(`SELECT kind, "to", status, sent_at FROM email_log WHERE org_id = ? ORDER BY id DESC LIMIT 50`).bind(id),
        db.prepare("SELECT id, who, action, before_json, after_json, at FROM platform_audit WHERE org_id = ? ORDER BY id DESC LIMIT 50").bind(id),
      ]);
      return {
        profile: (owner!.results[0] ?? null) as Record<string, unknown> | null,
        overrides: overrides!.results as { feature_key: string; enabled: 0 | 1; reason: string | null; set_by: number | null; set_at: number }[],
        emails: emails!.results as { kind: string; to: string; status: string; sent_at: number | null }[],
        audit: trail!.results as AuditRow[],
      };
    },
    /** Applies column changes to one org with its audit row (one batch). Columns are fixed by the callers, never user input. */
    async updateOrg(id: string, set: Partial<Record<"status" | "plan_id" | "trial_ends_at" | "grace_ends_at" | "deactivated_at" | "deleted_at" | "limits_override_json", string | number | null>>, a: AuditInput): Promise<void> {
      const cols = Object.keys(set);
      await db.batch([
        db.prepare(`UPDATE orgs SET ${cols.map((c, i) => `${c} = ?${i + 2}`).join(", ")} WHERE id = ?1`).bind(id, ...cols.map((c) => set[c as keyof typeof set] ?? null)),
        audit(a),
      ]);
    },
    /** Marks the salon paid by hand (bank transfer, cash) until `until`: status active, subscription provider manual. */
    async activate(id: string, planId: string, until: number | null, a: AuditInput): Promise<void> {
      await db.batch([
        db.prepare("UPDATE orgs SET status = 'active', plan_id = ?2, deactivated_at = NULL WHERE id = ?1").bind(id, planId),
        db
          .prepare("INSERT INTO subscriptions(org_id,provider,status,current_period_end) VALUES(?1,'manual','active',?2) ON CONFLICT(org_id) DO UPDATE SET provider = 'manual', status = 'active', current_period_end = ?2")
          .bind(id, until),
        audit(a),
      ]);
    },
    async setOverride(orgId: string, key: string, enabled: 0 | 1 | null, reason: string | null, by: number, a: AuditInput): Promise<void> {
      await db.batch([
        enabled === null
          ? db.prepare("DELETE FROM org_feature_overrides WHERE org_id = ? AND feature_key = ?").bind(orgId, key)
          : db
              .prepare(
                "INSERT INTO org_feature_overrides(org_id,feature_key,enabled,reason,set_by,set_at) VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(org_id,feature_key) DO UPDATE SET enabled = ?3, reason = ?4, set_by = ?5, set_at = ?6",
              )
              .bind(orgId, key, enabled, reason, by, a.at),
        audit(a),
      ]);
    },
    /** A single-use support code (sha-256 stored) for "Log in as salon". */
    async createSupport(codeHash: string, pid: number, orgId: string, expiresAt: number, a: AuditInput): Promise<void> {
      await db.batch([
        db.prepare("INSERT INTO support_sessions(code_hash,platform_user_id,org_id,expires_at) VALUES(?,?,?,?)").bind(codeHash, pid, orgId, expiresAt),
        audit(a),
      ]);
    },
    /** Uses a support code once: its org and platform user, or null when unknown, used, revoked or expired. 1 statement. */
    async consumeSupport(codeHash: string, now: number): Promise<{ orgId: string; pid: number } | null> {
      const r = await db
        .prepare("UPDATE support_sessions SET used_at = ?2 WHERE code_hash = ?1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?2 RETURNING org_id, platform_user_id")
        .bind(codeHash, now)
        .first<{ org_id: string; platform_user_id: number }>();
      return r ? { orgId: r.org_id, pid: r.platform_user_id } : null;
    },

    // ---------- plans ----------
    async plans() {
      const { results } = await db
        .prepare("SELECT p.*, (SELECT json_group_array(feature_key) FROM plan_features f WHERE f.plan_id = p.id) AS features, (SELECT COUNT(*) FROM orgs o WHERE o.plan_id = p.id AND o.status != 'deleted') AS orgs FROM plans p ORDER BY sort")
        .all<{ id: string; name: string; price_monthly: number; currency: string; stripe_price_id: string | null; limits_json: string; active: number; sort: number; features: string; orgs: number }>();
      return results;
    },
    async updatePlan(id: string, p: { name: string; price_monthly: number; stripe_price_id: string | null; limits_json: string; active: 0 | 1; features: string[] }, a: AuditInput): Promise<boolean> {
      const res = await db.batch([
        db.prepare("UPDATE plans SET name = ?, price_monthly = ?, stripe_price_id = ?, limits_json = ?, active = ? WHERE id = ?").bind(p.name, p.price_monthly, p.stripe_price_id, p.limits_json, p.active, id),
        db.prepare("DELETE FROM plan_features WHERE plan_id = ? AND EXISTS (SELECT 1 FROM plans WHERE id = ?)").bind(id, id),
        ...p.features.map((f) => db.prepare("INSERT INTO plan_features(plan_id,feature_key) SELECT ?1, ?2 WHERE EXISTS (SELECT 1 FROM plans WHERE id = ?1)").bind(id, f)),
        audit(a),
      ]);
      return (res[0]!.meta.changes ?? 0) > 0;
    },

    // ---------- audit + overview ----------
    async auditLog(f: { orgId?: string; before?: number; limit: number }): Promise<(AuditRow & { org_id: string | null; slug: string | null })[]> {
      const { results } = await db
        .prepare(
          `SELECT a.id, a.who, a.action, a.org_id, o.slug, a.before_json, a.after_json, a.at FROM platform_audit a LEFT JOIN orgs o ON o.id = a.org_id
           WHERE (?1 = '' OR a.org_id = ?1) AND (?2 = 0 OR a.id < ?2) ORDER BY a.id DESC LIMIT ?3`,
        )
        .bind(f.orgId ?? "", f.before ?? 0, f.limit)
        .all<AuditRow & { org_id: string | null; slug: string | null }>();
      return results;
    },
    /** The overview in one statement: counts by status, trials ending this week, salons in grace, MRR, signups per day (30 days). */
    async overview(now: number) {
      const r = await db
        .prepare(
          `SELECT
             (SELECT json_group_object(status, n) FROM (SELECT status, COUNT(*) AS n FROM orgs GROUP BY status)) AS by_status,
             (SELECT json_group_array(json_object('id', id, 'slug', slug, 'name', name, 'at', trial_ends_at)) FROM (SELECT id, slug, name, trial_ends_at FROM orgs WHERE status = 'trial' AND trial_ends_at <= ?2 ORDER BY trial_ends_at LIMIT 50)) AS trials_ending,
             (SELECT json_group_array(json_object('id', id, 'slug', slug, 'name', name, 'at', grace_ends_at)) FROM (SELECT id, slug, name, grace_ends_at FROM orgs WHERE status IN ('grace','past_due') ORDER BY grace_ends_at LIMIT 50)) AS in_grace,
             (SELECT COALESCE(SUM(p.price_monthly), 0) FROM orgs o JOIN plans p ON p.id = o.plan_id WHERE o.status = 'active') AS mrr,
             (SELECT json_group_object(d, n) FROM (SELECT date(created_at / 1000, 'unixepoch') AS d, COUNT(*) AS n FROM orgs WHERE created_at >= ?1 GROUP BY d)) AS signups,
             (SELECT COUNT(*) FROM sales WHERE created_at >= ?3 AND deleted_at IS NULL) AS sales_today,
             (SELECT COUNT(*) FROM users WHERE active = 1) AS staff`,
        )
        .bind(now - 30 * DAY, now + 7 * DAY, now - DAY)
        .first<{ by_status: string; trials_ending: string; in_grace: string; mrr: number; signups: string; sales_today: number; staff: number }>();
      return {
        byStatus: JSON.parse(r?.by_status ?? "{}") as Record<string, number>,
        trialsEnding: JSON.parse(r?.trials_ending ?? "[]") as { id: string; slug: string; name: string; at: number }[],
        inGrace: JSON.parse(r?.in_grace ?? "[]") as { id: string; slug: string; name: string; at: number }[],
        mrr: r?.mrr ?? 0,
        signups: JSON.parse(r?.signups ?? "{}") as Record<string, number>,
        salesLast24h: r?.sales_today ?? 0,
        activeStaff: r?.staff ?? 0,
      };
    },
  };
}

export interface AuditRow {
  id: number;
  who: string;
  action: string;
  before_json: string | null;
  after_json: string | null;
  at: number;
}
