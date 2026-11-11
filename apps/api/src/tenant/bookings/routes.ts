import { Hono, type Context } from "hono";
import type { AppEnv, Env } from "../../env";
import { HttpError } from "../../core/errors";
import { isAdmin, requireAdmin } from "../../core/roles";
import { requireFeature } from "../../core/pipeline";
import { featuresFor } from "../../core/features-cache";
import { resolvePublicOrg, publicRateLimit } from "../../core/public";
import { orgAppUrl } from "../../core/links";
import { randomToken } from "../../core/crypto";
import { services as svc } from "../../core/services";
import type { Org } from "../../data/platform";
import {
  bookingsRepo,
  notificationsRepo,
  servicesRepo,
  settingsRepo,
  usersRepo,
  type BookedService,
  type BookingRow,
  type BookingSettingsRow,
  type BookingStatus,
} from "../../data/tenant";
import { canonicalPhone, whatsappDigits } from "../../lib/phone";
import { moneyText } from "../../lib/money";
import { allowedRecipient } from "../../lib/whatsapp";
import { anyFree, daysBetween, freeSlots, hhmm, isDay, localNow, parseHhmm, pickStaff, type WeekHours } from "../../lib/slots";
import { notifyUsers } from "../notifications/notify";
import { waSetup } from "../whatsapp/ready";
import { bookingConfirmEmail, newBookingEmail, type BookingEmailData } from "../../emails/booking";
import type { Settings } from "@ss/contract";

const bad = (m: string) => new HttpError(400, m);
const FEATURE = "online_bookings";
const STATUSES: BookingStatus[] = ["confirmed", "completed", "no_show", "cancelled"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(v: unknown, max: number): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().replace(/\s+/g, " ").slice(0, max);
  return s || null;
}

