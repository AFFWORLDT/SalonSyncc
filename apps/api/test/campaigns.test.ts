import { env } from "cloudflare:test";
import { describe, it, expect, afterEach } from "vitest";
import app from "../src/index";
import { makeOrg, makeUser, loginAs } from "./helpers";
import { fakeServices } from "./fakes";
import { countingDb } from "./counting-db";
import { setServicesForTest, type WaTemplateInfo } from "../src/core/services";
import { waConfigRepo } from "../src/data/tenant";
import { CAMPAIGN_BATCH, drainCampaign } from "../src/jobs/wa-jobs";

const B = CAMPAIGN_BATCH;
const ph = (i: number) => `+9198${String(i).padStart(8, "0")}`;
import { invalidateFeatures } from "../src/core/features-cache";

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const E = { ...env, ROOT_DOMAIN: "", APP_ORIGIN: "https://app.salonstation.test" };
const TOKEN = "EAAGcampaignSECRETtoken1234567890";
const call = (method: string, path: string, cookie: string, body?: unknown) =>
  app.fetch(
    new Request(`https://x.test/api${path}`, {
      method,
      headers: { cookie, ...(body !== undefined && !(body instanceof FormData) ? { "content-type": "application/json" } : {}) },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    }),
    E,
    ctx,
  );
const json = async (r: Response): Promise<any> => r.json();

const TEMPLATES: WaTemplateInfo[] = [
  {
    id: "t1",
    name: "eid_offer",
    status: "APPROVED",
    category: "MARKETING",
    language: "en",
    header: null,
    body: "Hi {{1}}, {{2}} off this Eid",
    vars: 2,
    slots: [{ part: "body", key: "1" }, { part: "body", key: "2" }],
    sendable: true,
  },
  { id: "t2", name: "draft_one", status: "PENDING", category: "MARKETING", language: "en", header: null, body: "Hello", vars: 0, slots: [], sendable: true },
  {
    id: "t3",
    name: "pic_offer",
    status: "APPROVED",
    category: "MARKETING",
    language: "en_US",
    header: null,
    body: "New look {{1}}",
    vars: 2,
    slots: [{ part: "header", key: "media", media: "image" }, { part: "body", key: "1" }],
    sendable: true,
  },
];
const PARAMS = [{ customer_name: true }, { text: "20%" }];

let pnid = 70000000 + Math.floor(Math.random() * 1_000_000);
async function setup(slug: string, opts: { plan?: "pro" | "pro_max"; wa?: boolean; testNumbers?: string | null } = {}) {
  const org = await makeOrg({ slug, plan: opts.plan ?? "pro_max" });
  const own = await makeUser(org.id, { username: "own", role: "owner" });
  await makeUser(org.id, { username: "b1", role: "barber" });
  if (opts.wa !== false) {
    await waConfigRepo(env.DB, org.id, env.SECRETS_KEY).set(
      { phoneNumberId: String(++pnid), wabaId: "123456789", token: TOKEN, testNumbers: opts.testNumbers ?? null },
      { id: own.id, name: "own" },
    );
  }
  return { org, own, ck: await loginAs(slug, "own"), k1: await loginAs(slug, "b1") };
}
/** `n` customers "Cust i" with phones +9198000xxxxx (phone NULL / opted out as asked). */
async function customers(orgId: string, n: number, opts: { from?: number; phone?: boolean; opt?: number } = {}) {
  const from = opts.from ?? 1;
  await env.DB.prepare(
    `INSERT INTO customers (org_id, name, phone, wa_opt_out, created_at)
     WITH RECURSIVE k(i) AS (SELECT ?1 UNION ALL SELECT i + 1 FROM k WHERE i < ?2)
     SELECT ?3, 'Cust ' || i, CASE WHEN ?4 THEN '+9198' || printf('%08d', i) ELSE NULL END, ?5, 1 FROM k`,
  )
    .bind(from, from + n - 1, orgId, opts.phone === false ? 0 : 1, opts.opt ?? 0)
    .run();
}
const messages = async (orgId: string) =>
  (await env.DB.prepare("SELECT * FROM wa_messages WHERE org_id = ? ORDER BY id").bind(orgId).all<any>()).results;

