/**
 * WhatsApp Cloud API pure helpers (ported from FM api/src/whatsapp.ts). No I/O, no env.
 * Business-started messages use Meta-approved templates whose blanks ({{1}} or {{contact_name}}, in the text header or
 * the body) are filled per send. The Graph client is integrations/wa-client.ts; per-org credentials are data/tenant/whatsapp.ts.
 * FM's PROD_URL / rateLinkSuffix (staging forwarding) are deliberately not ported.
 */
import type { WaParam, WaSlot } from "@ss/contract";
import type { OrgClock } from "./clock";
import { firstName } from "./names";
import { whatsappDigits } from "./phone";

export { firstName };

/** How many blanks the body has: the highest {{n}}. */
export function templateVars(body: string): number {
  let max = 0;
  for (const m of body.matchAll(/\{\{(\d+)\}\}/g)) max = Math.max(max, Number(m[1]));
  return max;
}

const BLANK = /\{\{\s*(\d+|[a-z_][a-z0-9_]*)\s*\}\}/g;

/** The blanks of one part: {{1}}…{{n}} when numbered (up to the highest), otherwise each {{name}} once, in order. */
function partSlots(part: WaSlot["part"], text: string): WaSlot[] {
  const keys = Array.from(text.matchAll(BLANK), (m) => m[1]!);
  if (keys.some((k) => /^\d+$/.test(k))) return Array.from({ length: templateVars(text) }, (_, i) => ({ part, key: String(i + 1) }));
  return [...new Set(keys)].map((key) => ({ part, key, named: true as const }));
}

/** Every blank to fill when sending: the header's (its text blanks, or one media slot), then the body's. */
export function templateSlots(header: string | null, body: string, media?: WaSlot["media"]): WaSlot[] {
  const head: WaSlot[] = media ? [{ part: "header", key: "media", media }] : partSlots("header", header ?? "");
  return [...head, ...partSlots("body", body)];
}

/**
 * A stored phone as the digits Meta wants. Canonical phones (lib/phone) are "+<digits>" or, for the org's own
 * calling code, a national number with a leading 0; loosely typed input (spaces, 00 prefix) is tolerated too.
 */
export function waRecipient(phone: string, callingCode: string): string {
  const p = phone.trim();
  if (p.startsWith("+")) return p.slice(1).replace(/\D/g, "");
  const d = p.replace(/\D/g, "");
  if (d.startsWith("00")) return d.slice(2);
  if (d.startsWith("0")) return whatsappDigits(d, callingCode);
  return d;
}

/** True when `phone` may be messaged: no test list means everyone, otherwise only listed numbers (per org). */
export function allowedRecipient(testNumbers: string | null | undefined, phone: string, callingCode: string): boolean {
  const list = (testNumbers ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!list.length) return true;
  const to = waRecipient(phone, callingCode);
  return list.some((n) => waRecipient(n, callingCode) === to);
}

/**
 * One filled blank. A plain string is a numbered body value (bills, reminders and older campaigns); a button
 * value is the text appended to that button's link.
 */
export type WaValue = string | (WaSlot & { text: string; filename?: string }) | { part: "button"; index: number; text: string };

function parts(at: number, clock: OrgClock, locale: string): Record<string, string> {
  const opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "2-digit", month: "2-digit", year: "2-digit", hour: "numeric", minute: "2-digit", hour12: true, timeZone: clock.timezone };
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat(locale, opts);
  } catch {
    fmt = new Intl.DateTimeFormat("en-GB", opts);
  }
  return Object.fromEntries(fmt.formatToParts(at).map((x) => [x.type, x.value]));
}

/** "Thursday, 29-10-26, 12:01 PM" in the org's timezone and locale: the visit as the rating messages show it. */
export function visitTime(at: number, clock: OrgClock, locale: string): string {
  const p = parts(at, clock, locale);
  return `${p.weekday}, ${p.day}-${p.month}-${p.year}, ${p.hour}:${p.minute} ${String(p.dayPeriod ?? "").toUpperCase()}`.trimEnd();
}