async function body(c: Context<AppEnv>): Promise<Record<string, unknown>> {
  try {
    const b = await c.req.json();
    if (b && typeof b === "object" && !Array.isArray(b)) return b as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  throw bad("Send the details as JSON");
}

// ---------------------------------------------------------------------------------------------------------------
// Shared: who can be booked, what can be booked, and the free times.
// ---------------------------------------------------------------------------------------------------------------

interface Catalog {
  bs: BookingSettingsRow;
  s: Settings;
  staff: { id: number; name: string; role: string; avatar: string | null }[];
  services: { id: number; category: string; name: string; description: string | null; price: number; minutes: number }[];
}

/** Settings, bookable staff (active; the chosen list, else every active barber) and active services with durations. 4 small reads. */
async function catalog(db: D1Database, orgId: string): Promise<Catalog> {
  const [bs, s, users, list] = await Promise.all([bookingsRepo(db, orgId).settings(), settingsRepo(db, orgId).get(), usersRepo(db, orgId).list(), servicesRepo(db, orgId).list(false)]);
  const active = users.filter((u) => u.active);
  const chosen = bs.staff ? bs.staff.map((id) => active.find((u) => u.id === id)).filter((u) => !!u) : active.filter((u) => u.role === "barber");
  return {
    bs,
    s,
    staff: chosen.map((u) => ({ id: u.id, name: u.name, role: u.role, avatar: u.avatar_v > 0 ? `/api/public/avatar/${u.id}/${u.avatar_v}` : null })),
    services: list.map((r) => ({ id: r.id, category: r.category, name: r.name, description: r.description, price: r.price, minutes: bs.durations[String(r.id)] ?? bs.default_duration })),
  };
}

/** The booking window for `day`: null when it is outside [today, today + days_ahead]. `earliest` is set for today. */
function window(cat: Catalog, day: string, at: number): { earliest?: number } | null {
  const now = localNow(at, cat.s.timezone);
  const ahead = daysBetween(now.day, day);
  if (ahead < 0 || ahead > cat.bs.days_ahead) return null;
  return ahead === 0 ? { earliest: now.minute + cat.bs.lead_min } : {};
}

function pickServices(cat: Catalog, raw: unknown): BookedService[] {
  const ids = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  const picked = [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 6);
  const out = picked.map((id) => cat.services.find((x) => x.id === id)).filter((x) => !!x);
  if (!out.length || out.length !== picked.length) throw bad("Choose at least one service");
  return out.map((x) => ({ id: x.id, name: x.name, price: x.price, minutes: x.minutes }));
}

const minutesOf = (list: BookedService[]) => list.reduce((n, x) => n + x.minutes, 0);

const whenText = (b: Pick<BookingRow, "day" | "start_min">, locale: string) => {
  const d = new Date(`${b.day}T00:00:00Z`).toLocaleDateString(locale || "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const h = Math.floor(b.start_min / 60);
  const m = b.start_min % 60;
  return `${d}, ${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h >= 12 ? "pm" : "am"}`;
};

type StaffOf = (id: number) => { name: string; avatar: string | null };
const toApi = (b: BookingRow, staffOf: StaffOf, cc: string) => ({
  id: b.id,
  ref: b.ref,
  staff_id: b.staff_id,
  staff_name: staffOf(b.staff_id).name,
  staff_avatar: staffOf(b.staff_id).avatar,
  day: b.day,
  start: hhmm(b.start_min),
  end: hhmm(b.end_min),
  services: b.services,
  total: b.total,
  customer_name: b.customer_name,
  customer_phone: b.customer_phone,
  customer_wa: whatsappDigits(b.customer_phone, cc),
  customer_email: b.customer_email,
  note: b.note,
  status: b.status,
  source: b.source,
  created_at: b.created_at,
});

const REF_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const newRef = () => "B" + Array.from(crypto.getRandomValues(new Uint8Array(6)), (x) => REF_CHARS[x % REF_CHARS.length]).join("");

interface CreateInput {
  staff: number | "any";
  day: string;
  start: number;
  services: BookedService[];
  name: string;
  phone: string;
  email: string | null;
  note: string | null;
}

/** Validates the request against the catalogue and the free times, then inserts. 409 when the time is no longer free. */
async function createBooking(env: Env, orgId: string, cat: Catalog, i: CreateInput, at: number, source: "website" | "manual", by: number | null, ignoreWindow = false): Promise<BookingRow> {
  const minutes = minutesOf(i.services);
  const repo = bookingsRepo(env.DB, orgId);
  const busy = await repo.busy(i.day);
  let staffIds = cat.staff.map((x) => x.id);
  if (i.staff !== "any") {
    if (!staffIds.includes(i.staff)) throw bad("Choose who you'd like to book with");
    staffIds = [i.staff];
  }
  let staffId: number | null;
  if (ignoreWindow) {
    // A manual booking from the salon: any time of day, only the overlap check applies.
    staffId = i.staff === "any" ? staffIds[0] ?? null : i.staff;
  } else {
    const w = window(cat, i.day, at);
    if (!w) throw bad("Choose a date within the booking window");
    const per = freeSlots({ day: i.day, hours: cat.bs.hours, step: cat.bs.slot_min, minutes, staff: staffIds, busy, earliest: w.earliest });
    staffId = pickStaff(per, i.start, busy);
  }
  if (!staffId) throw new HttpError(409, "That time was just taken. Please choose another time.");
  for (let n = 0; n < 3; n++) {
    const row = await repo.insert(
      {
        ref: newRef(),
        token: randomToken(18),
        staff_id: staffId,
        day: i.day,
        start_min: i.start,
        end_min: i.start + minutes,
        services: i.services,
        total: i.services.reduce((t, x) => t + x.price, 0),
        customer_name: i.name,
        customer_phone: i.phone,
        customer_email: i.email,
        note: i.note,
        source,
        created_by: by,
      },
      at,
    ).catch((e: Error) => {
      if (/UNIQUE/i.test(e.message)) return "retry" as const; // ref collision: try another
      throw e;
    });
    if (row === "retry") continue;
    if (!row) throw new HttpError(409, "That time was just taken. Please choose another time.");
    return row;
  }
  throw new HttpError(503, "Please try again");
}

/** New booking: bell + push to owners/admins and the booked person, email to the salon and the client, WhatsApp to the client. Never throws. */
async function announce(env: Env, org: Org, cat: Catalog, b: BookingRow, notifyStaff: boolean): Promise<void> {
  try {
    const staffName = cat.staff.find((x) => x.id === b.staff_id)?.name ?? "Any";
    const when = whenText(b, cat.s.locale);
    const total = moneyText(b.total, cat.s);
    const salonName = cat.s.display_name || org.name;
    const appUrl = orgAppUrl(env, org);
    const data: BookingEmailData = {
      brand: env.BRAND_NAME,
      siteUrl: env.ROOT_DOMAIN ? `https://${env.ROOT_DOMAIN}` : appUrl,
      salonName,
      ref: b.ref,
      when,
      staff: staffName,
      services: b.services.map((x) => x.name),
      total,
      customerName: b.customer_name,
      customerPhone: b.customer_phone,
      customerEmail: b.customer_email,
      note: b.note,
    };
    const jobs: Promise<unknown>[] = [];
    if (notifyStaff) {
      const ids = await notificationsRepo(env.DB, org.id).adminIds();
      jobs.push(notifyUsers(env, org.id, [...ids, b.staff_id], { title: `New booking: ${b.customer_name}`, body: `${when} · ${data.services.join(", ")} · ${staffName}`, path: "/bookings/", tag: `booking-${b.id}` }));
      const owner = await env.DB.prepare("SELECT owner_email FROM orgs WHERE id = ?").bind(org.id).first<{ owner_email: string | null }>();
      const to = cat.bs.notify_email || owner?.owner_email;
      const mails = [];
      if (to) mails.push(newBookingEmail(to, data, appUrl));
      if (b.customer_email) mails.push(bookingConfirmEmail(b.customer_email, data, `${appUrl}/book/?t=${b.token}`, cat.s.phone));
      if (mails.length) jobs.push(svc(env).mail.sendBatch(env, mails));
    }
    if (cat.bs.wa_template) {
      jobs.push(
        (async () => {
          const cfg = await waSetup(env, org);
          if (!cfg || !allowedRecipient(cfg.testNumbers, b.customer_phone, cfg.callingCode)) return;
          await svc(env).wa.sendTemplate(cfg, b.customer_phone, cat.bs.wa_template!, cat.s.wa_language, [b.customer_name.split(" ")[0], salonName, when, data.services.join(", ")]);
        })(),
      );
    }
    await Promise.all(jobs);
  } catch (err) {
    console.error("booking announce failed", err);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Public: the salon's website (and the booking page on the salon's own host). No session.
// ---------------------------------------------------------------------------------------------------------------

export const bookingPublic = new Hono<AppEnv>();

/** CORS: the salon's own host is same-origin; another origin must be one of the salon's site_origins. */
function allowOrigin(c: Context<AppEnv>, origins: string[]): void {
  const o = c.req.header("Origin");
  if (o && origins.includes(o.replace(/\/+$/, ""))) {
    c.header("Access-Control-Allow-Origin", o);
    c.header("Vary", "Origin");
  }
}

async function publicOrg(c: Context<AppEnv>): Promise<Org> {
  const org = await resolvePublicOrg(c);
  if (!org || !(await featuresFor(c.env.DB, org)).features.includes(FEATURE)) throw new HttpError(404, "Not found");
  return org;
}

bookingPublic.options("*", async (c) => {
  const org = await resolvePublicOrg(c);
  const origins = org ? (await bookingsRepo(c.env.DB, org.id).settings()).site_origins : [];
  const o = c.req.header("Origin")?.replace(/\/+$/, "");
  const h: Record<string, string> = { "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400", Vary: "Origin" };
  if (o && origins.includes(o)) h["Access-Control-Allow-Origin"] = o;
  return new Response(null, { status: 204, headers: h });
});

/** What can be booked: salon, hours, staff, services with prices and durations. */
bookingPublic.get("/config", publicRateLimit("pub"), async (c) => {
  const org = await publicOrg(c);
  const cat = await catalog(c.env.DB, org.id);
  allowOrigin(c, cat.bs.site_origins);
  c.header("Cache-Control", "public, max-age=60");
  const now = localNow(Date.now(), cat.s.timezone);
  return c.json({
    salon: { name: cat.s.display_name || org.name, phone: cat.s.phone, address: cat.s.address, currency: cat.s.currency, currency_minor: cat.s.currency_minor },
    today: now.day,
    days_ahead: cat.bs.days_ahead,
    hours: cat.bs.hours.map((h) => (h ? { open: hhmm(h[0]), close: hhmm(h[1]) } : null)),
    staff: cat.staff.map(({ id, name, avatar }) => ({ id, name, avatar })),
    services: cat.services,
  });
});

/** Free start times on one day for the chosen services, per person and for "Any". */
bookingPublic.get("/slots", publicRateLimit("pub"), async (c) => {
  const org = await publicOrg(c);
  const cat = await catalog(c.env.DB, org.id);
  allowOrigin(c, cat.bs.site_origins);
  const day = c.req.query("day");
  if (!isDay(day)) throw bad("Choose a date");
  const minutes = minutesOf(pickServices(cat, c.req.query("services")));
  const w = window(cat, day, Date.now());
  const staffQ = c.req.query("staff");
  const ids = staffQ && staffQ !== "any" ? cat.staff.filter((x) => x.id === Number(staffQ)).map((x) => x.id) : cat.staff.map((x) => x.id);
  if (!w || !ids.length) return c.json({ day, times: [], staff: {} });
  const per = freeSlots({ day, hours: cat.bs.hours, step: cat.bs.slot_min, minutes, staff: ids, busy: await bookingsRepo(c.env.DB, org.id).busy(day), earliest: w.earliest });
  c.header("Cache-Control", "no-store");
  return c.json({ day, minutes, times: anyFree(per).map(hhmm), staff: Object.fromEntries([...per].map(([id, ts]) => [id, ts.map(hhmm)])) });
});

/** Books a time. Rate-limited per IP; a filled-in `website` field (hidden on the form) is a bot and is dropped. */
bookingPublic.post("/", publicRateLimit("book"), async (c) => {
  const org = await publicOrg(c);
  const cat = await catalog(c.env.DB, org.id);
  allowOrigin(c, cat.bs.site_origins);
  const b = await body(c);
  if (clean(b.website, 200)) return c.json({ ok: true, ref: newRef() }, 201);
  const day = b.day;
  if (!isDay(day)) throw bad("Choose a date");
  const start = parseHhmm(b.time);
  if (start === null) throw bad("Choose a time");
  const name = clean(b.name, 80);
  if (!name) throw bad("Enter your name");
  const phone = canonicalPhone(b.phone, cat.s.phone_country);
  if (!phone) throw bad("Enter a valid mobile number");
  const email = clean(b.email, 120);
  if (email && !EMAIL_RE.test(email)) throw bad("Enter a valid email, or leave it empty");
  const staff = b.staff === "any" || b.staff === undefined || b.staff === null || b.staff === "" ? ("any" as const) : Number(b.staff);
  const row = await createBooking(c.env, org.id, cat, { staff, day, start, services: pickServices(cat, b.services), name, phone, email, note: clean(b.note, 300) }, Date.now(), "website", null);
  c.executionCtx.waitUntil(announce(c.env, org, cat, row, true));
  const staffName = cat.staff.find((x) => x.id === row.staff_id)?.name ?? "";
  return c.json({ ok: true, ref: row.ref, token: row.token, day: row.day, time: hhmm(row.start_min), staff: staffName, total: row.total, services: row.services.map((x) => x.name) }, 201);
});

/** The client's booking by its link token (view page). */
bookingPublic.get("/b/:token", publicRateLimit("pub"), async (c) => {
  const org = await publicOrg(c);
  const b = await bookingsRepo(c.env.DB, org.id).byToken(c.req.param("token"));
  if (!b) throw new HttpError(404, "Booking not found");
  const cat = await catalog(c.env.DB, org.id);
  c.header("Cache-Control", "no-store");
  return c.json({
    ref: b.ref,
    salon: cat.s.display_name || org.name,
    phone: cat.s.phone,
    when: whenText(b, cat.s.locale),
    day: b.day,
    time: hhmm(b.start_min),
    staff: cat.staff.find((x) => x.id === b.staff_id)?.name ?? "",
    services: b.services.map((x) => x.name),
    total: b.total,
    currency: cat.s.currency,
    currency_minor: cat.s.currency_minor,
    status: b.status,
    can_cancel: b.status === "confirmed" && window(cat, b.day, Date.now()) !== null,
  });
});

/** The client cancels from their link (a confirmed booking that hasn't passed). Tells the salon. */
bookingPublic.post("/b/:token/cancel", publicRateLimit("book"), async (c) => {
  const org = await publicOrg(c);
  const repo = bookingsRepo(c.env.DB, org.id);
  const b = await repo.byToken(c.req.param("token"));
  if (!b) throw new HttpError(404, "Booking not found");
  if (b.status !== "confirmed") return c.json({ ok: true, status: b.status });
  await repo.setStatus(b.id, "cancelled", Date.now());
  const ids = await notificationsRepo(c.env.DB, org.id).adminIds();
  c.executionCtx.waitUntil(notifyUsers(c.env, org.id, [...ids, b.staff_id], { title: `Booking cancelled: ${b.customer_name}`, body: `${b.ref} · ${b.day} ${hhmm(b.start_min)}`, path: "/bookings/", tag: `booking-${b.id}` }));
  return c.json({ ok: true, status: "cancelled" });
});

// ---------------------------------------------------------------------------------------------------------------
// Tenant: the Bookings page and its settings (/api/bookings…).
// ---------------------------------------------------------------------------------------------------------------

export const bookings = new Hono<AppEnv>();
bookings.use("*", requireFeature(FEATURE));

const staffNameFn = async (c: Context<AppEnv>): Promise<StaffOf> => {
  const users = await usersRepo(c.env.DB, c.var.tenant.org.id).list();
  return (id: number) => {
    const u = users.find((x) => x.id === id);
    return { name: u?.name ?? "Former staff", avatar: u && u.avatar_v > 0 ? `/api/public/avatar/${u.id}/${u.avatar_v}` : null };
  };
};

/** Bookings between two days (admins: everyone's; staff: their own). */
bookings.get("/", async (c) => {
  const s = await settingsRepo(c.env.DB, c.var.tenant.org.id).get();
  const today = localNow(Date.now(), s.timezone).day;
  const from = c.req.query("from") ?? today;
  const to = c.req.query("to") ?? from;
  if (!isDay(from) || !isDay(to) || to < from || daysBetween(from, to) > 92) throw bad("Choose a date range up to 3 months");
  const u = c.var.tenant.user;
  const rows = await bookingsRepo(c.env.DB, c.var.tenant.org.id).list(from, to, isAdmin(u) ? null : u.id);
  const name = await staffNameFn(c);
  return c.json({ today, items: rows.map((b) => toApi(b, name, s.phone_country)) });
});

/** The settings page: rules, durations per service, who takes bookings, plus the lists to choose from. */
bookings.get("/settings", requireAdmin, async (c) => {
  const orgId = c.var.tenant.org.id;
  const cat = await catalog(c.env.DB, orgId);
  const [users, list] = await Promise.all([usersRepo(c.env.DB, orgId).list(), servicesRepo(c.env.DB, orgId).list(false)]);
  return c.json({
    hours: cat.bs.hours.map((h) => (h ? { open: hhmm(h[0]), close: hhmm(h[1]) } : null)),
    slot_min: cat.bs.slot_min,
    lead_min: cat.bs.lead_min,
    days_ahead: cat.bs.days_ahead,
    default_duration: cat.bs.default_duration,
    durations: cat.bs.durations,
    staff: cat.bs.staff,
    notify_email: cat.bs.notify_email,
    site_origins: cat.bs.site_origins,
    wa_template: cat.bs.wa_template,
    booking_url: `${orgAppUrl(c.env, c.var.tenant.org)}/book/`,
    api_base: `${orgAppUrl(c.env, c.var.tenant.org)}/api/public/booking`,
    all_staff: users.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name, role: u.role })),
    services: list.map((r) => ({ id: r.id, category: r.category, name: r.name, price: r.price })),
  });
});

