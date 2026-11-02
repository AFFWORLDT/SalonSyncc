import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../src/index";
import { waWebhook } from "../src/integrations/wa-webhook";
import { makeOrg, makeUser } from "./helpers";
import { waConfigRepo } from "../src/data/tenant";
import type { OrgStatus } from "../src/data/platform";

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const SECRET = "test-wa-app-secret";
const URL_ = "https://x.test/api/wa/webhook";
type E = typeof env;

async function hmac(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return "sha256=" + Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
}
const verify = (qs: string, e: Partial<E> = {}) => app.fetch(new Request(`${URL_}?${qs}`), { ...env, ...e }, ctx);
async function hook(body: unknown, opts: { e?: Partial<E>; sig?: string | null; raw?: string } = {}) {
  const raw = opts.raw ?? JSON.stringify(body);
  const headers: Record<string, string> = { "content-type": "application/json" };
  const sig = opts.sig === undefined ? await hmac(SECRET, raw) : opts.sig;
  if (sig !== null) headers["x-hub-signature-256"] = sig;
  return app.fetch(new Request(URL_, { method: "POST", headers, body: raw }), { ...env, ...opts.e }, ctx);
}

let pnid = 90000000 + Math.floor(Math.random() * 1_000_000);
async function waOrg(slug: string, opts: { plan?: "pro" | "pro_max"; status?: OrgStatus; cc?: string; phone?: string } = {}) {
  const org = await makeOrg({ slug, plan: opts.plan ?? "pro_max", status: opts.status });
  const own = await makeUser(org.id, { username: "own", role: "owner" });
  const phoneNumberId = String(++pnid);
  await waConfigRepo(env.DB, org.id, env.SECRETS_KEY).set({ phoneNumberId, wabaId: "1", token: "EAAtok", testNumbers: null }, { id: own.id, name: "own" });
  if (opts.cc) await env.DB.prepare("UPDATE org_settings SET phone_country = ? WHERE org_id = ?").bind(opts.cc, org.id).run();
  await env.DB.prepare("INSERT INTO customers (org_id, name, phone, created_at) VALUES (?, 'Ali', ?, ?)").bind(org.id, opts.phone ?? "0501234567", Date.now()).run();
  await env.DB.prepare(
    "INSERT INTO wa_messages (org_id, kind, phone, template, status, wa_id, created_at, sent_at) VALUES (?, 'bill', ?, 'ss_bill', 'sent', 'wamid.SAME', ?, ?)",
  ).bind(org.id, opts.phone ?? "0501234567", Date.now(), Date.now()).run();
  return { org, phoneNumberId };
}
const msg = async (orgId: string) => (await env.DB.prepare("SELECT * FROM wa_messages WHERE org_id = ? AND wa_id = 'wamid.SAME'").bind(orgId).first<any>())!;
const optOut = async (orgId: string) => (await env.DB.prepare("SELECT wa_opt_out FROM customers WHERE org_id = ?").bind(orgId).first<any>())!.wa_opt_out;

const change = (phoneNumberId: string, value: Record<string, unknown>) => ({ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: phoneNumberId }, ...value } });
const payload = (...changes: unknown[]) => ({ object: "whatsapp_business_account", entry: [{ id: "waba", changes }] });
const status = (status: string, ts = 1_800_000_000, extra: Record<string, unknown> = {}) => ({ id: "wamid.SAME", status, timestamp: String(ts), ...extra });
const stop = (from: string, body = "STOP") => ({ from, id: "wamid.in", type: "text", text: { body } });

describe("GET /api/wa/webhook (verification)", () => {
  it("echoes the challenge only for subscribe + the right verify token", async () => {
    const ok = await verify("hub.mode=subscribe&hub.verify_token=test-wa-verify-token&hub.challenge=12345");
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("12345");
    for (const qs of [
      "hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345",
      "hub.mode=subscribe&hub.challenge=12345",
      "hub.mode=unsubscribe&hub.verify_token=test-wa-verify-token&hub.challenge=12345",
      "hub.mode=subscribe&hub.verify_token=test-wa-verify-tokenX&hub.challenge=1",
    ]) expect((await verify(qs)).status, qs).toBe(403);
  });
  it("403 when WA_VERIFY_TOKEN is not configured, even for an empty token", async () => {
    expect((await verify("hub.mode=subscribe&hub.verify_token=&hub.challenge=1", { WA_VERIFY_TOKEN: undefined })).status).toBe(403);
    expect((await verify("hub.mode=subscribe&hub.verify_token=test-wa-verify-token&hub.challenge=1", { WA_VERIFY_TOKEN: undefined })).status).toBe(403);
  });
});

