import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { buildFmImport, purgeSql, totalsSql, compareTotals, percent, lit, preflightSql, preflightProblems, ID_OFFSET, MAX_STMT, type FmSource, type Row } from "../scripts/fm-import/build";
import { makeOrg, makeUser, loginAs } from "./helpers";
import { checkPassword, hashPassword } from "../src/core/crypto";

const ORG = "org_fm";
const T = 1_761_000_000_000;
const K = ID_OFFSET;

function bytes(n: number, seed = 7): Uint8Array {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = (i * 31 + seed) % 256; // includes 0x00 bytes
  return b;
}

async function fixture(): Promise<FmSource> {
  const hash = await hashPassword("faizan-pass");
  const user = (id: number, username: string, role: string, extra: Row = {}): Row => ({
    id, name: username, username, phone: null, password_hash: hash, role, commission_pct: null, sort_order: id, active: 1,
    session_version: 3, created_at: T + id, updated_at: T + id, avatar: null, avatar_type: null, avatar_v: 0, can_add_expense: 0, ...extra,
  });
  const sale = (id: number, barber: number, customer: number | null, amount: number, extra: Row = {}): Row => ({
    id, bill_no: `FM-20261101-00${id}`, token: `tok${id}`, day: "2026-11-01", barber_id: barber, customer_id: customer,
    customer_label: customer ? "Ali" : "Customer 1", amount, payment_mode: "cash", note: null, commission_pct: 20,
    commission: amount / 5, vat_rate: 0.05, vat_amount: Math.round(amount / 21), created_by: 1, created_at: T + 100 + id,
    updated_at: T + 100 + id, deleted_at: null, wa_feedback_at: null, wa_feedback_reminded_at: null, review_clicked_at: null, ...extra,
  });
  const line = (id: number, book: string, account: string | null, barber: number | null, amount: number, source: string, source_id: number, extra: Row = {}): Row => ({
    id, at: T + id, day: "2026-11-01", book, account, barber_id: barber, amount, kind: source, source, source_id, ref: null, memo: "m",
    reverses_id: null, reversed: 0, actor_id: 1, ...extra,
  });
  return {
    settings: [{
      id: 1, salon_name: "Faizan Mohammed Gents Salon", salon_name_ar: "صالون", tagline: "Since 2010", address: "Dubai", phone: "045551234",
      licence_no: "L1", trn: "T1", vat_enabled: 1, vat_rate: 0.05, default_commission_pct: 20, quick_amounts: "20,30", whatsapp_mode: "link",
      thank_you_text: "Thanks {name} — {salon} {amount} {link}", receipt_footer: "Come again", updated_at: T, notify_sales: 1, notify_sale_min: 0,
      notify_summary: 1, summary_hour: 23, notify_reminder: 1, reminder_hour: 13, notify_barber_changes: 1, wa_bill_auto: 1,
      wa_bill_template: "fm_bill", wa_reminder_enabled: 1, wa_reminder_days: 15, wa_reminder_hour: 11, wa_reminder_template: "fm_fresh_cut",
      wa_language: "en", wa_feedback_enabled: 1, wa_feedback_delay_min: 120, wa_feedback_template: "fm_rating",
      google_review_url: "https://g.example/r", instagram_url: "https://i.example/fm", wa_feedback_reminder_min: 120,
      wa_feedback_reminder_template: "fm_rating_reminder",
    }],
    users: [
      user(1, "old-admin", "admin", { active: 0 }),
      user(2, "faizan", "admin", { avatar: bytes(150_000), avatar_type: "image/webp", avatar_v: 4 }),
      user(3, "sonu", "barber", { commission_pct: 25, can_add_expense: 1 }),
    ],
    customers: [
      { id: 1, name: "Ali", phone: "0501234567", visits: 2, spent: 5000, last_visit_at: T + 102, created_at: T, wa_opt_out: 0, wa_reminded_at: null },
      { id: 2, name: "Omar", phone: "+447700900123", visits: 0, spent: 0, last_visit_at: null, created_at: T, wa_opt_out: 1, wa_reminded_at: T },
    ],
    services: [{ id: 1, category: "Hair", name: "Cut", description: null, price: 3000, sort_order: 0, active: 1, created_at: T, updated_at: T }],
    sales: [sale(1, 3, 1, 3000), sale(2, 2, 1, 2000, { payment_mode: "card" }), sale(3, 3, null, 1500, { deleted_at: T + 500 })],
    sale_items: [
      { id: 1, sale_id: 1, service_id: 1, name: "Cut", price: 3000, qty: 1 },
      { id: 2, sale_id: 2, service_id: null, name: "Beard", price: 1000, qty: 2 },
    ],
    expenses: [{ id: 1, barber_id: 3, day: "2026-11-01", amount: 500, note: "lunch", created_at: T, updated_at: T }],
    company_expenses: [{ id: 1, day: "2026-11-01", amount: 1200, note: "rent", created_by: 2, created_at: T, updated_at: T, paid_from: "bank" }],
    barber_payouts: [{ id: 1, barber_id: 3, day: "2026-11-01", amount: 800, paid_from: "cash", note: null, created_by: 2, created_at: T, updated_at: T }],
    money_transfers: [{ id: 1, day: "2026-11-01", amount: 1000, from_account: "cash", to_account: "bank", note: null, created_by: null, created_at: T, updated_at: T }],
    ledger_entries: [
      line(1, "shop", "cash", null, 10000, "opening", 0),
      line(2, "barber", null, 3, 200, "opening", 3),
      line(3, "shop", "cash", null, 3000, "sale", 1, { reversed: 1 }),
      line(4, "shop", "cash", null, -3000, "sale", 1, { reverses_id: 3 }),
      line(5, "shop", "cash", null, 3000, "sale", 1),
      line(6, "shop", "bank", null, -1200, "company_expense", 1),
      line(7, "barber", null, 3, -800, "payout", 1),
    ],
    audit_log: [
      { id: 1, at: T, actor_id: 2, actor_name: "faizan", entity: "settings", entity_id: 1, ref: null, action: "update", before: "{}", after: "{}" },
      { id: 2, at: T, actor_id: null, actor_name: "faizan", entity: "sale", entity_id: 2, ref: "FM-20261101-002", action: "create", before: null, after: "{}" },
    ],
    notifications: [{ id: 1, user_id: 3, title: "Hi", body: null, path: "/sales", created_at: T, read_at: null }],
    announcements: [{ id: 1, sender_id: 2, audience: "barber", target_id: 3, title: "t", body: "b", recipients: 1, created_at: T }],
    ratings: [{ id: 1, sale_id: 1, customer_id: 1, barber_id: 3, stars: 5, comment: "great", created_at: T, updated_at: T }],
    wa_campaigns: [{ id: 1, template: "fm_offer", language: "en", params: "[]", total: 1, created_by: 2, created_at: T, finished_at: T }],
    wa_messages: [{
      id: 1, kind: "announcement", customer_id: 1, phone: "0501234567", template: "fm_offer", params: "[]", status: "sent", wa_id: "w1",
      error: null, sale_id: null, campaign_id: 1, created_by: 2, created_at: T, sent_at: T, delivered_at: null, read_at: null,
    }],
    counters: [{ name: "bill_20261101", seq: 3 }, { name: "cust_20261101", seq: 1 }],
    push_tokens: [{ token: "old-firebase", user_id: 3, created_at: T, updated_at: T }],
  };
}

