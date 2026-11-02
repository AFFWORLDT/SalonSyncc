import type { LedgerSource, Line } from "../../lib/ledger";
import type { IdExpr } from "../../lib/audit";

export type { IdExpr };

/** A SQL condition with its binds, evaluated inside the batch. */
export interface Cond {
  sql: string;
  binds: unknown[];
}

/**
 * Ledger statements, returned unexecuted so callers put them in the same D1 batch as the change.
 * Every statement is scoped by org_id, including live-line selection on reversal (INV§8.4).
 */
export function ledgerRepo(db: D1Database, orgId: string) {
  return {
    /** `when` (SQL + binds): each line is written only when it holds, e.g. when a guarded write in the same batch took effect. */
    postStmts(source: LedgerSource, sourceId: number | IdExpr, ref: string | null, actorId: number, lines: Line[], when?: Cond): D1PreparedStatement[] {
      const id = typeof sourceId === "number" ? { sql: "?", binds: [sourceId] } : sourceId;
      const at = Date.now();
      return lines.map((l) =>
        db
          .prepare(
            `INSERT INTO ledger_entries (org_id, at, day, book, account, barber_id, amount, kind, source, source_id, ref, memo, actor_id)
             SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ${id.sql}, ?, ?, ?${when ? ` WHERE ${when.sql}` : ""}`,
          )
          .bind(orgId, at, l.day, l.book, l.account, l.barber_id, l.amount, l.kind, source, ...id.binds, ref, l.memo, actorId, ...(when?.binds ?? [])),
      );
    },

    /** Cancels every live line of a source in this org: an opposite line on the same day and account, then marks the original. */
    reverseStmts(source: LedgerSource, sourceId: number, actorId: number, when?: Cond): D1PreparedStatement[] {
      const w = when ? ` AND ${when.sql}` : "";
      const wb = when?.binds ?? [];
      return [
        db
          .prepare(
            `INSERT INTO ledger_entries (org_id, at, day, book, account, barber_id, amount, kind, source, source_id, ref, memo, reverses_id, actor_id)
             SELECT org_id, ?, day, book, account, barber_id, -amount, 'reversal', source, source_id, ref, 'Reversed · ' || memo, id, ?
             FROM ledger_entries WHERE org_id = ? AND source = ? AND source_id = ? AND reversed = 0 AND reverses_id IS NULL${w}`,
          )
          .bind(Date.now(), actorId, orgId, source, sourceId, ...wb),
        db
          .prepare(`UPDATE ledger_entries SET reversed = 1 WHERE org_id = ? AND source = ? AND source_id = ? AND reversed = 0 AND reverses_id IS NULL${w}`)
          .bind(orgId, source, sourceId, ...wb),
      ];
    },
  };
}
