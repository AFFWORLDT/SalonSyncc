import { Hono, type Context } from "hono";
import type { CompanyExpenseInput, ExpenseInput, MoneyAccount } from "@ss/contract";
import type { AppEnv } from "../../env";
import { HttpError } from "../../core/errors";
import { isAdmin, requireAdmin } from "../../core/roles";
import { requireFeature } from "../../core/pipeline";
import { clockOf, expensesRepo, settingsRepo, type WriteResult } from "../../data/tenant";
import { businessDay } from "../../lib/clock";
import { DAY_RE, MONTH_RE, toMinor } from "../../lib/money";

const bad = (m: string) => new HttpError(400, m);
const STALE = "This expense was changed by someone else. Reload and try again.";
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

/** `?month=YYYY-MM` (default this month) as a day range; `?day=` narrows to one day. */
function range(q: Record<string, string>, today: string): { from: string; to: string } {
  if (q.day && DAY_RE.test(q.day)) return { from: q.day, to: q.day };
  const m = q.month && MONTH_RE.test(q.month) ? q.month : today.slice(0, 7);
  return { from: `${m}-01`, to: `${m}-31` };
}

// ---------- barber expenses (one per barber per day) ----------

export const expenses = new Hono<AppEnv>();
// Mounted at "/expenses": the feature gate covers only this prefix.
expenses.use("*", requireFeature("expenses"));

expenses.get("/", async (c) => {
  const me = c.var.tenant.user;
  const q = c.req.query();
  const { today: t } = await today(c);
  // Barbers see only their own; their barber_id filter is ignored (FM).
  const barberId = !isAdmin(me) ? me.id : q.barber_id ? id(q.barber_id) : undefined;
  return c.json(await expensesRepo(c.env.DB, c.var.tenant.org.id).list({ ...range(q, t), barberId }));
});

expenses.put("/", async (c) => {
  const me = c.var.tenant.user;
  const repo = expensesRepo(c.env.DB, c.var.tenant.org.id);
  const b = await readBody<ExpenseInput>(c);
  const { settings, today: t } = await today(c);
  // FM: a barber logs only their own expense, only for today, and only when the admin allowed it (RF5).
  let day = t;
  let barberId = me.id;
  if (isAdmin(me)) {
    if (b.day) {
      if (typeof b.day !== "string" || !DAY_RE.test(b.day) || b.day > t) throw bad("Pick a valid day (not in the future)");
      day = b.day;
    }
    if (b.barber_id !== undefined && b.barber_id !== null && (b.barber_id as unknown) !== "") {
      const n = Number(b.barber_id);
      if (!Number.isInteger(n) || n <= 0) throw bad(NO_BARBER);
      barberId = n;
    }
  } else if (!(await repo.canAddExpense(me.id))) {
    throw new HttpError(403, "Expenses are added by the admin. Ask them to add yours.");
  }
  const barber = await repo.barberFor(barberId);
  if (!barber) throw bad(NO_BARBER);
  const old = await repo.byBarberDay(barber.id, day);
  const actor = { id: me.id, name: me.name };

  const zero = b.amount === 0 || b.amount === "0" || b.amount === "";
  if (zero) {
    if (old && (await repo.remove(old, actor)) === "stale") throw new HttpError(409, STALE, "stale");
    // Already gone (nothing to delete, or a concurrent delete won): the outcome the caller asked for.
    return c.json({ ok: true, deleted: true });
  }
  const amount = toMinor(b.amount, settings.currency_minor);
  if (!amount) throw bad("Enter the expense amount (e.g. 50)");
  const result: WriteResult = await repo.upsert(old, { barber, day, amount, note: clean(b.note, 300) }, actor);
  // A concurrent write (or delete) won between our read and our batch: nothing was written.
  if (result !== "ok") throw new HttpError(409, STALE, "stale");
  return c.json(await repo.byBarberDay(barber.id, day));
});

// ---------- company expenses (admin only) ----------

export const companyExpenses = new Hono<AppEnv>();
// Mounted at "/company-expenses".
companyExpenses.use("*", requireFeature("expenses"), requireAdmin);

function readCompanyExpense(b: Partial<CompanyExpenseInput>, today: string, minor: number) {
  const day = b.day ?? today;
  if (typeof day !== "string" || !DAY_RE.test(day) || day > today) throw bad("Pick a valid day (not in the future)");
  const amount = toMinor(b.amount, minor);
  if (!amount) throw bad("Enter the expense amount (e.g. 500)");
  const note = clean(b.note, 300);
  if (!note) throw bad("Say what the expense is for (e.g. rent)");
  const paid_from = (b.paid_from ?? "cash") as MoneyAccount;
  if (paid_from !== "cash" && paid_from !== "bank") throw bad("Paid from: choose Cash or Bank");
  return { day, amount, note, paid_from };
}

/** 404 when gone, 409 when a concurrent write won. */
function lost(r: WriteResult): void {
  if (r === "gone") throw new HttpError(404, "Not found");
  if (r === "stale") throw new HttpError(409, STALE, "stale");
}

companyExpenses.get("/", async (c) => {
  const { today: t } = await today(c);
  // FM: company expenses filter by month only.
  const { from, to } = range({ month: c.req.query("month") ?? "" }, t);
  return c.json(await expensesRepo(c.env.DB, c.var.tenant.org.id).companyList(from, to));
});

companyExpenses.post("/", async (c) => {
  const me = c.var.tenant.user;
  const b = await readBody<CompanyExpenseInput>(c);
  const { settings, today: t } = await today(c);
  const e = readCompanyExpense(b, t, settings.currency_minor);
  return c.json(await expensesRepo(c.env.DB, c.var.tenant.org.id).companyCreate(e, { id: me.id, name: me.name }));
});

companyExpenses.put("/:id", async (c) => {
  const me = c.var.tenant.user;
  const repo = expensesRepo(c.env.DB, c.var.tenant.org.id);
  const expenseId = id(c.req.param("id"));
  const old = await repo.companyById(expenseId);
  if (!old) throw new HttpError(404, "Not found");
  const b = await readBody<CompanyExpenseInput>(c);
  const { settings, today: t } = await today(c);
  const e = readCompanyExpense(b, t, settings.currency_minor);
  lost(await repo.companyUpdate(old, e, { id: me.id, name: me.name }));
  const row = await repo.companyById(expenseId);
  if (!row) throw new HttpError(404, "Not found"); // deleted right after our write
  return c.json(row);
});

companyExpenses.delete("/:id", async (c) => {
  const me = c.var.tenant.user;
  const repo = expensesRepo(c.env.DB, c.var.tenant.org.id);
  const old = await repo.companyById(id(c.req.param("id")));
  if (!old) throw new HttpError(404, "Not found");
  lost(await repo.companyRemove(old, { id: me.id, name: me.name }));
  return c.json({ ok: true });
});
