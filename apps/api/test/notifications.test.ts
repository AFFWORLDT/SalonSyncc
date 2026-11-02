import { env } from "cloudflare:test";
import { describe, it, expect, afterEach, vi } from "vitest";
import app from "../src/index";
import { makeOrg, makeUser, loginAs } from "./helpers";
import { fakeServices } from "./fakes";
import { setServicesForTest } from "../src/core/services";
import { notificationsRepo, PUSH_MAX_TOKENS } from "../src/data/tenant";
import { notifyUsers } from "../src/tenant/notifications/notify";
import { buildAssertion, fcmPush } from "../src/integrations/push-client";

// waitUntil work (hooks) is collected so tests can await it deterministically.
const pending: Promise<unknown>[] = [];
const ctx = { waitUntil(p: Promise<unknown>) { pending.push(p); }, passThroughOnException() {} } as unknown as ExecutionContext;
const flush = async () => { while (pending.length) await pending.shift(); };
// FCM_SERVICE_ACCOUNT only has to be present: sends go through the FakePush seam, never the network.
const E = { ...env, ROOT_DOMAIN: "", FCM_SERVICE_ACCOUNT: "{\"fake\":true}" };
const call = async (method: string, path: string, cookie: string, body?: unknown, e: typeof E = E): Promise<Response> =>
  app.fetch(
    new Request(`https://x.test/api${path}`, {
      method,
      headers: { cookie, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    e,
    ctx,
  );
const json = async (r: Response): Promise<any> => r.json();
const money = (minor: number) => new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED" }).format(minor / 100);
const tok = (s: string) => `${s}-token-aaaaaaaaaaaaaaaaaaaa`;

async function setup(slug: string, plan: "free" | "pro" | "pro_max" = "pro_max") {
  const org = await makeOrg({ slug, plan });
  const own = await makeUser(org.id, { username: "own", role: "owner" });
  const b1 = await makeUser(org.id, { username: "b1", role: "barber" });
  return { org, own, b1, ck: await loginAs(slug, "own"), k1: await loginAs(slug, "b1") };
}
const setSettings = (orgId: string, sql: string, ...binds: unknown[]) =>
  env.DB.prepare(`UPDATE org_settings SET ${sql} WHERE org_id = ?`).bind(...binds, orgId).run();
const notes = async (orgId: string) =>
  (await env.DB.prepare("SELECT user_id, title, body, path, read_at FROM notifications WHERE org_id = ? ORDER BY id").bind(orgId).all<any>()).results;
const tokens = async () => (await env.DB.prepare("SELECT token, org_id, user_id FROM push_tokens ORDER BY token").all<any>()).results;

let f = fakeServices();
afterEach(async () => {
  await flush();
  setServicesForTest(null);
});
const install = (opts?: Parameters<typeof fakeServices>[0]) => {
  f = fakeServices(opts);
  f.install();
  return f;
};

describe("sale notifications", () => {
  it("a barber's sale notifies only this org's active owner/admins (RF5)", async () => {
    install();
    const a = await setup("nt-rf5-a");
    const adm = await makeUser(a.org.id, { username: "adm", role: "admin" });
    const gone = await makeUser(a.org.id, { username: "gone", role: "admin" });
    await env.DB.prepare("UPDATE users SET active = 0 WHERE org_id = ? AND id = ?").bind(a.org.id, gone.id).run();
    const b = await setup("nt-rf5-b");
    const bAdm = await makeUser(b.org.id, { username: "adm", role: "admin" });
    const ak = await loginAs("nt-rf5-a", "adm");
    expect((await call("POST", "/push/tokens", a.ck, { token: tok("a-own") })).status).toBe(200);
    expect((await call("POST", "/push/tokens", ak, { token: tok("a-adm") })).status).toBe(200);
    expect((await call("POST", "/push/tokens", a.k1, { token: tok("a-b1") })).status).toBe(200);
    expect((await call("POST", "/push/tokens", b.ck, { token: tok("b-own") })).status).toBe(200);
    expect((await call("POST", "/push/tokens", await loginAs("nt-rf5-b", "adm"), { token: tok("b-adm") })).status).toBe(200);

    const r = await call("POST", "/sales", a.k1, { amount: 25, payment_mode: "cash" });
    expect(r.status).toBe(201);
    await flush();

    const rows = await notes(a.org.id);
    expect(rows.map((n) => n.user_id).sort()).toEqual([a.own.id, adm.id].sort());
    expect(rows[0]).toMatchObject({ title: `New bill · ${money(2500)}`, body: "b1 · Customer 1", path: "/sales/", read_at: null });
    expect(await notes(b.org.id)).toEqual([]);
    expect(f.pushes).toHaveLength(1);
    expect(f.pushes[0]!.tokens.sort()).toEqual([tok("a-adm"), tok("a-own")]);
    expect(f.pushes[0]!.push).toMatchObject({ title: `New bill · ${money(2500)}`, path: "/sales/" });
    expect(bAdm.org_id).toBe(b.org.id);
  });

  it("never notifies the creator; items are listed FM-style", async () => {
    install();
    const a = await setup("nt-self");
    const adm = await makeUser(a.org.id, { username: "adm", role: "admin" });
    await call("POST", "/sales", a.ck, { payment_mode: "card", customer_name: "Ali", items: [{ name: "Cut", price: 30, qty: 2 }, { name: "Beard", price: 15, qty: 1 }] });
    await flush();
    const rows = await notes(a.org.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: adm.id, title: `New bill · ${money(7500)}`, body: "own · Ali · Cut ×2, Beard" });
  });

  it("under notify_sale_min (or notify_sales off) nothing is recorded or sent", async () => {
    install();
    const a = await setup("nt-min");
    await call("POST", "/push/tokens", a.ck, { token: tok("min-own") });
    await setSettings(a.org.id, "notify_sale_min = ?", 5000);
    await call("POST", "/sales", a.k1, { amount: 49.99, payment_mode: "cash" });
    await flush();
    expect(await notes(a.org.id)).toEqual([]);
    expect(f.pushes).toEqual([]);
    await call("POST", "/sales", a.k1, { amount: 50, payment_mode: "cash" });
    await flush();
    expect(await notes(a.org.id)).toHaveLength(1);
    await setSettings(a.org.id, "notify_sales = 0, notify_sale_min = 0");
    await call("POST", "/sales", a.k1, { amount: 500, payment_mode: "cash" });
    await flush();
    expect(await notes(a.org.id)).toHaveLength(1);
  });

  it("money is formatted in the org's currency and locale", async () => {
    install();
    const a = await setup("nt-cur");
    await makeUser(a.org.id, { username: "adm", role: "admin" });
    await setSettings(a.org.id, "currency = 'INR', currency_minor = 100, locale = 'en-IN'");
    await call("POST", "/sales", a.k1, { amount: 123456, payment_mode: "cash" });
    await flush();
    const want = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(123456);
    expect((await notes(a.org.id))[0].title).toBe(`New bill · ${want}`);
  });

  it("an admin editing or deleting a barber's sale notifies that barber (FM text)", async () => {
    install();
    const a = await setup("nt-edit");
    await setSettings(a.org.id, "notify_sales = 0");
    const b2 = await makeUser(a.org.id, { username: "b2", role: "barber" });
    await call("POST", "/push/tokens", a.k1, { token: tok("edit-b1") });
    const sale = await json(await call("POST", "/sales", a.k1, { amount: 25, payment_mode: "cash" }));
    await flush();

    // The barber editing their own sale: nobody is told.
    expect((await call("PUT", `/sales/${sale.id}`, a.k1, { amount: 26, payment_mode: "cash" })).status).toBe(200);
    await flush();
    expect(await notes(a.org.id)).toEqual([]);

    expect((await call("PUT", `/sales/${sale.id}`, a.ck, { amount: 30, payment_mode: "cash" })).status).toBe(200);
    await flush();
    let rows = await notes(a.org.id);
    expect(rows).toEqual([
      { user_id: a.b1.id, title: "Your sale was changed", body: `${sale.bill_no} · ${money(2600)} → ${money(3000)} · by the admin`, path: "/history/", read_at: null },
    ]);
    expect(f.pushes.at(-1)).toMatchObject({ tokens: [tok("edit-b1")], push: { tag: `sale-${sale.id}` } });

    // Moved to another barber: the original barber hears about it.
    await call("PUT", `/sales/${sale.id}`, a.ck, { amount: 30, payment_mode: "cash", barber_id: b2.id });
    await flush();
    rows = await notes(a.org.id);
    expect(rows.at(-1)).toMatchObject({ user_id: a.b1.id, body: `${sale.bill_no} · ${money(3000)} → ${money(3000)} · moved to another barber · by the admin` });

    // Delete: now b2's sale.
    expect((await call("DELETE", `/sales/${sale.id}`, a.ck)).status).toBe(200);
    await flush();
    rows = await notes(a.org.id);
    expect(rows.at(-1)).toEqual({ user_id: b2.id, title: "Your sale was deleted", body: `${sale.bill_no} · ${money(3000)} · Customer 1 · by the admin`, path: "/history/", read_at: null });
    expect(rows).toHaveLength(3);
  });

  it("notify_barber_changes off, or the admin's own sale: no change notification", async () => {
    install();
    const a = await setup("nt-edit-off");
    await setSettings(a.org.id, "notify_sales = 0");
    const own = await json(await call("POST", "/sales", a.ck, { amount: 25, payment_mode: "cash" }));
    await call("PUT", `/sales/${own.id}`, a.ck, { amount: 30, payment_mode: "cash" });
    await call("DELETE", `/sales/${own.id}`, a.ck);
    await setSettings(a.org.id, "notify_barber_changes = 0");
    const s = await json(await call("POST", "/sales", a.k1, { amount: 25, payment_mode: "cash" }));
    await call("PUT", `/sales/${s.id}`, a.ck, { amount: 30, payment_mode: "cash" });
    await call("DELETE", `/sales/${s.id}`, a.ck);
    await flush();
    expect(await notes(a.org.id)).toEqual([]);
  });

  it("dead tokens are deleted (org-scoped); live ones stay", async () => {
    install({ dead: [tok("dead-own")] });
    const a = await setup("nt-dead");
    await makeUser(a.org.id, { username: "adm", role: "admin" });
    await call("POST", "/push/tokens", a.ck, { token: tok("dead-own") });
    await call("POST", "/push/tokens", await loginAs("nt-dead", "adm"), { token: tok("live-adm") });
    await call("POST", "/sales", a.k1, { amount: 25, payment_mode: "cash" });
    await flush();
    const mine = (await tokens()).filter((t) => t.org_id === a.org.id).map((t) => t.token);
    expect(mine).toEqual([tok("live-adm")]);

    // deleteTokens never reaches another org's token.
    const b = await setup("nt-dead-b");
    await call("POST", "/push/tokens", b.ck, { token: tok("dead-b") });
    await notificationsRepo(env.DB, a.org.id).deleteTokens([tok("dead-b")]);
    expect((await tokens()).some((t) => t.token === tok("dead-b"))).toBe(true);
  });

  it("without FCM_SERVICE_ACCOUNT rows are recorded but nothing is sent", async () => {
    install();
    const a = await setup("nt-nofcm");
    await call("POST", "/push/tokens", a.ck, { token: tok("nofcm") });
    const { FCM_SERVICE_ACCOUNT: _, ...noFcm } = E;
    await call("POST", "/sales", a.k1, { amount: 25, payment_mode: "cash" }, noFcm as typeof E);
    await flush();
    expect(await notes(a.org.id)).toHaveLength(1);
    expect(f.pushes).toEqual([]);
  });

  it("a free org (no push) records nothing from sales", async () => {
    install();
    const a = await setup("nt-free", "free");
    await call("POST", "/sales", a.k1, { amount: 25, payment_mode: "cash" });
    await flush();
    expect(await notes(a.org.id)).toEqual([]);
    expect(f.pushes).toEqual([]);
  });
});

describe("notifyUsers", () => {
  it("never throws; works from env (no session) and ignores other orgs' user ids", async () => {
    const a = await setup("nu-a");
    const b = await setup("nu-b");
    setServicesForTest(() => ({ ...fakeServices().services, push: { send: async () => { throw new Error("fcm down"); } } }));
    await env.DB.prepare("INSERT INTO push_tokens(token,org_id,user_id,created_at,updated_at) VALUES(?,?,?,?,?)").bind(tok("nu"), a.org.id, a.own.id, 1, 1).run();
    await expect(notifyUsers(E, a.org.id, [a.own.id, b.own.id, b.b1.id], { title: "T", body: "B" })).resolves.toBeUndefined();
    expect((await notes(a.org.id)).map((n) => n.user_id)).toEqual([a.own.id]);
    expect(await notes(b.org.id)).toEqual([]);
    // Unknown org, broken DB input: still no throw.
    await expect(notifyUsers(E, "org_missing", [1], { title: "T", body: "B" })).resolves.toBeUndefined();
  });

  it("skips an org without push (no rows)", async () => {
    install();
    const a = await setup("nu-free", "free");
    await notifyUsers(E, a.org.id, [a.own.id], { title: "T", body: "B" });
    expect(await notes(a.org.id)).toEqual([]);
  });

  it("adminIds is org-scoped and active owner/admin only (RF5)", async () => {
    const a = await setup("ai-a");
    const adm = await makeUser(a.org.id, { username: "adm", role: "admin" });
    const b = await setup("ai-b");
    await makeUser(b.org.id, { username: "adm", role: "admin" });
    expect((await notificationsRepo(env.DB, a.org.id).adminIds()).sort()).toEqual([a.own.id, adm.id].sort());
    expect(await notificationsRepo(env.DB, a.org.id).adminIds(a.own.id)).toEqual([adm.id]);
    expect(await notificationsRepo(env.DB, a.org.id).tokensFor([b.own.id])).toEqual([]);
  });
});

describe("push token routes", () => {
  it("registers, validates, and a device that signs into another salon moves", async () => {
    const a = await setup("pt-a");
    const b = await setup("pt-b");
    expect((await call("POST", "/push/tokens", a.ck, { token: "short" })).status).toBe(400);
    expect((await call("POST", "/push/tokens", a.ck, { token: 42 })).status).toBe(400);
    expect(await json(await call("POST", "/push/tokens", a.ck, { token: tok("dev") }))).toEqual({ ok: true });
    expect((await tokens()).filter((t) => t.token === tok("dev"))).toEqual([{ token: tok("dev"), org_id: a.org.id, user_id: a.own.id }]);
    await call("POST", "/push/tokens", a.k1, { token: tok("dev") });
    expect((await tokens()).filter((t) => t.token === tok("dev"))).toEqual([{ token: tok("dev"), org_id: a.org.id, user_id: a.b1.id }]);
    await call("POST", "/push/tokens", b.ck, { token: tok("dev") });
    expect((await tokens()).filter((t) => t.token === tok("dev"))).toEqual([{ token: tok("dev"), org_id: b.org.id, user_id: b.own.id }]);
  });

  it("DELETE removes only the session user's token in this org", async () => {
    const a = await setup("ptd-a");
    const b = await setup("ptd-b");
    await call("POST", "/push/tokens", a.ck, { token: tok("del-a") });
    expect(await json(await call("DELETE", "/push/tokens", a.k1, { token: tok("del-a") }))).toEqual({ ok: true });
    expect(await json(await call("DELETE", "/push/tokens", b.ck, { token: tok("del-a") }))).toEqual({ ok: true });
    expect((await tokens()).some((t) => t.token === tok("del-a"))).toBe(true);
    expect((await call("DELETE", "/push/tokens", a.ck)).status).toBe(200); // no body: no-op
    await call("DELETE", "/push/tokens", a.ck, { token: tok("del-a") });
    expect((await tokens()).some((t) => t.token === tok("del-a"))).toBe(false);
  });

  it("free org: every push/notification route is 403; unknown paths 404", async () => {
    const a = await setup("pt-free", "free");
    expect((await call("POST", "/push/tokens", a.ck, { token: tok("free") })).status).toBe(403);
    expect((await call("DELETE", "/push/tokens", a.ck, { token: tok("free") })).status).toBe(200); // sign-out is never gated
    expect((await call("GET", "/notifications", a.ck)).status).toBe(403);
    expect((await call("POST", "/notifications/read", a.ck, {})).status).toBe(403);
    expect((await call("GET", "/notifications/nope", a.ck)).status).toBe(404);
    expect((await call("GET", "/push/nope", a.ck)).status).toBe(404);
  });
});

describe("notification feed", () => {
  const add = async (orgId: string, userId: number, title: string, at: number) =>
    (await env.DB.prepare("INSERT INTO notifications(org_id,user_id,title,body,path,created_at) VALUES(?,?,?,?,?,?) RETURNING id")
      .bind(orgId, userId, title, "b", "/x/", at).first<{ id: number }>())!.id;

  it("feed is the session user's, newest first, FM limit, unread count", async () => {
    const a = await setup("fd-a");
    const b = await setup("fd-b");
    for (let i = 1; i <= 25; i++) await add(a.org.id, a.own.id, `N${i}`, 1000 + i);
    await add(a.org.id, a.b1.id, "barber's", 5000);
    await add(b.org.id, b.own.id, "other org", 6000);
    const r = await json(await call("GET", "/notifications", a.ck));
    expect(r.unread).toBe(25);
    expect(r.items).toHaveLength(20);
    expect(r.items[0]).toMatchObject({ title: "N25", body: "b", path: "/x/", read_at: null, created_at: 1025 });
    expect(Object.keys(r.items[0]).sort()).toEqual(["body", "created_at", "id", "path", "read_at", "title"]);
    expect((await json(await call("GET", "/notifications?limit=3", a.ck))).items.map((n: any) => n.title)).toEqual(["N25", "N24", "N23"]);
    expect((await json(await call("GET", "/notifications?limit=999", a.ck))).items).toHaveLength(25);
    expect((await json(await call("GET", "/notifications?limit=abc", a.ck))).items).toHaveLength(20);
    expect(await json(await call("GET", "/notifications", a.k1))).toMatchObject({ unread: 1, items: [{ title: "barber's" }] });
  });

  it("mark-read: given ids or all, only for the session user and org", async () => {
    const a = await setup("rd-a");
    const b = await setup("rd-b");
    const n1 = await add(a.org.id, a.own.id, "1", 1);
    const n2 = await add(a.org.id, a.own.id, "2", 2);
    const n3 = await add(a.org.id, a.own.id, "3", 3);
    const nb1 = await add(a.org.id, a.b1.id, "barber", 4);
    const other = await add(b.org.id, b.own.id, "other", 5);

    expect(await json(await call("POST", "/notifications/read", a.ck, { ids: [n1, nb1, other] }))).toEqual({ ok: true });
    const readOf = async (id: number) => (await env.DB.prepare("SELECT read_at FROM notifications WHERE id = ?").bind(id).first<any>()).read_at;
    expect(await readOf(n1)).not.toBeNull();
    expect(await readOf(n2)).toBeNull();
    expect(await readOf(nb1)).toBeNull();
    expect(await readOf(other)).toBeNull();

    // Org B's owner naming A's ids changes nothing.
    await call("POST", "/notifications/read", b.ck, { ids: [n2, n3] });
    expect(await readOf(n2)).toBeNull();

    expect((await call("POST", "/notifications/read", a.ck, { ids: "x" })).status).toBe(400);
    expect((await call("POST", "/notifications/read", a.ck, { ids: [1.5] })).status).toBe(400);
    expect((await call("POST", "/notifications/read", a.ck, { ids: Array.from({ length: 51 }, (_, i) => i + 1) })).status).toBe(400);

    // No ids: everything of mine.
    await call("POST", "/notifications/read", a.ck);
    expect((await json(await call("GET", "/notifications", a.ck))).unread).toBe(0);
    expect(await readOf(nb1)).toBeNull();
    expect(await readOf(other)).toBeNull();
    // Already-read rows keep their first read_at.
    const first = await readOf(n1);
    await call("POST", "/notifications/read", a.ck, {});
    expect(await readOf(n1)).toBe(first);
  });
});

describe("user delete", () => {
  it("hard-deleting a user with no activity removes their push tokens and notifications", async () => {
    const a = await setup("ud-a");
    const b3 = await makeUser(a.org.id, { username: "b3", role: "barber" });
    const k3 = await loginAs("ud-a", "b3");
    await call("POST", "/push/tokens", k3, { token: tok("ud-b3") });
    await env.DB.prepare("INSERT INTO notifications(org_id,user_id,title,created_at) VALUES(?,?,?,?)").bind(a.org.id, b3.id, "hi", 1).run();
    await env.DB.prepare("INSERT INTO notifications(org_id,user_id,title,created_at) VALUES(?,?,?,?)").bind(a.org.id, a.b1.id, "keep", 1).run();
    const r = await call("DELETE", `/users/${b3.id}`, a.ck);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ deleted: true });
    expect((await tokens()).some((t) => t.token === tok("ud-b3"))).toBe(false);
    expect((await notes(a.org.id)).map((n) => n.title)).toEqual(["keep"]);
  });
});

