import { Hono, type Context } from "hono";
import type { Paged, Sale, SaleInput, SaleItem, Settings } from "@ss/contract";
import type { AppEnv } from "../../env";
import { HttpError } from "../../core/errors";
import { isAdmin } from "../../core/roles";
import { requireFeature } from "../../core/pipeline";
import { clockOf, customersRepo, salesRepo, settingsRepo, type SaleFilters, type VersionedSale } from "../../data/tenant";
import { businessDay, dayStamp } from "../../lib/clock";
import { DAY_RE, clampPage, commissionOf, toMinor, vatOf } from "../../lib/money";
import { canonicalPhone } from "../../lib/phone";
import { hooks, runHook } from "./hooks";

const bad = (m: string) => new HttpError(400, m);
const MAX_ITEMS = 30;
const MAX_QTY = 20;
const NO_BARBER = "Choose an active barber";
const SERVICE_GONE = "One of the services no longer exists. Refresh and pick again.";

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

const present = (v: unknown) => v !== undefined && v !== null && v !== "";

/**
 * The bill lines and total (FM resolveItems). Catalogue services (of this org, hidden ones too) take their name from the
 * catalogue and, unless a price was typed on the bill (major units), their catalogue price; one-off items carry their own
 * name and price. With no items, the typed amount is the total. Runs before any write, so a bad item never uses up a bill number.
 */
async function resolveItems(repo: ReturnType<typeof salesRepo>, b: Partial<SaleInput>, s: Settings): Promise<{ items: SaleItem[]; amount: number }> {
  if (present(b.items) && !Array.isArray(b.items)) throw bad("Send the items as a list");
  const raw = Array.isArray(b.items) ? b.items : [];
  if (raw.length > MAX_ITEMS) throw bad(`A bill can have at most ${MAX_ITEMS} items`);
  if (!raw.length) {
    const amount = toMinor(b.amount, s.currency_minor);
    if (!amount) throw bad("Pick a service or enter the amount (e.g. 25)");
    return { items: [], amount };
  }
  if (raw.some((i) => !i || typeof i !== "object" || Array.isArray(i))) throw bad("Each extra item needs a name and a price");
  const ids = [...new Set(raw.map((i) => Number(i.service_id)).filter((n) => Number.isInteger(n) && n > 0))];
  const services = await repo.servicesByIds(ids);
  const items: SaleItem[] = raw.map((i) => {
    const qty = Math.min(MAX_QTY, Math.max(1, Math.floor(Number(i.qty) || 1)));
    if (i.service_id) {
      const svc = services.get(Number(i.service_id));
      if (!svc) throw bad("One of the services no longer exists. Refresh and pick again.");
      const given = present(i.price) ? toMinor(i.price, s.currency_minor) : null;
      if (present(i.price) && given === null) throw bad(`Enter a price for ${svc.name}, e.g. 25`);
      return { service_id: svc.id, name: svc.name, price: given ?? svc.price, qty };
    }
    const name = clean(i.name, 80);
    const price = toMinor(i.price, s.currency_minor);
    if (!name || !price) throw bad("Each extra item needs a name and a price");
    return { service_id: null, name, price, qty };
  });
  const amount = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  if (amount <= 0) throw bad(`The total must be more than ${s.currency} 0`);
  return { items, amount };
}

async function readBody(c: Context<AppEnv>): Promise<Partial<SaleInput>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw bad("Send the details as JSON");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw bad("Send the details as JSON");
  return raw as Partial<SaleInput>;
}

/** FM readSaleInput: payment mode, canonical phone (checked before any write, so a bad number never uses up a bill number), name, note. */
function readSaleInput(b: Partial<SaleInput>, s: Settings) {
  if (b.payment_mode !== "cash" && b.payment_mode !== "card") throw bad("Choose Cash or Card");
  const rawPhone = clean(b.customer_phone, 30);
  const phone = rawPhone ? canonicalPhone(rawPhone, s.phone_country) : null;
  if (rawPhone && !phone) throw bad("Mobile number doesn't look right");
  return { payment_mode: b.payment_mode, phone, name: clean(b.customer_name, 80), note: clean(b.note, 300) };
}

/** An admin-chosen day: valid and not after today. */
function pastDay(v: unknown, today: string): string {
  if (typeof v !== "string" || !DAY_RE.test(v) || v > today) throw bad("Pick a valid day (not in the future)");
  return v;
}

