import { Hono } from "hono";
import type { WaConfigView } from "@ss/contract";
import type { AppEnv } from "../../env";
import type { Context } from "hono";
import { HttpError } from "../../core/errors";
import { requireFeature } from "../../core/pipeline";
import { forbidden, isAdmin, requireAdmin } from "../../core/roles";
import { platformRepo } from "../../data/platform";
import { salesRepo, settingsRepo, waConfigRepo, waMessagesRepo, type WaConfigInput } from "../../data/tenant";
import { canonicalPhone } from "../../lib/phone";
import { isBillError, NOT_READY, sendBill } from "./bill";
import { waReady } from "./ready";
import { runFeedback, runFeedbackReminders, runReminders, WA_BATCH } from "../../jobs/wa-jobs";

/**
 * The salon's own WhatsApp credentials: GET/PUT/DELETE /whatsapp/config. Owner/admin, feature `whatsapp`, gated per
 * route (router mounted at "/"). The token is write-only (RF4): never in a response, an audit row or an error.
 * Later tasks add the template/campaign/bill routes here.
 */
export const whatsapp = new Hono<AppEnv>();

const bad = (m: string) => new HttpError(400, m);
const ID_RE = /^\d{5,25}$/;
const MAX_TEST_NUMBERS = 20;
const DUPLICATE = "That WhatsApp number is already connected to another salon";

/** Parses the PUT body. Error messages never include the submitted token. */
function parseConfig(b: unknown, callingCode: string): WaConfigInput {
  if (!b || typeof b !== "object" || Array.isArray(b)) throw bad("Send the WhatsApp settings as JSON");
  const o = b as Record<string, unknown>;
  const id = (k: string, label: string) => {
    const v = typeof o[k] === "string" ? (o[k] as string).trim() : "";
    if (!ID_RE.test(v)) throw bad(`${label} must be 5 to 25 digits`);
    return v;
  };
  const phoneNumberId = id("phone_number_id", "Phone number ID");
  const wabaId = id("waba_id", "WhatsApp Business Account ID");
  const token = o.token;
  if (typeof token !== "string" || !token) throw bad("Enter the access token");
  if (token.length > 512) throw bad("The access token is too long");
  if (/\s/.test(token)) throw bad("The access token can't contain spaces");
  const raw = o.test_numbers;
  let testNumbers: string | null = null;
  if (raw !== undefined && raw !== null) {
    if (typeof raw !== "string") throw bad("Test numbers must be a comma-separated list");
    const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (list.length > MAX_TEST_NUMBERS) throw bad(`At most ${MAX_TEST_NUMBERS} test numbers`);
    const out: string[] = [];
    for (const n of list) {
      const p = canonicalPhone(n, callingCode);
      if (!p) throw bad(`"${n.slice(0, 30)}" isn't a valid phone number`);
      if (!out.includes(p)) out.push(p);
    }
    testNumbers = out.length ? out.join(",") : null;
  }
  return { phoneNumberId, wabaId, token, testNumbers };
}

const gate = [requireFeature("whatsapp"), requireAdmin] as const;

whatsapp.get("/whatsapp/config", ...gate, async (c) => {
  const m = await waConfigRepo(c.env.DB, c.var.tenant.org.id, c.env.SECRETS_KEY).meta();
  const view: WaConfigView | null = m
    ? { phone_number_id: m.phoneNumberId, waba_id: m.wabaId, test_numbers: m.testNumbers ? m.testNumbers.split(",") : [], has_token: true }
    : null;
  return c.json(view);
});

whatsapp.put("/whatsapp/config", ...gate, async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw bad("Send the WhatsApp settings as JSON");
  }
  const { org, user } = c.var.tenant;
  const { phone_country } = await settingsRepo(c.env.DB, org.id).get();
  const input = parseConfig(body, phone_country);
  const owner = await platformRepo(c.env.DB).orgByPhoneNumberId(input.phoneNumberId);
  if (owner && owner.id !== org.id) throw new HttpError(409, DUPLICATE);
  const r = await waConfigRepo(c.env.DB, org.id, c.env.SECRETS_KEY).set(input, { id: user.id, name: user.name });
  if (r === "conflict") throw new HttpError(409, DUPLICATE);
  return c.json({ wa_ready: true });
});

