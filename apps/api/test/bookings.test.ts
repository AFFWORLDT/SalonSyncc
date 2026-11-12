import { env } from "cloudflare:test";
import { afterEach, describe, it, expect } from "vitest";
import app from "../src/index";
import { setServicesForTest } from "../src/core/services";
import { localNow, freeSlots, anyFree, pickStaff, DEFAULT_HOURS } from "../src/lib/slots";
import { makeOrg, makeUser } from "./helpers";
import { fakeServices } from "./fakes";

const ROOT = "salonkit.online";
const e = { ...env, ROOT_DOMAIN: ROOT };
let pending: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException() {} } as unknown as ExecutionContext;
const call = (url: string, init?: RequestInit) => app.fetch(new Request(url, init), e, ctx);
const flush = async () => {
  await Promise.all(pending);
  pending = [];
};
afterEach(async () => {
  await flush();
  setServicesForTest(null);
});

const json = { "content-type": "application/json" };
const pub = (slug: string, path: string, init?: RequestInit) => call(`https://${slug}.${ROOT}/api/public/booking${path}`, init);
const book = (slug: string, b: Record<string, unknown>, ip = "10.2.0.1") =>
  pub(slug, "", { method: "POST", headers: { ...json, "CF-Connecting-IP": ip, Origin: "https://site.example" }, body: JSON.stringify(b) });
const token = async (slug: string, username: string) =>
  ((await (
    await call(`https://${slug}.${ROOT}/api/mobile/session`, {
      method: "POST",
      headers: { ...json, "CF-Connecting-IP": "10.2.0.9" },
      body: JSON.stringify({ username, password: "pass1234", device: { id: `dev-${slug}-${username}`, name: "Phone", platform: "ios", app_version: "1.0.0" } }),
    })
  ).json()) as { token: string }).token;
const authed = (slug: string, tok: string, path: string, init: RequestInit = {}) =>
  call(`https://${slug}.${ROOT}/api${path}`, { ...init, headers: { ...json, authorization: `Bearer ${tok}`, ...(init.headers ?? {}) } });

/** A salon with online bookings on, two barbers, two services, open 10:00-22:00 every day. */
async function salon(slug: string, on = true) {
  const org = await makeOrg({ slug, plan: "pro" });
  await makeUser(org.id, { username: "own" });
  const a = await makeUser(org.id, { username: "sara", role: "barber" });
  const b = await makeUser(org.id, { username: "maya", role: "barber" });
  await env.DB.prepare("UPDATE orgs SET owner_email = ? WHERE id = ?").bind(`owner@${slug}.test`, org.id).run();
  if (on) await env.DB.prepare("INSERT INTO org_feature_overrides(org_id,feature_key,enabled,set_at) VALUES(?,?,1,?)").bind(org.id, "online_bookings", Date.now()).run();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO services(org_id,uid,category,name,price,sort_order,active,created_at,updated_at) VALUES(?,?,?,?,?,?,1,?,?)").bind(org.id, "s1", "Hair", "Blow-dry", 10000, 1, now, now),
    env.DB.prepare("INSERT INTO services(org_id,uid,category,name,price,sort_order,active,created_at,updated_at) VALUES(?,?,?,?,?,?,1,?,?)").bind(org.id, "s2", "Nails", "Gel polish", 15000, 2, now, now),
  ]);
  const svc = (await env.DB.prepare("SELECT id FROM services WHERE org_id = ? ORDER BY sort_order").bind(org.id).all<{ id: number }>()).results.map((r) => r.id);
  await env.DB.prepare("INSERT INTO booking_settings(org_id,hours,site_origins,durations,updated_at) VALUES(?,?,?,?,?)")
    .bind(org.id, JSON.stringify(DEFAULT_HOURS), "https://site.example", JSON.stringify({ [svc[1]]: 45 }), now)
    .run();
  return { org, staff: [a.id, b.id], svc };
}

