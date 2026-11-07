import { auditRepo, type AuditInput } from "./audit";
import { loginLimits } from "../../lib/limits";

/** Staff (users) rows as the staff screens see them: no password hash, no photo bytes. */
export interface StaffRow {
  id: number;
  org_id: string;
  username: string;
  name: string;
  phone: string | null;
  role: "owner" | "admin" | "barber";
  commission_pct: number | null;
  sort_order: number;
  active: 0 | 1;
  can_add_expense: 0 | 1;
  avatar_v: number;
  created_at: number;
  updated_at: number;
}

export interface StaffWrite {
  name: string;
  username: string;
  phone: string | null;
  role: "admin" | "barber" | "owner";
  commission_pct: number | null;
  sort_order: number;
  active: boolean;
  can_add_expense: boolean;
}

const COLS =
  "id, org_id, username, name, phone, role, commission_pct, sort_order, active, can_add_expense, avatar_v, created_at, updated_at";

/**
 * Where the browser fetches a user's photo; null when there is none or the user is inactive (the public route 404s then).
 * avatar_v only ever grows: positive = a photo at that version, zero or negative = cleared (clearAvatar negates it), so a
 * re-upload after a clear never reuses an immutable URL. `slug` is needed on workers.dev (no tenant host).
 */
/** The banner's public URL at version `v`, or null when there is none. */
export function bannerUrl(id: number, v: number | null | undefined, slug: string): string | null {
  return v && v > 0 ? `/api/public/banner/${id}/${v}?org=${encodeURIComponent(slug)}` : null;
}

export function avatarUrl(id: number, v: number | null | undefined, slug: string, active: boolean | number = true): string | null {
  return v && v > 0 && active ? `/api/public/avatar/${id}/${v}?org=${encodeURIComponent(slug)}` : null;
}

/** A user as the audit log keeps it: no secrets, photo or counters. */
export const staffAudit = (r: StaffRow | StaffWrite) => ({
  name: r.name,
  username: r.username,
  phone: r.phone,
  role: r.role,
  commission_pct: r.commission_pct,
  sort_order: r.sort_order,
  active: typeof r.active === "boolean" ? r.active : !!r.active,
  can_add_expense: typeof r.can_add_expense === "boolean" ? r.can_add_expense : !!r.can_add_expense,
});

type Actor = AuditInput["actor"];

/** The login-lockout keys of a username: the account key and the prefix every device key starts with. */
function lockoutKeys(orgId: string, username: string): { accountKey: string; devicePrefix: string } {
  const [, device, account] = loginLimits(orgId, username, "");
  return { accountKey: account!.key, devicePrefix: device!.key };
}

const COUNT_STAFF = "(SELECT COUNT(*) FROM users WHERE org_id = ? AND role != 'owner' AND active = 1)";

