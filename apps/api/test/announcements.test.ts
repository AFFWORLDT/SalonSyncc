import { env } from "cloudflare:test";
import { describe, it, expect, afterEach } from "vitest";
import app from "../src/index";
import { makeOrg, makeUser, loginAs } from "./helpers";
import { fakeServices } from "./fakes";
import { setServicesForTest } from "../src/core/services";

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const E = { ...env, ROOT_DOMAIN: "", FCM_SERVICE_ACCOUNT: "{\"fake\":true}" };
const call = (method: string, path: string, cookie: string, body?: unknown) =>
  app.fetch(
    new Request(`https://x.test/api${path}`, {
      method,
      headers: { cookie, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    E,
    ctx,
  );
const json = async (r: Response): Promise<any> => r.json();
const tok = (s: string) => `${s}-token-aaaaaaaaaaaaaaaaaaaa`;
const notes = async (orgId: string) =>
  (await env.DB.prepare("SELECT user_id, title, body, path FROM notifications WHERE org_id = ? ORDER BY id").bind(orgId).all<any>()).results;

async function setup(slug: string, plan: "free" | "pro" | "pro_max" = "pro_max") {
  const org = await makeOrg({ slug, plan });
  const own = await makeUser(org.id, { username: "own", role: "owner" });
  const adm = await makeUser(org.id, { username: "adm", role: "admin" });
  const b1 = await makeUser(org.id, { username: "b1", role: "barber" });
  const b2 = await makeUser(org.id, { username: "b2", role: "barber" });
  return { org, own, adm, b1, b2, ck: await loginAs(slug, "own"), k1: await loginAs(slug, "b1") };
}

let f = fakeServices();
afterEach(() => setServicesForTest(null));
const install = () => { f = fakeServices(); f.install(); };

describe("announcements", () => {
  it("audience all reaches this org's active staff except the sender; stores and returns the FM shape", async () => {
    install();
    const a = await setup("an-all-a");
    const b = await setup("an-all-b");
    await env.DB.prepare("UPDATE users SET active = 0 WHERE org_id = ? AND id = ?").bind(a.org.id, a.b2.id).run();
    expect((await call("POST", "/push/tokens", a.k1, { token: tok("a-b1") })).status).toBe(200);
    expect((await call("POST", "/push/tokens", b.k1, { token: tok("b-b1") })).status).toBe(200);
    const r = await call("POST", "/announcements", a.ck, { audience: "all", title: "  Meeting  ", body: "At 5pm" });
    expect(r.status).toBe(201);
    expect(await json(r)).toMatchObject({ sender_id: a.own.id, sender_name: "own", audience: "all", target_id: null, target_name: null, title: "Meeting", body: "At 5pm", recipients: 2 });
    expect((await notes(a.org.id)).map((n) => n.user_id).sort()).toEqual([a.adm.id, a.b1.id].sort());
    expect(await notes(b.org.id)).toEqual([]);
    expect(f.pushes).toHaveLength(1);
    expect(f.pushes[0]!.tokens).toEqual([tok("a-b1")]);
  });

  it("audience barber sends to one active user and GET lists newest first, org-scoped, max 30", async () => {
    install();
    const a = await setup("an-one-a");
    const b = await setup("an-one-b");
    const r = await call("POST", "/announcements", a.ck, { audience: "barber", barber_id: a.b1.id, title: "Hi", body: "You" });
    expect(r.status).toBe(201);
    expect(await json(r)).toMatchObject({ audience: "barber", target_id: a.b1.id, target_name: "b1", recipients: 1 });
    expect((await notes(a.org.id)).map((n) => n.user_id)).toEqual([a.b1.id]);
    await call("POST", "/announcements", b.ck, { audience: "all", title: "Other", body: "org" });
    for (let i = 0; i < 31; i++) {
      await env.DB.prepare("INSERT INTO announcements(org_id,sender_id,audience,title,body,recipients,created_at) VALUES(?,?,?,?,?,?,?)")
        .bind(a.org.id, a.own.id, "all", `old${i}`, "x", 0, 1000 + i).run();
    }
    const list = await json(await call("GET", "/announcements", a.ck));
    expect(list).toHaveLength(30);
    expect(list[0].title).toBe("Hi");
    expect(list.every((x: any) => x.sender_name === "own")).toBe(true);
    expect(list.some((x: any) => x.title === "Other")).toBe(false);
  });

  it("barber target in another org, inactive, or missing gets 400 (RF5)", async () => {
    install();
    const a = await setup("an-rf5-a");
    const b = await setup("an-rf5-b");
    await env.DB.prepare("UPDATE users SET active = 0 WHERE org_id = ? AND id = ?").bind(a.org.id, a.b2.id).run();
    for (const barber_id of [b.b1.id, a.b2.id, undefined, 999999]) {
      const r = await call("POST", "/announcements", a.ck, { audience: "barber", barber_id, title: "t", body: "b" });
      expect(r.status).toBe(400);
    }
    // target_id is accepted as an alias of barber_id
    expect((await call("POST", "/announcements", a.ck, { audience: "barber", target_id: a.b1.id, title: "t", body: "b" })).status).toBe(201);
    expect(await notes(b.org.id)).toEqual([]);
  });

  it("validates title, body and audience", async () => {
    install();
    const a = await setup("an-val");
    for (const bad of [
      { audience: "all", title: "", body: "b" },
      { audience: "all", title: "t", body: "   " },
      { audience: "everyone", title: "t", body: "b" },
      {},
    ]) expect((await call("POST", "/announcements", a.ck, bad)).status).toBe(400);
    const r = await call("POST", "/announcements", a.ck, { audience: "all", title: "t".repeat(200), body: "b".repeat(900) });
    const o = await json(r);
    expect(o.title).toHaveLength(80);
    expect(o.body).toHaveLength(500);
  });

  it("barber gets 403; org without the feature gets 403 feature_disabled; unknown path 404", async () => {
    install();
    const a = await setup("an-403");
    expect((await call("POST", "/announcements", a.k1, { audience: "all", title: "t", body: "b" })).status).toBe(403);
    expect((await call("GET", "/announcements", a.k1)).status).toBe(403);
    const p = await setup("an-403-free", "free");
    const r = await call("GET", "/announcements", p.ck);
    expect(r.status).toBe(403);
    expect(await json(r)).toMatchObject({ code: "feature_disabled" });
    expect((await call("POST", "/announcements", p.ck, { audience: "all", title: "t", body: "b" })).status).toBe(403);
    expect((await call("GET", "/announcements/nope", a.ck)).status).toBe(404);
  });

  it("without push the announcement is stored but no notification rows or pushes are made", async () => {
    install();
    const a = await setup("an-nopush");
    await env.DB.prepare("INSERT INTO org_feature_overrides(org_id,feature_key,enabled,set_at) VALUES(?,?,0,?)").bind(a.org.id, "push", Date.now()).run();
    const r = await call("POST", "/announcements", a.ck, { audience: "all", title: "t", body: "b" });
    expect(r.status).toBe(201);
    expect((await json(r)).recipients).toBe(3);
    expect(await notes(a.org.id)).toEqual([]);
    expect(f.pushes).toHaveLength(0);
    expect(await json(await call("GET", "/announcements", a.ck))).toHaveLength(1);
  });
});

describe("user delete with announcements", () => {
  it("a sender is deactivated, not deleted", async () => {
    install();
    const a = await setup("an-del-s");
    const k = await loginAs("an-del-s", "adm");
    await call("POST", "/announcements", k, { audience: "all", title: "t", body: "b" });
    const r = await call("DELETE", `/users/${a.adm.id}`, a.ck);
    expect(r.status).toBe(200);
    expect(await json(r)).toMatchObject({ deactivated: true });
  });

  it("a one-barber announcement target is deactivated, not deleted (no FK failure)", async () => {
    install();
    const a = await setup("an-del-t");
    await call("POST", "/announcements", a.ck, { audience: "barber", barber_id: a.b2.id, title: "t", body: "b" });
    const r = await call("DELETE", `/users/${a.b2.id}`, a.ck);
    expect(r.status).toBe(200);
    expect(await json(r)).toMatchObject({ deactivated: true });
    const u = await env.DB.prepare("SELECT active FROM users WHERE org_id = ? AND id = ?").bind(a.org.id, a.b2.id).first<any>();
    expect(u.active).toBe(0);
  });
});