async function testKey() {
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const der = new Uint8Array((await crypto.subtle.exportKey("pkcs8", pair.privateKey)) as ArrayBuffer);
  let bin = "";
  for (const x of der) bin += String.fromCharCode(x);
  return { pair, pem: `-----BEGIN PRIVATE KEY-----\n${btoa(bin).replace(/(.{64})/g, "$1\n")}\n-----END PRIVATE KEY-----\n` };
}

describe("fix round 1", () => {
  afterEach(() => vi.restoreAllMocks());

  it("lapsed (expired) org: DELETE token and POST read still work; free org can drop its token", async () => {
    const a = await setup("fx-exp");
    await call("POST", "/push/tokens", a.ck, { token: tok("fx-exp") });
    await env.DB.prepare("INSERT INTO notifications(org_id,user_id,title,created_at) VALUES(?,?,?,?)").bind(a.org.id, a.own.id, "x", 1).run();
    await env.DB.prepare("UPDATE orgs SET status = 'expired' WHERE id = ?").bind(a.org.id).run();
    // Other writes are still blocked.
    expect((await call("POST", "/push/tokens", a.ck, { token: tok("fx-exp2") })).status).toBe(402);
    expect((await call("POST", "/notifications/read", a.ck, {})).status).toBe(200);
    expect((await json(await call("GET", "/notifications", a.ck))).unread).toBe(0);
    expect((await call("DELETE", "/push/tokens", a.ck, { token: tok("fx-exp") })).status).toBe(200);
    expect((await tokens()).some((t) => t.token === tok("fx-exp"))).toBe(false);

    const f2 = await setup("fx-free", "free");
    await env.DB.prepare("INSERT INTO push_tokens(token,org_id,user_id,created_at,updated_at) VALUES(?,?,?,?,?)").bind(tok("fx-free"), f2.org.id, f2.own.id, 1, 1).run();
    expect((await call("DELETE", "/push/tokens", f2.ck, { token: tok("fx-free") })).status).toBe(200);
    expect((await tokens()).some((t) => t.token === tok("fx-free"))).toBe(false);
  });

  it("caps a send at PUSH_MAX_TOKENS, most recently updated first", async () => {
    install();
    expect(PUSH_MAX_TOKENS).toBe(40);
    const a = await setup("fx-cap");
    const stmts = Array.from({ length: 45 }, (_, i) =>
      env.DB.prepare("INSERT INTO push_tokens(token,org_id,user_id,created_at,updated_at) VALUES(?,?,?,?,?)").bind(tok(`cap${String(i).padStart(2, "0")}`), a.org.id, a.own.id, 1, 1000 + i),
    );
    await env.DB.batch(stmts);
    await notifyUsers(E, a.org.id, [a.own.id], { title: "T", body: "B" });
    expect(f.pushes).toHaveLength(1);
    const sent = f.pushes[0]!.tokens;
    expect(sent).toHaveLength(40);
    expect(sent[0]).toBe(tok("cap44"));
    expect([...sent].sort()).toEqual(Array.from({ length: 40 }, (_, i) => tok(`cap${String(i + 5).padStart(2, "0")}`)));
  });

  it("a token moved to org B gets no org-A push", async () => {
    install();
    const a = await setup("fx-mv-a");
    const b = await setup("fx-mv-b");
    await call("POST", "/push/tokens", a.ck, { token: tok("mv") });
    await call("POST", "/push/tokens", b.ck, { token: tok("mv") });
    await call("POST", "/sales", a.k1, { amount: 25, payment_mode: "cash" });
    await flush();
    expect(await notes(a.org.id)).toHaveLength(1); // the bell still has it
    expect(f.pushes.flatMap((p) => p.tokens)).not.toContain(tok("mv"));
  });

  it("FCM client: one failed fetch never loses the other tokens' dead reports (no network: fetch is stubbed)", async () => {
    const { pem } = await testKey();
    const sa = JSON.stringify({ project_id: "p", client_email: "fx@p.iam.gserviceaccount.com", private_key: pem });
    const seen: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith("https://oauth2.googleapis.com/")) return Response.json({ access_token: "at", expires_in: 3600 });
      const token = JSON.parse(String(init?.body)).message.token as string;
      seen.push(token);
      if (token === "boom") throw new Error("Too many subrequests");
      if (token === "gone404") return new Response("not found", { status: 404 });
      if (token === "unreg") return new Response('{"error":{"details":[{"errorCode":"UNREGISTERED"}]}}', { status: 400 });
      return new Response("{}", { status: 200 });
    });
    const r = await fcmPush.send({ ...env, FCM_SERVICE_ACCOUNT: sa }, ["gone404", "boom", "ok", "unreg"], { title: "T", body: "B", link: "https://x.test/sales/" });
    expect(r.dead.sort()).toEqual(["gone404", "unreg"]);
    expect(seen.sort()).toEqual(["boom", "gone404", "ok", "unreg"]);
  });
});