const intIn = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};

bookings.put("/settings", requireAdmin, async (c) => {
  const orgId = c.var.tenant.org.id;
  const repo = bookingsRepo(c.env.DB, orgId);
  const cur = await repo.settings();
  const b = await body(c);
  let hours: WeekHours = cur.hours;
  if (b.hours !== undefined) {
    if (!Array.isArray(b.hours) || b.hours.length !== 7) throw bad("Set hours for all 7 days");
    hours = b.hours.map((h, i) => {
      if (!h) return null;
      const o = parseHhmm((h as { open?: unknown }).open);
      const cl = parseHhmm((h as { close?: unknown }).close);
      if (o === null || cl === null || cl <= o) throw bad(`Check the opening hours for day ${i + 1}`);
      return [o, cl] as [number, number];
    });
  }
  const durations: Record<string, number> = {};
  if (b.durations && typeof b.durations === "object") {
    for (const [k, v] of Object.entries(b.durations as Record<string, unknown>)) {
      const n = Number(v);
      if (/^\d+$/.test(k) && Number.isInteger(n) && n >= 5 && n <= 600) durations[k] = n;
    }
  }
  const users = await usersRepo(c.env.DB, orgId).list();
  const staff = Array.isArray(b.staff) ? [...new Set(b.staff.map(Number))].filter((id) => users.some((u) => u.id === id && u.active)) : b.staff === null ? null : cur.staff;
  const email = b.notify_email === undefined ? cur.notify_email : clean(b.notify_email, 120);
  if (email && !EMAIL_RE.test(email)) throw bad("Enter a valid alert email, or leave it empty");
  const origins = Array.isArray(b.site_origins)
    ? b.site_origins
        .map((o) => String(o).trim().replace(/\/+$/, ""))
        .filter((o) => /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(o))
        .slice(0, 5)
    : cur.site_origins;
  const next: BookingSettingsRow = {
    hours,
    slot_min: intIn(b.slot_min, 5, 120, cur.slot_min),
    lead_min: intIn(b.lead_min, 0, 2880, cur.lead_min),
    days_ahead: intIn(b.days_ahead, 1, 120, cur.days_ahead),
    default_duration: intIn(b.default_duration, 5, 600, cur.default_duration),
    durations: b.durations === undefined ? cur.durations : durations,
    staff,
    notify_email: email,
    site_origins: origins,
    wa_template: b.wa_template === undefined ? cur.wa_template : clean(b.wa_template, 120),
    updated_at: Date.now(),
  };
  await repo.saveSettings(next, next.updated_at);
  return c.json({ ok: true });
});

