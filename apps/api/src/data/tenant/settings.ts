import type { Settings, SettingsInput } from "@ss/contract";
import type { OrgClock } from "../../lib/clock";
import { auditRepo } from "./audit";
import { logoUrl } from "./assets";

/** The org's business-day clock from its settings. */
export const clockOf = (s: { timezone: string; day_start_hour: number }): OrgClock => ({
  timezone: s.timezone,
  dayStartHour: s.day_start_hour,
});

const COLS =
  "display_name, salon_name_ar, tagline, address, contact_phone, licence_no, trn, vat_enabled, vat_rate, default_commission_pct, quick_amounts, thank_you_text, receipt_footer, notify_sales, notify_sale_min, notify_summary, summary_hour, notify_reminder, reminder_hour, notify_barber_changes, google_review_url, instagram_url, timezone, day_start_hour, currency, currency_minor, locale, phone_country, bill_prefix, brand_color, " +
  "wa_bill_auto, wa_bill_template, wa_bill_pdf_template, wa_reminder_enabled, wa_reminder_days, wa_reminder_hour, wa_reminder_template, wa_language, wa_feedback_enabled, wa_feedback_delay_min, wa_feedback_template, wa_feedback_reminder_min, wa_feedback_reminder_template, wa_rating_image_url, wa_rating_reminder_image_url, wa_fresh_cut_image_url";

const quick = (csv: string): number[] =>
  csv.split(",").map(Number).filter((n) => Number.isFinite(n) && n > 0);

export function settingsRepo(db: D1Database, orgId: string) {
  async function get(): Promise<Settings> {
    // logo_url is derived from the org_assets version (the old org_settings.logo_url column is unused).
    const r = await db
      .prepare(
        `SELECT ${COLS}, (SELECT v FROM org_assets WHERE org_id = ?1 AND kind = 'logo') AS logo_v, (SELECT slug FROM orgs WHERE id = ?1) AS slug
         FROM org_settings WHERE org_id = ?1`,
      )
      .bind(orgId)
      .first<Record<string, any>>();
    if (!r) throw new Error(`org_settings missing for ${orgId}`);
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
      google_review_url: r.google_review_url,
      instagram_url: r.instagram_url,
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

  const editable = (s: Settings): SettingsInput => {
    const { currency_minor: _m, logo_url: _l, brand_color: _b, ...rest } = s;
    return rest;
  };

  return {
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
               notify_barber_changes = ?, google_review_url = ?, instagram_url = ?, timezone = ?, day_start_hour = ?, currency = ?,
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
            n.notify_barber_changes ? 1 : 0, n.google_review_url, n.instagram_url, n.timezone, n.day_start_hour, n.currency,
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