/** Recomputes customer stats in the background; a failure never fails the request. */
function refreshStats(c: Context<AppEnv>, ids: (number | null)[]) {
  const repo = customersRepo(c.env.DB, c.var.tenant.org.id);
  for (const cid of new Set(ids)) {
    if (cid) c.executionCtx.waitUntil(repo.refreshStats(cid).catch((e) => console.error("customer stats refresh failed", e)));
  }
}

export const sales = new Hono<AppEnv>();
// Mounted at "/sales": the feature gate covers only this prefix.
sales.use("*", requireFeature("core_sales"));

sales.get("/", async (c) => {
  const me = c.var.tenant.user;
  const q = c.req.query();
  const page = clampPage(q.page);
  const page_size = Math.min(200, Math.max(1, Math.floor(Number(q.page_size)) || 50));
  const f: SaleFilters = {};
  if (q.day && DAY_RE.test(q.day)) f.day = q.day;
  if (q.from && DAY_RE.test(q.from)) f.from = q.from;
  if (q.to && DAY_RE.test(q.to)) f.to = q.to;
  // Barbers see only their own sales; their barber_id / customer_id filters are ignored (FM).
  if (!isAdmin(me)) f.barberId = me.id;
  else if (q.barber_id) f.barberId = id(q.barber_id);
  if (isAdmin(me) && q.customer_id) f.customerId = id(q.customer_id);
  if (q.q?.trim()) f.q = q.q.trim().slice(0, 80);
  if (q.payment_mode === "cash" || q.payment_mode === "card") f.paymentMode = q.payment_mode;
  const r = await salesRepo(c.env.DB, c.var.tenant.org.id).list(f, page, page_size);
  const body: Paged<Sale> = { items: r.items, total: r.total, sum: r.sum, page, page_size };
  return c.json(body);
});

sales.post("/", async (c) => {
  const me = c.var.tenant.user;
  const orgId = c.var.tenant.org.id;
  const db = c.env.DB;
  const b = await readBody(c);
  const settings = await settingsRepo(db, orgId).get();
  const { payment_mode, phone, name, note } = readSaleInput(b, settings);

  const today = businessDay(Date.now(), clockOf(settings));
  let day = today;
  if (present(b.day) && isAdmin(me)) day = pastDay(b.day, today);

  const repo = salesRepo(db, orgId);
  const { items, amount } = await resolveItems(repo, b, settings);

  // Barbers always sell as themselves; an admin may ring up a sale for an active user of their own org (RF1).
  let barberId = me.id;
  if (isAdmin(me) && present(b.barber_id)) {
    const n = Number(b.barber_id);
    if (!Number.isInteger(n) || n <= 0) throw bad(NO_BARBER);
    barberId = n;
  }
  const barber = await repo.barberForSale(barberId);
  if (!barber) throw bad(NO_BARBER);

  const existing = phone ? await customersRepo(db, orgId).byPhone(phone) : null;
  const stamp = dayStamp(day);
  const seqs = c.var.tenant.repo;
  const billNo = `${settings.bill_prefix}-${stamp}-${String(await seqs.nextSeq(`bill_${stamp}`)).padStart(3, "0")}`;
  const label = name ?? existing?.name ?? `Customer ${await seqs.nextSeq(`cust_${stamp}`)}`;

  const pct = barber.commission_pct ?? settings.default_commission_pct;
  const vatRate = settings.vat_enabled ? settings.vat_rate : 0;
  let sale: Sale;
  try {
    sale = await repo.create(
      {
        bill_no: billNo,
        day,
        barber,
        customer: phone ? { phone, name, rename: isAdmin(me) } : null,
        customer_label: label,
        amount,
        payment_mode,
        note,
        commission_pct: pct,
        commission: commissionOf(amount, pct),
        vat_rate: vatRate,
        vat_amount: vatOf(amount, vatRate),
        items,
      },
      { id: me.id, name: me.name },
    );
  } catch (e) {
    // A catalogue service was deleted between resolveItems and the batch: sale_items' FK failed and nothing was written.
    if (/FOREIGN KEY constraint failed/i.test(String((e as Error)?.message ?? e))) throw bad(SERVICE_GONE);
    throw e;
  }

  refreshStats(c, [sale.customer_id]);
  runHook(c, "afterSale", () => hooks.afterSale(c, sale, settings));
  return c.json(sale, 201);
});