/** The salon adds a booking (phone call, walk-in later today). Any time of day; only the overlap check applies. */
bookings.post("/", requireAdmin, async (c) => {
  const org = c.var.tenant.org;
  const cat = await catalog(c.env.DB, org.id);
  const b = await body(c);
  const day = b.day;
  if (!isDay(day)) throw bad("Choose a date");
  const start = parseHhmm(b.time);
  if (start === null) throw bad("Choose a time");
  const name = clean(b.name, 80);
  if (!name) throw bad("Enter the client's name");
  const phone = canonicalPhone(b.phone, cat.s.phone_country);
  if (!phone) throw bad("Enter a valid mobile number");
  const staffId = Number(b.staff);
  const users = await usersRepo(c.env.DB, org.id).list();
  if (!users.some((u) => u.id === staffId && u.active)) throw bad("Choose who the booking is with");
  // The salon may book anyone active, not only the online list.
  const withStaff: Catalog = { ...cat, staff: users.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name, role: u.role, avatar: null })) };
  const row = await createBooking(c.env, org.id, withStaff, { staff: staffId, day, start, services: pickServices(cat, b.services), name, phone, email: null, note: clean(b.note, 300) }, Date.now(), "manual", c.var.tenant.user.id, true);
  if (cat.bs.wa_template) c.executionCtx.waitUntil(announce(c.env, org, withStaff, row, false));
  const nameOf = await staffNameFn(c);
  return c.json(toApi(row, nameOf, cat.s.phone_country), 201);
});

