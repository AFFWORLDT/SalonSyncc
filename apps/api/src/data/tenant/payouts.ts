import type { MoneyAccount, Payout, Transfer } from "@ss/contract";
import { auditRepo, type AuditInput } from "./audit";
import { ledgerRepo, type Cond } from "./ledger";
import type { WriteResult } from "./expenses";
import { needsRepost, payoutLines, transferLines } from "../../lib/ledger";
import { randomToken } from "../../core/crypto";

type Actor = AuditInput["actor"];

/** Payouts with the barber's name; the join stays in the org. */
const PAYOUT_SELECT = `SELECT p.id, p.barber_id, u.name AS barber_name, p.day, p.amount, p.paid_from, p.note, p.updated_at
  FROM barber_payouts p JOIN users u ON u.org_id = p.org_id AND u.id = p.barber_id
  WHERE p.org_id = ?`;

/** Money moves with the creator's name; the join stays in the org. */
const TRANSFER_SELECT = `SELECT t.id, t.day, t.amount, t.from_account, t.to_account, t.note, u.name AS created_by_name, t.updated_at
  FROM money_transfers t LEFT JOIN users u ON u.org_id = t.org_id AND u.id = t.created_by
  WHERE t.org_id = ?`;

/** A payout's values (FM readPayout). */
export interface PayoutWrite {
  barber_id: number;
  barber_name: string;
  day: string;
  amount: number;
  paid_from: MoneyAccount;
  note: string | null;
}

/** A money move's values (FM readTransfer). */
export interface TransferWrite {
  day: string;
  amount: number;
  from_account: MoneyAccount;
  to_account: MoneyAccount;
  note: string | null;
}

const accountName = (a: MoneyAccount) => (a === "cash" ? "Cash" : "Bank");
/** FM's transfer ref, e.g. "Cash → Bank". */
export const transferRef = (t: { from_account: MoneyAccount; to_account: MoneyAccount }) => `${accountName(t.from_account)} → ${accountName(t.to_account)}`;

const payoutSnap = (p: PayoutWrite | Payout) => ({
  barber_id: p.barber_id,
  barber_name: p.barber_name,
  day: p.day,
  amount: p.amount,
  paid_from: p.paid_from,
  note: p.note,
});
const transferSnap = (t: TransferWrite | Transfer) => ({ day: t.day, amount: t.amount, from_account: t.from_account, to_account: t.to_account, note: t.note });

/**
 * Barber payouts and money moves. Every query here is scoped by org_id; test/sql-guard.test.ts enforces it.
 * Creates find their row by a per-row uid (never by newest-id lookup, RF4). Edits and deletes are compare-and-set on updated_at, and
 * the audit and ledger statements in the same batch are gated on the guarded write having taken effect (lesson 0012).
 */
