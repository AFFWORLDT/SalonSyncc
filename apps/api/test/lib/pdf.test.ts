import { describe, it, expect } from "vitest";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { pdfText } from "../pdf-text";
import type { Receipt } from "@ss/contract";
import { billPdf, pdfMoney, pdfSafe, pngSize } from "../../src/lib/pdf";
import { makePng } from "../png";

// 1x1 images (valid headers; pdf-lib only parses them).
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));

const images = async (bytes: Uint8Array) => {
  const doc = await PDFDocument.load(bytes);
  return doc.context.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFRawStream && o.dict.get(PDFName.of("Subtype")) === PDFName.of("Image")).length;
};

const receipt = (over: { sale?: Partial<Receipt["sale"]>; salon?: Partial<Receipt["salon"]> } = {}): Receipt => ({
  sale: {
    bill_no: "FM-0123",
    day: "2026-10-29",
    barber_name: "Imran",
    customer_label: "Naveed Khan",
    customer_phone: "0556276071",
    amount: 9500,
    payment_mode: "card",
    vat_rate: 5,
    vat_amount: 452,
    created_at: Date.UTC(2026, 9, 29, 15, 40),
    items: [
      { service_id: 1, name: "Haircut", price: 3500, qty: 1 },
      { service_id: 2, name: "Beard trim & shape", price: 2500, qty: 1 },
      { service_id: 3, name: "Hair massage with scrub", price: 3500, qty: 1 },
    ],
    note: null,
    ...over.sale,
  },
  salon: {
    salon_name: "Faizan Mohammed Gents Salon",
    display_name: "Faizan Mohammed Gents Salon",
    salon_name_ar: "صالون",
    tagline: "Love to have a special appearance… just come to us ✂️",
    address: "Shop 3, Warsan 4, Dubai, UAE",
    phone: "0558422430",
    trn: "100123456700003",
    licence_no: null,
    receipt_footer: "Thank you for visiting. See you again soon!",
    logo_url: null,
    currency: "AED",
    currency_minor: 100,
    locale: "en-AE",
    timezone: "Asia/Dubai",
    ...over.salon,
  },
});
const LINK = "https://fm.salonkit.online/r/?t=abc123def456";

describe("pdfSafe / pdfMoney", () => {
  it("keeps only what Helvetica (WinAnsi) can draw", () => {
    expect(pdfSafe("Love to have a special appearance… just come to us ✂️")).toBe("Love to have a special appearance... just come to us");
    expect(pdfSafe("Naveed’s “cut” – done")).toBe(`Naveed's "cut" - done`);
    expect(pdfSafe("صالون")).toBe("?????");
    expect(pdfSafe(null)).toBe("");
  });
  it("formats minor units in the org's locale with latin digits", () => {
    expect(pdfMoney(6500, { currency_minor: 100, locale: "en-AE" })).toBe("65.00");
    expect(pdfMoney(123456, { currency_minor: 100, locale: "en-US" })).toBe("1,234.56");
    expect(pdfMoney(12345678, { currency_minor: 100, locale: "en-IN" })).toBe("1,23,456.78");
    expect(pdfMoney(1500, { currency_minor: 1, locale: "ja-JP" })).toBe("1,500");
    expect(pdfMoney(6500, { currency_minor: 100, locale: "ar-AE" })).toMatch(/^65[.,٫]00$|^65\.00$/);
    expect(pdfSafe(pdfMoney(6500, { currency_minor: 100, locale: "ar-AE" }))).not.toContain("?");
    expect(pdfMoney(6500, { currency_minor: 100, locale: "not a locale!" })).toBe("65.00");
  });
});

