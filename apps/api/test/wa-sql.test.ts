import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { makeOrg, makeUser } from "./helpers";
import { FEEDBACK_DUE_SQL, RATING_REMINDER_DUE_SQL, VISIT_REMINDER_DUE_SQL, waJobsRepo } from "../src/data/tenant";

/**
 * The WhatsApp job queries (data/tenant/wa-sql.ts) on the real D1 schema (migrations), not an inline one (INV §8.15).
 * Keeps FM's numbered-placeholder lesson (FM wa-sql.test.ts, bill FM-20261030-006): with a sale id AND a limit both
 * bound, the limit must never be read as the sale id.
 */
const DAY = 86_400_000;
let n = 0;
async function seedOrg(slug: string) {
  const org = await makeOrg({ slug, plan: "pro_max" });
  const barber = await makeUser(org.id, { username: "faizan", role: "barber" });
  return { org, barber };
}
async function customer(orgId: string, phone: string, extra: { name?: string; wa_opt_out?: number; last_visit_at?: number | null; wa_reminded_at?: number | null } = {}) {
  const r = await env.DB.prepare(
    "INSERT INTO customers (org_id, name, phone, created_at, wa_opt_out, last_visit_at, wa_reminded_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id",
  )
    .bind(orgId, extra.name ?? "Laxmikant Saraswat", phone, 1, extra.wa_opt_out ?? 0, extra.last_visit_at ?? null, extra.wa_reminded_at ?? null)
    .first<{ id: number }>();
  return r!.id;
}
async function sale(orgId: string, barberId: number, customerId: number, createdAt: number, extra: { wa_feedback_at?: number | null } = {}) {
  const k = ++n;
  const r = await env.DB.prepare(
    `INSERT INTO sales (org_id, bill_no, token, day, barber_id, customer_id, customer_label, amount, payment_mode, commission_pct, commission,
       vat_rate, vat_amount, created_by, created_at, updated_at, wa_feedback_at)
     VALUES (?, ?, ?, '2026-11-01', ?, ?, 'Laxmikant', 1000, 'cash', 0, 0, 0, 0, ?, ?, ?, ?) RETURNING id`,
  )
    .bind(orgId, `B-${k}`, `tok-sql-${k}-${Math.random()}`, barberId, customerId, barberId, createdAt, createdAt, extra.wa_feedback_at ?? null)
    .first<{ id: number }>();
  await env.DB.prepare("INSERT INTO sale_items (org_id, sale_id, name, price, qty) VALUES (?, ?, 'Haircut', 1000, 1), (?, ?, 'Beard', 500, 2)")
    .bind(orgId, r!.id, orgId, r!.id)
    .run();
  return r!.id;
}
const rawDue = (orgId: string, at: number, saleId: number | null, limit: number) =>
  env.DB.prepare(FEEDBACK_DUE_SQL).bind(orgId, at - 20 * 3_600_000, at, at - DAY, saleId, limit).all<{ id: number; services: string; barber_name: string; recent: number }>();

describe("FEEDBACK_DUE_SQL", () => {
  it("numbered placeholders: a sale id with limit 1 finds that sale; no sale id lists all newest first up to the limit", async () => {
    const { org, barber } = await seedOrg("wsql-fb");
    const c = await customer(org.id, "+919511506049");
    const old = await sale(org.id, barber.id, c, 900);
    const fresh = await sale(org.id, barber.id, c, 1000);
    expect((await rawDue(org.id, 1000, fresh, 1)).results.map((r) => r.id)).toEqual([fresh]);
    expect((await rawDue(org.id, 1000, old, 1)).results.map((r) => r.id)).toEqual([old]);
    const one = (await rawDue(org.id, 1000, fresh, 1)).results[0]!;
    expect(one.services).toBe("Haircut, Beard x2");
    expect(one.barber_name).toBe("faizan");
    expect((await rawDue(org.id, 1000, null, 40)).results.map((r) => r.id)).toEqual([fresh, old]);
    expect((await rawDue(org.id, 1000, null, 1)).results.map((r) => r.id)).toEqual([fresh]);
  });

  it("skips asked, deleted, opted-out and out-of-window sales; flags a customer asked in the last 20 hours", async () => {
    const { org, barber } = await seedOrg("wsql-fb2");
    const at = 10 * DAY;
    const c = await customer(org.id, "+971501111111");
    const out = await customer(org.id, "+971502222222", { wa_opt_out: 1 });
    const due = await sale(org.id, barber.id, c, at - 1000);
    await sale(org.id, barber.id, c, at - 2000, { wa_feedback_at: at - 1500 }); // already asked
    const del = await sale(org.id, barber.id, c, at - 3000);
    await env.DB.prepare("UPDATE sales SET deleted_at = 1 WHERE org_id = ? AND id = ?").bind(org.id, del).run();
    await sale(org.id, barber.id, out, at - 1000); // opted out (RF3)
    await sale(org.id, barber.id, c, at - DAY - 1); // older than a day
    await sale(org.id, barber.id, c, at + 1); // newer than the cutoff
    const repo = waJobsRepo(env.DB, org.id);
    expect((await repo.feedbackDue(at - 20 * 3_600_000, at, at - DAY, null, 40)).map((r) => [r.id, r.recent])).toEqual([[due, 0]]);
    await env.DB.prepare("INSERT INTO wa_messages (org_id, kind, customer_id, phone, template, status, created_at) VALUES (?, 'feedback', ?, 'x', 'ss_rating', 'sent', ?)")
      .bind(org.id, c, at - 19 * 3_600_000)
      .run();
    expect((await repo.feedbackDue(at - 20 * 3_600_000, at, at - DAY, null, 40)).map((r) => [r.id, r.recent])).toEqual([[due, 1]]);
  });

  it("is org-scoped: org B's due sales (and B's sale id) never come back for org A", async () => {
    const a = await seedOrg("wsql-fba");
    const b = await seedOrg("wsql-fbb");
    const ca = await customer(a.org.id, "+971503333333");
    const cb = await customer(b.org.id, "+971503333333");
    const sa = await sale(a.org.id, a.barber.id, ca, 1000);
    const sb = await sale(b.org.id, b.barber.id, cb, 1000);
    // B's customer was asked recently: that must not mark A's same-phone customer as recent.
    await env.DB.prepare("INSERT INTO wa_messages (org_id, kind, customer_id, phone, template, status, created_at) VALUES (?, 'feedback', ?, 'x', 'ss_rating', 'sent', 999)")
      .bind(b.org.id, ca)
      .run();
    const repo = waJobsRepo(env.DB, a.org.id);
    expect((await repo.feedbackDue(0, 1000, 0, null, 40)).map((r) => [r.id, r.recent])).toEqual([[sa, 0]]);
    expect(await repo.feedbackDue(0, 1000, 0, sb, 40)).toEqual([]);
  });
});

