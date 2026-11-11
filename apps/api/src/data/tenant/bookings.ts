import { DEFAULT_HOURS, type Busy, type WeekHours } from "../../lib/slots";

export interface BookingSettingsRow {
  hours: WeekHours;
  slot_min: number;
  lead_min: number;
  days_ahead: number;
  default_duration: number;
  durations: Record<string, number>;
  staff: number[] | null;
  notify_email: string | null;
  site_origins: string[];
  wa_template: string | null;
  updated_at: number;
}

export type BookingStatus = "confirmed" | "completed" | "no_show" | "cancelled";

export interface BookedService {
  id: number;
  name: string;
  price: number;
  minutes: number;
}

export interface BookingRow {
  id: number;
  ref: string;
  token: string;
  staff_id: number;
  day: string;
  start_min: number;
  end_min: number;
  services: BookedService[];
  total: number;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  note: string | null;
  status: BookingStatus;
  source: "website" | "manual";
  created_at: number;
  updated_at: number;
}

export interface BookingInsert {
  ref: string;
  token: string;
  staff_id: number;
  day: string;
  start_min: number;
  end_min: number;
  services: BookedService[];
  total: number;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  note: string | null;
  source: "website" | "manual";
  created_by: number | null;
}

export const BOOKING_DEFAULTS: BookingSettingsRow = {
  hours: DEFAULT_HOURS,
  slot_min: 30,
  lead_min: 60,
  days_ahead: 30,
  default_duration: 60,
  durations: {},
  staff: null,
  notify_email: null,
  site_origins: [],
  wa_template: null,
  updated_at: 0,
};

const json = <T>(s: string | null, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

type RawSettings = Omit<BookingSettingsRow, "hours" | "durations" | "staff" | "site_origins"> & { hours: string; durations: string; staff: string | null; site_origins: string | null };
type RawBooking = Omit<BookingRow, "services"> & { services: string };

const COLS = "id, ref, token, staff_id, day, start_min, end_min, services, total, customer_name, customer_phone, customer_email, note, status, source, created_at, updated_at";
const toRow = (r: RawBooking): BookingRow => ({ ...r, services: json<BookedService[]>(r.services, []) });

/** Every query here is scoped by org_id; test/sql-guard.test.ts enforces it. */
export function bookingsRepo(db: D1Database, orgId: string) {
  return {
    async settings(): Promise<BookingSettingsRow> {
      const r = await db
        .prepare("SELECT hours, slot_min, lead_min, days_ahead, default_duration, durations, staff, notify_email, site_origins, wa_template, updated_at FROM booking_settings WHERE org_id = ?")
        .bind(orgId)
        .first<RawSettings>();
      if (!r) return BOOKING_DEFAULTS;
      return {
        ...r,
        hours: json<WeekHours>(r.hours, DEFAULT_HOURS),
        durations: json<Record<string, number>>(r.durations, {}),
        staff: json<number[] | null>(r.staff, null),
        site_origins: (r.site_origins ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      };
    },

    async saveSettings(s: BookingSettingsRow, at: number): Promise<void> {
      await db
        .prepare(
          `INSERT INTO booking_settings (org_id, hours, slot_min, lead_min, days_ahead, default_duration, durations, staff, notify_email, site_origins, wa_template, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (org_id) DO UPDATE SET hours = excluded.hours, slot_min = excluded.slot_min, lead_min = excluded.lead_min,
             days_ahead = excluded.days_ahead, default_duration = excluded.default_duration, durations = excluded.durations,
             staff = excluded.staff, notify_email = excluded.notify_email, site_origins = excluded.site_origins,
             wa_template = excluded.wa_template, updated_at = excluded.updated_at`,
        )
        .bind(
          orgId,
          JSON.stringify(s.hours),
          s.slot_min,
          s.lead_min,
          s.days_ahead,
          s.default_duration,
          JSON.stringify(s.durations),
          s.staff ? JSON.stringify(s.staff) : null,
          s.notify_email,
          s.site_origins.length ? s.site_origins.join(",") : null,
          s.wa_template,
          at,
        )
        .run();
    },

    /** One day's confirmed bookings (the busy times). Index bookings_day: a few rows read. */
    async busy(day: string): Promise<Busy[]> {
      const r = await db
        .prepare("SELECT staff_id, start_min, end_min FROM bookings WHERE org_id = ? AND day = ? AND status = 'confirmed'")
        .bind(orgId, day)
        .all<Busy>();
      return r.results;
    },

    /**
     * Inserts the booking unless that person already has a confirmed booking overlapping it (one statement, so two
     * clients racing for the same slot cannot both win). Null when the slot was taken.
     */
    async insert(b: BookingInsert, at: number): Promise<BookingRow | null> {
      const r = await db
        .prepare(
          `INSERT INTO bookings (org_id, ref, token, staff_id, day, start_min, end_min, services, total, customer_name, customer_phone, customer_email, note, status, source, created_by, created_at, updated_at)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?
           WHERE NOT EXISTS (SELECT 1 FROM bookings WHERE org_id = ? AND day = ? AND staff_id = ? AND status = 'confirmed' AND start_min < ? AND end_min > ?)
           RETURNING ${COLS}`,
        )
        .bind(
          orgId, b.ref, b.token, b.staff_id, b.day, b.start_min, b.end_min, JSON.stringify(b.services), b.total, b.customer_name, b.customer_phone,
          b.customer_email, b.note, b.source, b.created_by, at, at,
          orgId, b.day, b.staff_id, b.end_min, b.start_min,
        )
        .first<RawBooking>();
      return r ? toRow(r) : null;
    },

    async list(from: string, to: string, staffId: number | null): Promise<BookingRow[]> {
      const r = await db
        .prepare(`SELECT ${COLS} FROM bookings WHERE org_id = ? AND day BETWEEN ? AND ?${staffId ? " AND staff_id = ?" : ""} ORDER BY day, start_min, id LIMIT 500`)
        .bind(...(staffId ? [orgId, from, to, staffId] : [orgId, from, to]))
        .all<RawBooking>();
      return r.results.map(toRow);
    },

    async byId(id: number): Promise<BookingRow | null> {
      const r = await db.prepare(`SELECT ${COLS} FROM bookings WHERE org_id = ? AND id = ?`).bind(orgId, id).first<RawBooking>();
      return r ? toRow(r) : null;
    },

    async byToken(token: string): Promise<BookingRow | null> {
      const r = await db.prepare(`SELECT ${COLS} FROM bookings WHERE org_id = ? AND token = ?`).bind(orgId, token).first<RawBooking>();
      return r ? toRow(r) : null;
    },

    async setStatus(id: number, status: BookingStatus, at: number): Promise<boolean> {
      const r = await db.prepare("UPDATE bookings SET status = ?, updated_at = ? WHERE org_id = ? AND id = ?").bind(status, at, orgId, id).run();
      return r.meta.changes > 0;
    },

    /** Upcoming confirmed bookings from `day` on: the dashboard badge. */
    async upcomingCount(day: string): Promise<number> {
      const r = await db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE org_id = ? AND day >= ? AND status = 'confirmed'").bind(orgId, day).first<{ n: number }>();
      return r?.n ?? 0;
    },
  };
}