whatsapp.delete("/whatsapp/config", ...gate, async (c) => {
  const { org, user } = c.var.tenant;
  await waConfigRepo(c.env.DB, org.id, c.env.SECRETS_KEY).clear({ id: user.id, name: user.name });
  return c.json({ wa_ready: false });
});

// ---------- bills (feature whatsapp) and customer opt-out (admin) ----------

const idParam = (raw: string | undefined): number => {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(404, "Not found");
  return n;
};

/** FM billForWhatsapp: a live sale of this org (404 otherwise); barbers only their own (403). */
async function billSale(c: Context<AppEnv>) {
  const { org, user } = c.var.tenant;
  const sale = await salesRepo(c.env.DB, org.id).byId(idParam(c.req.param("id")));
  if (!sale) throw new HttpError(404, "Not found");
  if (!isAdmin(user) && sale.barber_id !== user.id) throw forbidden();
  return sale;
}

/** The latest WhatsApp send of this bill, or null. */
whatsapp.get("/sales/:id/whatsapp", requireFeature("whatsapp"), async (c) => {
  const sale = await billSale(c);
  return c.json(await waMessagesRepo(c.env.DB, c.var.tenant.org.id).latestBill(sale.id));
});

/** Sends the bill now. 409 wa_not_ready without a connected number (checked after the sale, so another org's id is 404). */
whatsapp.post("/sales/:id/whatsapp", requireFeature("whatsapp"), async (c) => {
  const sale = await billSale(c);
  const r = await sendBill(c.env, c.var.tenant.org.id, sale.id, c.var.tenant.user.id);
  if (isBillError(r)) {
    if (r.code === "wa_not_ready") throw new HttpError(409, r.error, "wa_not_ready");
    if (r.code === "not_found") throw new HttpError(404, "Not found");
    throw bad(r.error);
  }
  return c.json(r);
});

/** FM PUT /customers/:id/whatsapp: opt a customer of THIS org out of (or back into) WhatsApp (RF3). Audited. */
whatsapp.put("/customers/:id/whatsapp", ...gate, async (c) => {
  const customerId = idParam(c.req.param("id"));
  const b = (await c.req.json().catch(() => null)) as { opt_out?: unknown } | null;
  if (!b || typeof b !== "object" || typeof b.opt_out !== "boolean") throw bad("opt_out must be true or false");
  const { org, user } = c.var.tenant;
  const row = await waMessagesRepo(c.env.DB, org.id).setOptOut(customerId, b.opt_out, { id: user.id, name: user.name });
  if (!row) throw new HttpError(404, "Not found");
  return c.json(row);
});

// ---------- manual job runs (FM routes.ts 1523-1535): admin, feature whatsapp, 40 sends per call, no hour window ----------

const requireReady = async (c: Context<AppEnv>) => {
  if (!(await waReady(c, c.var.tenant.org))) throw new HttpError(409, NOT_READY, "wa_not_ready");
};

/** Due visit reminders now (like FM, regardless of wa_reminder_enabled / wa_reminder_hour). */
whatsapp.post("/wa/reminders/run", ...gate, async (c) => {
  await requireReady(c);
  return c.json(await runReminders(c.env, c.var.tenant.org.id, Date.now(), WA_BATCH, { left: WA_BATCH }));
});

/** Due rating requests, then due rating reminders, sharing one 40-send budget, as one tally (FM order). */
whatsapp.post("/wa/feedback/run", ...gate, async (c) => {
  await requireReady(c);
  const orgId = c.var.tenant.org.id;
  const budget = { left: WA_BATCH };
  const a = await runFeedback(c.env, orgId, Date.now(), WA_BATCH, budget);
  const b = await runFeedbackReminders(c.env, orgId, Date.now(), WA_BATCH, budget);
  return c.json({ due: a.due + b.due, sent: a.sent + b.sent, failed: a.failed + b.failed, skipped: a.skipped + b.skipped });
});
