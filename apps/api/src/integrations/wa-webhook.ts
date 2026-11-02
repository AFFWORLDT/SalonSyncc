import { Hono } from "hono";
import type { AppEnv, Env } from "../env";
import { safeEqual } from "../core/crypto";
import { computeFeatures } from "../core/features-cache";
import { platformRepo, type WebhookOrg } from "../data/platform";
import { waMessagesRepo } from "../data/tenant";
import { FREE_STMTS, meteredEnv } from "../lib/metered";
import { canonicalPhone } from "../lib/phone";
import { validSignature, webhookEvents, type WaStatusEvent } from "../lib/whatsapp";

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

/**
 * Free-plan statement cap (I3): FREE_STMTS per request whatever the payload size, metered (lib/metered). Per number:
 * the org lookup 1 (org, calling code and feature inputs in one statement), its STOPs 1 (one json_each UPDATE), its
 * receipts at most 3 (one json_each UPDATE per kind). Opt-outs go first, for every number, before any receipt (RF3:
 * a STOP must never be lost to a receipt flood). Receipts then take what is left, number by number; whatever does
 * not fit is dropped with a console.error of how many (Meta gets 200 either way: receipts are informational).
 */
async function processPayload(rawEnv: Env, payload: unknown): Promise<void> {
  const budget = { stmts: FREE_STMTS };
  const env = meteredEnv(rawEnv, budget);
  const groups = [...changesByNumber(payload)]
    .map(([id, changes]) => ({ id, ...webhookEvents({ entry: [{ changes }] }) }))
    .filter((g) => g.statuses.length || g.optOuts.length);
  const orgs = new Map<string, WebhookOrg | null>();
  const orgOf = async (id: string): Promise<WebhookOrg | null> => {
    if (!orgs.has(id)) {
      const w = await platformRepo(env.DB).webhookOrg(id);
      const ok =
        w && w.org.status !== "deactivated" && w.org.status !== "deleted" && computeFeatures(w.org, w.planFeatures, w.limits, w.overrides).features.includes("whatsapp");
      orgs.set(id, ok ? w : null);
    }
    return orgs.get(id)!;
  };
  const lookupCost = (id: string) => (orgs.has(id) ? 0 : 1);

  // Pass 1: every number's STOPs (lookup + 1).
  for (const g of groups) {
    if (!g.optOuts.length) continue;
    if (budget.stmts < lookupCost(g.id) + 1) {
      console.error(`wa webhook: statement cap reached, ${g.optOuts.length} opt-outs for ${g.id} not applied`);
      continue;
    }
    try {
      const w = await orgOf(g.id);
      if (!w) continue;
      const phones = g.optOuts.map((p) => canonicalPhone(p, w.phoneCountry)).filter((p): p is string => !!p);
      if (phones.length) await waMessagesRepo(env.DB, w.org.id).optOutStatement(phones).run();
    } catch (e) {
      console.error(`wa webhook: opt-out for ${g.id} failed`, e);
    }
  }

  // Pass 2: receipts, as far as the cap allows.
  for (const g of groups) {
    if (!g.statuses.length) continue;
    try {
      if (budget.stmts < lookupCost(g.id) + 1) {
        console.error(`wa webhook: statement cap reached, ${g.statuses.length} status updates dropped for ${g.id}`);
        continue;
      }
      const w = await orgOf(g.id);
      if (!w) continue;
      const all = waMessagesRepo(env.DB, w.org.id).statusStatements(g.statuses);
      const fit = all.slice(0, Math.max(0, budget.stmts));
      const dropped = all.slice(fit.length).reduce((n, x) => n + x.n, 0);
      if (dropped) console.error(`wa webhook: statement cap reached, ${dropped} status updates dropped for ${g.id}`);
      if (!fit.length) continue;
      const res = await env.DB.batch(fit.map((x) => x.stmt));
      const fi = fit.findIndex((x) => x.kind === "failed");
      if (fi >= 0) warnUnmatchedFailures(g.statuses, res[fi]!);
    } catch (e) {
      console.error(`wa webhook: change for ${g.id} failed`, e);
    }
  }
}

/**
 * M5, accepted race: a campaign send's wa_messages result row (carrying its wa_id) is written with the NEXT send's
 * round trip (jobs/wa-jobs drainCampaign), so a very fast "failed" receipt can arrive before its wa_id is stored, match
 * no row, and the message keeps showing "sent". Moving the write earlier would double the statements per send, so the
 * race is only logged here, with the wa_id, for support to trace.
 */
function warnUnmatchedFailures(statuses: WaStatusEvent[], res: D1Result): void {
  const matched = new Set((res.results as { wa_id: string }[]).map((r) => r.wa_id));
  for (const s of statuses) {
    if (s.status === "failed" && !matched.has(s.wa_id)) console.warn(`wa webhook: failed status matched no message (wa_id ${s.wa_id})`);
  }
}