let f = fakeServices();
const install = (opts: Parameters<typeof fakeServices>[0] = {}) => {
  f = fakeServices({ templates: TEMPLATES, ...opts });
  f.install();
  return f;
};
afterEach(() => setServicesForTest(null));

describe("campaign access", () => {
  it("403 for a pro org (no whatsapp_campaigns) on every route, 403 for a barber, 409 when not WA-ready", async () => {
    install();
    const p = await setup("wc-pro", { plan: "pro" });
    const routes: [string, string, unknown?][] = [
      ["GET", "/wa/templates"],
      ["POST", "/wa/templates", { name: "x_y_z", body: "Hi", examples: [] }],
      ["POST", "/wa/test", { to: "+919800000001", template: "eid_offer", params: PARAMS }],
      ["GET", "/wa/audience"],
      ["GET", "/wa/campaigns"],
      ["POST", "/wa/campaigns", { template: "eid_offer", params: PARAMS }],
      ["POST", "/wa/campaigns/1/next"],
      ["POST", "/wa/media", new FormData()],
    ];
    for (const [m, path, body] of routes) {
      const r = await call(m, path, p.ck, body);
      expect(r.status, `${m} ${path}`).toBe(403);
      expect((await json(r)).code).toBe("feature_disabled");
    }
    const a = await setup("wc-bar");
    for (const [m, path, body] of routes) expect((await call(m, path, a.k1, body)).status, `barber ${m} ${path}`).toBe(403);
    const n = await setup("wc-notready", { wa: false });
    for (const [m, path, body] of routes.filter(([, p]) => !p.includes("/next"))) {
      const r = await call(m, path, n.ck, body);
      expect(r.status, `${m} ${path}`).toBe(409);
      expect((await json(r)).code).toBe("wa_not_ready");
    }
    expect(f.wa).toHaveLength(0);
  });
});

