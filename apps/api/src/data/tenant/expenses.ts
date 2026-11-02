import type { CompanyExpense, Expense, MoneyAccount } from "@ss/contract";
import { auditRepo, type AuditInput } from "./audit";
import { ledgerRepo, type Cond } from "./ledger";
import { companyExpenseLines, expenseLines, needsRepost } from "../../lib/ledger";
import { randomToken } from "../../core/crypto";

type Actor = AuditInput["actor"];

/** Barber expenses with the barber's name; the join stays in the org. */
const EXPENSE_SELECT = `SELECT e.id, e.barber_id, u.name AS barber_name, e.day, e.amount, e.note, e.updated_at
  FROM expenses e JOIN users u ON u.org_id = e.org_id AND u.id = e.barber_id
  WHERE e.org_id = ?`;

/** Company expenses with the creator's name; the join stays in the org. */
const COMPANY_SELECT = `SELECT e.id, e.day, e.amount, e.note, e.paid_from, e.created_by, u.name AS created_by_name, e.updated_at
  FROM company_expenses e LEFT JOIN users u ON u.org_id = e.org_id AND u.id = e.created_by
  WHERE e.org_id = ?`;

export interface ExpenseFilters {
  from: string;
  to: string;
  barberId?: number;
}

/** A barber expense's new values (FM PUT /expenses). */
export interface ExpenseWrite {
  barber: { id: number; name: string };
  day: string;
  amount: number;
  note: string | null;
}

/** A company expense's values (FM readCompanyExpense). */
export interface CompanyExpenseWrite {
  day: string;
  amount: number;
  note: string;
  paid_from: MoneyAccount;
}

/** Outcome of a guarded write: applied, or lost to a concurrent write (`stale`) / a concurrent delete (`gone`). */
export type WriteResult = "ok" | "stale" | "gone";

const isUniqueViolation = (e: unknown) => /UNIQUE constraint failed/i.test(String((e as Error)?.message ?? e));

const expenseSnap = (barber: { id: number; name: string }, day: string, e: { amount: number; note: string | null }) => ({
  barber_id: barber.id,
  barber_name: barber.name,
  day,
  amount: e.amount,
  note: e.note,
});
const companySnap = (e: CompanyExpenseWrite) => ({ day: e.day, amount: e.amount, note: e.note, paid_from: e.paid_from });

/**
 * Barber and company expenses. Every query here is scoped by org_id; test/sql-guard.test.ts enforces it.
 * Edits and deletes use optimistic concurrency (updated_at compare-and-set), and the audit and ledger statements in the
 * same batch are gated on the guarded write having taken effect, so the ledger always matches the rows (lesson 0012).
 */
