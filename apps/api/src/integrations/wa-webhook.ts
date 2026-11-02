import { Hono } from "hono";
import type { AppEnv, Env } from "../env";
import { safeEqual } from "../core/crypto";
import { featuresFor } from "../core/features-cache";
import { platformRepo } from "../data/platform";
import { settingsRepo, waMessagesRepo } from "../data/tenant";
import { canonicalPhone } from "../lib/phone";
import { validSignature, webhookEvents } from "../lib/whatsapp";

/**
 * Meta's WhatsApp webhook, one Meta app for every salon (mounted at /api/wa/webhook, no session, outside tenantGuard).
 * GET is the verification handshake (WA_VERIFY_TOKEN must match; FM echoed any challenge). POST carries delivery receipts
 * and replies, signed with WA_APP_SECRET (required). Each change is routed to the org owning its
 * value.metadata.phone_number_id, and every write is scoped to that org (RF1). Once the signature is valid the answer is
 * always 200 "ok" so Meta does not retry; processing errors are logged, never thrown.
 */
export const waWebhook = new Hono<AppEnv>();

const MAX_BODY = 1024 * 1024;

waWebhook.get("/", (c) => {
  const expected = c.env.WA_VERIFY_TOKEN;
  const mode = c.req.query("hub.mode");
  const given = c.req.query("hub.verify_token") ?? "";
  const challenge = c.req.query("hub.challenge") ?? "";
  if (!expected || mode !== "subscribe" || !safeEqual(given, expected)) return c.text("Forbidden", 403);
  return c.text(challenge);
});

waWebhook.post("/", async (c) => {
  const secret = c.env.WA_APP_SECRET;
  if (!secret) return c.text("Webhook not configured", 503);
  const declared = Number(c.req.header("content-length") ?? 0);
  if (declared > MAX_BODY) return c.text("Too large", 413);
  const raw = await c.req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY) return c.text("Too large", 413);
  if (!(await validSignature(secret, raw, c.req.header("x-hub-signature-256")))) return c.text("Bad signature", 401);
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return c.text("ok");
  }
  try {
    await processPayload(c.env, payload);
  } catch (e) {
    console.error("wa webhook: processing failed", e);
  }
  return c.text("ok");
});

/** The changes of a payload grouped by the phone_number_id they came to (changes without one are dropped). */
function changesByNumber(payload: unknown): Map<string, unknown[]> {
  const out = new Map<string, unknown[]>();
  const entries = (payload as { entry?: unknown })?.entry;
  if (!Array.isArray(entries)) return out;
  for (const e of entries) {
    const changes = (e as { changes?: unknown })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const ch of changes) {
      const id = (ch as { value?: { metadata?: { phone_number_id?: unknown } } })?.value?.metadata?.phone_number_id;
      if (typeof id !== "string" && typeof id !== "number") continue;
      const key = String(id);
      if (!key) continue;
      out.set(key, [...(out.get(key) ?? []), ch]);
    }
  }
  return out;
}

async function processPayload(env: Env, payload: unknown): Promise<void> {
  for (const [phoneNumberId, changes] of changesByNumber(payload)) {
    try {
      const org = await platformRepo(env.DB).orgByPhoneNumberId(phoneNumberId);
      if (!org || org.status === "deactivated" || org.status === "deleted") continue;
      if (!(await featuresFor(env.DB, org)).features.includes("whatsapp")) continue;
      const { statuses, optOuts } = webhookEvents({ entry: [{ changes }] });
      if (!statuses.length && !optOuts.length) continue;
      const cc = optOuts.length ? (await settingsRepo(env.DB, org.id).get()).phone_country : "";
      const phones = optOuts.map((p) => canonicalPhone(p, cc)).filter((p): p is string => !!p);
      const stmts = waMessagesRepo(env.DB, org.id).webhookStatements(statuses, phones);
      if (stmts.length) await env.DB.batch(stmts);
    } catch (e) {
      console.error(`wa webhook: change for ${phoneNumberId} failed`, e);
    }
  }
}
