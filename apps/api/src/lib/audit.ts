/**
 * Audit log: who changed what, when, with before/after snapshots.
 * Pure helpers and types; the SQL (auditStmt) lives in data/tenant/audit.ts.
 */

export type AuditEntity = "sale" | "expense" | "company_expense" | "payout" | "transfer" | "opening" | "user" | "service" | "settings";
export type AuditAction = "create" | "update" | "delete" | "password_reset";

/** An id known only inside the batch, e.g. `(SELECT id FROM sales WHERE org_id = ? AND uid = ?)`. */
export type IdExpr = { sql: string; binds: unknown[] };

/** Top-level keys whose values differ (compared as JSON), sorted. */
export function changedFields(before: object | null, after: object | null): string[] {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  return [...keys].filter((k) => JSON.stringify(b[k] ?? null) !== JSON.stringify(a[k] ?? null)).sort();
}

const SECRET_USER_KEYS = ["password_hash", "avatar", "avatar_type", "session_version"];

/** A user row without secrets or the photo blob. */
export function userSnapshot(u: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(u).filter(([k]) => !SECRET_USER_KEYS.includes(k)));
}
