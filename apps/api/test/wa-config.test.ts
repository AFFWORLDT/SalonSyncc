import { env } from "cloudflare:test";
import { describe, it, expect, vi, afterEach } from "vitest";
import app from "../src/index";
import { makeOrg, makeUser, loginAs } from "./helpers";
import { waConfigRepo } from "../src/data/tenant";
import { platformRepo } from "../src/data/platform";
import { waReady, waSetup } from "../src/tenant/whatsapp/ready";
import { graphWaClient, GRAPH } from "../src/integrations/wa-client";
import { HttpError } from "../src/core/errors";

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const E = { ...env, ROOT_DOMAIN: "" };
const TOKEN = "EAAGsecretTOKEN1234567890abcdef";
const call = (method: string, path: string, cookie: string, body?: unknown) =>
  app.fetch(
    new Request(`https://x.test/api${path}`, {
      method,
      headers: { cookie, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    E,
    ctx,
  );

async function setup(slug: string, plan: "pro" | "pro_max" = "pro_max", phoneCountry = "971") {
  const org = await makeOrg({ slug, plan });
  if (phoneCountry !== "971") await env.DB.prepare("UPDATE org_settings SET phone_country = ? WHERE org_id = ?").bind(phoneCountry, org.id).run();
  await makeUser(org.id, { username: "own", role: "owner" });
  await makeUser(org.id, { username: "adm", role: "admin" });
  await makeUser(org.id, { username: "bar", role: "barber" });
  return { org, own: await loginAs(slug, "own"), adm: await loginAs(slug, "adm"), bar: await loginAs(slug, "bar") };
}
const body = (over: Record<string, unknown> = {}) => ({ phone_number_id: "1234567890", waba_id: "98765432100", token: TOKEN, ...over });
const auditRows = async (orgId: string) =>
  (await env.DB.prepare("SELECT entity, action, actor_name, before, after FROM audit_log WHERE org_id = ? AND entity = 'whatsapp' ORDER BY id").bind(orgId).all<any>()).results;

describe("PUT/GET/DELETE /api/whatsapp/config", () => {
  it("set then get: never echoes the token; token_enc is encrypted (RF4); audit redacted", async () => {
    const a = await setup("wac-a");
    const put = await call("PUT", "/whatsapp/config", a.own, body({ test_numbers: "050 111 2222, +919511506049" }));
    const putText = await put.text();
    expect(put.status).toBe(200);
    expect(JSON.parse(putText)).toEqual({ wa_ready: true });
    expect(putText).not.toContain(TOKEN);

    const get = await call("GET", "/whatsapp/config", a.own);
    const getText = await get.text();
    expect(get.status).toBe(200);
    expect(JSON.parse(getText)).toEqual({ phone_number_id: "1234567890", waba_id: "98765432100", test_numbers: ["0501112222", "+919511506049"], has_token: true });
    expect(getText).not.toContain(TOKEN);

    const row = await env.DB.prepare("SELECT * FROM org_whatsapp WHERE org_id = ?").bind(a.org.id).first<any>();
    expect(row.token_enc).not.toBe(TOKEN);
    expect(row.token_enc).not.toContain(TOKEN);
    expect(row.token_enc).toMatch(/^v1\./);
    expect(row.test_numbers).toBe("0501112222,+919511506049");

    const cfg = await waConfigRepo(env.DB, a.org.id, env.SECRETS_KEY).get();
    expect(cfg).toEqual({ phoneNumberId: "1234567890", wabaId: "98765432100", token: TOKEN, testNumbers: "0501112222,+919511506049", callingCode: "971" });

    const au = await auditRows(a.org.id);
    expect(au).toHaveLength(1);
    expect(au[0]).toMatchObject({ entity: "whatsapp", action: "create", actor_name: "own" });
    expect(JSON.stringify(au)).not.toContain(TOKEN);
    expect(JSON.parse(au[0].after)).toMatchObject({ phone_number_id: "1234567890", token: "[redacted]" });

    // settings report wa_ready too
    expect(((await (await call("GET", "/settings", a.own)).json()) as any).wa_ready).toBe(true);
  });

  it("an admin may update; an update audit row has both sides redacted; a re-PUT of the same number is fine", async () => {
    const a = await setup("wac-up");
    expect((await call("PUT", "/whatsapp/config", a.own, body({ phone_number_id: "20000001" }))).status).toBe(200);
    const r = await call("PUT", "/whatsapp/config", a.adm, body({ phone_number_id: "20000001", token: "NEWtoken_abc", waba_id: "11111" }));
    expect(r.status).toBe(200);
    const au = await auditRows(a.org.id);
    expect(au.map((x: any) => x.action)).toEqual(["create", "update"]);
    expect(JSON.stringify(au)).not.toContain(TOKEN);
    expect(JSON.stringify(au)).not.toContain("NEWtoken_abc");
    expect(JSON.parse(au[1].before)).toMatchObject({ waba_id: "98765432100", token: "[redacted]" });
    expect((await waConfigRepo(env.DB, a.org.id, env.SECRETS_KEY).get())?.token).toBe("NEWtoken_abc");
  });

  it("91 org: test numbers canonicalised with its calling code", async () => {
    const a = await setup("wac-in", "pro_max", "91");
    expect((await call("PUT", "/whatsapp/config", a.own, body({ phone_number_id: "20000002", test_numbers: "09511506049" }))).status).toBe(200);
    expect(await (await call("GET", "/whatsapp/config", a.own)).json()).toMatchObject({ test_numbers: ["+919511506049"] });
    expect((await waConfigRepo(env.DB, a.org.id, env.SECRETS_KEY).get())?.callingCode).toBe("91");
  });

  it("another org's phone_number_id -> 409", async () => {
    const a = await setup("wac-dup-a");
    const b = await setup("wac-dup-b");
    expect((await call("PUT", "/whatsapp/config", a.own, body({ phone_number_id: "20000003" }))).status).toBe(200);
    const r = await call("PUT", "/whatsapp/config", b.own, body({ phone_number_id: "20000003", token: "otherTOKEN" }));
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "That WhatsApp number is already connected to another salon" });
    expect(await env.DB.prepare("SELECT 1 FROM org_whatsapp WHERE org_id = ?").bind(b.org.id).first()).toBeNull();
    expect(await platformRepo(env.DB).orgByPhoneNumberId("20000003")).toMatchObject({ id: a.org.id });
    expect(await platformRepo(env.DB).orgByPhoneNumberId("999999")).toBeNull();
  });

  it("a barber gets 403; a pro org (no whatsapp) gets 403", async () => {
    const a = await setup("wac-bar");
    for (const [m, b] of [["PUT", body()], ["GET", undefined], ["DELETE", undefined]] as const) {
      expect((await call(m, "/whatsapp/config", a.bar, b)).status).toBe(403);
    }
    const p = await setup("wac-pro", "pro");
    for (const [m, b] of [["PUT", body({ phone_number_id: "55555" })], ["GET", undefined], ["DELETE", undefined]] as const) {
      const r = await call(m, "/whatsapp/config", p.own, b);
      expect(r.status).toBe(403);
      expect(await r.json()).toMatchObject({ code: "feature_disabled" });
    }
    expect(await env.DB.prepare("SELECT 1 FROM org_whatsapp WHERE org_id IN (?, ?)").bind(a.org.id, p.org.id).first()).toBeNull();
  });

  it("validates the input", async () => {
    const a = await setup("wac-val");
    const bad: Record<string, unknown>[] = [
      body({ phone_number_id: "12a45" }),
      body({ phone_number_id: "1234" }),
      body({ phone_number_id: "1".repeat(26) }),
      body({ waba_id: "" }),
      body({ waba_id: 12345 }),
      body({ token: "" }),
      body({ token: "has space" }),
      body({ token: "x".repeat(513) }),
      body({ token: 5 }),
      body({ test_numbers: "not-a-phone" }),
      body({ test_numbers: Array.from({ length: 21 }, (_, i) => `05011122${String(i).padStart(2, "0")}`).join(",") }),
      body({ test_numbers: 7 }),
    ];
    for (const b of bad) {
      const r = await call("PUT", "/whatsapp/config", a.own, b);
      const t = await r.text();
      expect(r.status, JSON.stringify(b).slice(0, 80)).toBe(400);
      expect(t).not.toContain(TOKEN);
    }
    expect((await call("PUT", "/whatsapp/config", a.own, "nope")).status).toBe(400);
    expect((await call("PUT", "/whatsapp/config", a.own, body({ phone_number_id: "20000004", token: "x".repeat(512), test_numbers: "" }))).status).toBe(200);
    expect(await (await call("GET", "/whatsapp/config", a.own)).json()).toMatchObject({ test_numbers: [] });
  });

  it("DELETE removes the config (audited); GET then answers null", async () => {
    const a = await setup("wac-del");
    expect((await call("GET", "/whatsapp/config", a.own)).status).toBe(200);
    expect(await (await call("GET", "/whatsapp/config", a.own)).json()).toBeNull();
    await call("PUT", "/whatsapp/config", a.own, body({ phone_number_id: "20000005" }));
    const d = await call("DELETE", "/whatsapp/config", a.adm);
    expect(d.status).toBe(200);
    expect(await d.json()).toEqual({ wa_ready: false });
    expect(await (await call("GET", "/whatsapp/config", a.own)).json()).toBeNull();
    const au = await auditRows(a.org.id);
    expect(au.map((x: any) => x.action)).toEqual(["create", "delete"]);
    expect(JSON.stringify(au)).not.toContain(TOKEN);
    // deleting again is a no-op, not audited
    expect((await call("DELETE", "/whatsapp/config", a.own)).status).toBe(200);
    expect(await auditRows(a.org.id)).toHaveLength(2);
    // the number is free for another salon now
    const b = await setup("wac-del-b");
    expect((await call("PUT", "/whatsapp/config", b.own, body({ phone_number_id: "20000005" }))).status).toBe(200);
  });
});

describe("waReady / waSetup", () => {
  afterEach(() => vi.restoreAllMocks());

  it("true only with the whatsapp feature and a config row; a rotated key is not ready (no throw, no token logged)", async () => {
    const a = await setup("wac-ready");
    const org = (await platformRepo(env.DB).orgById(a.org.id))!;
    expect(await waReady(E, org)).toBe(false);
    expect((await call("PUT", "/whatsapp/config", a.own, body({ phone_number_id: "20000006" }))).status).toBe(200);
    expect(await waReady(E, org)).toBe(true);
    expect((await waSetup(E, org))?.token).toBe(TOKEN);

    const p = await setup("wac-ready-pro", "pro");
    await waConfigRepo(env.DB, p.org.id, env.SECRETS_KEY).set({ phoneNumberId: "77777", wabaId: "88888", token: TOKEN, testNumbers: null }, { id: 1, name: "x" });
    expect(await waReady(E, (await platformRepo(env.DB).orgById(p.org.id))!)).toBe(false);

    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const rotated = { ...E, SECRETS_KEY: btoa(String.fromCharCode(...new Uint8Array(32).fill(9))) };
    expect(await waReady(rotated, org)).toBe(false);
    expect(await waSetup(rotated, org)).toBeNull();
    expect(err).toHaveBeenCalled();
    expect(JSON.stringify(err.mock.calls)).not.toContain(TOKEN);
    // GET config still works (no decrypt), so the owner can re-enter the token
    expect((await call("GET", "/whatsapp/config", a.own)).status).toBe(200);
  });
});

describe("Graph client (fake fetch, no network)", () => {
  const cfg = { phoneNumberId: "1234567890", wabaId: "98765432100", token: TOKEN, testNumbers: null, callingCode: "971" };
  type Call = { url: string; init: RequestInit };
  const fakeFetch = (status: number, payload: unknown, calls: Call[] = []) =>
    (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;

  it("sendTemplate posts to v21.0 and returns the wamid", async () => {
    const calls: Call[] = [];
    const wa = graphWaClient(fakeFetch(200, { messages: [{ id: "wamid.X" }] }, calls));
    expect(await wa.sendTemplate(cfg, "0501234567", "ss_bill", "en", ["Ali"])).toEqual({ status: "sent", wa_id: "wamid.X" });
    expect(GRAPH).toBe("https://graph.facebook.com/v21.0");
    expect(calls[0]!.url).toBe(`${GRAPH}/1234567890/messages`);
    const sent = JSON.parse(String(calls[0]!.init.body));
    expect(sent).toMatchObject({ messaging_product: "whatsapp", to: "971501234567", type: "template", template: { name: "ss_bill", language: { code: "en" } } });
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("sendTemplate never throws and strips the token from Graph errors", async () => {
    const echo = graphWaClient(fakeFetch(401, { error: { message: `Invalid OAuth access token - ${TOKEN} is expired`, code: 190 } }));
    const r = await echo.sendTemplate(cfg, "0501234567", "ss_bill", "en", []);
    expect(r.status).toBe("failed");
    expect(JSON.stringify(r)).not.toContain(TOKEN);
    expect((r as { error: string }).error).toContain("[redacted]");

    const boom = graphWaClient((async () => {
      throw new Error(`network down Authorization: Bearer ${TOKEN}`);
    }) as unknown as typeof fetch);
    const r2 = await boom.sendTemplate(cfg, "0501234567", "ss_bill", "en", []);
    expect(r2.status).toBe("failed");
    expect(JSON.stringify(r2)).not.toContain(TOKEN);

    const noId = graphWaClient(fakeFetch(200, {}));
    expect(await noId.sendTemplate(cfg, "0501234567", "ss_bill", "en", [])).toEqual({ status: "failed", error: "WhatsApp did not accept the message" });
  });

  it("sendTemplate skips numbers outside the test list (no fetch)", async () => {
    const calls: Call[] = [];
    const wa = graphWaClient(fakeFetch(200, { messages: [{ id: "wamid.Y" }] }, calls));
    const r = await wa.sendTemplate({ ...cfg, testNumbers: "0501112222" }, "0501234567", "ss_bill", "en", []);
    expect(r.status).toBe("skipped");
    expect(calls).toHaveLength(0);
    expect((await wa.sendTemplate({ ...cfg, testNumbers: "0501112222" }, "0501112222", "ss_bill", "en", [])).status).toBe("sent");
  });

  it("listTemplates/createTemplate/uploadMedia: typed results, or HttpError 502 without the token", async () => {
    const ok = graphWaClient(
      fakeFetch(200, {
        data: [
          { id: "t1", name: "ss_bill", status: "APPROVED", category: "UTILITY", language: "en", components: [{ type: "BODY", text: "Hi {{1}}" }] },
          { id: "t2", name: "promo", status: "APPROVED", category: "MARKETING", language: "en", components: [{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "Hey" }, { type: "BUTTONS", buttons: [{ type: "URL", url: "https://x/{{1}}" }] }] },
        ],
      }),
    );
    expect(await ok.listTemplates(cfg)).toEqual([
      { id: "t1", name: "ss_bill", status: "APPROVED", category: "UTILITY", language: "en", header: null, body: "Hi {{1}}", vars: 1, slots: [{ part: "body", key: "1" }], sendable: true },
      { id: "t2", name: "promo", status: "APPROVED", category: "MARKETING", language: "en", header: null, body: "Hey", vars: 1, slots: [{ part: "header", key: "media", media: "image" }], sendable: false },
    ]);
    expect(await graphWaClient(fakeFetch(200, { id: "c1", status: "PENDING" })).createTemplate(cfg, { name: "n", category: "UTILITY", language: "en", body: "b", examples: [] })).toEqual({ id: "c1", status: "PENDING" });
    expect(await graphWaClient(fakeFetch(200, { id: "m1" })).uploadMedia(cfg, new File(["x"], "a.jpg", { type: "image/jpeg" }))).toBe("m1");

    const bad = graphWaClient(fakeFetch(400, { error: { error_user_msg: `Bad token ${TOKEN}` } }));
    for (const p of [bad.listTemplates(cfg), bad.createTemplate(cfg, { name: "n", category: "UTILITY", language: "en", body: "b", examples: [] }), bad.uploadMedia(cfg, new File(["x"], "a.jpg", { type: "image/jpeg" }))]) {
      const e = await p.then(() => null, (x) => x);
      expect(e).toBeInstanceOf(HttpError);
      expect(e.status).toBe(502);
      expect(e.message).toMatch(/^WhatsApp error: /);
      expect(e.message).not.toContain(TOKEN);
    }
    const thrown = graphWaClient((async () => {
      throw new Error(`fail ${TOKEN}`);
    }) as unknown as typeof fetch);
    const e2 = await thrown.listTemplates(cfg).then(() => null, (x) => x);
    expect(e2).toBeInstanceOf(HttpError);
    expect(e2.message).not.toContain(TOKEN);
  });
});