describe("FCM assertion (JWT RS256)", () => {
  it("builds a JWT signed with the service account key", async () => {
    const pair = (await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair;
    const der = new Uint8Array((await crypto.subtle.exportKey("pkcs8", pair.privateKey)) as ArrayBuffer);
    let bin = "";
    for (const x of der) bin += String.fromCharCode(x);
    const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(bin).replace(/(.{64})/g, "$1\n")}\n-----END PRIVATE KEY-----\n`;
    const jwt = await buildAssertion({ project_id: "p", client_email: "svc@p.iam.gserviceaccount.com", private_key: pem }, 1_700_000_000);

    const [h, c, s] = jwt.split(".");
    const unb64 = (x: string) => Uint8Array.from(atob(x.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (x.length % 4)) % 4)), (ch) => ch.charCodeAt(0));
    const text = (x: string) => new TextDecoder().decode(unb64(x));
    expect(JSON.parse(text(h!))).toEqual({ alg: "RS256", typ: "JWT" });
    expect(JSON.parse(text(c!))).toEqual({
      iss: "svc@p.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: 1_700_000_000,
      exp: 1_700_003_600,
    });
    expect(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", pair.publicKey, unb64(s!), new TextEncoder().encode(`${h}.${c}`))).toBe(true);
    expect(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", pair.publicKey, unb64(s!), new TextEncoder().encode(`${h}.x${c}`))).toBe(false);
  });
});
