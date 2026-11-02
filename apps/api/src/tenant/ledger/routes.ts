import { Hono, type Context } from "hono";
import type { BalanceInput, BarberLedger, MoneyAccount, PayoutInput, TransferInput } from "@ss/contract";
import type { AppEnv } from "../../env";
import { HttpError } from "../../core/errors";
import { requireAdmin } from "../../core/roles";
import { requireFeature } from "../../core/pipeline";
import { clockOf, ledgerBooks, payoutsRepo, settingsRepo, type WriteResult } from "../../data/tenant";
import { businessDay } from "../../lib/clock";
import { openingLines } from "../../lib/ledger";
import { DAY_RE, MONTH_RE, signedMinor, toMinor } from "../../lib/money";

/**
 * Ledger (FM routes.ts 1065-1378): money moves, balances and openings, the shop book, payouts and the barber book.
 * Admin only, feature `ledger`. The gate is on each route (not a router-level use("*")), so unknown paths under these
 * prefixes still fall through to the JSON 404 instead of being claimed by this router.
 */
export const ledger = new Hono<AppEnv>();
const gate = [requireFeature("ledger"), requireAdmin] as const;

const bad = (m: string) => new HttpError(400, m);
const notFound = () => new HttpError(404, "Not found");
const NO_BARBER = "Choose an active barber";

function clean(v: unknown, max: number): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().slice(0, max);
  return s || null;
}

function id(v: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw bad("Invalid id");
  return n;
}

function account(v: unknown, field: string): MoneyAccount {
  if (v !== "cash" && v !== "bank") throw bad(`${field}: choose Cash or Bank`);
  return v;
}

async function readBody<T>(c: Context<AppEnv>): Promise<Partial<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw bad("Send the details as JSON");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw bad("Send the details as JSON");
  return raw as Partial<T>;
}

/** The org's settings and its business day today. */
async function today(c: Context<AppEnv>) {
  const settings = await settingsRepo(c.env.DB, c.var.tenant.org.id).get();
  return { settings, today: businessDay(Date.now(), clockOf(settings)) };
}

/** `?month=YYYY-MM` (default this month) as a day range. */
function monthRange(month: string | undefined, today: string): { from: string; to: string } {
  const m = month && MONTH_RE.test(month) ? month : today.slice(0, 7);
  return { from: `${m}-01`, to: `${m}-31` };
}

/** FM's book window: `to` defaults to today, `from` to the first of `to`'s month (and must not be after `to`). */
function bookWindow(q: Record<string, string>, today: string): { from: string; to: string } {
  const to = q.to && DAY_RE.test(q.to) ? q.to : today;
  const from = q.from && DAY_RE.test(q.from) && q.from <= to ? q.from : `${to.slice(0, 7)}-01`;
  return { from, to };
}

function pastDay(v: unknown, today: string): string {
  const day = v ?? today;
  if (typeof day !== "string" || !DAY_RE.test(day) || day > today) throw bad("Pick a valid day (not in the future)");
  return day;
}

const actorOf = (c: Context<AppEnv>) => ({ id: c.var.tenant.user.id, name: c.var.tenant.user.name });

/** 404 when gone, 409 when a concurrent write won. */
function lost(r: WriteResult, stale: string): void {
  if (r === "gone") throw notFound();
  if (r === "stale") throw new HttpError(409, stale, "stale");
}

// ---------- money moves (cash drawer <-> bank) ----------

const TRANSFER_STALE = "This money move was changed by someone else. Reload and try again.";

function readTransfer(b: Partial<TransferInput>, today: string, minor: number) {
  const day = pastDay(b.day, today);
  const amount = toMinor(b.amount, minor);
  if (!amount) throw bad("Enter the amount (e.g. 2000)");
  const from_account = account(b.from_account, "From");
  const to_account = account(b.to_account, "To");
  if (from_account === to_account) throw bad("Pick two different accounts");
  return { day, amount, from_account, to_account, note: clean(b.note, 200) };
}

ledger.get("/transfers", ...gate, async (c) => {
  const { today: t } = await today(c);
  const { from, to } = monthRange(c.req.query("month"), t);
  return c.json(await payoutsRepo(c.env.DB, c.var.tenant.org.id).transferList(from, to));
});

