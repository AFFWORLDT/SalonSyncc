/**
 * The bill as a PDF (sent as the WhatsApp document), ported from FM pdf.ts: a phone-friendly A5 page with the org's logo
 * (or a text header), the bill details, the services table, VAT and the total. Per org: the currency label, the time zone
 * and locale, and "TAX INVOICE"/TRN only when the org has VAT on. Drawn with pdf-lib's standard Helvetica (no font
 * embedding, cheap on CPU), which only knows Latin text: anything else (Arabic names, emoji) becomes "?" or is dropped.
 * Only jpeg/png logos are embedded; a webp or unreadable logo falls back to the text header.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { Receipt } from "@ss/contract";

const W = 420; // A5 width in points
const M = 28; // side margin
const INK = rgb(0.09, 0.09, 0.11);
const MUTED = rgb(0.42, 0.42, 0.46);
const LINE = rgb(0.88, 0.88, 0.9);
const BAND = rgb(0.07, 0.07, 0.09);
const ACCENT = rgb(0.17, 0.24, 0.62);
const ZEBRA = rgb(0.965, 0.965, 0.975);
const WHITE = rgb(1, 1, 1);

export interface BillBranding {
  /** The org logo (org_assets) and its MIME type; only image/jpeg and image/png are drawn. */
  logo?: Uint8Array | null;
  logoType?: string | null;
  /** Instagram handle without "@", e.g. f.m_salon_. */
  instagram?: string | null;
  /** The salon's WhatsApp number as printed, e.g. +971 50 670 9984. */
  whatsapp?: string | null;
}

export interface BillPdfInput {
  receipt: Receipt;
  /** The org's VAT switch: "TAX INVOICE" and the TRN are printed only when on. */
  vatEnabled: boolean;
  branding: BillBranding;
  /** The online bill (receipt page). */
  link: string;
}

/** Keeps what Helvetica (WinAnsi) can draw: common symbols are swapped, anything else becomes "?". */
export function pdfSafe(text: string | null | undefined): string {
  return (text ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[  ]/g, " ")
    .replace(/\p{Extended_Pictographic}|[️‍]/gu, "")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?")
    .replace(/\s+/g, " ")
    .trim();
}

/** Latin digits in the org's locale (en-GB when the locale is unusable). */
function numberFormat(locale: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  try {
    return new Intl.NumberFormat(locale, { ...opts, numberingSystem: "latn" });
  } catch {
    return new Intl.NumberFormat("en-GB", opts);
  }
}
function dateFormat(locale: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat(locale, { ...opts, numberingSystem: "latn" });
  } catch {
    try {
      return new Intl.DateTimeFormat("en-GB", opts);
    } catch {
      return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" });
    }
  }
}

