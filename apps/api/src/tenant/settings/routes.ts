import { Hono, type Context } from "hono";
import type { Settings, SettingsInput, SettingsResponse } from "@ss/contract";
import type { AppEnv } from "../../env";
import { HttpError } from "../../core/errors";
import { requireAdmin } from "../../core/roles";
import { requireFeature } from "../../core/pipeline";
import { assetsRepo, logoUrl, settingsRepo, withWaReady } from "../../data/tenant";
import { publicRateLimit, resolvePublicOrg } from "../../core/public";
import { pngSize } from "../../lib/pdf";

const bad = (m: string) => new HttpError(400, m);

/** Optional text: string or null, trimmed, "" -> null, over `max` rejected. */
function text(b: Record<string, unknown>, k: keyof SettingsInput, label: string, max: number): string | null {
  const v = b[k];
  if (v === null) return null;
  if (typeof v !== "string") throw bad(`${label} must be text`);
  const t = v.trim();
  if (t.length > max) throw bad(`${label} is too long (max ${max} characters)`);
  return t || null;
}

function required(b: Record<string, unknown>, k: keyof SettingsInput, label: string, max: number): string {
  const v = text(b, k, label, max);
  if (!v) throw bad(`Enter ${label}`);
  return v;
}

function bool(b: Record<string, unknown>, k: keyof SettingsInput, label: string): boolean {
  if (typeof b[k] !== "boolean") throw bad(`${label} must be on or off`);
  return b[k] as boolean;
}

function int(b: Record<string, unknown>, k: keyof SettingsInput, label: string, min: number, max: number): number {
  const v = b[k];
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) throw bad(`${label} must be a whole number from ${min} to ${max}`);
  return v;
}

function percent(b: Record<string, unknown>, k: keyof SettingsInput, label: string): number {
  const v = b[k];
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100) throw bad(`${label} must be between 0 and 100`);
  return Math.round(v * 100) / 100;
}

function link(b: Record<string, unknown>, k: keyof SettingsInput, label: string): string | null {
  const v = text(b, k, label, 300);
  if (v && !/^https:\/\/\S+$/.test(v)) throw bad(`${label} must be a link starting with https://`);
  return v;
}

const TEMPLATE_RE = /^[a-z0-9_]{1,64}$/;
const WA_LANGUAGE_RE = /^[a-z]{2}(_[A-Z]{2})?$/;

/** A Meta template name: lowercase letters, digits and _, 1-64 characters. */
function template(b: Record<string, unknown>, k: keyof SettingsInput, label: string): string {
  const v = b[k];
  if (typeof v !== "string" || !TEMPLATE_RE.test(v.trim())) throw bad(`${label} must be a template name (a-z, 0-9 and _, up to 64)`);
  return v.trim();
}

/** Optional https image link, at most 500 characters. */
function imageUrl(b: Record<string, unknown>, k: keyof SettingsInput, label: string): string | null {
  const v = text(b, k, label, 500);
  if (v && !/^https:\/\/\S+$/.test(v)) throw bad(`${label} must be a link starting with https://`);
  return v;
}

/** The canonical IANA name, or null when the zone is unknown. */
function canonicalTimezone(tz: string): string | null {
  if (!/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/.test(tz)) return null;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

function canonicalLocale(l: string): string | null {
  try {
    return Intl.getCanonicalLocales(l)[0] ?? null;
  } catch {
    return null;
  }
}

/** Decimal digits of a currency's minor unit (AED 2, JPY 0, KWD 3), or null for an unknown code. */
export function currencyDigits(code: string): number | null {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits ?? null;
  } catch {
    return null;
  }
}