ledger.post("/transfers", ...gate, async (c) => {
  const b = await readBody<TransferInput>(c);
  const { settings, today: t } = await today(c);
  const w = readTransfer(b, t, settings.currency_minor);
  return c.json(await payoutsRepo(c.env.DB, c.var.tenant.org.id).transferCreate(w, actorOf(c)), 201);
});

ledger.put("/transfers/:id", ...gate, async (c) => {
  const repo = payoutsRepo(c.env.DB, c.var.tenant.org.id);
  const transferId = id(c.req.param("id"));
  const old = await repo.transferById(transferId);
  if (!old) throw notFound();
  const b = await readBody<TransferInput>(c);
  const { settings, today: t } = await today(c);
  const w = readTransfer(b, t, settings.currency_minor);
  lost(await repo.transferUpdate(old, w, actorOf(c)), TRANSFER_STALE);
  const row = await repo.transferById(transferId);
  if (!row) throw notFound(); // deleted right after our write
  return c.json(row);
});

ledger.delete("/transfers/:id", ...gate, async (c) => {
  const repo = payoutsRepo(c.env.DB, c.var.tenant.org.id);
  const old = await repo.transferById(id(c.req.param("id")));
  if (!old) throw notFound();
  lost(await repo.transferRemove(old, actorOf(c)), TRANSFER_STALE);
  return c.json({ ok: true });
});

// ---------- balances and openings ----------

ledger.get("/ledger/balances", ...gate, async (c) => c.json(await ledgerBooks(c.env.DB, c.var.tenant.org.id).balances()));

/**
 * FM: sets balances to what the admin counted. The shop's "Balance set" lines live under opening/0 and each listed
 * barber's under opening/<barber id>; setting again reverses the live ones and posts target − (balance − live opening).
 * Concurrency: ledgerBooks.setOpenings compare-and-sets the org's opening version and the live opening lines read;
 * a concurrent opening edit makes this one 409 "stale" with nothing written.
 */
ledger.put("/ledger/balances", ...gate, async (c) => {
  const books = ledgerBooks(c.env.DB, c.var.tenant.org.id);
  const b = await readBody<BalanceInput>(c);
  const { settings, today: day } = await today(c);
  const money = (v: unknown, what: string) => {
    const n = signedMinor(v, settings.currency_minor);
    if (n === null) throw bad(`Enter the ${what} amount in ${settings.currency} (0 is fine)`);
    return n;
  };
  const target = { cash: money(b.cash, "cash drawer"), bank: money(b.bank, "bank") };
  const rawBarbers = b.barbers && typeof b.barbers === "object" && !Array.isArray(b.barbers) ? b.barbers : {};
  // Keyed by numeric id, so "1" and "01" cannot post two openings for one barber.
  const barbers = [...new Map(Object.entries(rawBarbers).map(([bid, v]) => [id(bid), money(v, "barber")] as const))];
  const known = await books.orgUserIds(barbers.map(([bid]) => bid));
  if (barbers.some(([bid]) => !known.has(bid))) throw bad("Choose a barber from your team");

  const snap = await books.openingSnapshot();
  const shop = (a: MoneyAccount) => snap.groups.find((g) => g.book === "shop" && g.account === a) ?? { total: 0, live: 0 };
  const barber = (bid: number) => snap.groups.find((g) => g.book === "barber" && g.barber_id === bid) ?? { total: 0, live: 0 };
  const cash = shop("cash");
  const bank = shop("bank");
  const ok = await books.setOpenings(
    snap,
    {
      shop: openingLines({ day, cash: target.cash - (cash.total - cash.live), bank: target.bank - (bank.total - bank.live), barbers: {} }),
      barbers: barbers.map(([bid, amount]) => {
        const g = barber(bid);
        return { id: bid, lines: openingLines({ day, cash: 0, bank: 0, barbers: { [bid]: amount - (g.total - g.live) } }) };
      }),
      before: { cash: cash.total, bank: bank.total, barbers: Object.fromEntries(barbers.map(([bid]) => [bid, barber(bid).total])) },
      after: { cash: target.cash, bank: target.bank, barbers: Object.fromEntries(barbers) },
    },
    actorOf(c),
  );
  if (!ok) throw new HttpError(409, "The balances were changed by someone else. Reload and try again.", "stale");
  return c.json(await books.balances());
});