describe("templates, audience, test send, media", () => {
  it("lists the org's templates and submits a new one in the org's language (audited)", async () => {
    install();
    const a = await setup("wc-tpl");
    await env.DB.prepare("UPDATE org_settings SET wa_language = 'en_GB' WHERE org_id = ?").bind(a.org.id).run();
    const list = await call("GET", "/wa/templates", a.ck);
    expect(list.status).toBe(200);
    expect((await json(list)).map((t: any) => t.name)).toEqual(["eid_offer", "draft_one", "pic_offer"]);
    expect((await call("POST", "/wa/templates", a.ck, { name: "Eid Offer", body: "Hi {{1}}", examples: [] })).status).toBe(400);
    expect((await call("POST", "/wa/templates", a.ck, { name: "ei", body: "Hi {{1}} there", examples: ["Ali"] })).status).toBe(400); // name too short
    expect((await call("POST", "/wa/templates", a.ck, { name: "eid_2", body: "{{1}} hi", examples: ["Ali"] })).status).toBe(400); // blank at start
    const long = await call("POST", "/wa/templates", a.ck, { name: "eid_3", body: `Hi ${"x".repeat(1024)}`, examples: [] });
    expect(long.status).toBe(400);
    expect((await json(long)).error).toBe("Message too long (max 1024)");
    const r = await call("POST", "/wa/templates", a.ck, { name: "Eid Offer", category: "MARKETING", body: "Hi {{1}}, offer inside", examples: ["Ali"] });
    expect(r.status).toBe(201);
    expect(await json(r)).toMatchObject({ name: "eid_offer", status: "PENDING", language: "en_GB", vars: 1, slots: [{ part: "body", key: "1" }] });
    expect(f.created).toEqual([expect.objectContaining({ name: "eid_offer", language: "en_GB", body: "Hi {{1}}, offer inside", examples: ["Ali"] })]);
    expect(f.created[0]!.cfg.token).toBe(TOKEN);
    const au = await env.DB.prepare("SELECT ref, action FROM audit_log WHERE org_id = ? AND ref LIKE 'WhatsApp template%'").bind(a.org.id).all();
    expect(au.results).toEqual([{ ref: "WhatsApp template eid_offer", action: "create" }]);
  });

  it("audience counts this org's customers with a phone who did not opt out", async () => {
    install();
    const a = await setup("wc-aud");
    const b = await setup("wc-aud-b");
    await customers(a.org.id, 7);
    await customers(a.org.id, 2, { from: 100, opt: 1 });
    await customers(a.org.id, 3, { from: 200, phone: false });
    await customers(b.org.id, 5);
    expect(await json(await call("GET", "/wa/audience", a.ck))).toEqual({ customers: 7 });
  });

  it("test send: canonical phone with the org's calling code, kind test, test list respected", async () => {
    install();
    const a = await setup("wc-test", { testNumbers: "+919811111111" });
    await env.DB.prepare("UPDATE org_settings SET phone_country = '91' WHERE org_id = ?").bind(a.org.id).run();
    expect((await call("POST", "/wa/test", a.ck, { to: "12", template: "eid_offer", params: PARAMS })).status).toBe(400);
    expect((await call("POST", "/wa/test", a.ck, { to: "98111 11111", template: "nope", params: PARAMS })).status).toBe(404);
    expect((await call("POST", "/wa/test", a.ck, { to: "98111 11111", template: "draft_one", params: [] })).status).toBe(400);
    expect((await call("POST", "/wa/test", a.ck, { to: "98111 11111", template: "eid_offer", params: [{ text: "x" }] })).status).toBe(400);
    const r = await call("POST", "/wa/test", a.ck, { to: "98111 11111", template: "eid_offer", params: PARAMS });
    expect(r.status).toBe(200);
    expect(await json(r)).toMatchObject({ kind: "test", phone: "+919811111111", template: "eid_offer", status: "sent" });
    expect(f.wa).toHaveLength(1);
    expect(f.wa[0]).toMatchObject({ phone: "+919811111111", template: "eid_offer", lang: "en" });
    expect(f.wa[0]!.params).toEqual([{ part: "body", key: "1", text: "there" }, { part: "body", key: "2", text: "20%" }]);
    // Off the test list: logged skipped, no Graph call.
    const off = await json(await call("POST", "/wa/test", a.ck, { to: "+919822222222", template: "eid_offer", params: PARAMS }));
    expect(off).toMatchObject({ kind: "test", status: "skipped" });
    expect(f.wa).toHaveLength(1);
    const rows = await messages(a.org.id);
    expect(rows.map((m) => [m.kind, m.phone, m.status, m.created_by])).toEqual([
      ["test", "+919811111111", "sent", a.own.id],
      ["test", "+919822222222", "skipped", a.own.id],
    ]);
  });

  it("media: jpg/png up to 5 MB and mp4 up to 16 MB go to Meta as-is; others are refused", async () => {
    install();
    const a = await setup("wc-media");
    const form = (bytes: number, type: string, name: string) => {
      const fd = new FormData();
      fd.append("file", new File([new Uint8Array(bytes)], name, { type }));
      return fd;
    };
    const ok = await call("POST", "/wa/media", a.ck, form(1000, "image/jpeg", "a.jpg"));
    expect(ok.status).toBe(200);
    expect(await json(ok)).toEqual({ id: expect.stringMatching(/^media_fake/) });
    expect(f.uploads).toHaveLength(1);
    expect(f.uploads[0]!.file).toMatchObject({ name: "a.jpg", type: "image/jpeg", size: 1000 });
    expect(f.uploads[0]!.cfg.token).toBe(TOKEN);
    expect((await call("POST", "/wa/media", a.ck, form(6 * 1024 * 1024, "video/mp4", "v.mp4"))).status).toBe(200);
    expect((await call("POST", "/wa/media", a.ck, form(5 * 1024 * 1024 + 1, "image/png", "big.png"))).status).toBe(400);
    expect((await call("POST", "/wa/media", a.ck, form(100, "image/gif", "a.gif"))).status).toBe(400);
    expect((await call("POST", "/wa/media", a.ck, new FormData())).status).toBe(400);
    expect((await call("POST", "/wa/media", a.ck, { file: "x" })).status).toBe(400);
    expect(f.uploads).toHaveLength(2);
  });
});