export function expensesRepo(db: D1Database, orgId: string) {
  const audit = auditRepo(db, orgId);
  const ledger = ledgerRepo(db, orgId);

  const byBarberDay = (barberId: number, day: string) =>
    db.prepare(`${EXPENSE_SELECT} AND e.barber_id = ? AND e.day = ?`).bind(orgId, barberId, day).first<Expense>();
  const companyById = (id: number) => db.prepare(`${COMPANY_SELECT} AND e.id = ?`).bind(orgId, id).first<CompanyExpense>();

  return {
    /** Whether this org's user may log their own expenses (users.can_add_expense). */
    async canAddExpense(userId: number): Promise<boolean> {
      const r = await db.prepare("SELECT can_add_expense FROM users WHERE org_id = ? AND id = ?").bind(orgId, userId).first<{ can_add_expense: number }>();
      return !!r?.can_add_expense;
    },

    /** An active user of this org an expense can be logged for; null otherwise (another org's id, inactive, unknown). */
    barberFor(id: number): Promise<{ id: number; name: string } | null> {
      return db
        .prepare("SELECT id, name FROM users WHERE org_id = ? AND id = ? AND active = 1 AND role IN ('owner','admin','barber')")
        .bind(orgId, id)
        .first<{ id: number; name: string }>();
    },

    /** FM GET /expenses: newest day first, then the barbers' order. */
    async list(f: ExpenseFilters): Promise<Expense[]> {
      const barber = f.barberId !== undefined ? " AND e.barber_id = ?" : "";
      const r = await db
        .prepare(`${EXPENSE_SELECT} AND e.day BETWEEN ? AND ?${barber} ORDER BY e.day DESC, u.sort_order, e.id`)
        .bind(orgId, f.from, f.to, ...(f.barberId !== undefined ? [f.barberId] : []))
        .all<Expense>();
      return r.results;
    },

    /** The one expense of a barber on a day (its updated_at is the row version). */
    byBarberDay,

    /**
     * FM's upsert, made race-safe. With no prior row: a plain INSERT, so a concurrent insert for the same barber and day
     * fails the batch on UNIQUE(org_id, barber_id, day) and nothing is posted twice. With a prior row: compare-and-set on
     * its updated_at, and the audit row and ledger repost are gated on that UPDATE having taken effect.
     */
    async upsert(old: Expense | null, w: ExpenseWrite, actor: Actor): Promise<WriteResult> {
      const ref = `${w.barber.name} · ${w.day}`;
      const lines = expenseLines({ day: w.day, amount: w.amount, barber_name: w.barber.name, note: w.note });
      if (!old) {
        const at = Date.now();
        const idExpr = { sql: "(SELECT id FROM expenses WHERE org_id = ? AND barber_id = ? AND day = ?)", binds: [orgId, w.barber.id, w.day] };
        try {
          await db.batch([
            db
              .prepare("INSERT INTO expenses (org_id, barber_id, day, amount, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
              .bind(orgId, w.barber.id, w.day, w.amount, w.note, at, at),
            audit.stmt({ actor, entity: "expense", entityId: idExpr, ref, action: "create", before: null, after: expenseSnap(w.barber, w.day, w) }),
            ...ledger.postStmts("expense", idExpr, ref, actor.id, lines),
          ]);
        } catch (e) {
          if (isUniqueViolation(e)) return "stale";
          throw e;
        }
        return "ok";
      }
      const at = Math.max(Date.now(), old.updated_at + 1);
      // G holds only if THIS batch's UPDATE took effect (new version, and our amount).
      const g: Cond = {
        sql: "EXISTS (SELECT 1 FROM expenses WHERE org_id = ? AND id = ? AND updated_at = ? AND amount = ?)",
        binds: [orgId, old.id, at, w.amount],
      };
      const oldLines = expenseLines({ day: old.day, amount: old.amount, barber_name: old.barber_name, note: old.note });
      const stmts = [
        db
          .prepare("UPDATE expenses SET amount = ?, note = ?, updated_at = ? WHERE org_id = ? AND id = ? AND updated_at = ?")
          .bind(w.amount, w.note, at, orgId, old.id, old.updated_at),
        audit.stmt({ actor, entity: "expense", entityId: old.id, ref, action: "update", when: g, before: expenseSnap(w.barber, w.day, old), after: expenseSnap(w.barber, w.day, w) }),
      ];
      if (needsRepost(oldLines, lines)) stmts.push(...ledger.reverseStmts("expense", old.id, actor.id, g), ...ledger.postStmts("expense", old.id, ref, actor.id, lines, g));
      const res = await db.batch(stmts);
      if ((res[0]!.meta.changes ?? 0) > 0) return "ok";
      return (await byBarberDay(w.barber.id, w.day)) ? "stale" : "gone";
    },

    /**
     * FM amount 0: hard delete with an audit row and a ledger reversal. The audit and reversal run first in the batch,
     * gated on the row still being at the version read; the DELETE then uses the same compare. One transaction, so either
     * all three happen or none.
     */
    async remove(old: Expense, actor: Actor): Promise<WriteResult> {
      const ref = `${old.barber_name} · ${old.day}`;
      const g: Cond = { sql: "EXISTS (SELECT 1 FROM expenses WHERE org_id = ? AND id = ? AND updated_at = ?)", binds: [orgId, old.id, old.updated_at] };
      const barber = { id: old.barber_id, name: old.barber_name };
      const res = await db.batch([
        audit.stmt({ actor, entity: "expense", entityId: old.id, ref, action: "delete", when: g, before: expenseSnap(barber, old.day, old), after: null }),
        ...ledger.reverseStmts("expense", old.id, actor.id, g),
        db.prepare("DELETE FROM expenses WHERE org_id = ? AND id = ? AND updated_at = ?").bind(orgId, old.id, old.updated_at),
      ]);
      if ((res[res.length - 1]!.meta.changes ?? 0) > 0) return "ok";
      return (await byBarberDay(old.barber_id, old.day)) ? "stale" : "gone";
    },

    async companyList(from: string, to: string): Promise<CompanyExpense[]> {
      const r = await db.prepare(`${COMPANY_SELECT} AND e.day BETWEEN ? AND ? ORDER BY e.day DESC, e.id DESC`).bind(orgId, from, to).all<CompanyExpense>();
      return r.results;
    },

    companyById,

    /** FM POST /company-expenses. The batch finds its row by a per-row uid, never by newest-id lookup (RF4). */
    async companyCreate(w: CompanyExpenseWrite, actor: Actor): Promise<CompanyExpense> {
      const at = Date.now();
      const uid = randomToken(9);
      const idExpr = { sql: "(SELECT id FROM company_expenses WHERE org_id = ? AND uid = ?)", binds: [orgId, uid] };
      const [ins] = await db.batch([
        db
          .prepare(
            `INSERT INTO company_expenses (org_id, uid, day, amount, note, paid_from, created_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
          )
          .bind(orgId, uid, w.day, w.amount, w.note, w.paid_from, actor.id, at, at),
        audit.stmt({ actor, entity: "company_expense", entityId: idExpr, ref: w.note, action: "create", before: null, after: companySnap(w) }),
        ...ledger.postStmts("company_expense", idExpr, w.note, actor.id, companyExpenseLines(w)),
      ]);
      const id = (ins!.results[0] as { id: number }).id;
      return (await companyById(id))!;
    },

    /** FM PUT /company-expenses/:id with a compare-and-set on updated_at; audit and repost gated on it. */
    async companyUpdate(old: CompanyExpense, w: CompanyExpenseWrite, actor: Actor): Promise<WriteResult> {
      const at = Math.max(Date.now(), old.updated_at + 1);
      const g: Cond = {
        sql: "EXISTS (SELECT 1 FROM company_expenses WHERE org_id = ? AND id = ? AND updated_at = ? AND day = ? AND amount = ? AND paid_from = ?)",
        binds: [orgId, old.id, at, w.day, w.amount, w.paid_from],
      };
      const oldLines = companyExpenseLines(old);
      const lines = companyExpenseLines(w);
      const stmts = [
        db
          .prepare("UPDATE company_expenses SET day = ?, amount = ?, note = ?, paid_from = ?, updated_at = ? WHERE org_id = ? AND id = ? AND updated_at = ?")
          .bind(w.day, w.amount, w.note, w.paid_from, at, orgId, old.id, old.updated_at),
        audit.stmt({ actor, entity: "company_expense", entityId: old.id, ref: w.note, action: "update", when: g, before: companySnap(old), after: companySnap(w) }),
      ];
      if (needsRepost(oldLines, lines)) {
        stmts.push(...ledger.reverseStmts("company_expense", old.id, actor.id, g), ...ledger.postStmts("company_expense", old.id, w.note, actor.id, lines, g));
      }
      const res = await db.batch(stmts);
      if ((res[0]!.meta.changes ?? 0) > 0) return "ok";
      return (await companyById(old.id)) ? "stale" : "gone";
    },

    /** FM DELETE /company-expenses/:id (hard delete): audit and reversal first, gated on the version read, then the DELETE. */
    async companyRemove(old: CompanyExpense, actor: Actor): Promise<WriteResult> {
      const g: Cond = { sql: "EXISTS (SELECT 1 FROM company_expenses WHERE org_id = ? AND id = ? AND updated_at = ?)", binds: [orgId, old.id, old.updated_at] };
      const res = await db.batch([
        audit.stmt({ actor, entity: "company_expense", entityId: old.id, ref: old.note, action: "delete", when: g, before: companySnap(old), after: null }),
        ...ledger.reverseStmts("company_expense", old.id, actor.id, g),
        db.prepare("DELETE FROM company_expenses WHERE org_id = ? AND id = ? AND updated_at = ?").bind(orgId, old.id, old.updated_at),
      ]);
      if ((res[res.length - 1]!.meta.changes ?? 0) > 0) return "ok";
      return (await companyById(old.id)) ? "stale" : "gone";
    },
  };
}