/** 6500 minor units → "65.00" (org locale grouping, latin digits, the currency's decimals). */
export function pdfMoney(minor: number, s: { currency_minor: number; locale: string }): string {
  const digits = Math.max(0, Math.round(Math.log10(s.currency_minor || 1)));
  return pdfSafe(numberFormat(s.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(minor / (s.currency_minor || 1)));
}

const PAYMENT: Record<string, string> = { cash: "Cash", card: "Card" };

/** The logo as a pdf-lib image, or null (no logo, webp, or bytes pdf-lib can't read). */
async function embedLogo(doc: PDFDocument, b: BillBranding): Promise<PDFImage | null> {
  if (!b.logo?.length) return null;
  try {
    if (b.logoType === "image/png") return await doc.embedPng(b.logo);
    if (b.logoType === "image/jpeg" || b.logoType === "image/jpg") return await doc.embedJpg(b.logo);
  } catch {
    // unreadable bytes: fall back to the text header
  }
  return null;
}

export async function billPdf({ receipt, vatEnabled, branding, link }: BillPdfInput): Promise<Uint8Array> {
  const { sale, salon } = receipt;
  const money = (minor: number) => pdfMoney(minor, salon);
  const doc = await PDFDocument.create();
  doc.setTitle(`Bill ${pdfSafe(sale.bill_no)} - ${pdfSafe(salon.salon_name)}`);
  doc.setAuthor(pdfSafe(salon.salon_name));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await embedLogo(doc, branding);
  const showVat = sale.vat_rate > 0;

  const rows = sale.items.length ? sale.items : [{ name: "Salon service", qty: 1, price: sale.amount, service_id: null }];
  const H = Math.max(595, 470 + rows.length * 22 + (showVat ? 36 : 0) + (sale.note ? 18 : 0));
  const page = doc.addPage([W, H]);
  const text = (p: PDFPage, s: string, x: number, y: number, size: number, f: PDFFont = font, color = INK) => p.drawText(s, { x, y, size, font: f, color });
  const right = (s: string, xRight: number, y: number, size: number, f: PDFFont = font, color = INK) =>
    page.drawText(s, { x: xRight - f.widthOfTextAtSize(s, size), y, size, font: f, color });
  const fit = (s: string, max: number, size: number, f: PDFFont = font) => {
    let out = s;
    while (out.length > 1 && f.widthOfTextAtSize(out, size) > max) out = out.slice(0, -1);
    return out === s ? s : `${out.slice(0, -1)}...`;
  };

  // ---- dark header band: the logo in a white circle (when there is one), salon name, tagline ----
  const bandH = 104;
  page.drawRectangle({ x: 0, y: H - bandH, width: W, height: bandH, color: BAND });
  page.drawRectangle({ x: 0, y: H - bandH - 4, width: W, height: 4, color: ACCENT });
  const cy = H - bandH / 2;
  let nameX = M;
  if (logo) {
    const cx = M + 34;
    page.drawCircle({ x: cx, y: cy, size: 34, color: WHITE });
    const scale = 48 / Math.max(logo.width, logo.height, 1); // fits inside the circle, aspect kept
    const w = logo.width * scale;
    const h = logo.height * scale;
    page.drawImage(logo, { x: cx - w / 2, y: cy - h / 2, width: w, height: h });
    nameX = cx + 48;
  }
  text(page, fit(pdfSafe(salon.salon_name), W - nameX - M, 17, bold), nameX, cy + 6, 17, bold, WHITE);
  const tagline = pdfSafe(salon.tagline);
  if (tagline) text(page, fit(tagline, W - nameX - M, 9), nameX, cy - 12, 9, font, rgb(0.75, 0.75, 0.8));

  // ---- title row ----
  let y = H - bandH - 40;
  text(page, vatEnabled && showVat ? "TAX INVOICE" : "BILL", M, y, 11, bold, ACCENT);
  right(`No. ${pdfSafe(sale.bill_no)}`, W - M, y, 11, bold);
  y -= 14;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: LINE });

  // ---- details: two columns of label / value (date and time in the org's zone and locale) ----
  const when = new Date(sale.created_at);
  const tz = { timeZone: salon.timezone };
  const date = pdfSafe(dateFormat(salon.locale, { day: "numeric", month: "short", year: "numeric", ...tz }).format(when));
  const time = pdfSafe(dateFormat(salon.locale, { hour: "numeric", minute: "2-digit", ...tz }).format(when));
  const customer = /^Customer \d+$/.test(sale.customer_label) ? "Walk-in customer" : pdfSafe(sale.customer_label) || "Walk-in customer";
  const details: [string, string][] = [
    ["Date", `${date}, ${time}`],
    ["Barber", pdfSafe(sale.barber_name)],
    ["Customer", customer],
    ["Payment", PAYMENT[sale.payment_mode] ?? pdfSafe(sale.payment_mode)],
  ];
  if (sale.customer_phone) details.splice(3, 0, ["Mobile", pdfSafe(sale.customer_phone)]);
  y -= 22;
  const colW = (W - 2 * M) / 2;
  details.forEach(([label, value], i) => {
    const x = M + (i % 2) * colW;
    const rowY = y - Math.floor(i / 2) * 34;
    text(page, label.toUpperCase(), x, rowY, 7.5, bold, MUTED);
    text(page, fit(value, colW - 12, 10.5), x, rowY - 14, 10.5, font, INK);
  });
  y -= Math.ceil(details.length / 2) * 34 + 10;

  // ---- services table ----
  const cQty = W - M - 150;
  const cPrice = W - M - 80;
  page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 22, color: INK });
  text(page, "SERVICE", M + 10, y + 1, 8, bold, WHITE);
  right("QTY", cQty + 18, y + 1, 8, bold, WHITE);
  right("PRICE", cPrice + 22, y + 1, 8, bold, WHITE);
  right("AMOUNT", W - M - 10, y + 1, 8, bold, WHITE);
  y -= 28;
  rows.forEach((it, i) => {
    if (i % 2 === 1) page.drawRectangle({ x: M, y: y - 7, width: W - 2 * M, height: 22, color: ZEBRA });
    text(page, fit(pdfSafe(it.name) || "Service", cQty - M - 30, 10), M + 10, y, 10);
    right(String(it.qty), cQty + 18, y, 10);
    right(money(it.price), cPrice + 22, y, 10, font, MUTED);
    right(money(it.price * it.qty), W - M - 10, y, 10, bold);
    y -= 22;
  });
  page.drawLine({ start: { x: M, y: y + 8 }, end: { x: W - M, y: y + 8 }, thickness: 0.8, color: LINE });

  // ---- totals (vat_rate is a percent: 5 = 5%) ----
  y -= 12;
  if (showVat) {
    text(page, "Subtotal (excl. VAT)", cQty - 60, y, 9.5, font, MUTED);
    right(money(sale.amount - sale.vat_amount), W - M - 10, y, 9.5, font, MUTED);
    y -= 18;
    text(page, `VAT ${Number(sale.vat_rate.toFixed(2))}%`, cQty - 60, y, 9.5, font, MUTED);
    right(money(sale.vat_amount), W - M - 10, y, 9.5, font, MUTED);
    y -= 18;
  }
  y -= 8;
  page.drawRectangle({ x: cQty - 72, y: y - 11, width: W - M - (cQty - 72), height: 30, color: ACCENT });
  text(page, "TOTAL", cQty - 60, y, 10, bold, WHITE);
  right(fit(`${pdfSafe(salon.currency)} ${money(sale.amount)}`, W - M - 10 - (cQty - 20), 15, bold), W - M - 10, y - 1, 15, bold, WHITE);
  y -= 30;
  if (showVat) {
    right("Prices include VAT", W - M - 10, y, 8, font, MUTED);
    y -= 12;
  }
  if (sale.note) {
    text(page, fit(`Note: ${pdfSafe(sale.note)}`, W - 2 * M, 9), M, y, 9, font, MUTED);
    y -= 18;
  }

  // ---- footer: thank-you, contact, online link ----
  const fy = 104;
  page.drawLine({ start: { x: M, y: fy }, end: { x: W - M, y: fy }, thickness: 0.8, color: LINE });
  const thanks = fit(pdfSafe(salon.receipt_footer) || "Thank you for visiting. See you again soon!", W - 2 * M, 11, bold);
  text(page, thanks, Math.max(M, (W - bold.widthOfTextAtSize(thanks, 11)) / 2), fy - 22, 11, bold, INK);
  const contact = [pdfSafe(salon.address), salon.phone ? `Tel ${pdfSafe(salon.phone)}` : ""].filter(Boolean).join("  |  ");
  const line2 = [
    branding.whatsapp ? `WhatsApp ${pdfSafe(branding.whatsapp)}` : "",
    branding.instagram ? `Instagram @${pdfSafe(branding.instagram)}` : "",
    vatEnabled && salon.trn ? `TRN ${pdfSafe(salon.trn)}` : "",
  ]
    .filter(Boolean)
    .join("  |  ");
  for (const [i, s] of [contact, line2].entries()) {
    if (!s) continue;
    const f = fit(s, W - 2 * M, 8);
    text(page, f, (W - font.widthOfTextAtSize(f, 8)) / 2, fy - 42 - i * 13, 8, font, MUTED);
  }
  const l = fit(pdfSafe(link), W - 2 * M - 70, 7.5);
  const lw = font.widthOfTextAtSize(`View online: ${l}`, 7.5);
  text(page, `View online: ${l}`, (W - lw) / 2, fy - 76, 7.5, font, ACCENT);

  return doc.save();
}
