import type { Balances, BarberBalance, LedgerLine, ShopLedger } from "@ss/contract";
import type { Account, LedgerSource, Line } from "../../lib/ledger";
import type { IdExpr } from "../../lib/audit";
import { auditRepo } from "./audit";
import { avatarUrl } from "./users";

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

/** A ledger line as the books return it (before the running balance is added). */
type LineRow = Omit<LedgerLine, "balance" | "reversed"> & { reversed: number };

const LEDGER_SELECT = `SELECT l.id, l.at, l.day, l.account, l.barber_id, l.amount, l.kind, l.source, l.source_id, l.ref, l.memo,
  l.reverses_id, l.reversed, u.name AS actor_name
  FROM ledger_entries l LEFT JOIN users u ON u.org_id = l.org_id AND u.id = l.actor_id
  WHERE l.org_id = ?`;

/** Live opening lines: not reversed and not themselves a reversal. */
const LIVE_OPENING = "source = 'opening' AND reversed = 0 AND reverses_id IS NULL";
/** Per-org version of the opening balances (counters row), bumped by every PUT /ledger/balances. */
const OPENING_VERSION = "ledger_openings";

/** Adds FM's running balance (starting at `start`) to each line, oldest first. */
function withBalance(rows: LineRow[], start: number): LedgerLine[] {
  let running = start;
  return rows.map((r) => {
    running += r.amount;
    return { ...r, reversed: !!r.reversed, balance: running };
  });
}

/** Per book/account/barber group: the total of every line and the live opening part of it. */
export interface OpeningSnapshot {
  version: number;
  groups: { book: "shop" | "barber"; account: Account | null; barber_id: number | null; total: number; live: number }[];
  liveCount: number;
  liveSum: number;
}

/** A new set of opening lines: the shop's (source_id 0) and each listed barber's (source_id = barber id). */
export interface OpeningWrite {
  shop: Line[];
  barbers: { id: number; lines: Line[] }[];
  before: unknown;
  after: unknown;
}

/**
 * Ledger reads (balances, shop book, barber book) and the opening-balance write. All scoped by org_id.
 */