/** FM editableSale: barbers may change only their own sales, and only on today's business day. 404 for missing/deleted/other org. */
async function editableSale(c: Context<AppEnv>, repo: ReturnType<typeof salesRepo>, saleId: number, settings: Settings): Promise<VersionedSale> {
  const me = c.var.tenant.user;
  const sale = await repo.byIdVersioned(saleId);
  if (!sale) throw new HttpError(404, "Not found");
  if (!isAdmin(me)) {
    if (sale.barber_id !== me.id) throw new HttpError(403, "You don't have access to this");
    if (sale.day !== businessDay(Date.now(), clockOf(settings))) throw new HttpError(403, "Old sales can only be changed by the admin");
  }
  return sale;
}

const WALK_IN = /^Customer \d+$/;

/** After a lost race (the guarded write changed nothing): 404 if the sale is gone, else 409 stale. */
async function lostRace(repo: ReturnType<typeof salesRepo>, saleId: number): Promise<never> {
  if (!(await repo.isLive(saleId))) throw new HttpError(404, "Not found");
  throw new HttpError(409, "This sale was changed by someone else. Reload and try again.", "stale");
}

sales.put("/:id", async (c) => {
  const me = c.var.tenant.user;
  const orgId = c.var.tenant.org.id;
  const db = c.env.DB;
  const saleId = id(c.req.param("id"));
  const settings = await settingsRepo(db, orgId).get();
  const repo = salesRepo(db, orgId);
  const sale = await editableSale(c, repo, saleId, settings);
  const b = await readBody(c);
  const { payment_mode, phone, name, note } = readSaleInput(b, settings);
  const { items, amount } = await resolveItems(repo, b, settings);

  // FM: the commission pct and VAT rate stay the sale's snapshot; only a barber change takes the new barber's pct.
  let barber = { id: sale.barber_id, name: sale.barber_name };
  let commissionPct = sale.commission_pct;
  if (isAdmin(me) && present(b.barber_id) && Number(b.barber_id) !== sale.barber_id) {
    const n = Number(b.barber_id);
    const next = Number.isInteger(n) && n > 0 ? await repo.barberForSale(n) : null;
    if (!next) throw bad(NO_BARBER);
    barber = { id: next.id, name: next.name };
    commissionPct = next.commission_pct ?? settings.default_commission_pct;
  }
  let day = sale.day;
  if (isAdmin(me) && present(b.day) && b.day !== sale.day) day = pastDay(b.day, businessDay(Date.now(), clockOf(settings)));

  const existing = phone ? await customersRepo(db, orgId).byPhone(phone) : null;
  // No name now: the customer's saved name, else keep an existing "Customer N", else number a new walk-in.
  const label =
    name ?? existing?.name ?? (WALK_IN.test(sale.customer_label) ? sale.customer_label : `Customer ${await c.var.tenant.repo.nextSeq(`cust_${dayStamp(day)}`)}`);

  const applied = await repo.update(
    sale,
    {
      day,
      barber,
      customer: phone ? { phone, name, rename: isAdmin(me) } : null,
      customer_label: label,
      amount,
      payment_mode,
      note,
      commission_pct: commissionPct,
      commission: commissionOf(amount, commissionPct),
      vat_amount: vatOf(amount, sale.vat_rate),
      items,
    },
    { id: me.id, name: me.name },
  );
  if (!applied) await lostRace(repo, sale.id);
  const updated = await repo.byId(sale.id);
  if (!updated) throw new HttpError(404, "Not found"); // deleted right after our write
  refreshStats(c, [updated.customer_id, updated.customer_id !== sale.customer_id ? sale.customer_id : null]);
  // Only reached when the guarded write took effect (a lost race threw 404/409 above).
  runHook(c, "afterSaleEdit", () => hooks.afterSaleEdit(c, sale, updated, settings));
  return c.json(updated);
});

sales.delete("/:id", async (c) => {
  const me = c.var.tenant.user;
  const orgId = c.var.tenant.org.id;
  const db = c.env.DB;
  const saleId = id(c.req.param("id"));
  const repo = salesRepo(db, orgId);
  const sale = await editableSale(c, repo, saleId, await settingsRepo(db, orgId).get());
  if (!(await repo.remove(sale, { id: me.id, name: me.name }))) await lostRace(repo, sale.id);
  refreshStats(c, [sale.customer_id]);
  runHook(c, "afterSaleDelete", () => hooks.afterSaleDelete(c, sale));
  return c.json({ ok: true });
});
