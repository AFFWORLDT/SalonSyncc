import { env } from "cloudflare:test";
import { describe, it, expect, afterEach, vi } from "vitest";
import type { Env } from "../src/env";
import { hourly, CRON_STMTS } from "../src/jobs/hourly";
import { setServicesForTest } from "../src/core/services";
import { fakeServices } from "./fakes";
import { countingDb } from "./counting-db";
import { makeOrg } from "./helpers";
import { lifecycleEmail } from "../src/emails/lifecycle";

const DAY = 86_400_000;
// Minute 0 of an hour (the lifecycle runs hourly).
const T0 = Date.UTC(2026, 10, 10, 6, 0, 0);
const E = { ...env, ROOT_DOMAIN: "salonkit.online", RESEND_API_KEY: "re_test", MAIL_FROM: "SalonKit <hello@salonkit.online>" } as Env;

afterEach(() => {
  setServicesForTest(null);
  vi.useRealTimers();
});

async function trialOrg(slug: string, trialEnds: number, opts: { plan?: "free" | "pro_max"; email?: boolean } = {}) {
  const o = await makeOrg({ slug, status: "trial", plan: opts.plan ?? "pro_max" });
  await env.DB.prepare("UPDATE orgs SET trial_ends_at = ?, grace_ends_at = ?, owner_email = ? WHERE id = ?")
    .bind(trialEnds, trialEnds + 7 * DAY, opts.email === false ? null : `${slug}@example.com`, o.id)
    .run();
  return o;
}
const statusOf = async (id: string) => (await env.DB.prepare("SELECT status FROM orgs WHERE id = ?").bind(id).first<{ status: string }>())!.status;
const kinds = async (id: string) => (await env.DB.prepare("SELECT kind, status FROM email_log WHERE org_id = ? ORDER BY id").bind(id).all<{ kind: string; status: string }>()).results;

async function tick(at: number) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at);
  const { db, count } = countingDb(env.DB);
  const r = await hourly({ ...E, DB: db }, at);
  expect(CRON_STMTS - r.stmtsLeft, "meter vs counting proxy").toBe(count.statements);
  expect(count.statements).toBeLessThanOrEqual(45);
  return r;
}

describe("lifecycle state machine (injected clock)", () => {
  it("trial -> (2-day email) -> grace with daily reminders -> expired, each email once", async () => {
    const f = fakeServices();
    f.install();
    const start = T0;
    const o = await trialOrg("life-a", start + 7 * DAY);

    await tick(start); // day 0: nothing due
    expect(await statusOf(o.id)).toBe("trial");
    expect(await kinds(o.id)).toEqual([]);

    await tick(start + 5 * DAY + 3_600_000); // 2 days left
    expect((await kinds(o.id)).map((k) => k.kind)).toEqual(["trial_ending"]);
    await tick(start + 5 * DAY + 7_200_000); // again: not twice
    expect((await kinds(o.id)).length).toBe(1);

    await tick(start + 7 * DAY); // trial over
    expect(await statusOf(o.id)).toBe("grace");
    expect((await kinds(o.id)).map((k) => k.kind)).toEqual(["trial_ending", "grace_reminder_1"]);

    for (let d = 1; d < 7; d++) await tick(start + (7 + d) * DAY);
    expect((await kinds(o.id)).map((k) => k.kind)).toEqual(["trial_ending", ...Array.from({ length: 7 }, (_, i) => `grace_reminder_${i + 1}`)]);
    expect(await statusOf(o.id)).toBe("grace");

    await tick(start + 14 * DAY); // grace over
    expect(await statusOf(o.id)).toBe("expired");
    expect((await kinds(o.id)).at(-1)).toEqual({ kind: "expired", status: "sent" });
    await tick(start + 15 * DAY);
    expect(await statusOf(o.id)).toBe("expired"); // nothing deleted, nothing more sent
    expect((await kinds(o.id)).length).toBe(9);

    const audit = await env.DB.prepare("SELECT who, action, after_json FROM platform_audit WHERE org_id = ? ORDER BY id").bind(o.id).all<any>();
    expect(audit.results.map((a: any) => [a.who, a.action, JSON.parse(a.after_json).status])).toEqual([
      ["system", "trial_ended", "grace"],
      ["system", "grace_ended", "expired"],
    ]);
  });

  it("a Free trial becomes active (Free is permanent)", async () => {
    const o = await trialOrg("life-free", T0 - 1, { plan: "free" });
    await tick(T0);
    expect(await statusOf(o.id)).toBe("active");
  });

  it("paid by hand until a date: then 7 days payment due, then expired", async () => {
    const o = await makeOrg({ slug: "life-manual", status: "active", plan: "pro" });
    await env.DB.prepare("UPDATE subscriptions SET provider = 'manual', current_period_end = ? WHERE org_id = ?").bind(T0 - 1, o.id).run();
    await tick(T0);
    expect(await statusOf(o.id)).toBe("past_due");
    await tick(T0 + 7 * DAY);
    expect(await statusOf(o.id)).toBe("expired");
  });

  it("paid salons without an end date, and Free salons, never move", async () => {
    const paid = await makeOrg({ slug: "life-paid", status: "active", plan: "pro" });
    const free = await makeOrg({ slug: "life-freeact", status: "active", plan: "free" });
    await tick(T0 + 100 * DAY);
    expect(await statusOf(paid.id)).toBe("active");
    expect(await statusOf(free.id)).toBe("active");
  });

  it("a deactivated salon gets one email; salons without an email get none", async () => {
    const f = fakeServices();
    f.install();
    const o = await trialOrg("life-deact", T0 + 30 * DAY);
    await env.DB.prepare("UPDATE orgs SET status = 'deactivated' WHERE id = ?").bind(o.id).run();
    const silent = await trialOrg("life-silent", T0 - DAY, { email: false });
    await tick(T0);
    await tick(T0 + 3_600_000);
    expect((await kinds(o.id)).map((k) => k.kind)).toEqual(["deactivated"]);
    expect(await kinds(silent.id)).toEqual([]);
    expect(await statusOf(silent.id)).toBe("grace");
  });

  it("only runs on the hour", async () => {
    const o = await trialOrg("life-hour", T0 - 1);
    await tick(T0 + 10 * 60_000);
    expect(await statusOf(o.id)).toBe("trial");
  });
});

describe("lifecycle emails", () => {
  const base = { brand: "SalonKit", siteUrl: "https://salonkit.online", salonName: "<b>Bad</b> & Co", salonUrl: "https://bad.salonkit.online/", now: T0, supportEmail: "" };
  it("say the right thing and escape the salon name", () => {
    const t = lifecycleEmail({ ...base, kind: "trial_ending", trialEndsAt: T0 + 2 * DAY, graceEndsAt: null });
    expect(t.subject).toBe("Your SalonKit trial ends in 2 days");
    expect(t.html).toContain("&lt;b&gt;Bad&lt;/b&gt; &amp; Co");
    expect(t.html).not.toContain("<b>Bad</b>");
    expect(t.html).toContain("https://bad.salonkit.online/plan/");
    const g = lifecycleEmail({ ...base, kind: "grace_reminder", trialEndsAt: null, graceEndsAt: T0 + 3 * DAY });
    expect(g.subject).toContain("3 days left");
    expect(lifecycleEmail({ ...base, kind: "expired", trialEndsAt: null, graceEndsAt: null }).text).toContain("read-only");
    expect(lifecycleEmail({ ...base, kind: "deactivated", trialEndsAt: null, graceEndsAt: null }).html).not.toContain("/plan/");
  });
});