export function parseSettings(raw: unknown): SettingsInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw bad("Send the settings as a JSON object");
  const b = raw as Record<string, unknown>;

  const phone_country = text(b, "phone_country", "Phone country code", 4);
  if (!phone_country || !/^\d{1,4}$/.test(phone_country)) throw bad("Phone country code must be 1 to 4 digits");

  const trn = text(b, "trn", "TRN", 40);
  if (trn && phone_country === "971" && !/^\d{15}$/.test(trn)) throw bad("TRN must be exactly 15 digits");

  const qa = b.quick_amounts;
  if (!Array.isArray(qa) || qa.length > 8) throw bad("Quick amounts must be a list of up to 8 amounts");
  const quick_amounts = qa.map((n) => {
    if (typeof n !== "number" || !Number.isFinite(n) || n <= 0 || n > 1_000_000) throw bad("Each quick amount must be above 0 and at most 1,000,000");
    return n;
  });

  const timezone = canonicalTimezone(required(b, "timezone", "a timezone", 60));
  if (!timezone) throw bad("Unknown timezone");
  const locale = canonicalLocale(required(b, "locale", "a locale", 20));
  if (!locale) throw bad("Unknown locale");

  const bill_prefix = text(b, "bill_prefix", "Bill prefix", 6);
  if (!bill_prefix || !/^[A-Z0-9]{1,6}$/.test(bill_prefix)) throw bad("Bill prefix must be 1 to 6 capital letters or digits");
  const currency = text(b, "currency", "Currency", 3);
  if (!currency || !/^[A-Z]{3}$/.test(currency)) throw bad("Currency must be a 3-letter code like AED");

  return {
    display_name: required(b, "display_name", "the salon name", 100),
    salon_name_ar: text(b, "salon_name_ar", "Arabic name", 100),
    tagline: text(b, "tagline", "Tagline", 200),
    address: text(b, "address", "Address", 300),
    phone: text(b, "phone", "Phone", 30),
    licence_no: text(b, "licence_no", "Licence number", 40),
    trn,
    vat_enabled: bool(b, "vat_enabled", "VAT"),
    vat_rate: percent(b, "vat_rate", "VAT rate"),
    default_commission_pct: percent(b, "default_commission_pct", "Commission"),
    quick_amounts,
    thank_you_text: required(b, "thank_you_text", "the WhatsApp thank-you text", 600),
    receipt_footer: text(b, "receipt_footer", "Receipt footer", 300),
    notify_sales: bool(b, "notify_sales", "Sale alerts"),
    notify_sale_min: int(b, "notify_sale_min", "Sale alert amount", 0, 100_000_000),
    notify_summary: bool(b, "notify_summary", "Daily summary"),
    summary_hour: int(b, "summary_hour", "Summary hour", 0, 23),
    notify_reminder: bool(b, "notify_reminder", "Reminders"),
    reminder_hour: int(b, "reminder_hour", "Reminder hour", 0, 23),
    notify_barber_changes: bool(b, "notify_barber_changes", "Barber change alerts"),
    // Newer than some apps: undefined means "keep what is saved" (filled in by the PUT handler).
    email_staff_daily: b.email_staff_daily === undefined ? (undefined as unknown as boolean) : bool(b, "email_staff_daily", "Daily email to staff"),
    email_staff_monthly: b.email_staff_monthly === undefined ? (undefined as unknown as boolean) : bool(b, "email_staff_monthly", "Monthly email to staff"),
    google_review_url: link(b, "google_review_url", "Google review"),
    instagram_url: link(b, "instagram_url", "Instagram"),
    // Older apps don't send this one yet: undefined means "keep what is saved" (filled in by the PUT handler).
    google_maps_url: b.google_maps_url === undefined ? (undefined as unknown as null) : link(b, "google_maps_url", "Google Maps"),
    timezone,
    day_start_hour: int(b, "day_start_hour", "Day start hour", 0, 12),
    currency,
    locale,
    phone_country,
    bill_prefix,
    wa_bill_auto: bool(b, "wa_bill_auto", "Automatic WhatsApp bills"),
    wa_bill_template: template(b, "wa_bill_template", "Bill template"),
    wa_bill_pdf_template: template(b, "wa_bill_pdf_template", "PDF bill template"),
    wa_reminder_enabled: bool(b, "wa_reminder_enabled", "Visit reminders"),
    wa_reminder_days: int(b, "wa_reminder_days", "Reminder days", 1, 90),
    wa_reminder_hour: int(b, "wa_reminder_hour", "Reminder send hour", 0, 23),
    wa_reminder_template: template(b, "wa_reminder_template", "Reminder template"),
    wa_language: waLanguage(b),
    wa_feedback_enabled: bool(b, "wa_feedback_enabled", "Rating requests"),
    wa_feedback_delay_min: int(b, "wa_feedback_delay_min", "Rating request delay", 0, 1440),
    wa_feedback_template: template(b, "wa_feedback_template", "Rating template"),
    wa_feedback_reminder_min: int(b, "wa_feedback_reminder_min", "Rating reminder delay", 0, 1440),
    wa_feedback_reminder_template: template(b, "wa_feedback_reminder_template", "Rating reminder template"),
    wa_rating_image_url: imageUrl(b, "wa_rating_image_url", "Rating picture"),
    wa_rating_reminder_image_url: imageUrl(b, "wa_rating_reminder_image_url", "Rating reminder picture"),
    wa_fresh_cut_image_url: imageUrl(b, "wa_fresh_cut_image_url", "Fresh cut picture"),
  };
}

function waLanguage(b: Record<string, unknown>): string {
  const v = b.wa_language;
  if (typeof v !== "string" || !WA_LANGUAGE_RE.test(v.trim())) throw bad("WhatsApp language must be a code like en or en_US");
  return v.trim();
}

const withReady = (c: Context<AppEnv>, s: Settings): Promise<SettingsResponse> =>
  withWaReady(c.env.DB, c.var.tenant.org.id, c.var.tenant.features, s);