describe("billPdf", () => {
  it("VAT org: a TAX INVOICE with TRN, VAT lines, the org currency and the link", async () => {
    const bytes = await billPdf({ receipt: receipt(), vatEnabled: true, branding: { instagram: "f.m_salon_", whatsapp: "+971 50 670 9984" }, link: LINK });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const t = await pdfText(bytes);
    expect(t).toContain("TAX INVOICE");
    expect(t).toContain("TRN 100123456700003");
    expect(t).toContain("VAT 5%");
    expect(t).toContain("AED 95.00");
    expect(t).toContain("Instagram @f.m_salon_");
    expect(t).toContain("WhatsApp +971 50 670 9984");
    expect(t).toContain(`View online: ${LINK}`);
    expect(t).toContain("29 Oct 2026"); // 15:40 UTC = 19:40 Dubai
    expect(t).toMatch(/7:40\s?pm/i);
    expect(await images(bytes)).toBe(0); // no logo: text header, no image
  });

  it("INR org without VAT: a plain BILL, INR amounts, org timezone, no TRN anywhere", async () => {
    const r = receipt({
      sale: { vat_rate: 0, vat_amount: 0, amount: 150000, items: [{ service_id: 1, name: "Haircut", price: 150000, qty: 1 }], created_at: Date.UTC(2026, 9, 29, 20, 0) },
      salon: { currency: "INR", locale: "en-IN", timezone: "Asia/Kolkata", trn: "27ABCDE1234F1Z5" },
    });
    const bytes = await billPdf({ receipt: r, vatEnabled: false, branding: {}, link: LINK });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const t = await pdfText(bytes);
    expect(t).toContain("BILL");
    expect(t).not.toContain("TAX INVOICE");
    expect(t).not.toContain("TRN");
    expect(t).not.toContain("27ABCDE1234F1Z5");
    expect(t).not.toContain("AED");
    expect(t).toContain("INR 1,500.00");
    expect(t).toContain("30 Oct 2026"); // 20:00 UTC = 01:30 next day in Kolkata
    expect(t).not.toContain("WhatsApp");
  });

  it("an amount-only sale and a non-Latin name still render", async () => {
    const r = receipt({ sale: { items: [], vat_rate: 0, vat_amount: 0, customer_label: "نافيد" } });
    const bytes = await billPdf({ receipt: r, vatEnabled: true, branding: {}, link: "x" });
    expect(bytes.length).toBeGreaterThan(1000);
    const t = await pdfText(bytes);
    expect(t).toContain("Salon service");
    expect(t).toContain("?????");
  });

  it("embeds a png or jpeg logo; a webp or unreadable logo falls back to the text header", async () => {
    const png = await billPdf({ receipt: receipt(), vatEnabled: true, branding: { logo: PNG, logoType: "image/png" }, link: LINK });
    expect(await images(png)).toBeGreaterThan(0);
    const webp = await billPdf({ receipt: receipt(), vatEnabled: true, branding: { logo: new Uint8Array([1, 2, 3]), logoType: "image/webp" }, link: LINK });
    expect(await images(webp)).toBe(0);
    const junk = await billPdf({ receipt: receipt(), vatEnabled: true, branding: { logo: new Uint8Array(100).fill(7), logoType: "image/png" }, link: LINK });
    expect(new TextDecoder().decode(junk.slice(0, 5))).toBe("%PDF-");
    expect(await images(junk)).toBe(0);
    expect(await pdfText(junk)).toContain("Faizan Mohammed Gents Salon");
  });
  it("I1 CPU guard: a PNG logo over 256x256 is not embedded (the bill still renders); 200x200 is; a JPEG over 200 KB is skipped", async () => {
    const big = await makePng(1000, 1000);
    expect(pngSize(big)).toEqual({ w: 1000, h: 1000 });
    expect(big.length).toBeLessThan(200 * 1024);
    const without = await billPdf({ receipt: receipt(), vatEnabled: true, branding: { logo: big, logoType: "image/png" }, link: LINK });
    expect(await images(without)).toBe(0);
    expect(await pdfText(without)).toContain("Faizan Mohammed Gents Salon");
    const wide = await billPdf({ receipt: receipt(), vatEnabled: true, branding: { logo: await makePng(300, 10), logoType: "image/png" }, link: LINK });
    expect(await images(wide)).toBe(0);
    const ok = await makePng(200, 200);
    const withLogo = await billPdf({ receipt: receipt(), vatEnabled: true, branding: { logo: ok, logoType: "image/png" }, link: LINK });
    expect(await images(withLogo)).toBeGreaterThan(0);
    const edge = await billPdf({ receipt: receipt(), vatEnabled: true, branding: { logo: await makePng(256, 256), logoType: "image/png" }, link: LINK });
    expect(await images(edge)).toBeGreaterThan(0);
    const hugeJpeg = new Uint8Array(200 * 1024 + 1);
    hugeJpeg.set([0xff, 0xd8, 0xff]);
    const j = await billPdf({ receipt: receipt(), vatEnabled: true, branding: { logo: hugeJpeg, logoType: "image/jpeg" }, link: LINK });
    expect(await images(j)).toBe(0);
  });

  it("pngSize reads the IHDR without decoding; null for anything that is not a PNG header", () => {
    expect(pngSize(PNG)).toEqual({ w: 1, h: 1 });
    expect(pngSize(new Uint8Array(100).fill(7))).toBeNull();
    expect(pngSize(PNG.slice(0, 20))).toBeNull();
  });
});
