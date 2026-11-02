/**
 * Formatting for the UI, per salon. Money arrives as integer minor units of the salon's currency
 * (settings.currency_minor per major unit); days are YYYY-MM-DD in the salon's time zone.
 * AuthProvider calls setFormat(settings) after every /api/me, so plain calls like money(x) use the signed-in salon.
 */
import { COUNTRIES, type Country } from "./phone-countries";

export interface FormatConfig {
  currency: string; // ISO 4217, e.g. "INR"
  minor: number; // minor units per major unit: 100, 1000, 1
  locale: string;
  timezone: string; // IANA
  dayStartHour: number; // the business day starts at this local hour
  phoneCountry: string; // calling code digits
}

type SettingsLike = { currency: string; currency_minor: number; locale: string; timezone: string; day_start_hour: number; phone_country: string };

const DEFAULT: FormatConfig = { currency: "", minor: 100, locale: "en-GB", timezone: "UTC", dayStartHour: 0, phoneCountry: "" };
let cfg: FormatConfig = DEFAULT;
let nf: { whole: Intl.NumberFormat; frac: Intl.NumberFormat } | null = null;

export function setFormat(s: SettingsLike | FormatConfig | null): void {
  if (!s) cfg = DEFAULT;
  else if ("currency_minor" in s)
    cfg = { currency: s.currency, minor: s.currency_minor || 1, locale: s.locale || "en-GB", timezone: s.timezone || "UTC", dayStartHour: s.day_start_hour ?? 0, phoneCountry: s.phone_country ?? "" };
  else cfg = s;
  nf = null;
}
export function getFormat(): FormatConfig {
  return cfg;
}

/** Decimal places of the salon currency: 100 -> 2, 1000 -> 3, 1 -> 0. */
export function minorDigits(minor = cfg.minor): number {
  return Math.max(0, Math.round(Math.log10(minor || 1)));
}

function fmts() {
  if (!nf) {
    const d = minorDigits();
    let locale = cfg.locale;
    try {
      new Intl.NumberFormat(locale);
    } catch {
      locale = "en-GB";
    }
    nf = {
      whole: new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: d }),
      frac: new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d }),
    };
  }
  return nf;
}

/** 2500 -> "INR 25", 2550 -> "INR 25.50" (for a 2-decimal currency). */
export function money(minorUnits: number): string {
  const v = minorUnits / cfg.minor;
  const body = Number.isInteger(v) ? fmts().whole.format(v) : fmts().frac.format(v);
  return cfg.currency ? `${cfg.currency} ${body}` : body;
}

/** The currency code for labels ("Price (INR)"). */
export function currencyCode(): string {
  return cfg.currency;
}

/** Bare number for dense tables: 2500 -> "25", 2550 -> "25.5". 0 -> "–" when `dash`. */
export function num(minorUnits: number, dash = false): string {
  if (dash && !minorUnits) return "–";
  return fmts().whole.format(minorUnits / cfg.minor);
}

/** VAT inside a VAT-inclusive total; `ratePct` is a percent (5 = 5%). Same rounding as the API's vatOf. */
export function includedVat(totalMinor: number, ratePct: number): number {
  return ratePct ? Math.round((totalMinor * ratePct) / (100 + ratePct)) : 0;
}

/** Fixed decimals, no grouping or code, for bill tables: 2550 -> "25.50". */
export function fixed(minorUnits: number): string {
  return (minorUnits / cfg.minor).toFixed(minorDigits());
}

/** Major-unit value for a form field: 2550 -> "25.5". */
export function toInput(minorUnits: number): string {
  return String(minorUnits / cfg.minor);
}

/** A typed major-unit amount -> integer minor units ("25.5" -> 2550). NaN when not a number. */
export function fromInput(text: string): number {
  const v = Number(String(text).trim());
  return Number.isFinite(v) ? Math.round(v * cfg.minor) : NaN;
}

/** Wall-clock parts of an instant in the salon zone. */
function wall(ms: number, tz = cfg.timezone) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms));
  const get = (t: string) => p.find((x) => x.type === t)!.value;
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

/** Calendar YYYY-MM-DD of an instant in the salon zone. */
export function zoneDay(ms: number): string {
  return wall(ms).day;
}

function prevDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * The business day an instant belongs to (same rule as the API's clock): before day_start_hour local wall time it is
 * still the previous date. Wall-time based, so DST changes don't shift the boundary.
 */
export function businessDay(ms: number): string {
  const w = wall(ms);
  return w.hour < cfg.dayStartHour ? prevDay(w.day) : w.day;
}

/** The API's business day from the last /api/me (its clock wins over a wrong device clock) and when it arrived. */
let serverToday: { day: string; at: number } | null = null;
const SERVER_TODAY_TTL = 3 * 3_600_000;
export function setServerToday(day: string | null): void {
  serverToday = day ? { day, at: Date.now() } : null;
}

/** Today as the salon counts it: the API's answer while fresh, else computed from the device clock in the salon zone. */
export function businessToday(): string {
  if (serverToday && Date.now() - serverToday.at < SERVER_TODAY_TTL) return serverToday.day;
  return businessDay(Date.now());
}

function utcDate(day: string) {
  return new Date(`${day}T00:00:00Z`);
}

/** "Wed 21 Oct". */
export function dayLabel(day: string): string {
  return utcDate(day).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/** "21 Oct 2026". */
export function dateLabel(day: string): string {
  return utcDate(day).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** "October 2026". */
export function monthLabel(month: string): string {
  return utcDate(`${month}-01`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** "Oct". */
export function monthShort(month: string): string {
  return utcDate(`${month}-01`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
}

/** Salon clock time "14:05" for an epoch-ms instant. */
export function timeLabel(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: cfg.timezone });
}

/** Salon date-time "21 Oct 2026, 14:05". */
export function dateTimeLabel(ms: number): string {
  return new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: cfg.timezone });
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/** "0501234567" -> "050 123 4567" (local numbers the API keeps for some countries); others unchanged. */
export function phoneLabel(p: string | null): string {
  if (!p) return "";
  if (/^05\d{8}$/.test(p)) return `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}`;
  return p;
}

/** Canonical phone -> digits for wa.me. Local numbers ("0…") belong to the salon's own country. */
export function whatsappDigits(phone: string): string {
  return phone.startsWith("+") ? phone.slice(1) : `${cfg.phoneCountry}${phone.replace(/^0/, "")}`;
}

/** Fills {name} {amount} {salon} {link} {barber} in the thank-you template. */
export function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

export function pctLabel(p: number): string {
  return `${Number.isInteger(p) ? p : p.toFixed(2).replace(/0$/, "")}%`;
}

// ---------- phone input ----------

export { COUNTRIES, countriesFor, type Country } from "./phone-countries";

/** Digits of what was typed, without a leading national 0. */
function nationalDigits(raw: string) {
  return raw.replace(/\D/g, "").replace(/^0+/, "");
}

/**
 * Checks a phone typed into the field. Empty is fine (the phone is optional).
 * Returns the full international number to send ("+919876543210") or an error to show.
 */
export function checkPhone(cc: string, raw: string): { value: string | null; error: string | null } {
  if (!raw.trim()) return { value: null, error: null };
  const country: Country = COUNTRIES.find((c) => c.code === cc) ?? COUNTRIES[COUNTRIES.length - 1];
  let n = nationalDigits(raw);
  if (country.code) {
    // People often paste the full number: drop a repeated country code.
    if (n.startsWith(country.code) && !country.test(n) && country.test(n.slice(country.code.length))) n = n.slice(country.code.length);
    if (!country.test(n)) return { value: null, error: `Not a valid ${country.label.split(" +")[0]} mobile. Example: ${country.example}` };
    return { value: `+${country.code}${n}`, error: null };
  }
  if (!country.test(n)) return { value: null, error: "Type the full number with country code, e.g. +44 7700 900123" };
  return { value: `+${n}`, error: null };
}

/** Canonical stored phone ("0501234567" local, or "+919876543210") -> country code + national digits for the field. */
export function splitPhone(p: string | null): { cc: string; local: string } {
  if (!p) return { cc: cfg.phoneCountry, local: "" };
  if (p.startsWith("0")) return { cc: cfg.phoneCountry, local: p.slice(1) };
  const digits = p.replace(/\D/g, "");
  const country = COUNTRIES.filter((c) => c.code && digits.startsWith(c.code)).sort((a, b) => b.code.length - a.code.length)[0];
  return country ? { cc: country.code, local: digits.slice(country.code.length) } : { cc: "", local: digits };
}
