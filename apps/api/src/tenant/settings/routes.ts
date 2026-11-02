import { Hono } from "hono";
import type { SettingsInput } from "@ss/contract";
import type { AppEnv } from "../../env";
import { HttpError } from "../../core/errors";
import { requireAdmin } from "../../core/roles";
import { requireFeature } from "../../core/pipeline";
import { settingsRepo } from "../../data/tenant";

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

function validTimezone(tz: string): boolean {
  if (!/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
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

  const timezone = required(b, "timezone", "a timezone", 60);
  if (!validTimezone(timezone)) throw bad("Unknown timezone");

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
    google_review_url: link(b, "google_review_url", "Google review"),
    instagram_url: link(b, "instagram_url", "Instagram"),
    timezone,
    day_start_hour: int(b, "day_start_hour", "Day start hour", 0, 12),
    currency,
    locale: required(b, "locale", "a locale", 20),
    phone_country,
    bill_prefix,
  };
}

export const settings = new Hono<AppEnv>();
settings.use("*", requireFeature("core_sales"));

settings.get("/", async (c) => c.json(await settingsRepo(c.env.DB, c.var.tenant.org.id).get()));

settings.put("/", requireAdmin, async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw bad("Send the settings as JSON");
  }
  const next = parseSettings(body);
  const { org, user } = c.var.tenant;
  // Nothing in this form changes the plan's features, so the feature cache is left alone.
  return c.json(await settingsRepo(c.env.DB, org.id).update(next, { id: user.id, name: user.name }));
});