/** Tomorrow in Dubai (always inside the window, never affected by the notice period). */
const tomorrow = () => {
  const d = new Date(`${localNow(Date.now(), "Asia/Dubai").day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

describe("slots maths", () => {
  it("fits bookings inside opening hours and around busy times", () => {
    const day = "2026-11-12";
    const per = freeSlots({ day, hours: DEFAULT_HOURS, step: 30, minutes: 60, staff: [1, 2], busy: [{ staff_id: 1, start_min: 600, end_min: 660 }] });
    expect(per.get(1)![0]).toBe(660); // 10:00 taken, next start 11:00
    expect(per.get(2)![0]).toBe(600);
    expect(per.get(1)!.at(-1)).toBe(1260); // last start 21:00 for a 60 min booking ending 22:00
    expect(anyFree(per)[0]).toBe(600);
    expect(pickStaff(per, 600, [])).toBe(2);
    expect(freeSlots({ day, hours: [null, null, null, null, null, null, null], step: 30, minutes: 60, staff: [1], busy: [] }).size).toBe(0);
  });
});

describe("public booking API", () => {
  it("needs a Turnstile pass when Turnstile is on", async () => {
    setServicesForTest(() => fakeServices({ turnstileOk: (t) => t === "good" }).services);
    const { staff, svc } = await salon("bk-bot");
    const b = { day: tomorrow(), time: "12:00", staff: staff[0], services: [svc[0]], name: "Rita", phone: "0501234567" };
    const send = (extra: Record<string, unknown>) =>
      app.fetch(
        new Request(`https://bk-bot.${ROOT}/api/public/booking`, { method: "POST", headers: { ...json, "CF-Connecting-IP": "10.2.7.1", Origin: "https://site.example" }, body: JSON.stringify({ ...b, ...extra }) }),
        { ...e, TURNSTILE_SECRET: "s" },
        ctx,
      );
    const r = await send({});
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ code: "turnstile" });
    expect((await send({ turnstile: "good" })).status).toBe(201);
  });

  it("is 404 unless the super admin switched the feature on", async () => {
    await salon("bk-off", false);
    expect((await pub("bk-off", "/config")).status).toBe(404);
  });

  it("config lists staff and services with durations; CORS only for the salon's site", async () => {
    const { svc } = await salon("bk-cfg");
    const r = await pub("bk-cfg", "/config", { headers: { Origin: "https://site.example" } });
    expect(r.status).toBe(200);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe("https://site.example");
    const body = (await r.json()) as { staff: { name: string }[]; services: { id: number; minutes: number }[] };
    expect(body.staff.map((s) => s.name).sort()).toEqual(["maya", "sara"]);
    expect(body.services.find((s) => s.id === svc[1])!.minutes).toBe(45);
    const other = await pub("bk-cfg", "/config", { headers: { Origin: "https://evil.example" } });
    expect(other.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("books a slot, emails the owner and the client, and the slot is gone for that stylist", async () => {
    const f = fakeServices();
    f.install();
    const { org, staff, svc } = await salon("bk-book");
    const day = tomorrow();
    const r = await book("bk-book", { day, time: "10:00", staff: staff[0], services: [svc[0]], name: "Aisha Khan", phone: "0501234567", email: "aisha@client.test" });
    expect(r.status).toBe(201);
    const res = (await r.json()) as { ref: string; token: string };
    expect(res.ref).toMatch(/^B[A-Z2-9]{6}$/);
    await flush();
    expect(f.mails.map((m) => m.to).sort()).toEqual(["aisha@client.test", "owner@bk-book.test"]);
    const slots = (await (await pub("bk-book", `/slots?day=${day}&services=${svc[0]}&staff=${staff[0]}`)).json()) as { times: string[] };
    expect(slots.times).not.toContain("10:00");
    expect(slots.times).not.toContain("09:30");
    // Same stylist, overlapping time: refused.
    expect((await book("bk-book", { day, time: "10:30", staff: staff[0], services: [svc[0]], name: "B", phone: "0501234568" }, "10.2.0.2")).status).toBe(409);
    // "Any": goes to the other stylist.
    const any = await book("bk-book", { day, time: "10:00", staff: "any", services: [svc[0]], name: "C", phone: "0501234569" }, "10.2.0.3");
    expect(any.status).toBe(201);
    const rows = (await env.DB.prepare("SELECT staff_id FROM bookings WHERE org_id = ? ORDER BY id").bind(org.id).all<{ staff_id: number }>()).results;
    expect(rows.map((x) => x.staff_id)).toEqual([staff[0], staff[1]]);
    // The client can see and cancel it from their link.
    const view = (await (await pub("bk-book", `/b/${res.token}`)).json()) as { status: string; can_cancel: boolean };
    expect(view).toMatchObject({ status: "confirmed", can_cancel: true });
    expect((await pub("bk-book", `/b/${res.token}/cancel`, { method: "POST", headers: { "CF-Connecting-IP": "10.2.0.4" } })).status).toBe(200);
    expect(((await (await pub("bk-book", `/b/${res.token}`)).json()) as { status: string }).status).toBe("cancelled");
  });

  it("rejects bad input and drops bots silently", async () => {
    const { org, svc } = await salon("bk-bad");
    const day = tomorrow();
    expect((await book("bk-bad", { day, time: "10:00", services: [svc[0]], name: "A", phone: "12" })).status).toBe(400);
    expect((await book("bk-bad", { day, time: "23:00", services: [svc[0]], name: "A", phone: "0501234567" }, "10.2.1.1")).status).toBe(409);
    expect((await book("bk-bad", { day: "2099-01-01", time: "10:00", services: [svc[0]], name: "A", phone: "0501234567" }, "10.2.1.2")).status).toBe(400);
    expect((await book("bk-bad", { day, time: "10:00", services: [9999], name: "A", phone: "0501234567" }, "10.2.1.3")).status).toBe(400);
    expect((await book("bk-bad", { day, time: "10:00", services: [svc[0]], name: "A", phone: "0501234567", website: "http://spam" }, "10.2.1.4")).status).toBe(201);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM bookings WHERE org_id = ?").bind(org.id).first<{ n: number }>();
    expect(n!.n).toBe(0);
  });
});

describe("Bookings page API", () => {
  it("owner lists everyone's bookings and changes status; a barber sees only their own", async () => {
    const { staff, svc } = await salon("bk-page");
    const day = tomorrow();
    await book("bk-page", { day, time: "11:00", staff: staff[0], services: [svc[0]], name: "A", phone: "0501234567" });
    await book("bk-page", { day, time: "11:00", staff: staff[1], services: [svc[1]], name: "B", phone: "0501234568" }, "10.2.2.2");
    const own = await token("bk-page", "own");
    const list = (await (await authed("bk-page", own, `/bookings?from=${day}&to=${day}`)).json()) as { items: { id: number; staff_id: number }[] };
    expect(list.items).toHaveLength(2);
    const sara = await token("bk-page", "sara");
    const mine = (await (await authed("bk-page", sara, `/bookings?from=${day}&to=${day}`)).json()) as { items: { staff_id: number }[] };
    expect(mine.items.map((x) => x.staff_id)).toEqual([staff[0]]);
    expect((await authed("bk-page", own, `/bookings/${list.items[0].id}`, { method: "PATCH", body: JSON.stringify({ status: "completed" }) })).status).toBe(200);
    // Manual booking by the salon, any time, still no double booking.
    expect((await authed("bk-page", own, "/bookings", { method: "POST", body: JSON.stringify({ day, time: "11:30", staff: staff[1], services: [svc[0]], name: "Walk in", phone: "0501230000" }) })).status).toBe(409);
    expect((await authed("bk-page", own, "/bookings", { method: "POST", body: JSON.stringify({ day, time: "08:00", staff: staff[1], services: [svc[0]], name: "Early", phone: "0501230000" }) })).status).toBe(201);
  });

  it("settings round-trip, and staff cannot read them", async () => {
    await salon("bk-set");
    const own = await token("bk-set", "own");
    const hours = Array.from({ length: 7 }, (_, i) => (i === 5 ? null : { open: "09:00", close: "21:00" }));
    const put = await authed("bk-set", own, "/bookings/settings", { method: "PUT", body: JSON.stringify({ hours, slot_min: 15, notify_email: "alerts@salon.test", site_origins: ["https://a.example/"] }) });
    expect(put.status).toBe(200);
    const got = (await (await authed("bk-set", own, "/bookings/settings")).json()) as { hours: unknown[]; slot_min: number; notify_email: string; site_origins: string[] };
    expect(got.hours[5]).toBeNull();
    expect(got).toMatchObject({ slot_min: 15, notify_email: "alerts@salon.test", site_origins: ["https://a.example"] });
    expect((await authed("bk-set", await token("bk-set", "sara"), "/bookings/settings")).status).toBe(403);
  });

  it("is 403 for a salon without the feature", async () => {
    await salon("bk-nofeat", false);
    expect((await authed("bk-nofeat", await token("bk-nofeat", "own"), "/bookings")).status).toBe(403);
  });
});