export function ledgerBooks(db: D1Database, orgId: string) {
  const audit = auditRepo(db, orgId);
  const ledger = ledgerRepo(db, orgId);

  return {
    /** FM balances(): shop accounts and what each barber is owed, right now. */
    async balances(): Promise<Balances> {
      const r = await db
        .prepare("SELECT book, account, barber_id, SUM(amount) AS amount FROM ledger_entries WHERE org_id = ? GROUP BY book, account, barber_id")
        .bind(orgId)
        .all<{ book: string; account: Account | null; barber_id: number | null; amount: number }>();
      const out: Balances = { cash: 0, bank: 0, barbers: {} };
      for (const x of r.results) {
        if (x.book === "shop" && x.account) out[x.account] += x.amount;
        else if (x.book === "barber" && x.barber_id) out.barbers[x.barber_id] = x.amount;
      }
      return out;
    },

    /** Ids among `ids` that are users of this org (openings may name inactive users who still have a balance). */
    async orgUserIds(ids: number[]): Promise<Set<number>> {
      if (!ids.length) return new Set();
      const r = await db
        .prepare(`SELECT id FROM users WHERE org_id = ? AND id IN (${ids.map(() => "?").join(",")})`)
        .bind(orgId, ...ids)
        .all<{ id: number }>();
      return new Set(r.results.map((x) => x.id));
    },

    /**
     * What PUT /ledger/balances computes from. The version is read first; the totals and the live opening lines come
     * from ONE statement, so `total - live` (the non-opening base) is a consistent snapshot.
     */
    async openingSnapshot(): Promise<OpeningSnapshot> {
      const v = await db.prepare("SELECT value FROM counters WHERE org_id = ? AND name = ?").bind(orgId, OPENING_VERSION).first<{ value: number }>();
      const r = await db
        .prepare(
          `SELECT book, account, barber_id, SUM(amount) AS total,
                  SUM(CASE WHEN ${LIVE_OPENING} THEN amount ELSE 0 END) AS live,
                  SUM(CASE WHEN ${LIVE_OPENING} THEN 1 ELSE 0 END) AS live_n
           FROM ledger_entries WHERE org_id = ? GROUP BY book, account, barber_id`,
        )
        .bind(orgId)
        .all<OpeningSnapshot["groups"][number] & { live_n: number }>();
      return {
        version: v?.value ?? 0,
        groups: r.results.map(({ live_n: _n, ...g }) => g),
        liveCount: r.results.reduce((a, g) => a + g.live_n, 0),
        liveSum: r.results.reduce((a, g) => a + g.live, 0),
      };
    },

    /**
     * Replaces the live opening lines (reverse + post), fail-closed against concurrent opening edits: the batch first
     * compare-and-sets the org's opening version (counters row) from the version read to a fresh random one, and only
     * if the live opening lines still have the count and sum read. Every reversal, posting and the audit row are gated
     * on the counter holding OUR new version, so a batch that lost the race writes nothing. False = stale.
     */
    async setOpenings(snap: OpeningSnapshot, w: OpeningWrite, actor: { id: number; name: string }): Promise<boolean> {
      let next = 0;
      while (next === 0 || next === snap.version) next = crypto.getRandomValues(new Uint32Array(1))[0]! * 2048 + (Date.now() % 2048);
      const g: Cond = { sql: "EXISTS (SELECT 1 FROM counters WHERE org_id = ? AND name = ? AND value = ?)", binds: [orgId, OPENING_VERSION, next] };
      const stmts: D1PreparedStatement[] = [
        db.prepare("INSERT INTO counters(org_id, name, value) VALUES(?, ?, 0) ON CONFLICT(org_id, name) DO NOTHING").bind(orgId, OPENING_VERSION),
        db
          .prepare(
            `UPDATE counters SET value = ? WHERE org_id = ? AND name = ? AND value = ?
               AND (SELECT COUNT(*) FROM ledger_entries WHERE org_id = ? AND ${LIVE_OPENING}) = ?
               AND (SELECT COALESCE(SUM(amount), 0) FROM ledger_entries WHERE org_id = ? AND ${LIVE_OPENING}) = ?`,
          )
          .bind(next, orgId, OPENING_VERSION, snap.version, orgId, snap.liveCount, orgId, snap.liveSum),
        ...ledger.reverseStmts("opening", 0, actor.id, g),
        ...ledger.postStmts("opening", 0, "Shop", actor.id, w.shop, g),
      ];
      for (const b of w.barbers) stmts.push(...ledger.reverseStmts("opening", b.id, actor.id, g), ...ledger.postStmts("opening", b.id, null, actor.id, b.lines, g));
      stmts.push(audit.stmt({ actor, entity: "opening", entityId: 0, ref: "Balances", action: "update", when: g, before: w.before, after: w.after }));
      const res = await db.batch(stmts);
      return (res[1]!.meta.changes ?? 0) > 0;
    },

    /** FM GET /ledger/shop: opening before `from`, closing at the end of `to`, and the lines with a running balance. */
    async shopBook(from: string, to: string, account: "all" | Account): Promise<ShopLedger> {
      const sums = (op: "<" | "<=", day: string) =>
        db.prepare(`SELECT account, SUM(amount) AS amount FROM ledger_entries WHERE org_id = ? AND book = 'shop' AND day ${op} ? GROUP BY account`).bind(orgId, day);
      const acct = account === "all" ? "" : " AND l.account = ?";
      const [o, c, rows] = await db.batch([
        sums("<", from),
        sums("<=", to),
        db
          .prepare(`${LEDGER_SELECT} AND l.book = 'shop' AND l.day BETWEEN ? AND ?${acct} ORDER BY l.day, l.at, l.id`)
          .bind(orgId, from, to, ...(account === "all" ? [] : [account])),
      ]);
      const pick = (r: D1Result) => {
        const out = { cash: 0, bank: 0 };
        for (const x of r.results as { account: Account; amount: number }[]) out[x.account] = x.amount;
        return out;
      };
      const opening = pick(o!);
      const closing = pick(c!);
      const start = account === "all" ? opening.cash + opening.bank : opening[account];
      return { from, to, account, opening, closing, lines: withBalance(rows!.results as LineRow[], start) };
    },

    /** FM barberBalances(): every barber who is active or has barber-book lines (or just `only`), with earned, paid and owed. */
    async barberBalances(slug: string, only?: number): Promise<BarberBalance[]> {
      const r = await db
        .prepare(
          `SELECT u.id, u.name, u.role, u.avatar_v, u.active,
                  COALESCE(SUM(CASE WHEN l.source = 'sale' THEN l.amount END), 0) AS earned,
                  -COALESCE(SUM(CASE WHEN l.source = 'payout' THEN l.amount END), 0) AS paid,
                  COALESCE(SUM(l.amount), 0) AS balance, COUNT(l.id) AS n
           FROM users u LEFT JOIN ledger_entries l ON l.org_id = u.org_id AND l.book = 'barber' AND l.barber_id = u.id
           WHERE u.org_id = ?${only !== undefined ? " AND u.id = ?" : ""}
           GROUP BY u.id ORDER BY u.sort_order, u.name`,
        )
        .bind(orgId, ...(only !== undefined ? [only] : []))
        .all<{ id: number; name: string; role: string; avatar_v: number | null; active: number; earned: number; paid: number; balance: number; n: number }>();
      return r.results
        .filter((x) => only !== undefined || x.n > 0 || (x.active && x.role === "barber"))
        .map((x) => ({ id: x.id, name: x.name, avatar_url: avatarUrl(x.id, x.avatar_v, slug, x.active), active: !!x.active, earned: x.earned, paid: x.paid, balance: x.balance }));
    },

    /** FM GET /ledger/barbers/:id lines: what the barber was owed before `from`, then each line with the running balance. */
    async barberBook(barberId: number, from: string, to: string): Promise<{ opening: number; lines: LedgerLine[] }> {
      const [o, rows] = await db.batch([
        db.prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM ledger_entries WHERE org_id = ? AND book = 'barber' AND barber_id = ? AND day < ?").bind(orgId, barberId, from),
        db.prepare(`${LEDGER_SELECT} AND l.book = 'barber' AND l.barber_id = ? AND l.day BETWEEN ? AND ? ORDER BY l.day, l.at, l.id`).bind(orgId, barberId, from, to),
      ]);
      const opening = (o!.results[0] as { n: number }).n;
      return { opening, lines: withBalance(rows!.results as LineRow[], opening) };
    },
  };
}