/** The values for one recipient, each kept in its slot. Meta rejects empty parameters, so a blank becomes "-". */
export function bodyParams(spec: WaParam[], customerName: string | null): WaValue[] {
  return spec.map((p) => {
    const text = ("customer_name" in p && p.customer_name ? firstName(customerName) : (p as { text: string }).text.trim()) || "-";
    if (!p.part || !p.key) return text;
    return { part: p.part, key: p.key, ...(p.named ? { named: true as const } : {}), ...(p.media ? { media: p.media } : {}), text };
  });
}

/**
 * Graph's `components` for the values: a header and/or body entry, then button entries. Named blanks carry
 * parameter_name; a media header carries the media id, or a link (with the file name for a document).
 */
export function templateComponents(values: WaValue[]): Record<string, unknown>[] {
  const out: Record<WaSlot["part"], Record<string, unknown>[]> = { header: [], body: [] };
  const buttons: Record<string, unknown>[] = [];
  for (const v of values) {
    if (typeof v !== "string" && v.part === "button") {
      buttons.push({ type: "button", sub_type: "url", index: String(v.index), parameters: [{ type: "text", text: v.text }] });
      continue;
    }
    const o: WaSlot & { text: string; filename?: string } = typeof v === "string" ? { part: "body", key: "", text: v } : v;
    if (o.media) {
      const ref = /^https?:\/\//.test(o.text) ? { link: o.text } : { id: o.text };
      out[o.part].push({ type: o.media, [o.media]: { ...ref, ...(o.filename ? { filename: o.filename } : {}) } });
    } else out[o.part].push(o.named ? { type: "text", parameter_name: o.key, text: o.text } : { type: "text", text: o.text });
  }
  return [...(["header", "body"] as const).filter((p) => out[p].length).map((p) => ({ type: p, parameters: out[p] })), ...buttons];
}

/** The text as the customer will read it: numbered blanks from a list, named ones from a map. */
export function previewText(text: string, params: string[] | Record<string, string>): string {
  return text.replace(BLANK, (all, k: string) => (Array.isArray(params) ? params[Number(k) - 1] : params[k]) ?? all);
}

// ---------- webhook (Meta -> us) ----------

export type WaStatusEvent = { wa_id: string; status: "delivered" | "read" | "failed"; at: number; error: string | null };

/**
 * Reads Meta's webhook payload: delivery updates for messages we sent ("sent" is already known and skipped), and
 * customers who replied STOP / tapped a "Stop promotions" button (as +<digits>). Malformed input is ignored, never thrown.
 */
export function webhookEvents(payload: unknown): { statuses: WaStatusEvent[]; optOuts: string[] } {
  const statuses: WaStatusEvent[] = [];
  const optOuts: string[] = [];
  const entries = (payload as { entry?: unknown })?.entry;
  if (!Array.isArray(entries)) return { statuses, optOuts };
  for (const e of entries) {
    const changes = (e as { changes?: unknown })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const ch of changes) {
      const v = (ch as { value?: { statuses?: unknown; messages?: unknown } })?.value;
      for (const s of Array.isArray(v?.statuses) ? v.statuses : []) {
        const st = s as { id?: string; status?: string; timestamp?: string; errors?: { code?: number; title?: string; message?: string }[] };
        if (!st.id || (st.status !== "delivered" && st.status !== "read" && st.status !== "failed")) continue;
        const err = st.errors?.[0];
        statuses.push({
          wa_id: st.id,
          status: st.status,
          at: Number(st.timestamp) * 1000 || Date.now(),
          error: st.status === "failed" ? `${err?.title || err?.message || "Not delivered"}${err?.code ? ` (${err.code})` : ""}` : null,
        });
      }
      for (const m of Array.isArray(v?.messages) ? v.messages : []) {
        const msg = m as { from?: string; text?: { body?: string }; button?: { text?: string } };
        const said = (msg.text?.body ?? msg.button?.text ?? "").trim().toLowerCase();
        if (msg.from && /^(stop|unsubscribe)\b/.test(said)) optOuts.push(`+${msg.from.replace(/\D/g, "")}`);
      }
    }
  }
  return { statuses, optOuts };
}

/** Checks Meta's X-Hub-Signature-256 (HMAC-SHA256 of the raw body with the app secret), in constant time. */
export async function validSignature(appSecret: string, rawBody: string, header: string | undefined): Promise<boolean> {
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  const hex = Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
  const given = header.slice(7);
  if (given.length !== hex.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}