async function run(stmts: string[]) {
  for (const s of stmts) await env.DB.prepare(s).run();
}
async function totals() {
  const out: { k: string; v: number }[] = [];
  for (const q of totalsSql("ss", ORG)) out.push(...(await env.DB.prepare(q).all<{ k: string; v: number }>()).results);
  return out;
}
const one = <R>(sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).first<R>();
const opts = { orgId: ORG, slug: "fm", now: T + 10_000, logo: { bytes: bytes(60_000, 3), type: "image/png" } };

describe("FM import", () => {
  let src: FmSource;
  beforeEach(async () => {
    src = await fixture();
    await run(purgeSql(ORG)); // storage is shared across this file's tests
  });

  it("keeps every statement under D1's size limit, photos included", () => {
    const stmts = buildFmImport(src, opts);
    expect(Math.max(...stmts.map((s) => s.length))).toBeLessThan(MAX_STMT);
    expect(stmts.filter((s) => s.startsWith("UPDATE users SET avatar")).length).toBe(4); // 150 000 bytes in 40 000-byte chunks
  });

  it("imports FM as an active manual pro_max org next to an existing salon, with shifted ids", async () => {
    const other = await makeOrg({ slug: "other" });
    await makeUser(other.id, { username: "boss" });
    await run(buildFmImport(src, opts));

    expect(await one("SELECT slug, name, status, plan_id, owner_user_id, country FROM orgs WHERE id = ?", ORG)).toEqual({
      slug: "fm", name: "Faizan Mohammed Gents Salon", status: "active", plan_id: "pro_max", owner_user_id: K + 2, country: "AE",
    });
    expect(await one("SELECT provider, status, current_period_end FROM subscriptions WHERE org_id = ?", ORG)).toEqual({ provider: "manual", status: "active", current_period_end: null });
    const users = await env.DB.prepare("SELECT id, username, role, active, session_version, commission_pct, can_add_expense FROM users WHERE org_id = ? ORDER BY id").bind(ORG).all();
    expect(users.results).toEqual([
      { id: K + 1, username: "old-admin", role: "admin", active: 0, session_version: 3, commission_pct: null, can_add_expense: 0 },
      { id: K + 2, username: "faizan", role: "owner", active: 1, session_version: 3, commission_pct: null, can_add_expense: 0 },
      { id: K + 3, username: "sonu", role: "barber", active: 1, session_version: 3, commission_pct: 25, can_add_expense: 1 },
    ]);
    expect(await one("SELECT COUNT(*) AS n FROM push_tokens WHERE org_id = ?", ORG)).toEqual({ n: 0 });
  });

  it("maps settings: percent VAT, FM prefix and templates, contact phone", async () => {
    await run(buildFmImport(src, opts));
    const s = await one<Record<string, unknown>>("SELECT * FROM org_settings WHERE org_id = ?", ORG);
    expect(s).toMatchObject({
      display_name: "Faizan Mohammed Gents Salon", contact_phone: "045551234", vat_enabled: 1, vat_rate: 5, bill_prefix: "FM",
      currency: "AED", timezone: "Asia/Dubai", day_start_hour: 4, phone_country: "971", default_commission_pct: 20,
      wa_bill_template: "fm_bill", wa_bill_pdf_template: "fm_bill_pdf", wa_feedback_template: "fm_rating",
      wa_reminder_template: "fm_fresh_cut", wa_feedback_reminder_template: "fm_rating_reminder", salon_name_ar: "صالون",
      thank_you_text: "Thanks {name} — {salon} {amount} {link}", google_review_url: "https://g.example/r",
    });
    expect((await one<{ vat_rate: number }>("SELECT vat_rate FROM sales WHERE org_id = ? AND bill_no = 'FM-20261101-001'", ORG))!.vat_rate).toBe(5);
    expect(percent(0.05)).toBe(5);
    expect(percent(0.075)).toBe(7.5);
  });

  it("round-trips photos and the logo byte for byte", async () => {
    await run(buildFmImport(src, opts));
    const u = await one<{ avatar: ArrayBuffer | number[]; avatar_type: string; avatar_v: number }>("SELECT avatar, avatar_type, avatar_v FROM users WHERE org_id = ? AND username = 'faizan'", ORG);
    expect(new Uint8Array(u!.avatar as ArrayBuffer)).toEqual(bytes(150_000));
    expect(u!.avatar_type).toBe("image/webp");
    expect(u!.avatar_v).toBe(4);
    expect(await one("SELECT typeof(avatar) AS t FROM users WHERE org_id = ? AND username = 'faizan'", ORG)).toEqual({ t: "blob" });
    const logo = await one<{ bytes: ArrayBuffer; type: string; v: number }>("SELECT bytes, type, v FROM org_assets WHERE org_id = ?", ORG);
    expect(new Uint8Array(logo!.bytes)).toEqual(bytes(60_000, 3));
    expect(logo!.v).toBe(1);
  });

  it("keeps the ledger's references and balances", async () => {
    await run(buildFmImport(src, opts));
    const r = await one<Record<string, number>>("SELECT source_id, reverses_id FROM ledger_entries WHERE org_id = ? AND id = ?", ORG, K + 4);
    expect(r).toEqual({ source_id: K + 1, reverses_id: K + 3 });
    expect(await one("SELECT source_id FROM ledger_entries WHERE id = ?", K + 1)).toEqual({ source_id: 0 });
    expect(await one("SELECT source_id, barber_id FROM ledger_entries WHERE id = ?", K + 2)).toEqual({ source_id: K + 3, barber_id: K + 3 });
    expect(await one("SELECT entity_id FROM audit_log WHERE id = ?", K + 1)).toEqual({ entity_id: 1 }); // settings
    expect(await one("SELECT entity_id FROM audit_log WHERE id = ?", K + 2)).toEqual({ entity_id: K + 2 }); // sale 2
    const m = Object.fromEntries((await totals()).map((x) => [x.k, x.v]));
    expect(m).toMatchObject({
      "ledger:shop:cash:-": 13000, "ledger:shop:bank:-": -1200, "ledger:barber:-:3": -600,
      "sales:count": 2, "sales:amount": 5000, "count:sales": 3, "day:2026-11-01": 5000, "items:total": 5000,
      "count:counters": 2, "counter:bill_20261101": 3, "avatars:bytes": 150_000,
    });
    expect(m["count:push_tokens"]).toBeUndefined(); // not imported, and not compared
  });

  it("continues FM's bill numbers and lets FM staff sign in with their passwords", async () => {
    await run(buildFmImport(src, opts));
    const owner = await one<{ password_hash: string }>("SELECT password_hash FROM users WHERE org_id = ? AND username = 'faizan'", ORG);
    expect(await checkPassword("faizan-pass", owner!.password_hash)).toBe(true);
    const cookie = await loginAs("fm", "faizan", "faizan-pass");
    expect(cookie).toContain("ss_session=");
    const next = await one<{ value: number }>("UPDATE counters SET value = value + 1 WHERE org_id = ? AND name = 'bill_20261101' RETURNING value", ORG);
    expect(next!.value).toBe(4);
  });

  it("matches FM's totals key for key", async () => {
    await run(buildFmImport(src, opts));
    const ss = await totals();
    // FM-side totals computed straight from the fixture rows
    const live = src.sales!.filter((s) => s.deleted_at === null);
    const sum = (rows: Row[], f: (r: Row) => number) => rows.reduce((a, r) => a + f(r), 0);
    const byKey = Object.fromEntries(ss.map((r) => [r.k, r.v]));
    expect(byKey["sales:amount"]).toBe(sum(live, (s) => Number(s.amount)));
    expect(byKey["sales:commission"]).toBe(sum(live, (s) => Number(s.commission)));
    expect(byKey["customers:spent"]).toBe(5000);
    for (const t of ["users", "customers", "services", "sales", "sale_items", "ledger_entries", "audit_log", "wa_messages", "ratings"])
      expect(byKey[`count:${t}`]).toBe(src[t]!.length);
    expect(compareTotals(ss, ss)).toEqual([]);
    expect(compareTotals([{ k: "a", v: 1 }], [{ k: "a", v: 2 }, { k: "b", v: 0 }])).toEqual(["a: fm=1 salonkit=2", "b: fm=missing salonkit=0"]);
  });

  it("fails loudly on a row whose reference is missing in FM", async () => {
    src.sales!.push({ ...src.sales![0]!, id: 9, bill_no: "FM-X", token: "tokx", barber_id: 77 });
    await expect(run(buildFmImport(src, opts))).rejects.toThrow(/FOREIGN KEY/);
  });

  it("purge removes every row of the org so a failed import can be retried", async () => {
    await run(buildFmImport(src, opts));
    await run(purgeSql(ORG));
    const tables = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND sql LIKE '%org_id%'").all<{ name: string }>();
    for (const { name } of tables.results) expect(await one(`SELECT COUNT(*) AS n FROM ${name} WHERE org_id = ?`, ORG)).toEqual({ n: 0 });
    expect(await one("SELECT COUNT(*) AS n FROM orgs WHERE id = ?", ORG)).toEqual({ n: 0 });
    await run(buildFmImport(src, opts)); // retry works
    expect(await one("SELECT COUNT(*) AS n FROM sales WHERE org_id = ?", ORG)).toEqual({ n: 3 });
  });

  it("refuses an FM without an active admin, and values SQL cannot hold", () => {
    src.users = src.users!.map((u) => ({ ...u, role: "barber" }));
    expect(() => buildFmImport(src, opts)).toThrow(/no active admin/);
    expect(() => lit(Number.NaN)).toThrow();
    expect(lit("it's")).toBe("'it''s'");
    expect(lit(new Uint8Array([0, 255]))).toBe("X'00ff'");
  });

  it("preflight refuses a taken slug or ids already at the offset, and passes on a fresh database", async () => {
    const check = async () => preflightProblems((await env.DB.prepare(preflightSql(ORG, "fm")).all<Record<string, number | null>>()).results[0]!);
    expect(await check()).toEqual([]);
    await run(buildFmImport(src, opts));
    expect(await check()).toEqual(expect.arrayContaining(["the slug fm or org org_fm already exists", expect.stringMatching(/^sales: max id \d+ >= 1000000$/)]));
  });

  it("refuses FM's older text-style WhatsApp templates, which SalonKit cannot fill", () => {
    src.settings![0]!.wa_feedback_template = "fm_feedback";
    expect(() => buildFmImport(src, opts)).toThrow(/picture templates/);
  });
});
