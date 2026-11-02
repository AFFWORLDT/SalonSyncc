/** Audit log writes. Statements are returned unexecuted so callers add them to the same D1 batch as the change. */
export interface AuditInput {
  actor: { id: number; name: string };
  entity: string;
  /** A known id, or an expression evaluated inside the batch (e.g. a uid lookup) with its binds. */
  entityId: number | { sql: string; binds: unknown[] };
  ref: string | null;
  action: string;
  /** Optional condition (SQL returning truthy, with binds): the row is written only when it holds, e.g. when a guarded write in the same batch took effect. */
  when?: { sql: string; binds: unknown[] };
  before: unknown;
  after: unknown;
}

const json = (v: unknown): string | null => (v === null || v === undefined ? null : JSON.stringify(v));

export function auditRepo(db: D1Database, orgId: string) {
  return {
    stmt(a: AuditInput): D1PreparedStatement {
      const id = typeof a.entityId === "number" ? { sql: "?", binds: [a.entityId] } : a.entityId;
      return db
        .prepare(
          `INSERT INTO audit_log (org_id, at, actor_id, actor_name, entity, entity_id, ref, action, before, after)
           SELECT ?, ?, ?, ?, ?, ${id.sql}, ?, ?, ?, ?${a.when ? ` WHERE ${a.when.sql}` : ""}`,
        )
        .bind(orgId, Date.now(), a.actor.id, a.actor.name, a.entity, ...id.binds, a.ref, a.action, json(a.before), json(a.after), ...(a.when?.binds ?? []));
    },
  };
}
