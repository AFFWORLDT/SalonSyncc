import { env } from "cloudflare:test";
import { describe, it, expect, vi, afterEach } from "vitest";
import app from "../src/index";
import { waWebhook } from "../src/integrations/wa-webhook";
import { makeOrg, makeUser } from "./helpers";
import { waConfigRepo } from "../src/data/tenant";
import type { OrgStatus } from "../src/data/platform";
import { countingDb } from "./counting-db";
import { invalidateFeatures } from "../src/core/features-cache";

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

describe("I3: the webhook's statements are capped (45) whatever the payload size; opt-outs go first", () => {
  afterEach(() => vi.restoreAllMocks());
  /** `n` sent messages wamid.N<i> in this org. */
  const sentMessages = (orgId: string, n: number) =>
    env.DB.prepare(
      `INSERT INTO wa_messages (org_id, kind, phone, template, status, wa_id, created_at, sent_at)
       WITH RECURSIVE k(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM k WHERE i < ?2) SELECT ?1, 'bill', '0501234567', 't', 'sent', 'wamid.N' || i, 1, 1 FROM k`,
    ).bind(orgId, n).run();
  const counted = async (body: unknown) => {
    const { db, count } = countingDb(env.DB);
    const res = await hook(body, { e: { DB: db } });
    return { res, count };
  };
  const st = (i: number, kind: string, ts: number) => ({ id: `wamid.N${i}`, status: kind, timestamp: String(ts), ...(kind === "failed" ? { errors: [{ code: 1, title: `bad ${i}` }] } : {}) });

  it("200 statuses and 3 STOPs: at most 45 statements, all 3 opt-outs recorded, every status applied", async () => {
    const a = await waOrg("wh-i3-big");
    for (const p of ["0501110001", "0501110002", "0501110003"]) {
      await env.DB.prepare("INSERT INTO customers (org_id, name, phone, created_at) VALUES (?, 'C', ?, 1)").bind(a.org.id, p).run();
    }
    await sentMessages(a.org.id, 200);
    invalidateFeatures(a.org.id);
    const statuses = Array.from({ length: 200 }, (_, i) => st(i + 1, ["delivered", "read", "failed"][i % 3]!, 1_800_000_000 + i));
    const stops = [stop("971501110001"), stop("971501110002", "unsubscribe"), stop("971501110003")];
    const { res, count } = await counted(payload(change(a.phoneNumberId, { statuses, messages: stops })));
    expect(res.status).toBe(200);
    expect(count.statements, `D1 statements (round trips: ${count.calls})`).toBeLessThanOrEqual(45);
    const opted = await env.DB.prepare("SELECT COUNT(*) AS n FROM customers WHERE org_id = ? AND wa_opt_out = 1").bind(a.org.id).first<any>();
    expect(opted.n).toBe(3);
    const rows = (await env.DB.prepare("SELECT wa_id, status, error, delivered_at, read_at FROM wa_messages WHERE org_id = ? AND wa_id LIKE 'wamid.N%'").bind(a.org.id).all<any>()).results;
    const by = new Map(rows.map((r) => [r.wa_id, r]));
    for (let i = 0; i < 200; i++) {
      const r = by.get(`wamid.N${i + 1}`);
      const at = (1_800_000_000 + i) * 1000;
      if (i % 3 === 0) expect(r, `delivered ${i}`).toMatchObject({ status: "sent", delivered_at: at, read_at: null });
      if (i % 3 === 1) expect(r, `read ${i}`).toMatchObject({ status: "sent", delivered_at: at, read_at: at });
      if (i % 3 === 2) expect(r, `failed ${i}`).toMatchObject({ status: "failed", error: `bad ${i + 1} (1)` });
    }
  });

  it("delivered then read in one payload keeps the earlier delivered_at; duplicates keep the first time", async () => {
    const a = await waOrg("wh-i3-order");
    await sentMessages(a.org.id, 1);
    await hook(payload(change(a.phoneNumberId, { statuses: [st(1, "delivered", 1_800_000_000), st(1, "read", 1_800_000_050), st(1, "delivered", 1_800_000_090)] })));
    const r = await env.DB.prepare("SELECT delivered_at, read_at FROM wa_messages WHERE org_id = ? AND wa_id = 'wamid.N1'").bind(a.org.id).first<any>();
    expect(r).toEqual({ delivered_at: 1_800_000_000_000, read_at: 1_800_000_050_000 });
  });

  it("many orgs in one payload: still at most 45 statements, every opt-out applied first, the dropped status updates logged", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const orgs = [];
    for (let i = 0; i < 14; i++) {
      const o = await waOrg(`wh-i3-many-${i}`);
      await sentMessages(o.org.id, 3);
      invalidateFeatures(o.org.id);
      orgs.push(o);
    }
    // Every org gets all three status kinds; the LAST org's change also carries a STOP.
    const changes = orgs.map((o, i) =>
      change(o.phoneNumberId, { statuses: [st(1, "delivered", 1_800_000_000), st(2, "read", 1_800_000_000), st(3, "failed", 1_800_000_000)], ...(i === 13 ? { messages: [stop("971501234567")] } : {}) }),
    );
    const { res, count } = await counted(payload(...changes));
    expect(res.status).toBe(200);
    expect(count.statements, `D1 statements (round trips: ${count.calls})`).toBeLessThanOrEqual(45);
    expect(await optOut(orgs[13]!.org.id)).toBe(1);
    expect(err.mock.calls.some((c) => /status updates? dropped/.test(String(c[0])))).toBe(true);
    // The first orgs' statuses went through.
    const first = await env.DB.prepare("SELECT delivered_at FROM wa_messages WHERE org_id = ? AND wa_id = 'wamid.N1'").bind(orgs[0]!.org.id).first<any>();
    expect(first.delivered_at).toBe(1_800_000_000_000);
  });

  it("M5: a failed status matching no message is warned with its wa_id", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const a = await waOrg("wh-m5");
    await hook(payload(change(a.phoneNumberId, { statuses: [{ id: "wamid.UNKNOWN", status: "failed", timestamp: "1800000000" }, status("failed")] })));
    expect((await msg(a.org.id)).status).toBe("failed");
    const lines = warn.mock.calls.map((c) => c.join(" "));
    expect(lines.some((l) => l.includes("wamid.UNKNOWN"))).toBe(true);
    expect(lines.some((l) => l.includes("wamid.SAME"))).toBe(false);
  });
});
