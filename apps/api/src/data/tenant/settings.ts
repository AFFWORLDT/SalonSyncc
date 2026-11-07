import type { Settings, SettingsInput, SettingsResponse } from "@ss/contract";
import type { OrgClock } from "../../lib/clock";
import { auditRepo } from "./audit";
import { logoUrl } from "./assets";

/** The org's business-day clock from its settings. */
export const clockOf = (s: { timezone: string; day_start_hour: number }): OrgClock => ({
  timezone: s.timezone,
  dayStartHour: s.day_start_hour,
});

/** The org_settings columns Settings is built from (also read, s.-prefixed, by the cron org loader in data/platform.ts). */
export const SETTINGS_COLS =
  "display_name, salon_name_ar, tagline, address, contact_phone, licence_no, trn, vat_enabled, vat_rate, default_commission_pct, quick_amounts, thank_you_text, receipt_footer, notify_sales, notify_sale_min, notify_summary, summary_hour, notify_reminder, reminder_hour, notify_barber_changes, email_staff_daily, email_staff_monthly, google_review_url, instagram_url, google_maps_url, timezone, day_start_hour, currency, currency_minor, locale, phone_country, bill_prefix, brand_color, " +
  "wa_bill_auto, wa_bill_template, wa_bill_pdf_template, wa_reminder_enabled, wa_reminder_days, wa_reminder_hour, wa_reminder_template, wa_language, wa_feedback_enabled, wa_feedback_delay_min, wa_feedback_template, wa_feedback_reminder_min, wa_feedback_reminder_template, wa_rating_image_url, wa_rating_reminder_image_url, wa_fresh_cut_image_url";

const quick = (csv: string): number[] =>
  csv.split(",").map(Number).filter((n) => Number.isFinite(n) && n > 0);

/** A row of SETTINGS_COLS plus logo_v (org_assets logo version) and slug, as Settings. */
export function toSettings(r: Record<string, any>): Settings {
  return {
    display_name: r.display_name,
    salon_name_ar: r.salon_name_ar,
    tagline: r.tagline,
    address: r.address,
    phone: r.contact_phone,
    licence_no: r.licence_no,
    trn: r.trn,
    vat_enabled: r.vat_enabled === 1,
    vat_rate: r.vat_rate,
    default_commission_pct: r.default_commission_pct,
    quick_amounts: quick(r.quick_amounts),
    thank_you_text: r.thank_you_text,
    receipt_footer: r.receipt_footer,
    notify_sales: r.notify_sales === 1,
    notify_sale_min: r.notify_sale_min,
    notify_summary: r.notify_summary === 1,
    summary_hour: r.summary_hour,
    notify_reminder: r.notify_reminder === 1,
    reminder_hour: r.reminder_hour,
    notify_barber_changes: r.notify_barber_changes === 1,
    email_staff_daily: r.email_staff_daily !== 0,
    email_staff_monthly: r.email_staff_monthly !== 0,
    google_review_url: r.google_review_url,
    instagram_url: r.instagram_url,
    google_maps_url: r.google_maps_url ?? null,
    timezone: r.timezone,
    day_start_hour: r.day_start_hour,
    currency: r.currency,
    currency_minor: r.currency_minor,
    locale: r.locale,
    phone_country: r.phone_country,
    bill_prefix: r.bill_prefix,
    wa_bill_auto: r.wa_bill_auto === 1,
    wa_bill_template: r.wa_bill_template,
    wa_bill_pdf_template: r.wa_bill_pdf_template,
    wa_reminder_enabled: r.wa_reminder_enabled === 1,
    wa_reminder_days: r.wa_reminder_days,
    wa_reminder_hour: r.wa_reminder_hour,
    wa_reminder_template: r.wa_reminder_template,
    wa_language: r.wa_language,
    wa_feedback_enabled: r.wa_feedback_enabled === 1,
    wa_feedback_delay_min: r.wa_feedback_delay_min,
    wa_feedback_template: r.wa_feedback_template,
    wa_feedback_reminder_min: r.wa_feedback_reminder_min,
    wa_feedback_reminder_template: r.wa_feedback_reminder_template,
    wa_rating_image_url: r.wa_rating_image_url,
    wa_rating_reminder_image_url: r.wa_rating_reminder_image_url,
    wa_fresh_cut_image_url: r.wa_fresh_cut_image_url,
    logo_url: logoUrl(r.logo_v, r.slug),
    brand_color: r.brand_color,
  };
}

/**
 * Settings as the API returns them (GET/PUT /api/settings and /api/me): plus wa_ready = the org has the whatsapp
 * feature and a connected number. Only that boolean leaves org_whatsapp; never the token or token_enc.
 */
export async function withWaReady(db: D1Database, orgId: string, features: readonly string[], s: Settings): Promise<SettingsResponse> {
  const wa_ready = features.includes("whatsapp") && (await settingsRepo(db, orgId).hasWhatsappConfig());
  return { ...s, wa_ready };
}

/** What a new salon has set up yet (the dashboard's setup checklist). */
export interface SetupStatus {
  logo: boolean;
  services: boolean;
  staff: boolean;
  vat: boolean;
  google_review: boolean;
  /** The salon's address and phone are filled in (they print on every bill). */
  details: boolean;
}