/** Every query here is scoped by org_id; tests/sql-guard.test.ts enforces it. */
export function usersRepo(db: D1Database, orgId: string) {
  const audit = auditRepo(db, orgId);
  const byId = (id: number) => db.prepare(`SELECT ${COLS} FROM users WHERE org_id = ? AND id = ?`).bind(orgId, id).first<StaffRow>();

  return {
    byId,
    async list(): Promise<StaffRow[]> {
      const r = await db.prepare(`SELECT ${COLS} FROM users WHERE org_id = ? ORDER BY role, sort_order, name`).bind(orgId).all<StaffRow>();
      return r.results;
    },
    /** True when another user in this org already has this username (case-insensitive). */
    async usernameTaken(username: string, exceptId: number | null): Promise<boolean> {
      const r = await db
        .prepare("SELECT id FROM users WHERE org_id = ? AND lower(username) = lower(?) AND id != ?")
        .bind(orgId, username, exceptId ?? 0)
        .first();
      return !!r;
    },
    async nextSortOrder(): Promise<number> {
      const r = await db.prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM users WHERE org_id = ?").bind(orgId).first<{ n: number }>();
      return r?.n ?? 1;
    },
    /**
     * Whether the user is referenced by business records, in which case they are deactivated rather than deleted.
     * Counts sales (as barber or creator, soft-deleted ones too: they still reference the user), ledger lines (barber book
     * or as actor), expenses, payouts (as barber or creator), company expenses and transfers they entered, and audit rows
     * they authored, and announcements they sent or were the one-barber target of (FK to users): anyone whose name the history shows is kept.
     */
    async userHasActivity(id: number): Promise<boolean> {
      const r = await db
        .prepare(
          `SELECT EXISTS (SELECT 1 FROM sales WHERE org_id = ?1 AND barber_id = ?2)
                + EXISTS (SELECT 1 FROM sales WHERE org_id = ?1 AND created_by = ?2)
                + EXISTS (SELECT 1 FROM ledger_entries WHERE org_id = ?1 AND barber_id = ?2)
                + EXISTS (SELECT 1 FROM ledger_entries WHERE org_id = ?1 AND actor_id = ?2)
                + EXISTS (SELECT 1 FROM expenses WHERE org_id = ?1 AND barber_id = ?2)
                + EXISTS (SELECT 1 FROM barber_payouts WHERE org_id = ?1 AND barber_id = ?2)
                + EXISTS (SELECT 1 FROM barber_payouts WHERE org_id = ?1 AND created_by = ?2)
                + EXISTS (SELECT 1 FROM company_expenses WHERE org_id = ?1 AND created_by = ?2)
                + EXISTS (SELECT 1 FROM money_transfers WHERE org_id = ?1 AND created_by = ?2)
                + EXISTS (SELECT 1 FROM audit_log WHERE org_id = ?1 AND actor_id = ?2)
                + EXISTS (SELECT 1 FROM announcements WHERE org_id = ?1 AND sender_id = ?2)
                + EXISTS (SELECT 1 FROM announcements WHERE org_id = ?1 AND target_id = ?2) AS n`,
        )
        .bind(orgId, id)
        .first<{ n: number }>();
      return (r?.n ?? 0) > 0;
    },

    /** Creates a user; null when the plan's staff limit (`maxStaff`, null = unlimited) is already reached. Atomic: the count is inside the INSERT. */
    async create(w: StaffWrite, passwordHash: string, actor: Actor, maxStaff: number | null): Promise<StaffRow | null> {
      const at = Date.now();
      const guard = maxStaff === null ? "" : ` WHERE ${COUNT_STAFF} < ?`;
      const [ins] = await db.batch([
        db
          .prepare(
            `INSERT INTO users (org_id, name, username, phone, password_hash, role, commission_pct, sort_order, active, can_add_expense, created_at, updated_at)
             SELECT ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?${guard} RETURNING ${COLS}`,
          )
          .bind(orgId, w.name, w.username, w.phone, passwordHash, w.role, w.commission_pct, w.sort_order, w.can_add_expense ? 1 : 0, at, at, ...(maxStaff === null ? [] : [orgId, maxStaff])),
        audit.stmt({
          actor,
          entity: "user",
          entityId: { sql: "(SELECT id FROM users WHERE org_id = ? AND username = ?)", binds: [orgId, w.username] },
          ref: w.name,
          action: "create",
          before: null,
          after: staffAudit(w),
          when: { sql: "(SELECT id FROM users WHERE org_id = ? AND username = ?) IS NOT NULL", binds: [orgId, w.username] },
        }),
      ]);
      return (ins!.results[0] as unknown as StaffRow | undefined) ?? null;
    },

    /**
     * Updates the profile; `bumpSession` signs the user out everywhere (used when deactivating).
     * `reactivateLimit` is set when this turns an inactive user active: `{max}` guards the plan's staff limit atomically (null max = unlimited).
     * Returns null when that guard refused.
     */
    async update(id: number, before: StaffRow, w: StaffWrite, bumpSession: boolean, actor: Actor, reactivateLimit?: { max: number | null }): Promise<StaffRow | null> {
      const guarded = reactivateLimit !== undefined && reactivateLimit.max !== null;
      const [upd] = await db.batch([
        db
          .prepare(
            `UPDATE users SET name = ?, username = ?, phone = ?, role = ?, commission_pct = ?, sort_order = ?, active = ?, can_add_expense = ?,
                    session_version = session_version + ?, updated_at = ? WHERE org_id = ? AND id = ?${guarded ? ` AND ${COUNT_STAFF} < ?` : ""} RETURNING ${COLS}`,
          )
          .bind(w.name, w.username, w.phone, w.role, w.commission_pct, w.sort_order, w.active ? 1 : 0, w.can_add_expense ? 1 : 0, bumpSession ? 1 : 0, Date.now(), orgId, id, ...(guarded ? [orgId, reactivateLimit!.max] : [])),
        audit.stmt({
          actor,
          entity: "user",
          entityId: id,
          ref: w.name,
          action: "update",
          before: staffAudit(before),
          after: staffAudit(w),
          // The update ran first in this batch: if it was refused, updated_at is unchanged from `before`.
          when: { sql: "(SELECT updated_at FROM users WHERE org_id = ? AND id = ?) != ?", binds: [orgId, id, before.updated_at] },
        }),
      ]);
      return (upd!.results[0] as unknown as StaffRow | undefined) ?? null;
    },

    /** New password, signs the user out everywhere and clears their lockout counters (account key + every device key). */
    async resetPassword(target: StaffRow, hash: string, actor: Actor): Promise<void> {
      const { accountKey, devicePrefix } = lockoutKeys(orgId, target.username);
      await db.batch([
        db
          .prepare("UPDATE users SET password_hash = ?, session_version = session_version + 1, updated_at = ? WHERE org_id = ? AND id = ?")
          .bind(hash, Date.now(), orgId, target.id),
        db.prepare("DELETE FROM login_failures WHERE org_id = ? AND key = ?").bind(orgId, accountKey),
        db.prepare("DELETE FROM login_failures WHERE org_id = ? AND substr(key, 1, ?) = ?").bind(orgId, devicePrefix.length, devicePrefix),
        audit.stmt({ actor, entity: "user", entityId: target.id, ref: target.name, action: "password_reset", before: null, after: null }),
      ]);
    },

    async deactivate(target: StaffRow, actor: Actor): Promise<void> {
      await db.batch([
        db.prepare("UPDATE users SET active = 0, session_version = session_version + 1, updated_at = ? WHERE org_id = ? AND id = ?").bind(Date.now(), orgId, target.id),
        audit.stmt({
          actor,
          entity: "user",
          entityId: target.id,
          ref: target.name,
          action: "update",
          before: staffAudit(target),
          after: { ...staffAudit(target), active: false },
        }),
      ]);
    },

    /** Deletes a user with no history. Child rows first: lockout counters, phone sessions, device push tokens and their notification feed (FM parity). */
    async remove(target: StaffRow, actor: Actor): Promise<void> {
      const { accountKey, devicePrefix } = lockoutKeys(orgId, target.username);
      await db.batch([
        db.prepare("DELETE FROM mobile_sessions WHERE org_id = ? AND user_id = ?").bind(orgId, target.id),
        db.prepare("DELETE FROM push_tokens WHERE org_id = ? AND user_id = ?").bind(orgId, target.id),
        db.prepare("DELETE FROM notifications WHERE org_id = ? AND user_id = ?").bind(orgId, target.id),
        db.prepare("DELETE FROM login_failures WHERE org_id = ? AND key = ?").bind(orgId, accountKey),
        db.prepare("DELETE FROM login_failures WHERE org_id = ? AND substr(key, 1, ?) = ?").bind(orgId, devicePrefix.length, devicePrefix),
        audit.stmt({ actor, entity: "user", entityId: target.id, ref: target.name, action: "delete", before: staffAudit(target), after: null }),
        db.prepare("DELETE FROM users WHERE org_id = ? AND id = ?").bind(orgId, target.id),
      ]);
    },

    /** Stores a photo and returns the new version, or null when the user isn't in this org. */
    async setAvatar(id: number, bytes: ArrayBuffer, type: string): Promise<number | null> {
      const r = await db
        .prepare("UPDATE users SET avatar = ?, avatar_type = ?, avatar_v = abs(avatar_v) + 1, updated_at = ? WHERE org_id = ? AND id = ? RETURNING avatar_v")
        .bind(bytes, type, Date.now(), orgId, id)
        .first<{ avatar_v: number }>();
      return r?.avatar_v ?? null;
    },
    async clearAvatar(id: number): Promise<void> {
      await db.prepare("UPDATE users SET avatar = NULL, avatar_type = NULL, avatar_v = -(abs(avatar_v) + 1), updated_at = ? WHERE org_id = ? AND id = ?").bind(Date.now(), orgId, id).run();
    },
    /** Stores a profile banner and returns the new version, or null when the user isn't in this org. */
    async setBanner(id: number, bytes: ArrayBuffer, type: string): Promise<number | null> {
      const r = await db
        .prepare("UPDATE users SET banner = ?, banner_type = ?, banner_v = abs(banner_v) + 1, updated_at = ? WHERE org_id = ? AND id = ? RETURNING banner_v")
        .bind(bytes, type, Date.now(), orgId, id)
        .first<{ banner_v: number }>();
      return r?.banner_v ?? null;
    },
    async clearBanner(id: number): Promise<void> {
      await db.prepare("UPDATE users SET banner = NULL, banner_type = NULL, banner_v = -(abs(banner_v) + 1), updated_at = ? WHERE org_id = ? AND id = ?").bind(Date.now(), orgId, id).run();
    },
    /** The banner of an active user of this org at version `v`; null otherwise. */
    async banner(id: number, v: number): Promise<{ bytes: Uint8Array; type: string } | null> {
      const r = await db
        .prepare("SELECT banner, banner_type FROM users WHERE org_id = ? AND id = ? AND banner_v = ? AND active = 1 AND banner IS NOT NULL")
        .bind(orgId, id, v)
        .first<{ banner: ArrayBuffer | number[]; banner_type: string | null }>();
      if (!r) return null;
      const bytes = r.banner instanceof ArrayBuffer ? new Uint8Array(r.banner) : new Uint8Array(r.banner as number[]);
      return { bytes, type: r.banner_type ?? "application/octet-stream" };
    },
    /** The photo of an active user of this org at version `v` (its current avatar_v); null otherwise. */
    async avatar(id: number, v: number): Promise<{ bytes: Uint8Array; type: string } | null> {
      const r = await db
        .prepare("SELECT avatar, avatar_type FROM users WHERE org_id = ? AND id = ? AND avatar_v = ? AND active = 1 AND avatar IS NOT NULL")
        .bind(orgId, id, v)
        .first<{ avatar: ArrayBuffer | number[]; avatar_type: string | null }>();
      if (!r) return null;
      const bytes = r.avatar instanceof ArrayBuffer ? new Uint8Array(r.avatar) : new Uint8Array(r.avatar as number[]);
      return { bytes, type: r.avatar_type ?? "application/octet-stream" };
    },
  };
}
