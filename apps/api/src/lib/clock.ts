/**
 * Business-day maths for one org. Pure (Intl only). The day boundary is `dayStartHour` local wall time in the
 * org's IANA timezone, so it stays right across DST; no fixed offsets anywhere.
 */
export interface OrgClock {
  timezone: string;
  dayStartHour: number; // 0..12
}

interface Parts {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string): Intl.DateTimeFormat {
  let f = formatters.get(timezone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    formatters.set(timezone, f);
  }
  return f;
}

function parts(ms: number, timezone: string): Parts {
  const p: Record<string, number> = {};
  for (const x of formatter(timezone).formatToParts(ms)) if (x.type !== "literal") p[x.type] = Number(x.value);
  return { y: p.year!, mo: p.month!, d: p.day!, h: p.hour! % 24, mi: p.minute! };
}

const wallUtc = (p: Parts) => Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi);

/** Zone offset (local minus UTC, ms) in force at an instant, at minute precision. */
function offsetAt(ms: number, timezone: string): number {
  const minute = Math.floor(ms / 60_000) * 60_000;
  return wallUtc(parts(minute, timezone)) - minute;
}

function check(clock: OrgClock): void {
  const h = clock.dayStartHour;
  if (!Number.isInteger(h) || h < 0 || h > 12) throw new RangeError(`dayStartHour must be an integer 0..12, got ${h}`);
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** Same day shifted by `delta` days. */
export function addDays(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** The business day (YYYY-MM-DD) a moment belongs to: before the day-start hour it is still the previous day. */
export function businessDay(ms: number, clock: OrgClock): string {
  check(clock);
  const p = parts(ms, clock.timezone);
  const day = `${pad(p.y, 4)}-${pad(p.mo)}-${pad(p.d)}`;
  return p.h < clock.dayStartHour ? addDays(day, -1) : day;
}

/** Local hour (0..23) of an instant in the org's timezone. */
export function localHour(ms: number, clock: OrgClock): number {
  return parts(ms, clock.timezone).h;
}

/**
 * Epoch ms at which a business day starts: the instant whose local wall time is `day` at dayStartHour:00.
 * In a DST gap (that wall time does not exist) it is the first valid instant after the gap; in an overlap, the earlier one.
 */
export function businessDayStart(day: string, clock: OrgClock): number {
  check(clock);
  const [y, m, d] = day.split("-").map(Number);
  const wall = Date.UTC(y!, m! - 1, d!, clock.dayStartHour, 0);
  const before = offsetAt(wall - 86_400_000, clock.timezone);
  const after = offsetAt(wall + 86_400_000, clock.timezone);
  const valid = [wall - before, wall - after].filter((t) => wallUtc(parts(t, clock.timezone)) === wall);
  if (valid.length) return Math.min(...valid);
  // Gap: find the transition between the two candidates (minute resolution; transitions fall on minutes).
  let lo = Math.min(wall - before, wall - after);
  let hi = Math.max(wall - before, wall - after);
  const base = offsetAt(lo, clock.timezone);
  lo = Math.floor(lo / 60_000);
  hi = Math.floor(hi / 60_000);
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (offsetAt(mid * 60_000, clock.timezone) === base) lo = mid;
    else hi = mid;
  }
  return hi * 60_000;
}

/** YYYYMMDD of a YYYY-MM-DD day (bill-number and counter names). */
export const dayStamp = (day: string): string => day.replaceAll("-", "");

/** Every day of a YYYY-MM month, as YYYY-MM-DD. */
export function daysOfMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const n = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${month}-${pad(i + 1)}`);
}

/** YYYY-MM of the month before. */
export function prevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y! - 1}-12` : `${y}-${pad(m! - 1)}`;
}
