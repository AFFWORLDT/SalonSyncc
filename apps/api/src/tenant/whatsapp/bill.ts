import type { Sale, Settings, WaMessage } from "@ss/contract";
import type { Env } from "../../env";
import { platformRepo, type Org } from "../../data/platform";
import { assetsRepo, salesRepo, settingsRepo, waMessagesRepo } from "../../data/tenant";
import { orgAppUrl } from "../../core/links";
import { services, type SendResult } from "../../core/services";
import { moneyText } from "../../lib/money";
import { allowedRecipient, firstName, type WaValue } from "../../lib/whatsapp";
import { billPdf } from "../../lib/pdf";
import { receiptOf } from "../../core/public";
import { waSetup } from "./ready";

/**
 * WhatsApp bills (FM wa-jobs.ts sendBill/servicesLine), per org: the org's own number, template names, language,
 * currency/locale/timezone, and links on the org's app origin. Every attempt is logged as exactly one wa_messages row;
 * an opted-out customer (RF3, per org) or a phone outside the org's test list is logged as "skipped" without a Graph call.
 */

export const NOT_READY = "WhatsApp isn't set up for this salon";

export type BillError = { error: string; code: "not_found" | "no_phone" | "wa_not_ready" };
export type BillResult = WaMessage | BillError;
export const isBillError = (r: BillResult): r is BillError => !("kind" in r);

/** "Ali" for a real name; "Customer" for "Dear …" greetings when there is none. */
const dearName = (label: string | null) => (firstName(label) === "there" ? "Customer" : firstName(label));

/** "Haircut, Beard trim x2" (Meta allows no new lines in a value; long lists are cut). */
export function servicesLine(items: { name: string; qty: number }[]): string {
  const s = items.map((i) => (i.qty > 1 ? `${i.name} x${i.qty}` : i.name)).join(", ") || "Salon service";
  return s.length > 120 ? `${s.slice(0, 117)}...` : s;
}

/** "29 Oct 2026, 7:40 pm" in the org's locale and zone (FM used en-GB / Asia/Dubai). */
function billTime(at: number, s: Pick<Settings, "locale" | "timezone">): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: s.timezone };
  try {
    return new Intl.DateTimeFormat(s.locale, opts).format(at);
  } catch {
    return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(at);
  }
}

/** The salon's receipt page for a bill. */
export const receiptLink = (env: Env, org: Org, token: string) => `${orgAppUrl(env, org)}/r/?t=${encodeURIComponent(token)}`;
/** The PDF bill (GET /api/public/bill/:token resolves the org from the token, so no ?org= is needed). */
export const billPdfLink = (env: Env, org: Org, token: string) => `${orgAppUrl(env, org)}/api/public/bill/${encodeURIComponent(token)}`;

/**
 * The template values. The plain bill: name, bill no, amount and the receipt link. When the org's bill template is its
 * PDF template (FM rule: wa_bill_template === the PDF template): the PDF as the document header, then name, bill no,
 * date, barber, services, amount, payment and the receipt link.
 */
export function billParams(env: Env, org: Org, sale: Sale, s: Settings): WaValue[] {
  const amount = moneyText(sale.amount, s);
  const link = receiptLink(env, org, sale.token);
  if (s.wa_bill_template !== s.wa_bill_pdf_template) return [firstName(sale.customer_label), sale.bill_no, amount, link];
  return [
    { part: "header", key: "media", media: "document", text: billPdfLink(env, org, sale.token), filename: `Bill_${sale.bill_no}.pdf` },
    dearName(sale.customer_label),
    sale.bill_no,
    billTime(sale.created_at, s),
    sale.barber_name,
    servicesLine(sale.items),
    amount,
    sale.payment_mode === "card" ? "Card" : "Cash",
    link,
  ];
}

/** Sends (or skips) one sale's bill for org `orgId` and logs the attempt. Never throws for a Graph failure. */
export async function sendBill(env: Env, orgId: string, saleId: number, actorId: number | null): Promise<BillResult> {
  const org = await platformRepo(env.DB).orgById(orgId);
  if (!org) return { error: "Not found", code: "not_found" };
  const sale = await salesRepo(env.DB, orgId).byId(saleId);
  if (!sale) return { error: "Not found", code: "not_found" };
  if (!sale.customer_phone) return { error: "This bill has no customer mobile", code: "no_phone" };
  const cfg = await waSetup(env, org);
  if (!cfg) return { error: NOT_READY, code: "wa_not_ready" };
  const s = await settingsRepo(env.DB, orgId).get();
  const repo = waMessagesRepo(env.DB, orgId);
  const params = billParams(env, org, sale, s);
  const phone = sale.customer_phone;
  let r: SendResult;
  if (await repo.optedOut(sale.customer_id, phone)) r = { status: "skipped", error: "opted out" };
  else if (!allowedRecipient(cfg.testNumbers, phone, cfg.callingCode)) r = { status: "skipped", error: "not in test numbers" };
  else r = await services(env).wa.sendTemplate(cfg, phone, s.wa_bill_template, s.wa_language, params);
  return repo.log({ kind: "bill", phone, template: s.wa_bill_template, params, customerId: sale.customer_id, saleId, actorId }, r);
}

/** "f.m_salon_" from an Instagram profile URL, else null. */
export const instagramHandle = (url: string | null) => url?.match(/instagram\.com\/([\w.]+)/i)?.[1] ?? null;

/** The bill PDF for a live sale of `org` (GET /api/public/bill/:token). */
export async function billPdfFor(env: Env, org: Org, sale: Sale): Promise<Uint8Array> {
  const [s, logo] = await Promise.all([settingsRepo(env.DB, org.id).get(), assetsRepo(env.DB, org.id).currentLogo()]);
  return billPdf({
    receipt: receiptOf(sale, s),
    vatEnabled: s.vat_enabled,
    branding: { logo: logo?.bytes ?? null, logoType: logo?.type ?? null, instagram: instagramHandle(s.instagram_url) },
    link: receiptLink(env, org, sale.token),
  });
}