export function settingsRepo(db: D1Database, orgId: string) {
  /** The setup checklist in one statement. */
  async function setup(): Promise<SetupStatus> {
    const r = await db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM org_assets WHERE org_id = ?1 AND kind = 'logo') AS logo,
                (SELECT COUNT(*) FROM services WHERE org_id = ?1) AS services,
                (SELECT COUNT(*) FROM users WHERE org_id = ?1 AND role != 'owner') AS staff,
                vat_enabled AS vat, google_review_url AS google,
                (coalesce(trim(address), '') != '' AND coalesce(trim(contact_phone), '') != '') AS details
         FROM org_settings WHERE org_id = ?1`,
      )
      .bind(orgId)
      .first<{ logo: number; services: number; staff: number; vat: number; google: string | null; details: number }>();
    return { logo: !!r?.logo, services: !!r?.services, staff: !!r?.staff, vat: !!r?.vat, google_review: !!r?.google, details: !!r?.details };
  }

  async function get(): Promise<Settings> {
    // logo_url is derived from the org_assets version (the old org_settings.logo_url column is unused).
    const r = await db
      .prepare(
        `SELECT ${SETTINGS_COLS}, (SELECT v FROM org_assets WHERE org_id = ?1 AND kind = 'logo') AS logo_v, (SELECT slug FROM orgs WHERE id = ?1) AS slug
         FROM org_settings WHERE org_id = ?1`,
      )
      .bind(orgId)
      .first<Record<string, any>>();
    if (!r) throw new Error(`org_settings missing for ${orgId}`);
    return toSettings(r);
  }

  const editable = (s: Settings): SettingsInput => {
    const { currency_minor: _m, logo_url: _l, brand_color: _b, ...rest } = s;
    return rest;
  };

  return {
    setup,
    get,
    /** True when the org has a WhatsApp number connected (an org_whatsapp row); the feature check is the caller's. */
    async hasWhatsappConfig(): Promise<boolean> {
      return !!(await db.prepare("SELECT 1 AS x FROM org_whatsapp WHERE org_id = ?").bind(orgId).first());
    },
    /** Replaces the editable set and writes the audit row in one batch. Returns the stored settings. */
    async update(next: SettingsInput, actor: { id: number; name: string }): Promise<Settings> {
      const before = editable(await get());
      const n = next;
      await db.batch([
        db
          .prepare(
            `UPDATE org_settings SET display_name = ?, salon_name_ar = ?, tagline = ?, address = ?, contact_phone = ?, licence_no = ?, trn = ?,
               vat_enabled = ?, vat_rate = ?, default_commission_pct = ?, quick_amounts = ?, thank_you_text = ?, receipt_footer = ?,
               notify_sales = ?, notify_sale_min = ?, notify_summary = ?, summary_hour = ?, notify_reminder = ?, reminder_hour = ?,
               notify_barber_changes = ?, email_staff_daily = ?, email_staff_monthly = ?, google_review_url = ?, instagram_url = ?, google_maps_url = ?, timezone = ?, day_start_hour = ?, currency = ?,
               locale = ?, phone_country = ?, bill_prefix = ?,
               wa_bill_auto = ?, wa_bill_template = ?, wa_bill_pdf_template = ?, wa_reminder_enabled = ?, wa_reminder_days = ?,
               wa_reminder_hour = ?, wa_reminder_template = ?, wa_language = ?, wa_feedback_enabled = ?, wa_feedback_delay_min = ?,
               wa_feedback_template = ?, wa_feedback_reminder_min = ?, wa_feedback_reminder_template = ?, wa_rating_image_url = ?,
               wa_rating_reminder_image_url = ?, wa_fresh_cut_image_url = ?, updated_at = ?
             WHERE org_id = ?`,
          )
          .bind(
            n.display_name, n.salon_name_ar, n.tagline, n.address, n.phone, n.licence_no, n.trn,
            n.vat_enabled ? 1 : 0, n.vat_rate, n.default_commission_pct, n.quick_amounts.join(","), n.thank_you_text, n.receipt_footer,
            n.notify_sales ? 1 : 0, n.notify_sale_min, n.notify_summary ? 1 : 0, n.summary_hour, n.notify_reminder ? 1 : 0, n.reminder_hour,
            n.notify_barber_changes ? 1 : 0, n.email_staff_daily ? 1 : 0, n.email_staff_monthly ? 1 : 0, n.google_review_url, n.instagram_url, n.google_maps_url, n.timezone, n.day_start_hour, n.currency,
            n.locale, n.phone_country, n.bill_prefix,
            n.wa_bill_auto ? 1 : 0, n.wa_bill_template, n.wa_bill_pdf_template, n.wa_reminder_enabled ? 1 : 0, n.wa_reminder_days,
            n.wa_reminder_hour, n.wa_reminder_template, n.wa_language, n.wa_feedback_enabled ? 1 : 0, n.wa_feedback_delay_min,
            n.wa_feedback_template, n.wa_feedback_reminder_min, n.wa_feedback_reminder_template, n.wa_rating_image_url,
            n.wa_rating_reminder_image_url, n.wa_fresh_cut_image_url, Date.now(),
            orgId,
          ),
        auditRepo(db, orgId).stmt({ actor, entity: "settings", entityId: 1, ref: "Settings", action: "update", before, after: n }),
      ]);
      return get();
    },
  };
}