describe("RATING_REMINDER_DUE_SQL", () => {
  it("only bills whose request was sent with the request template, not rated and not tapped through to Google", async () => {
    const { org, barber } = await seedOrg("wsql-rr");
    const c = await customer(org.id, "+971504444444");
    const plain = await sale(org.id, barber.id, c, 1000, { wa_feedback_at: 1000 });
    const clicked = await sale(org.id, barber.id, c, 1000, { wa_feedback_at: 1000 });
    const rated = await sale(org.id, barber.id, c, 1000, { wa_feedback_at: 1000 });
    const failed = await sale(org.id, barber.id, c, 1000, { wa_feedback_at: 1000 });
    const otherTpl = await sale(org.id, barber.id, c, 1000, { wa_feedback_at: 1000 });
    for (const [id, tpl, st] of [[plain, "ss_rating", "sent"], [clicked, "ss_rating", "sent"], [rated, "ss_rating", "sent"], [failed, "ss_rating", "failed"], [otherTpl, "old_tpl", "sent"]] as const)
      await env.DB.prepare("INSERT INTO wa_messages (org_id, kind, customer_id, phone, template, status, sale_id, created_at) VALUES (?, 'feedback', ?, 'x', ?, ?, ?, 1000)")
        .bind(org.id, c, tpl, st, id)
        .run();
    await env.DB.prepare("UPDATE sales SET review_clicked_at = 1500 WHERE org_id = ? AND id = ?").bind(org.id, clicked).run();
    await env.DB.prepare("INSERT INTO ratings (org_id, sale_id, customer_id, barber_id, stars, created_at, updated_at) VALUES (?, ?, ?, ?, 5, 1, 1)")
      .bind(org.id, rated, c, barber.id)
      .run();
    const at = 1000 + 7_200_000;
    const raw = await env.DB.prepare(RATING_REMINDER_DUE_SQL).bind(org.id, at - 7_200_000, at - 7_200_000 - DAY, "ss_rating", 40).all<{ id: number }>();
    expect(raw.results.map((r) => r.id)).toEqual([plain]);
    expect((await waJobsRepo(env.DB, org.id).ratingReminderDue(999, 999 - DAY, "ss_rating", 40)).map((r) => r.id)).toEqual([]); // not due yet
    expect(await waJobsRepo(env.DB, (await seedOrg("wsql-rr-b")).org.id).ratingReminderDue(at, 0, "ss_rating", 40)).toEqual([]);
  });
});

describe("VISIT_REMINDER_DUE_SQL", () => {
  it("customers with a last visit in [from, to), not reminded since, not opted out, of this org only", async () => {
    const a = await seedOrg("wsql-vr");
    const b = await seedOrg("wsql-vr-b");
    const from = 5 * DAY;
    const to = 6 * DAY;
    const inside = await customer(a.org.id, "+971505555551", { last_visit_at: from });
    const remindedBefore = await customer(a.org.id, "+971505555552", { last_visit_at: from + 10, wa_reminded_at: from - 1 });
    await customer(a.org.id, "+971505555553", { last_visit_at: from + 20, wa_reminded_at: from + 30 }); // reminded since
    await customer(a.org.id, "+971505555554", { last_visit_at: from + 30, wa_opt_out: 1 });
    await customer(a.org.id, "+971505555555", { last_visit_at: to }); // next day
    await customer(a.org.id, "+971505555556", { last_visit_at: from - 1 });
    await customer(b.org.id, "+971505555557", { last_visit_at: from + 5 });
    const raw = await env.DB.prepare(VISIT_REMINDER_DUE_SQL).bind(a.org.id, from, to, 40).all<{ id: number }>();
    expect(raw.results.map((r) => r.id)).toEqual([inside, remindedBefore]);
    expect((await waJobsRepo(env.DB, a.org.id).visitRemindersDue(from, to, 1)).map((r) => r.id)).toEqual([inside]);
  });
});