export const settings = new Hono<AppEnv>();
settings.use("*", requireFeature("core_sales"));

settings.get("/", async (c) => c.json(await withReady(c, await settingsRepo(c.env.DB, c.var.tenant.org.id).get())));

/** GET /api/settings/setup — the dashboard's setup checklist (owner/admin). */
settings.get("/setup", requireAdmin, async (c) => c.json(await settingsRepo(c.env.DB, c.var.tenant.org.id).setup()));

settings.put("/", requireAdmin, async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw bad("Send the settings as JSON");
  }
  const next = parseSettings(body);
  const { org, user } = c.var.tenant;
  const repo = settingsRepo(c.env.DB, org.id);
  const cur = await repo.get();
  if (next.google_maps_url === undefined) next.google_maps_url = cur.google_maps_url;
  if (next.email_staff_daily === undefined) next.email_staff_daily = cur.email_staff_daily;
  if (next.email_staff_monthly === undefined) next.email_staff_monthly = cur.email_staff_monthly;
  if (next.currency !== cur.currency && currencyDigits(next.currency) !== Math.round(Math.log10(cur.currency_minor))) {
    throw bad("That currency uses different decimals; contact support to change it");
  }
  // Nothing in this form changes the plan's features, so the feature cache is left alone.
  return c.json(await withReady(c, await repo.update(next, { id: user.id, name: user.name })));
});

// ---------- logo ----------

const LOGO_TYPES = ["image/webp", "image/jpeg", "image/png"];
const LOGO_MAX = 200 * 1024;
const LOGO_PNG_MAX_PX = 512;

settings.put("/logo", requireAdmin, async (c) => {
  const type = (c.req.header("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!LOGO_TYPES.includes(type)) throw bad("Send a WebP, JPEG or PNG image");
  if (Number(c.req.header("content-length") ?? 0) > LOGO_MAX) throw bad("Logo is too large (max 200 KB)");
  const bytes = await c.req.arrayBuffer();
  if (!bytes.byteLength) throw bad("The logo is empty");
  if (bytes.byteLength > LOGO_MAX) throw bad("Logo is too large (max 200 KB)");
  // CPU guard (lib/pdf): the PDF bill decodes a PNG logo; keep uploads small enough (bills draw PNGs up to 256 x 256).
  const px = type === "image/png" ? pngSize(new Uint8Array(bytes)) : null;
  if (px && (px.w > LOGO_PNG_MAX_PX || px.h > LOGO_PNG_MAX_PX)) {
    throw bad(`PNG logo is too big (${px.w} x ${px.h} px): use at most ${LOGO_PNG_MAX_PX} x ${LOGO_PNG_MAX_PX} px, or a JPEG`);
  }
  const { org } = c.var.tenant;
  const v = await assetsRepo(c.env.DB, org.id).setLogo(bytes, type);
  return c.json({ logo_url: logoUrl(v, org.slug) });
});

settings.delete("/logo", requireAdmin, async (c) => {
  await assetsRepo(c.env.DB, c.var.tenant.org.id).clearLogo();
  return c.json({ logo_url: null });
});

/**
 * Public logo, mounted on publicApi at /logo: GET /api/public/logo/:v. The org comes from the host (or ?org= on
 * workers.dev); `v` must be the current version, so the response is immutable. Shares the avatar rate-limit bucket.
 */
export const logoPublic = new Hono<AppEnv>();
logoPublic.get("/:v", publicRateLimit("avatar"), async (c) => {
  const org = await resolvePublicOrg(c);
  const v = Number(c.req.param("v"));
  if (!org || !Number.isInteger(v) || v <= 0) return c.json({ error: "Not found" }, 404);
  const img = await assetsRepo(c.env.DB, org.id).logo(v);
  if (!img) return c.json({ error: "Not found" }, 404);
  return new Response(img.bytes, {
    headers: { "content-type": img.type, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" },
  });
});

/**
 * The salon's name and logo for its sign-in page, mounted on publicApi at /brand: GET /api/public/brand. Same org
 * resolution as the logo (host, or ?org= on workers.dev); null fields when the host names no live salon.
 */
export const brandPublic = new Hono<AppEnv>();
brandPublic.get("/", publicRateLimit("pub"), async (c) => {
  const org = await resolvePublicOrg(c);
  if (!org) return c.json({ name: null, logo_url: null });
  const r = await c.env.DB.prepare(
    "SELECT (SELECT display_name FROM org_settings WHERE org_id = ?1) AS display_name, (SELECT v FROM org_assets WHERE org_id = ?1 AND kind = 'logo') AS logo_v"
  ).bind(org.id).first<{ display_name: string | null; logo_v: number | null }>();
  return c.json({ name: r?.display_name?.trim() || org.name, logo_url: logoUrl(r?.logo_v, org.slug) }, 200, { "cache-control": "no-store" });
});
