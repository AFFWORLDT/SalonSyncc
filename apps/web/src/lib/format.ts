/** Formatting for the UI. Money arrives as integer fils (AED x 100); days as Dubai YYYY-MM-DD. */

const aedFmt = new Intl.NumberFormat("en-AE", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const aed2Fmt = new Intl.NumberFormat("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 2500 -> "AED 25", 2550 -> "AED 25.50". */
export function aed(fils: number): string {
  const v = fils / 100;
  return `AED ${Number.isInteger(v) ? aedFmt.format(v) : aed2Fmt.format(v)}`;
}

/** Bare number for dense tables: 2500 -> "25", 2550 -> "25.5". 0 -> "–" when `dash`. */
export function num(fils: number, dash = false): string {
  if (dash && !fils) return "–";
  return aedFmt.format(fils / 100);
}

/** AED value for a form field: 2550 -> "25.5". */
export function toInput(fils: number): string {
  return String(fils / 100);
}

const DUBAI = "Asia/Dubai";

/** Dubai YYYY-MM-DD for a moment (ms). */
export function dubaiDay(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: DUBAI }).format(new Date(ms));
}

/** The salon's day starts at 4 AM: a bill at 2 AM on the 27th belongs to the 26th (same rule as the API). */
export const DAY_START_HOUR = 4;

/** The business day a moment belongs to: the Dubai date 4 hours earlier. */
export function businessDay(ms: number): string {
  return dubaiDay(ms - DAY_START_HOUR * 3_600_000);
}

/** Today as the salon counts it (until 4 AM it is still yesterday). */
export function businessToday(): string {
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

/** Dubai clock time "14:05" for an epoch-ms instant. */
export function timeLabel(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: DUBAI });
}

/** Dubai date-time "21 Oct 2026, 14:05". */
export function dateTimeLabel(ms: number): string {
  return new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: DUBAI });
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/** "0501234567" -> "050 123 4567". */
export function phoneLabel(p: string | null): string {
  if (!p) return "";
  if (/^05\d{8}$/.test(p)) return `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}`;
  return p;
}

/** Canonical phone -> digits for wa.me (UAE local numbers get 971). */
export function whatsappDigits(phone: string): string {
  return phone.startsWith("+") ? phone.slice(1) : `971${phone.slice(1)}`;
}

/** Fills {name} {amount} {salon} {link} {barber} in the thank-you template. */
export function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

export function pctLabel(p: number): string {
  return `${Number.isInteger(p) ? p : p.toFixed(2).replace(/0$/, "")}%`;
}

// ---------- phone input ----------

export interface Country {
  code: string; // dial code without +
  label: string;
  /** Validates the national number (digits only, no leading 0). */
  test: (n: string) => boolean;
  example: string;
}

/** UAE first (default), then the countries most customers come from. */
export const COUNTRIES: Country[] = [
  { code: "971", label: "UAE +971", test: (n) => /^5\d{8}$/.test(n) || /^[234679]\d{7}$/.test(n), example: "50 123 4567" },
  { code: "91", label: "India +91", test: (n) => /^[6-9]\d{9}$/.test(n), example: "98765 43210" },
  { code: "92", label: "Pakistan +92", test: (n) => /^3\d{9}$/.test(n), example: "300 1234567" },
  { code: "880", label: "Bangladesh +880", test: (n) => /^1\d{9}$/.test(n), example: "1712 345678" },
  { code: "977", label: "Nepal +977", test: (n) => /^9\d{9}$/.test(n), example: "984 1234567" },
  { code: "94", label: "Sri Lanka +94", test: (n) => /^7\d{8}$/.test(n), example: "71 234 5678" },
  { code: "63", label: "Philippines +63", test: (n) => /^9\d{9}$/.test(n), example: "917 123 4567" },
  { code: "20", label: "Egypt +20", test: (n) => /^1\d{9}$/.test(n), example: "100 123 4567" },
  { code: "966", label: "Saudi +966", test: (n) => /^5\d{8}$/.test(n), example: "50 123 4567" },
  { code: "968", label: "Oman +968", test: (n) => /^[79]\d{7}$/.test(n), example: "9123 4567" },
  { code: "974", label: "Qatar +974", test: (n) => /^[3567]\d{7}$/.test(n), example: "3312 3456" },
  { code: "965", label: "Kuwait +965", test: (n) => /^[569]\d{7}$/.test(n), example: "5012 3456" },
  { code: "973", label: "Bahrain +973", test: (n) => /^3\d{7}$/.test(n), example: "3600 1234" },
  { code: "44", label: "UK +44", test: (n) => /^7\d{9}$/.test(n), example: "7700 900123" },
  { code: "1", label: "USA/Canada +1", test: (n) => /^[2-9]\d{9}$/.test(n), example: "212 555 0123" },
  { code: "", label: "Other (type +code)", test: (n) => /^\d{8,15}$/.test(n), example: "+44 7700 900123" },
];

/** Digits of what was typed, without a leading national 0. */
function nationalDigits(raw: string) {
  return raw.replace(/\D/g, "").replace(/^0+/, "");
}

/**
 * Checks a phone typed into the field. Empty is fine (the phone is optional).
 * Returns the full international number to send ("+971501234567") or an error to show.
 */
export function checkPhone(cc: string, raw: string): { value: string | null; error: string | null } {
  if (!raw.trim()) return { value: null, error: null };
  const country = COUNTRIES.find((c) => c.code === cc) ?? COUNTRIES[COUNTRIES.length - 1];
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

/** Canonical stored phone ("0501234567" or "+919876543210") -> country code + national digits for the field. */
export function splitPhone(p: string | null): { cc: string; local: string } {
  if (!p) return { cc: "971", local: "" };
  if (p.startsWith("0")) return { cc: "971", local: p.slice(1) };
  const digits = p.replace(/\D/g, "");
  const country = COUNTRIES.filter((c) => c.code && digits.startsWith(c.code)).sort((a, b) => b.code.length - a.code.length)[0];
  return country ? { cc: country.code, local: digits.slice(country.code.length) } : { cc: "", local: digits };
}