export function payoutsRepo(db: D1Database, orgId: string) {
  const audit = auditRepo(db, orgId);
  const ledger = ledgerRepo(db, orgId);

  const payoutById = (id: number) => db.prepare(`${PAYOUT_SELECT} AND p.id = ?`).bind(orgId, id).first<Payout>();
  const transferById = (id: number) => db.prepare(`${TRANSFER_SELECT} AND t.id = ?`).bind(orgId, id).first<Transfer>();

  return {
    /** A user of this org a payout can go to: active, or (`allowInactive`) any user of the org. Null for another org's id. */
    barberFor(id: number, allowInactive = false): Promise<{ id: number; name: string } | null> {
      return db
        .prepare(`SELECT id, name FROM users WHERE org_id = ? AND id = ? AND role IN ('owner','admin','barber')${allowInactive ? "" : " AND active = 1"}`)
        .bind(orgId, id)
        .first<{ id: number; name: string }>();
    },

    payoutById,

    /** FM GET /payouts: newest day first. */
    async payoutList(from: string, to: string, barberId?: number): Promise<Payout[]> {
      const barber = barberId !== undefined ? " AND p.barber_id = ?" : "";
      const r = await db
        .prepare(`${PAYOUT_SELECT} AND p.day BETWEEN ? AND ?${barber} ORDER BY p.day DESC, p.id DESC`)
        .bind(orgId, from, to, ...(barberId !== undefined ? [barberId] : []))
        .all<Payout>();
      return r.results;
    },

    /** FM POST /payouts: the row, its audit row and its two ledger lines (shop −, barber −) in one batch. */
    async payoutCreate(w: PayoutWrite, actor: Actor): Promise<Payout> {
      const at = Date.now();
      const uid = randomToken(9);
      const idExpr = { sql: "(SELECT id FROM barber_payouts WHERE org_id = ? AND uid = ?)", binds: [orgId, uid] };
      const [ins] = await db.batch([
        db
          .prepare(
            `INSERT INTO barber_payouts (org_id, uid, barber_id, day, amount, paid_from, note, created_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
          )
          .bind(orgId, uid, w.barber_id, w.day, w.amount, w.paid_from, w.note, actor.id, at, at),
        audit.stmt({ actor, entity: "payout", entityId: idExpr, ref: w.barber_name, action: "create", before: null, after: payoutSnap(w) }),
        ...ledger.postStmts("payout", idExpr, w.barber_name, actor.id, payoutLines(w)),
      ]);
      const id = (ins!.results[0] as { id: number }).id;
      return (await payoutById(id))!;
    },

    /** FM PUT /payouts/:id with a compare-and-set on updated_at; audit and repost gated on it. */
    async payoutUpdate(old: Payout, w: PayoutWrite, actor: Actor): Promise<WriteResult> {
      const at = Math.max(Date.now(), old.updated_at + 1);
      const g: Cond = {
        sql: "EXISTS (SELECT 1 FROM barber_payouts WHERE org_id = ? AND id = ? AND updated_at = ? AND barber_id = ? AND day = ? AND amount = ? AND paid_from = ?)",
        binds: [orgId, old.id, at, w.barber_id, w.day, w.amount, w.paid_from],
      };
      const oldLines = payoutLines(old);
      const lines = payoutLines(w);
      const stmts = [
        db
          .prepare("UPDATE barber_payouts SET barber_id = ?, day = ?, amount = ?, paid_from = ?, note = ?, updated_at = ? WHERE org_id = ? AND id = ? AND updated_at = ?")
          .bind(w.barber_id, w.day, w.amount, w.paid_from, w.note, at, orgId, old.id, old.updated_at),
        audit.stmt({ actor, entity: "payout", entityId: old.id, ref: w.barber_name, action: "update", when: g, before: payoutSnap(old), after: payoutSnap(w) }),
      ];
      if (needsRepost(oldLines, lines)) {
        stmts.push(...ledger.reverseStmts("payout", old.id, actor.id, g), ...ledger.postStmts("payout", old.id, w.barber_name, actor.id, lines, g));
      }
      const res = await db.batch(stmts);
      if ((res[0]!.meta.changes ?? 0) > 0) return "ok";
      return (await payoutById(old.id)) ? "stale" : "gone";
    },

    /** FM DELETE /payouts/:id (hard delete): audit and reversal first, gated on the version read, then the DELETE. */
    async payoutRemove(old: Payout, actor: Actor): Promise<WriteResult> {
      const g: Cond = { sql: "EXISTS (SELECT 1 FROM barber_payouts WHERE org_id = ? AND id = ? AND updated_at = ?)", binds: [orgId, old.id, old.updated_at] };
      const res = await db.batch([
        audit.stmt({ actor, entity: "payout", entityId: old.id, ref: old.barber_name, action: "delete", when: g, before: payoutSnap(old), after: null }),
        ...ledger.reverseStmts("payout", old.id, actor.id, g),
        db.prepare("DELETE FROM barber_payouts WHERE org_id = ? AND id = ? AND updated_at = ?").bind(orgId, old.id, old.updated_at),
      ]);
      if ((res[res.length - 1]!.meta.changes ?? 0) > 0) return "ok";
      return (await payoutById(old.id)) ? "stale" : "gone";
    },

    transferById,

    /** FM GET /transfers: newest day first. */
    async transferList(from: string, to: string): Promise<Transfer[]> {
      const r = await db.prepare(`${TRANSFER_SELECT} AND t.day BETWEEN ? AND ? ORDER BY t.day DESC, t.id DESC`).bind(orgId, from, to).all<Transfer>();
      return r.results;
    },

    /** FM POST /transfers: the row, its audit row and its two ledger lines (from −, to +) in one batch. */
    async transferCreate(w: TransferWrite, actor: Actor): Promise<Transfer> {
      const at = Date.now();
      const uid = randomToken(9);
      const ref = transferRef(w);
      const idExpr = { sql: "(SELECT id FROM money_transfers WHERE org_id = ? AND uid = ?)", binds: [orgId, uid] };
      const [ins] = await db.batch([
        db
          .prepare(
            `INSERT INTO money_transfers (org_id, uid, day, amount, from_account, to_account, note, created_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
          )
          .bind(orgId, uid, w.day, w.amount, w.from_account, w.to_account, w.note, actor.id, at, at),
        audit.stmt({ actor, entity: "transfer", entityId: idExpr, ref, action: "create", before: null, after: transferSnap(w) }),
        ...ledger.postStmts("transfer", idExpr, ref, actor.id, transferLines(w)),
      ]);
      const id = (ins!.results[0] as { id: number }).id;
      return (await transferById(id))!;
    },

    /** FM PUT /transfers/:id with a compare-and-set on updated_at; audit and repost gated on it. */
    async transferUpdate(old: Transfer, w: TransferWrite, actor: Actor): Promise<WriteResult> {
      const at = Math.max(Date.now(), old.updated_at + 1);
      const ref = transferRef(w);
      const g: Cond = {
        sql: "EXISTS (SELECT 1 FROM money_transfers WHERE org_id = ? AND id = ? AND updated_at = ? AND day = ? AND amount = ? AND from_account = ? AND to_account = ?)",
        binds: [orgId, old.id, at, w.day, w.amount, w.from_account, w.to_account],
      };
      const oldLines = transferLines(old);
      const lines = transferLines(w);
      const stmts = [
        db
          .prepare("UPDATE money_transfers SET day = ?, amount = ?, from_account = ?, to_account = ?, note = ?, updated_at = ? WHERE org_id = ? AND id = ? AND updated_at = ?")
          .bind(w.day, w.amount, w.from_account, w.to_account, w.note, at, orgId, old.id, old.updated_at),
        audit.stmt({ actor, entity: "transfer", entityId: old.id, ref, action: "update", when: g, before: transferSnap(old), after: transferSnap(w) }),
      ];
      if (needsRepost(oldLines, lines)) {
        stmts.push(...ledger.reverseStmts("transfer", old.id, actor.id, g), ...ledger.postStmts("transfer", old.id, ref, actor.id, lines, g));
      }
      const res = await db.batch(stmts);
      if ((res[0]!.meta.changes ?? 0) > 0) return "ok";
      return (await transferById(old.id)) ? "stale" : "gone";
    },

    /** FM DELETE /transfers/:id (hard delete): audit and reversal first, gated on the version read, then the DELETE. */
    async transferRemove(old: Transfer, actor: Actor): Promise<WriteResult> {
      const g: Cond = { sql: "EXISTS (SELECT 1 FROM money_transfers WHERE org_id = ? AND id = ? AND updated_at = ?)", binds: [orgId, old.id, old.updated_at] };
      const res = await db.batch([
        audit.stmt({ actor, entity: "transfer", entityId: old.id, ref: transferRef(old), action: "delete", when: g, before: transferSnap(old), after: null }),
        ...ledger.reverseStmts("transfer", old.id, actor.id, g),
        db.prepare("DELETE FROM money_transfers WHERE org_id = ? AND id = ? AND updated_at = ?").bind(orgId, old.id, old.updated_at),
      ]);
      if ((res[res.length - 1]!.meta.changes ?? 0) > 0) return "ok";
      return (await transferById(old.id)) ? "stale" : "gone";
    },
  };
}
