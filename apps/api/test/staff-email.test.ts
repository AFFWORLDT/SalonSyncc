import { env } from "cloudflare:test";
import { describe, it, expect, afterEach } from "vitest";
import app from "../src/index";
import { makeOrg, makeUser, loginAs } from "./helpers";
import { fakeServices } from "./fakes";
import { setServicesForTest } from "../src/core/services";
import { settingsRepo } from "../src/data/tenant";
import { runStaffDaily, runStaffMonthly, staffMonthlyDue, MONTHLY_HOUR } from "../src/jobs/email-jobs";
import type { Org } from "../src/data/platform";

// waitUntil work is collected so a test can wait for the emails sent after the response.
let pending: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException() {} } as unknown as ExecutionContext;
const settle = async () => {
  while (pending.length) await Promise.all(pending.splice(0));
};
const E = { ...env, ROOT_DOMAIN: "" };
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

let f = fakeServices();
afterEach(() => setServicesForTest(null));
const install = () => {
  f = fakeServices();
  f.install();
};

async function sale(orgId: string, barberId: number, day: string, amount: number, commission = 0) {
  await env.DB.prepare(
    "INSERT INTO sales(org_id,bill_no,token,day,barber_id,customer_label,amount,payment_mode,commission_pct,commission,vat_rate,vat_amount,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  )
    .bind(orgId, `B-${Math.random()}`, `t${Math.random()}`, day, barberId, "Customer 1", amount, "cash", 0, commission, 0, 0, barberId, Date.now(), Date.now())
    .run();
}

async function setup(slug: string) {
  const org = await makeOrg({ slug, plan: "pro_max" });
  const own = await makeUser(org.id, { username: "own", role: "owner" });
  const b1 = await makeUser(org.id, { username: "b1", role: "barber" });
  const b2 = await makeUser(org.id, { username: "b2", role: "barber" });
  return { org, own, b1, b2, ck: await loginAs(slug, "own") };
}

describe("staff email", () => {
  it("is optional, checked, lower-cased, kept when omitted and cleared with null", async () => {
    const { b1, ck } = await setup("se-field");
    expect((await call("PUT", `/users/${b1.id}`, ck, { name: "b1", username: "b1", email: "not-an-email" })).status).toBe(400);
    const r = await call("PUT", `/users/${b1.id}`, ck, { name: "b1", username: "b1", email: " Sam@Mail.COM " });
    expect(r.status).toBe(200);
    expect(((await r.json()) as any).email).toBe("sam@mail.com");
    const kept: any = await (await call("PUT", `/users/${b1.id}`, ck, { name: "b1", username: "b1" })).json();
    expect(kept.email).toBe("sam@mail.com");
    const created: any = await (await call("POST", "/users", ck, { name: "New", username: "newb", password: "pass1234", email: "new@x.io" })).json();
    expect(created.email).toBe("new@x.io");
    const cleared: any = await (await call("PUT", `/users/${b1.id}`, ck, { name: "b1", username: "b1", email: null })).json();
    expect(cleared.email).toBeNull();
  });

  it("announcements go by email only when asked, to recipients with an email", async () => {
    install();
    const { org, b1, ck } = await setup("se-ann");
    await env.DB.prepare("UPDATE users SET email = 'b1@x.io' WHERE id = ?").bind(b1.id).run();
    expect((await call("POST", "/announcements", ck, { audience: "all", title: "Hi", body: "No email" })).status).toBe(201);
    await settle();
    expect(f.mails).toHaveLength(0);
    expect((await call("POST", "/announcements", ck, { audience: "all", title: "Meeting", body: "At 5pm\n\nBring towels", email: true })).status).toBe(201);
    await settle();
    expect(f.mails.map((m) => m.to)).toEqual(["b1@x.io"]);
    expect(f.mails[0]!.subject).toContain("Meeting");
    expect(f.mails[0]!.text).toContain("Bring towels");
    void org;
  });

  it("the daily email: each barber with an email, their own numbers, once a day", async () => {
    install();
    const { org, b1, b2 } = await setup("se-day");
    await env.DB.prepare("UPDATE users SET email = 'day@x.io' WHERE id = ?").bind(b1.id).run();
    await sale(org.id, b1.id, "2026-11-07", 4000, 400);
    await sale(org.id, b1.id, "2026-11-07", 2500, 250);
    await sale(org.id, b1.id, "2026-11-06", 5000, 500);
    await sale(org.id, b2.id, "2026-11-07", 9000, 900); // no email: nothing for b2
    const s = await settingsRepo(env.DB, org.id).get();
    const budget = { left: 10 };
    expect(await runStaffDaily(E, org as Org, s, "2026-11-07", Date.now(), budget)).toBe("sent");
    expect(budget.left).toBe(9);
    expect(f.mails).toHaveLength(1);
    expect(f.mails[0]!.to).toBe("day@x.io");
    expect(f.mails[0]!.subject).toContain("2 customers");
    expect(f.mails[0]!.text).toContain("vs yesterday");
    expect(await runStaffDaily(E, org as Org, s, "2026-11-07", Date.now(), budget)).toBe("done");
    expect(f.mails).toHaveLength(1);
    expect(await runStaffDaily(E, org as Org, s, "2026-11-08", Date.now(), { left: 0 })).toBe("budget");
  });

  it("the monthly email: last month's totals on the 1st, only for people who sold", async () => {
    install();
    const { org, b1, b2 } = await setup("se-month");
    await env.DB.prepare("UPDATE users SET email = id || '@x.io' WHERE id IN (?, ?)").bind(b1.id, b2.id).run();
    await sale(org.id, b1.id, "2026-10-03", 4000, 400);
    await sale(org.id, b1.id, "2026-10-20", 6000, 600);
    await sale(org.id, b1.id, "2026-11-01", 9999); // November: not in October's email
    const s = await settingsRepo(env.DB, org.id).get();
    expect(await runStaffMonthly(E, org as Org, s, "2026-11-01", Date.now(), { left: 5 })).toBe("sent");
    expect(f.mails.map((m) => m.to)).toEqual([`${b1.id}@x.io`]);
    expect(f.mails[0]!.subject).toContain("October 2026");
    expect(f.mails[0]!.text).toContain("Customers: 2 over 2 days");
  });

  it("monthly is due only on the 1st around MONTHLY_HOUR, and not when switched off", async () => {
    const org = await makeOrg({ slug: "se-due" });
    const s = { ...(await settingsRepo(env.DB, org.id).get()), timezone: "UTC", day_start_hour: 0 };
    const at = (d: string, h: number) => Date.parse(`${d}T${String(h).padStart(2, "0")}:05:00Z`);
    expect(staffMonthlyDue(at("2026-11-01", MONTHLY_HOUR), s)).toBe("2026-11-01");
    expect(staffMonthlyDue(at("2026-11-02", MONTHLY_HOUR), s)).toBeNull();
    expect(staffMonthlyDue(at("2026-11-01", 3), s)).toBeNull();
    expect(staffMonthlyDue(at("2026-11-01", MONTHLY_HOUR), { ...s, email_staff_monthly: false })).toBeNull();
  });

  it("an admin changing a barber's sale emails that barber when changes are announced", async () => {
    install();
    const { org, b1, ck } = await setup("se-change");
    await env.DB.prepare("UPDATE users SET email = 'change@x.io' WHERE id = ?").bind(b1.id).run();
    await env.DB.prepare("UPDATE org_settings SET notify_barber_changes = 1 WHERE org_id = ?").bind(org.id).run();
    const created: any = await (await call("POST", "/sales", ck, { amount: "40", payment_mode: "cash", barber_id: b1.id })).json();
    await settle();
    f.mails.length = 0;
    const r = await call("DELETE", `/sales/${created.id}`, ck);
    expect(r.status).toBe(200);
    await settle();
    expect(f.mails.map((m) => m.to)).toEqual(["change@x.io"]);
    expect(f.mails[0]!.subject).toContain("deleted your bill");
  });

  it("settings: the two switches are on by default, and an app that doesn't send them keeps them", async () => {
    const { org, ck } = await setup("se-set");
    const s: any = await (await call("GET", "/settings", ck)).json();
    expect(s.email_staff_daily).toBe(true);
    expect(s.email_staff_monthly).toBe(true);
    const { email_staff_daily: _d, email_staff_monthly: _m, currency_minor: _c, logo_url: _l, brand_color: _b, wa_ready: _w, ...rest } = s;
    expect((await call("PUT", "/settings", ck, { ...rest, email_staff_monthly: false })).status).toBe(200);
    expect((await call("PUT", "/settings", ck, rest)).status).toBe(200);
    const after = await settingsRepo(env.DB, org.id).get();
    expect(after.email_staff_daily).toBe(true);
    expect(after.email_staff_monthly).toBe(false);
  });
});