describe("campaigns", () => {
  it("create queues exactly the audience (opted-out and phoneless excluded, RF3), audited, no other org touched", async () => {
    install();
    const a = await setup("wc-new");
    const b = await setup("wc-new-b");
    await customers(a.org.id, 12);
    await customers(a.org.id, 3, { from: 100, opt: 1 });
    await customers(a.org.id, 2, { from: 200, phone: false });
    await customers(b.org.id, 4);
    expect((await call("POST", "/wa/campaigns", a.ck, { template: "nope", params: PARAMS })).status).toBe(404);
    expect((await call("POST", "/wa/campaigns", a.ck, { template: "draft_one", params: [] })).status).toBe(400);
    expect((await call("POST", "/wa/campaigns", a.ck, { template: "eid_offer", params: [PARAMS[0]] })).status).toBe(400);
    expect((await call("POST", "/wa/campaigns", a.ck, { template: "pic_offer", params: [{ text: "" }, { text: "x" }] })).status).toBe(400);
    const r = await call("POST", "/wa/campaigns", a.ck, { template: "eid_offer", params: PARAMS });
    expect(r.status).toBe(201);
    const k = await json(r);
    expect(k).toMatchObject({ template: "eid_offer", total: 12, queued: 12, sent: 0, failed: 0, skipped: 0, finished_at: null, created_by_name: "own" });
    const rows = await messages(a.org.id);
    expect(rows).toHaveLength(12);
    expect(rows.every((m) => m.kind === "announcement" && m.status === "queued" && m.campaign_id === k.id && m.sent_at === null)).toBe(true);
    expect(rows.some((m) => m.phone.startsWith("+919800000100"))).toBe(false);
    expect(await messages(b.org.id)).toHaveLength(0);
    const au = await env.DB.prepare("SELECT entity_id, ref FROM audit_log WHERE org_id = ? AND ref LIKE 'WhatsApp announcement%'").bind(a.org.id).all();
    expect(au.results).toEqual([{ entity_id: k.id, ref: "WhatsApp announcement eid_offer" }]);
    expect(f.wa).toHaveLength(0);
    // One unfinished campaign per org at a time.
    const again = await call("POST", "/wa/campaigns", a.ck, { template: "eid_offer", params: PARAMS });
    expect(again.status).toBe(409);
    expect(await json(again)).toEqual({ error: "Finish the current campaign first", code: "campaign_running" });
    expect(await messages(a.org.id)).toHaveLength(12);
    // Listed newest first, this org only.
    await env.DB.prepare("UPDATE wa_campaigns SET finished_at = 1 WHERE org_id = ?").bind(a.org.id).run();
    expect((await call("POST", "/wa/campaigns", a.ck, { template: "eid_offer", params: PARAMS })).status).toBe(201);
    const list = await json(await call("GET", "/wa/campaigns", a.ck));
    expect(list.map((x: any) => x.total)).toEqual([12, 12]);
    expect(list[1].id).toBe(k.id);
    expect(await json(await call("GET", "/wa/campaigns", b.ck))).toEqual([]);
  });

  it("refuses an empty audience and one over 1000 (free-plan cap); nothing is written", async () => {
    install();
    const a = await setup("wc-cap");
    const none = await call("POST", "/wa/campaigns", a.ck, { template: "eid_offer", params: PARAMS });
    expect(none.status).toBe(400);
    expect((await json(none)).error).toBe("No customers to send to");
    await customers(a.org.id, 1001);
    const r = await call("POST", "/wa/campaigns", a.ck, { template: "eid_offer", params: PARAMS });
    expect(r.status).toBe(400);
    expect((await json(r)).error).toBe("Campaigns are limited to 1000 customers on the current plan");
    expect(await messages(a.org.id)).toHaveLength(0);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM wa_campaigns WHERE org_id = ?").bind(a.org.id).first<{ n: number }>())!.n).toBe(0);
  });

  it("/next sends CAMPAIGN_BATCH (15), then the remainder, then finishes; values personalised", async () => {
    install();
    const a = await setup("wc-next");
    expect(B).toBe(15);
    await customers(a.org.id, B + 5);
    const k = await json(await call("POST", "/wa/campaigns", a.ck, { template: "eid_offer", params: PARAMS }));
    const r1 = await json(await call("POST", `/wa/campaigns/${k.id}/next`, a.ck));
    expect(r1).toMatchObject({ id: k.id, total: B + 5, sent: B, queued: 5, finished_at: null });
    expect(f.wa).toHaveLength(B);
    expect(f.wa[0]!.params).toEqual([{ part: "body", key: "1", text: "Cust" }, { part: "body", key: "2", text: "20%" }]);
    expect(f.wa[0]).toMatchObject({ template: "eid_offer", lang: "en" });
    const r2 = await json(await call("POST", `/wa/campaigns/${k.id}/next`, a.ck));
    expect(r2).toMatchObject({ sent: B + 5, queued: 0 });
    expect(r2.finished_at).toEqual(expect.any(Number));
    const r3 = await json(await call("POST", `/wa/campaigns/${k.id}/next`, a.ck));
    expect(r3).toMatchObject({ sent: B + 5, queued: 0, finished_at: r2.finished_at });
    expect(f.wa).toHaveLength(B + 5);
    expect(new Set(f.wa.map((s) => s.phone)).size).toBe(B + 5);
    const rows = await messages(a.org.id);
    expect(rows.every((m) => m.status === "sent" && m.wa_id && m.sent_at && JSON.parse(m.params).length === 2)).toBe(true);
    expect((await call("POST", "/wa/campaigns/999999/next", a.ck)).status).toBe(404);
  });

  it("an opt-out after queueing is skipped at send time (RF3); failures are logged; test list respected", async () => {
    install({ send: (s) => (s.phone === "+919800000003" ? { status: "failed", error: "boom" } : { status: "sent", wa_id: `w${s.phone}` }) });
    const a = await setup("wc-late", { testNumbers: "+919800000001,+919800000002,+919800000003" });
    await customers(a.org.id, 4);
    const k = await json(await call("POST", "/wa/campaigns", a.ck, { template: "eid_offer", params: PARAMS }));
    await env.DB.prepare("UPDATE customers SET wa_opt_out = 1 WHERE org_id = ? AND phone = '+919800000002'").bind(a.org.id).run();
    const r = await json(await call("POST", `/wa/campaigns/${k.id}/next`, a.ck));
    expect(r).toMatchObject({ total: 4, sent: 1, failed: 1, skipped: 2, queued: 0 });
    expect(r.finished_at).toEqual(expect.any(Number));
    expect(f.wa.map((s) => s.phone)).toEqual(["+919800000001", "+919800000003"]);
    const rows = await messages(a.org.id);
    expect(rows.map((m) => [m.phone, m.status, m.error])).toEqual([
      ["+919800000001", "sent", null],
      ["+919800000002", "skipped", "opted out"],
      ["+919800000003", "failed", "boom"],
      ["+919800000004", "skipped", "not in test numbers"],
    ]);
  });

  it("two concurrent /next calls never send the same message twice", async () => {
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    install({ send: async (s) => { await gate; return { status: "sent", wa_id: `w${s.phone}` }; } });
    const a = await setup("wc-race");
    await customers(a.org.id, 2 * B);
    const k = await json(await call("POST", "/wa/campaigns", a.ck, { template: "eid_offer", params: PARAMS }));
    const first = call("POST", `/wa/campaigns/${k.id}/next`, a.ck);
    const until = async (ok: () => boolean) => { for (let i = 0; i < 500 && !ok(); i++) await new Promise((r) => setTimeout(r, 5)); };
    await until(() => f.wa.length >= 1); // the first call has claimed its batch and is held in its first send
    const second = call("POST", `/wa/campaigns/${k.id}/next`, a.ck);
    await until(() => f.wa.length >= 2); // the second has claimed the next batch
    expect(f.wa.map((s) => s.phone)).toEqual([ph(1), ph(B + 1)]); // disjoint claims, both held in a send
    open();
    const [r1, r2] = await Promise.all([first, second]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(f.wa).toHaveLength(2 * B);
    expect(new Set(f.wa.map((s) => s.phone)).size).toBe(2 * B);
    const rows = await messages(a.org.id);
    expect(rows.every((m) => m.status === "sent")).toBe(true);
    const done = await json(await call("POST", `/wa/campaigns/${k.id}/next`, a.ck));
    expect(done).toMatchObject({ sent: 2 * B, queued: 0, finished_at: expect.any(Number) });
    expect(f.wa).toHaveLength(2 * B);
  });

  it("drainCampaign stops at the budget and releases the unsent claims", async () => {
    install();
    const a = await setup("wc-budget");
    await customers(a.org.id, 10);
    const k = await json(await call("POST", "/wa/campaigns", a.ck, { template: "eid_offer", params: PARAMS }));
    const budget = { left: 3 };
    const r = await drainCampaign(E, a.org.id, k.id, 40, budget);
    expect(r).toMatchObject({ sent: 3, queued: 7, finished_at: null });
    expect(budget.left).toBe(0);
    const queued = (await messages(a.org.id)).filter((m) => m.status === "queued");
    expect(queued).toHaveLength(7);
    expect(queued.every((m) => m.sent_at === null)).toBe(true); // released: due again at once
    expect(await drainCampaign(E, a.org.id, k.id, 40, { left: 0 })).toMatchObject({ sent: 3, queued: 7 });
    const rest = await drainCampaign(E, a.org.id, k.id, 40, { left: 40 });
    expect(rest).toMatchObject({ sent: 10, queued: 0, finished_at: expect.any(Number) });
    expect(new Set(f.wa.map((s) => s.phone)).size).toBe(10);
    // Without whatsapp_campaigns (feature override off) the no-session drain skips the org silently.
    const k2 = await json(await call("POST", "/wa/campaigns", a.ck, { template: "eid_offer", params: PARAMS }));
    await env.DB.prepare("INSERT INTO org_feature_overrides (org_id, feature_key, enabled, set_at) VALUES (?, 'whatsapp_campaigns', 0, 1)").bind(a.org.id).run();
    invalidateFeatures(a.org.id);
    expect(await drainCampaign(E, a.org.id, k2.id, 40, { left: 40 })).toMatchObject({ sent: 0, queued: 10 });
    expect(f.wa).toHaveLength(10);
    // Another org's id: null, nothing sent.
    const b = await setup("wc-budget-b");
    expect(await drainCampaign(E, b.org.id, k.id, 40, { left: 40 })).toBeNull();
    expect(f.wa).toHaveLength(10);
  });

  it("parallel creates in different orgs each get their own campaign id and audience", async () => {
    install();
    const orgs = await Promise.all([setup("wc-par-a"), setup("wc-par-b"), setup("wc-par-c")]);
    await Promise.all(orgs.map((o, i) => customers(o.org.id, 3 + i)));
    const made = await Promise.all(orgs.map(async (o) => json(await call("POST", "/wa/campaigns", o.ck, { template: "eid_offer", params: PARAMS }))));
    expect(made.map((k) => k.total)).toEqual([3, 4, 5]);
    for (let i = 0; i < orgs.length; i++) {
      const rows = await messages(orgs[i]!.org.id);
      expect(rows).toHaveLength(3 + i);
      expect(rows.every((m) => m.campaign_id === made[i].id)).toBe(true);
      const own = await env.DB.prepare("SELECT org_id FROM wa_campaigns WHERE id = ?").bind(made[i].id).first<{ org_id: string }>();
      expect(own!.org_id).toBe(orgs[i]!.org.id);
    }
  });

  it("two concurrent creates in one org: one campaign, the other 409 with nothing written", async () => {
    install();
    const a = await setup("wc-twice");
    await customers(a.org.id, 5);
    const rs = await Promise.all([1, 2].map(() => call("POST", "/wa/campaigns", a.ck, { template: "eid_offer", params: PARAMS })));
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM wa_campaigns WHERE org_id = ?").bind(a.org.id).first<{ n: number }>())!.n).toBe(1);
    const rows = await messages(a.org.id);
    expect(rows).toHaveLength(5);
    expect(rows.every((m) => m.campaign_id !== null)).toBe(true);
    const au = await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE org_id = ? AND ref LIKE 'WhatsApp announcement%'").bind(a.org.id).first<{ n: number }>();
    expect(au!.n).toBe(1);
  });

  it("at-most-once: a drain that dies after a send never re-sends it; its unattempted claims are sent later", async () => {
    let crash = true;
    install({
      send: (s) => {
        if (crash) throw new Error("worker killed"); // the Graph call went out, then the request died before logging
        return { status: "sent", wa_id: `w${s.phone}` };
      },
    });
    const a = await setup("wc-crash");
    await customers(a.org.id, 3);
    const k = await json(await call("POST", "/wa/campaigns", a.ck, { template: "eid_offer", params: PARAMS }));
    await expect(drainCampaign(E, a.org.id, k.id, 30, { left: 30 })).rejects.toThrow("worker killed");
    expect(f.wa.map((s) => s.phone)).toEqual(["+919800000001"]);
    expect((await messages(a.org.id)).map((m) => [m.status, m.error])).toEqual([["queued", "sending"], ["queued", null], ["queued", null]]);
    crash = false;
    // Within 5 minutes the claim still holds: nothing to do.
    expect(await drainCampaign(E, a.org.id, k.id, 30, { left: 30 })).toMatchObject({ queued: 3, sent: 0 });
    expect(f.wa).toHaveLength(1);
    // Later: the SENDING row fails as interrupted (not re-sent); the never-attempted ones go out.
    await env.DB.prepare("UPDATE wa_messages SET sent_at = sent_at - 600000 WHERE org_id = ?").bind(a.org.id).run();
    const r = await drainCampaign(E, a.org.id, k.id, 30, { left: 30 });
    expect(r).toMatchObject({ sent: 2, failed: 1, queued: 0, finished_at: expect.any(Number) });
    expect(f.wa.map((s) => s.phone)).toEqual(["+919800000001", "+919800000002", "+919800000003"]);
    expect((await messages(a.org.id)).map((m) => [m.phone, m.status, m.error])).toEqual([
      ["+919800000001", "failed", "interrupted, may have been sent"],
      ["+919800000002", "sent", null],
      ["+919800000003", "sent", null],
    ]);
  });

  it("/next with a full batch on a cold features cache stays within 45 D1 statements (free plan counts each batch statement)", async () => {
    install();
    const a = await setup("wc-d1");
    await customers(a.org.id, B + 10);
    const k = await json(await call("POST", "/wa/campaigns", a.ck, { template: "eid_offer", params: PARAMS }));
    invalidateFeatures(a.org.id);
    const { db, count } = countingDb(env.DB);
    const res = await app.fetch(
      new Request(`https://x.test/api/wa/campaigns/${k.id}/next`, { method: "POST", headers: { cookie: a.ck } }),
      { ...E, DB: db },
      ctx,
    );
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ sent: B, queued: 10 });
    expect(count.statements, `D1 statements (round trips: ${count.calls})`).toBeLessThanOrEqual(45);
  });
});