/** Status changes: completed, no-show, cancelled, or back to confirmed (if the time is still free). */
bookings.patch("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) throw bad("Invalid id");
  const repo = bookingsRepo(c.env.DB, c.var.tenant.org.id);
  const row = await repo.byId(id);
  const u = c.var.tenant.user;
  if (!row || (!isAdmin(u) && row.staff_id !== u.id)) throw new HttpError(404, "Booking not found");
  const b = await body(c);
  const status = b.status as BookingStatus;
  if (!STATUSES.includes(status)) throw bad("Choose a status");
  if (status === "confirmed" && row.status !== "confirmed") {
    const clash = (await repo.busy(row.day)).some((x) => x.staff_id === row.staff_id && x.start_min < row.end_min && x.end_min > row.start_min);
    if (clash) throw new HttpError(409, "That time has been booked by someone else");
  }
  await repo.setStatus(id, status, Date.now());
  return c.json({ ok: true });
});

/** Upcoming confirmed bookings (dashboard badge). */
bookings.get("/count", async (c) => {
  const s = await settingsRepo(c.env.DB, c.var.tenant.org.id).get();
  return c.json({ upcoming: await bookingsRepo(c.env.DB, c.var.tenant.org.id).upcomingCount(localNow(Date.now(), s.timezone).day) });
});