// ---------- shop book ----------

ledger.get("/ledger/shop", ...gate, async (c) => {
  const q = c.req.query();
  const { today: t } = await today(c);
  const { from, to } = bookWindow(q, t);
  const acct = q.account === "cash" || q.account === "bank" ? q.account : "all";
  return c.json(await ledgerBooks(c.env.DB, c.var.tenant.org.id).shopBook(from, to, acct));
});

// ---------- payouts and the barber book ----------

const PAYOUT_STALE = "This payout was changed by someone else. Reload and try again.";

/** FM readPayout; the barber must be an active user of this org (RF1). An edit may keep the payout's own barber even if inactive since. */
async function readPayout(c: Context<AppEnv>, b: Partial<PayoutInput>, keepBarberId?: number) {
  const { settings, today: t } = await today(c);
  const day = pastDay(b.day, t);
  const amount = toMinor(b.amount, settings.currency_minor);
  if (!amount) throw bad("Enter the amount paid (e.g. 500)");
  const n = Number(b.barber_id);
  if (b.barber_id === undefined || b.barber_id === null || !Number.isInteger(n) || n <= 0) throw bad(NO_BARBER);
  const barber = await payoutsRepo(c.env.DB, c.var.tenant.org.id).barberFor(n, n === keepBarberId);
  if (!barber) throw bad(NO_BARBER);
  return { barber_id: barber.id, barber_name: barber.name, day, amount, paid_from: account(b.paid_from, "Paid from"), note: clean(b.note, 200) };
}

ledger.get("/payouts", ...gate, async (c) => {
  const q = c.req.query();
  const { today: t } = await today(c);
  const { from, to } = monthRange(q.month, t);
  return c.json(await payoutsRepo(c.env.DB, c.var.tenant.org.id).payoutList(from, to, q.barber_id ? id(q.barber_id) : undefined));
});

ledger.post("/payouts", ...gate, async (c) => {
  const p = await readPayout(c, await readBody<PayoutInput>(c));
  return c.json(await payoutsRepo(c.env.DB, c.var.tenant.org.id).payoutCreate(p, actorOf(c)), 201);
});

ledger.put("/payouts/:id", ...gate, async (c) => {
  const repo = payoutsRepo(c.env.DB, c.var.tenant.org.id);
  const payoutId = id(c.req.param("id"));
  const old = await repo.payoutById(payoutId);
  if (!old) throw notFound();
  const p = await readPayout(c, await readBody<PayoutInput>(c), old.barber_id);
  lost(await repo.payoutUpdate(old, p, actorOf(c)), PAYOUT_STALE);
  const row = await repo.payoutById(payoutId);
  if (!row) throw notFound(); // deleted right after our write
  return c.json(row);
});

ledger.delete("/payouts/:id", ...gate, async (c) => {
  const repo = payoutsRepo(c.env.DB, c.var.tenant.org.id);
  const old = await repo.payoutById(id(c.req.param("id")));
  if (!old) throw notFound();
  lost(await repo.payoutRemove(old, actorOf(c)), PAYOUT_STALE);
  return c.json({ ok: true });
});

ledger.get("/ledger/barbers", ...gate, async (c) => c.json(await ledgerBooks(c.env.DB, c.var.tenant.org.id).barberBalances(c.var.tenant.org.slug)));

ledger.get("/ledger/barbers/:id", ...gate, async (c) => {
  const books = ledgerBooks(c.env.DB, c.var.tenant.org.id);
  const barberId = id(c.req.param("id"));
  const [barber] = await books.barberBalances(c.var.tenant.org.slug, barberId);
  if (!barber) throw notFound();
  const { today: t } = await today(c);
  const { from, to } = bookWindow(c.req.query(), t);
  const { opening, lines } = await books.barberBook(barberId, from, to);
  const body: BarberLedger = { barber, from, to, opening, lines };
  return c.json(body);
});
