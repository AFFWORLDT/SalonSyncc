/**
 * Online-booking time maths. Pure (Intl only). Times are minutes after the salon's local midnight; days are the
 * salon's local yyyy-mm-dd in its IANA timezone (calendar days, not the sales "business day").
 */

/** Opening hours per weekday, Sunday first: [open, close] in minutes, or null when closed. */
export type WeekHours = ([number, number] | null)[];

export interface Busy {
  staff_id: number;
  start_min: number;
  end_min: number;
}

const fmt = new Map<string, Intl.DateTimeFormat>();

/** The salon's local date and minute of day at `ms`. */
export function localNow(ms: number, timezone: string): { day: string; minute: number } {
  let f = fmt.get(timezone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    fmt.set(timezone, f);
  }
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(ms)) if (x.type !== "literal") p[x.type] = x.value;
  return { day: `${p.year}-${p.month}-${p.day}`, minute: Number(p.hour) * 60 + Number(p.minute) };
}

export const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/** Whole days from `a` to `b` (both yyyy-mm-dd). */
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();

export const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function parseHhmm(s: unknown): number | null {
  if (typeof s !== "string" || !/^\d{1,2}:\d{2}$/.test(s)) return null;
  const [h, m] = s.split(":").map(Number);
  if (h > 24 || m > 59 || h * 60 + m > 1440) return null;
  return h * 60 + m;
}

export interface SlotQuery {
  day: string;
  hours: WeekHours;
  step: number; // minutes between start times
  minutes: number; // length of the booking
  staff: number[]; // who can take it, in order of preference
  busy: Busy[]; // this day's confirmed bookings
  /** When `day` is today: start times before this minute are gone (now + notice). */
  earliest?: number;
}

/** Free start times per staff member for one day. A start is free when the whole booking fits in the opening hours
 * and overlaps none of that person's bookings. */
export function freeSlots(q: SlotQuery): Map<number, number[]> {
  const out = new Map<number, number[]>();
  const open = q.hours[weekday(q.day)];
  if (!open || q.minutes <= 0 || q.step <= 0) return out;
  const [from, to] = open;
  for (const id of q.staff) {
    const mine = q.busy.filter((b) => b.staff_id === id);
    const times: number[] = [];
    for (let t = from; t + q.minutes <= to; t += q.step) {
      if (q.earliest !== undefined && t < q.earliest) continue;
      if (mine.some((b) => t < b.end_min && b.start_min < t + q.minutes)) continue;
      times.push(t);
    }
    out.set(id, times);
  }
  return out;
}

/** Every start time at least one of the staff has free, ascending. */
export function anyFree(per: Map<number, number[]>): number[] {
  return [...new Set([...per.values()].flat())].sort((a, b) => a - b);
}

/** Who takes an "Any stylist" booking at `t`: the free person with the fewest bookings that day, then list order. */
export function pickStaff(per: Map<number, number[]>, t: number, busy: Busy[]): number | null {
  const free = [...per.entries()].filter(([, ts]) => ts.includes(t)).map(([id]) => id);
  if (!free.length) return null;
  const load = (id: number) => busy.filter((b) => b.staff_id === id).length;
  return free.reduce((best, id) => (load(id) < load(best) ? id : best), free[0]);
}

/** Default week for a new salon: 10:00–22:00 every day. */
export const DEFAULT_HOURS: WeekHours = Array.from({ length: 7 }, () => [600, 1320] as [number, number]);