describe("POST /api/wa/webhook", () => {
  it("503 without WA_APP_SECRET; 401 for a missing or bad signature; 413 over 1 MB", async () => {
    expect((await hook(payload(), { e: { WA_APP_SECRET: undefined } })).status).toBe(503);
    expect((await hook(payload(), { sig: null })).status).toBe(401);
    expect((await hook(payload(), { sig: await hmac("other-secret", JSON.stringify(payload())) })).status).toBe(401);
    expect((await hook(payload(), { sig: "sha256=deadbeef" })).status).toBe(401);
    const big = JSON.stringify({ pad: "x".repeat(1024 * 1024) });
    expect((await hook(null, { raw: big })).status).toBe(413);
  });

  it("valid signature over unparseable JSON is ignored with 200 ok", async () => {
    const r = await hook(null, { raw: "{not json" });
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("ok");
  });

  it("(RF1) a STOP and a status event from org A's number change only A's rows", async () => {
    const a = await waOrg("wh-rf1-a");
    const b = await waOrg("wh-rf1-b");
    const r = await hook(payload(change(a.phoneNumberId, { statuses: [status("delivered", 1_800_000_000)], messages: [stop("971501234567")] })));
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("ok");
    expect((await msg(a.org.id)).delivered_at).toBe(1_800_000_000_000);
    expect(await optOut(a.org.id)).toBe(1);
    expect((await msg(b.org.id)).delivered_at).toBeNull();
    expect(await optOut(b.org.id)).toBe(0);

    // read keeps the first delivered_at; failed sets status + truncated error; still only A
    await hook(payload(change(a.phoneNumberId, { statuses: [status("read", 1_800_000_100), status("delivered", 1_800_000_200)] })));
    let m = await msg(a.org.id);
    expect(m.delivered_at).toBe(1_800_000_000_000);
    expect(m.read_at).toBe(1_800_000_100_000);
    await hook(payload(change(a.phoneNumberId, { statuses: [status("failed", 1_800_000_300, { errors: [{ code: 131026, title: "E".repeat(400) }] })] })));
    m = await msg(a.org.id);
    expect(m.status).toBe("failed");
    expect(m.error).toHaveLength(300);
    const mb = await msg(b.org.id);
    expect(mb).toMatchObject({ status: "sent", error: null, read_at: null, delivered_at: null });
  });

  it("routes each change of one payload to its own org", async () => {
    const a = await waOrg("wh-multi-a");
    const b = await waOrg("wh-multi-b");
    const c = await waOrg("wh-multi-c");
    await hook(payload(change(a.phoneNumberId, { statuses: [status("read", 1_800_000_000)] }), change(b.phoneNumberId, { messages: [stop("971501234567", "unsubscribe")] })));
    expect((await msg(a.org.id)).read_at).toBe(1_800_000_000_000);
    expect(await optOut(a.org.id)).toBe(0);
    expect((await msg(b.org.id)).read_at).toBeNull();
    expect(await optOut(b.org.id)).toBe(1);
    expect(await optOut(c.org.id)).toBe(0);
    expect((await msg(c.org.id)).read_at).toBeNull();
  });

  it("opt-out matches the org's canonical phone for its calling code", async () => {
    const i = await waOrg("wh-in", { cc: "91", phone: "+919511506049" });
    await hook(payload(change(i.phoneNumberId, { messages: [stop("919511506049", "stop please")] })));
    expect(await optOut(i.org.id)).toBe(1);
  });

  it("unknown number, org without whatsapp, deactivated or deleted org: no-op 200", async () => {
    const victim = await waOrg("wh-noop-v");
    const noWa = await waOrg("wh-noop-pro", { plan: "pro" });
    const off = await waOrg("wh-noop-off", { status: "deactivated" });
    const del = await waOrg("wh-noop-del", { status: "deleted" });
    for (const pn of ["99999999999999", noWa.phoneNumberId, off.phoneNumberId, del.phoneNumberId]) {
      const r = await hook(payload(change(pn, { statuses: [status("delivered")], messages: [stop("971501234567")] })));
      expect(r.status, pn).toBe(200);
      expect(await r.text()).toBe("ok");
    }
    for (const o of [victim, noWa, off, del]) {
      expect((await msg(o.org.id)).delivered_at, o.org.slug).toBeNull();
      expect(await optOut(o.org.id), o.org.slug).toBe(0);
    }
    // a change with no metadata at all is ignored too
    expect((await hook(payload({ field: "messages", value: { statuses: [status("read")] } }))).status).toBe(200);
    expect((await msg(victim.org.id)).read_at).toBeNull();
  });

  it("is mounted outside the tenant router and the public rate limiter", () => {
    expect(waWebhook.routes.some((r) => r.method === "GET")).toBe(true);
    expect(waWebhook.routes.some((r) => r.method === "POST")).toBe(true);
  });
});
