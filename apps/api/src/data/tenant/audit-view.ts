import type { AuditEntry } from "@ss/contract";
import { changedFields } from "../../lib/audit";
import { likeEscape } from "./customers";

/** Read side of the audit log (admin viewer). Every query is scoped by org_id; the write side is audit.ts. */
interface AuditRow extends Omit<AuditEntry, "before" | "after" | "changed"> {
  before: string | null;
  after: string | null;
}

const parse = (s: string | null): Record<string, unknown> | null => {
  if (!s) return null;
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

function toEntry(r: AuditRow): AuditEntry {
  const before = parse(r.before);
  const after = parse(r.after);
  return { ...r, before, after, changed: changedFields(before, after) };
}

export interface AuditFilters {
  entity?: string;
  /** null = an actor id that cannot match anything (junk input). */
  actorId?: number | null;
  /** Inclusive lower / exclusive upper bound on `at` (ms), already converted from business days. */
  fromAt?: number;
  toAt?: number;
  q?: string;
}

export function auditViewRepo(db: D1Database, orgId: string) {
  return {
    async list(f: AuditFilters, page: number, pageSize: number): Promise<{ items: AuditEntry[]; total: number }> {
      const where: string[] = [];
      const args: unknown[] = [];
      if (f.entity) (where.push("entity = ?"), args.push(f.entity));
      if (f.actorId !== undefined) f.actorId === null ? where.push("0") : (where.push("actor_id = ?"), args.push(f.actorId));
      if (f.fromAt !== undefined) (where.push("at >= ?"), args.push(f.fromAt));
      if (f.toAt !== undefined) (where.push("at < ?"), args.push(f.toAt));
      if (f.q) {
        const like = `%${likeEscape(f.q)}%`;
        where.push("(ref LIKE ? ESCAPE '\\' OR actor_name LIKE ? ESCAPE '\\' OR before LIKE ? ESCAPE '\\' OR after LIKE ? ESCAPE '\\')");
        args.push(like, like, like, like);
      }
      const w = where.length ? ` AND ${where.join(" AND ")}` : "";
      const [rows, n] = await Promise.all([
        db.prepare(`SELECT * FROM audit_log WHERE org_id = ?${w} ORDER BY id DESC LIMIT ? OFFSET ?`).bind(orgId, ...args, pageSize, (page - 1) * pageSize).all<AuditRow>(),
        db.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE org_id = ?${w}`).bind(orgId, ...args).first<{ n: number }>(),
      ]);
      return { items: rows.results.map(toEntry), total: n?.n ?? 0 };
    },

    /**
     * One sale's trail, oldest first. `null` when this org has neither the sale nor any trail for it (a deleted
     * sale keeps its history, as in FM).
     */
    async saleHistory(saleId: number): Promise<AuditEntry[] | null> {
      const { results } = await db
        .prepare("SELECT * FROM audit_log WHERE org_id = ? AND entity = 'sale' AND entity_id = ? ORDER BY id")
        .bind(orgId, saleId)
        .all<AuditRow>();
      if (results.length) return results.map(toEntry);
      const live = await db.prepare("SELECT 1 AS x FROM sales WHERE org_id = ? AND id = ?").bind(orgId, saleId).first();
      return live ? [] : null;
    },
  };
}
