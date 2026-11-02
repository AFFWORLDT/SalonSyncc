import { env } from "cloudflare:test";
import { describe, it, expect, afterEach } from "vitest";
import app from "../src/index";
import { makeOrg, makeUser, loginAs } from "./helpers";
import { fakeServices } from "./fakes";
import { setServicesForTest } from "../src/core/services";
import { waConfigRepo } from "../src/data/tenant";
import { sendBill } from "../src/tenant/whatsapp/bill";
import { pdfText } from "./pdf-text";

const pending: Promise<unknown>[] = [];
const ctx = { waitUntil(p: Promise<unknown>) { pending.push(p); }, passThroughOnException() {} } as unknown as ExecutionContext;
const flush = async () => { while (pending.length) await pending.shift(); };
const APP = "https://app.salonstation.test";
const E = { ...env, ROOT_DOMAIN: "", APP_ORIGIN: APP };
const TOKEN = "EAAGbillSECRETtoken0987654321";
const call = (method: string, path: string, cookie: string, body?: unknown, e: typeof E = E) =>
  app.fetch(
    new Request(`https://x.test/api${path}`, {
      method,
      headers: { cookie, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    e,
    ctx,
  );
const pub = (path: string, ip = "9.9.9.9") => app.fetch(new Request(`https://x.test/api/public${path}`, { headers: { "CF-Connecting-IP": ip } }), E, ctx);
const json = async (r: Response): Promise<any> => r.json();
const aed = (minor: number) => new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED" }).format(minor / 100);

let pnid = 70000000 + Math.floor(Math.random() * 1_000_000);
async function setup(slug: string, opts: { plan?: "pro" | "pro_max"; wa?: boolean; testNumbers?: string | null } = {}) {
  const org = await makeOrg({ slug, plan: opts.plan ?? "pro_max" });
  const own = await makeUser(org.id, { username: "own", role: "owner" });
  const b1 = await makeUser(org.id, { username: "b1", role: "barber" });
  const b2 = await makeUser(org.id, { username: "b2", role: "barber" });
  if (opts.wa !== false) {
    await waConfigRepo(env.DB, org.id, env.SECRETS_KEY).set(
      { phoneNumberId: String(++pnid), wabaId: "123456789", token: TOKEN, testNumbers: opts.testNumbers ?? null },
      { id: own.id, name: "own" },
    );
  }
  return { org, own, b1, b2, ck: await loginAs(slug, "own"), k1: await loginAs(slug, "b1"), k2: await loginAs(slug, "b2") };
}
const setSettings = (orgId: string, sql: string, ...binds: unknown[]) =>
  env.DB.prepare(`UPDATE org_settings SET ${sql} WHERE org_id = ?`).bind(...binds, orgId).run();
const messages = async (orgId: string) =>
  (await env.DB.prepare("SELECT * FROM wa_messages WHERE org_id = ? ORDER BY id").bind(orgId).all<any>()).results;
const newSale = async (cookie: string, body: Record<string, unknown> = {}) => {
  const r = await call("POST", "/sales", cookie, { amount: 25, payment_mode: "cash", customer_name: "Ali Khan", customer_phone: "0501234567", ...body });
  expect(r.status).toBe(201);
  return json(r);
};

let f = fakeServices();
const install = (opts?: Parameters<typeof fakeServices>[0]) => {
  f = fakeServices(opts);
  f.install();
  return f;
};
afterEach(async () => {
  await flush();
  setServicesForTest(null);
});

describe("auto bill after a sale", () => {
  it("sends exactly one bill template with name, bill no, org-currency amount and the receipt link", async () => {
    install();
    const a = await setup("wb-auto");
    await setSettings(a.org.id, "wa_bill_auto = 1");
    const sale = await newSale(a.k1);
    await flush();
    expect(f.wa).toHaveLength(1);
    const s = f.wa[0]!;
    expect(s.template).toBe("ss_bill");
    expect(s.lang).toBe("en");
    expect(s.phone).toBe("0501234567");
    expect(s.cfg.token).toBe(TOKEN);
    expect(s.params).toEqual(["Ali", sale.bill_no, aed(2500), `${APP}/r/?t=${sale.token}`]);
    const rows = await messages(a.org.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "bill", status: "sent", template: "ss_bill", sale_id: sale.id, customer_id: sale.customer_id, phone: "0501234567", created_by: a.b1.id });
    expect(rows[0].wa_id).toMatch(/^wamid\.fake/);
    expect(JSON.parse(rows[0].params)).toEqual(s.params);
  });

  it("uses the org's template names, language and currency; a tenant subdomain link when ROOT_DOMAIN is set", async () => {
    install();
    const a = await setup("wb-inr");
    await setSettings(a.org.id, "wa_bill_auto = 1, wa_bill_template = 'fm_bill', wa_language = 'en_US', currency = 'INR', locale = 'en-IN', timezone = 'Asia/Kolkata', phone_country = '91'");
    const sale = await newSale(a.k1, { amount: 1500, customer_phone: "09511506049" });
    await flush();
    expect(f.wa).toHaveLength(1);
    expect(f.wa[0]).toMatchObject({ template: "fm_bill", lang: "en_US" });
    const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(1500);
    expect(f.wa[0]!.params[2]).toBe(inr);
    // A direct send with ROOT_DOMAIN set links to the salon's own subdomain.
    const m: any = await sendBill({ ...E, ROOT_DOMAIN: "salonstation.online" }, a.org.id, sale.id, a.own.id);
    expect(m.status).toBe("sent");
    expect(f.wa[1]!.params[3]).toBe(`https://wb-inr.salonstation.online/r/?t=${sale.token}`);
  });

  it("the PDF template (wa_bill_template = wa_bill_pdf_template, FM rule): document header + 8 values", async () => {
    install();
    const a = await setup("wb-pdf");
    await setSettings(a.org.id, "wa_bill_auto = 1, wa_bill_template = 'ss_bill_pdf'");
    const sale = await newSale(a.k1, { items: [{ name: "Haircut", price: 20, qty: 1 }, { name: "Beard", price: 5, qty: 2 }], payment_mode: "card" });
    await flush();
    expect(f.wa).toHaveLength(1);
    const p = f.wa[0]!.params as any[];
    expect(f.wa[0]!.template).toBe("ss_bill_pdf");
    expect(p).toHaveLength(9);
    expect(p[0]).toEqual({ part: "header", key: "media", media: "document", text: `${APP}/api/public/bill/${sale.token}`, filename: `Bill_${sale.bill_no}.pdf` });
    expect(p.slice(1, 3)).toEqual(["Ali", sale.bill_no]);
    expect(p[3]).toMatch(/2026|20\d\d/);
    expect(p.slice(4)).toEqual(["b1", "Haircut, Beard x2", aed(3000), "Card", `${APP}/r/?t=${sale.token}`]);
  });

  it("no send when wa_bill_auto is off, there is no phone, the org has no whatsapp feature or no number; push still works", async () => {
    install();
    const off = await setup("wb-off");
    await newSale(off.k1);
    const nophone = await setup("wb-nophone");
    await setSettings(nophone.org.id, "wa_bill_auto = 1");
    await newSale(nophone.k1, { customer_phone: null, customer_name: null });
    const pro = await setup("wb-pro", { plan: "pro", wa: false });
    await setSettings(pro.org.id, "wa_bill_auto = 1");
    await newSale(pro.k1);
    const unset = await setup("wb-unset", { wa: false });
    await setSettings(unset.org.id, "wa_bill_auto = 1, notify_sales = 1, notify_sale_min = 0");
    await newSale(unset.k1);
    await flush();
    expect(f.wa).toHaveLength(0);
    for (const o of [off, nophone, pro, unset]) expect(await messages(o.org.id)).toEqual([]);
    // the push part of afterSale still ran for the org without a number: the owner's bell has the bill
    const bell = await env.DB.prepare("SELECT title FROM notifications WHERE org_id = ? AND user_id = ?").bind(unset.org.id, unset.own.id).all<any>();
    expect(bell.results.map((n) => n.title)).toEqual([`New bill · ${aed(2500)}`]);
  });
});

describe("skips without a Graph call", () => {
  it("an opted-out customer gets status skipped, one row, no send (RF3)", async () => {
    install();
    const a = await setup("wb-optout");
    const sale = await newSale(a.k1);
    await env.DB.prepare("UPDATE customers SET wa_opt_out = 1 WHERE org_id = ? AND id = ?").bind(a.org.id, sale.customer_id).run();
    const r = await call("POST", `/sales/${sale.id}/whatsapp`, a.k1);
    expect(r.status).toBe(200);
    expect(await json(r)).toMatchObject({ kind: "bill", status: "skipped", error: "opted out", phone: "0501234567" });
    expect(f.wa).toHaveLength(0);
    expect(await messages(a.org.id)).toHaveLength(1);
  });

  it("a phone not on the org's test list is skipped", async () => {
    install();
    const a = await setup("wb-test", { testNumbers: "0509999999" });
    const sale = await newSale(a.ck);
    const r = await call("POST", `/sales/${sale.id}/whatsapp`, a.ck);
    expect(await json(r)).toMatchObject({ status: "skipped", error: "not in test numbers" });
    expect(f.wa).toHaveLength(0);
    const ok = await newSale(a.ck, { customer_phone: "+971509999999" });
    expect(await json(await call("POST", `/sales/${ok.id}/whatsapp`, a.ck))).toMatchObject({ status: "sent" });
    expect(f.wa).toHaveLength(1);
    expect(await messages(a.org.id)).toHaveLength(2);
  });

  it("a Graph failure is logged as failed, never with the token (RF4)", async () => {
    install({ send: () => ({ status: "failed", error: "Recipient not on WhatsApp" }) });
    const a = await setup("wb-fail");
    const sale = await newSale(a.ck);
    const r = await call("POST", `/sales/${sale.id}/whatsapp`, a.ck);
    const text = await r.text();
    expect(JSON.parse(text)).toMatchObject({ status: "failed", error: "Recipient not on WhatsApp" });
    expect(text).not.toContain(TOKEN);
    expect(JSON.stringify(await messages(a.org.id))).not.toContain(TOKEN);
  });
});

describe("GET/POST /api/sales/:id/whatsapp", () => {
  it("GET: null before, the latest bill message after; POST resends", async () => {
    install();
    const a = await setup("wb-get");
    const sale = await newSale(a.k1);
    expect(await json(await call("GET", `/sales/${sale.id}/whatsapp`, a.k1))).toBeNull();
    const first = await json(await call("POST", `/sales/${sale.id}/whatsapp`, a.k1));
    const second = await json(await call("POST", `/sales/${sale.id}/whatsapp`, a.ck));
    expect(second.id).toBeGreaterThan(first.id);
    const got = await json(await call("GET", `/sales/${sale.id}/whatsapp`, a.k1));
    expect(got).toEqual(second);
    expect(Object.keys(got).sort()).toEqual(["created_at", "delivered_at", "error", "id", "kind", "phone", "read_at", "status", "template"]);
  });

  it("a barber may only send their own sale's bill (403 otherwise); the owner any", async () => {
    install();
    const a = await setup("wb-own");
    const sale = await newSale(a.k1);
    expect((await call("POST", `/sales/${sale.id}/whatsapp`, a.k2)).status).toBe(403);
    expect((await call("GET", `/sales/${sale.id}/whatsapp`, a.k2)).status).toBe(403);
    expect(f.wa).toHaveLength(0);
    expect((await call("POST", `/sales/${sale.id}/whatsapp`, a.k1)).status).toBe(200);
    expect((await call("POST", `/sales/${sale.id}/whatsapp`, a.ck)).status).toBe(200);
  });

  it("409 wa_not_ready without a number; 403 feature_disabled without whatsapp; 400 without a phone; 404 unknown/deleted", async () => {
    install();
    const a = await setup("wb-409", { wa: false });
    const sale = await newSale(a.ck);
    const r = await call("POST", `/sales/${sale.id}/whatsapp`, a.ck);
    expect(r.status).toBe(409);
    expect(await json(r)).toEqual({ error: "WhatsApp isn't set up for this salon", code: "wa_not_ready" });
    const p = await setup("wb-403", { plan: "pro", wa: false });
    const ps = await newSale(p.ck);
    for (const m of ["GET", "POST"]) {
      const x = await call(m, `/sales/${ps.id}/whatsapp`, p.ck);
      expect(x.status).toBe(403);
      expect(await json(x)).toMatchObject({ code: "feature_disabled" });
    }
    const b = await setup("wb-400");
    const nophone = await newSale(b.ck, { customer_phone: null, customer_name: null });
    const np = await call("POST", `/sales/${nophone.id}/whatsapp`, b.ck);
    expect(np.status).toBe(400);
    expect(await messages(b.org.id)).toEqual([]);
    expect((await call("POST", `/sales/999999/whatsapp`, b.ck)).status).toBe(404);
    const gone = await newSale(b.ck);
    expect((await call("DELETE", `/sales/${gone.id}`, b.ck)).status).toBe(200);
    expect((await call("POST", `/sales/${gone.id}/whatsapp`, b.ck)).status).toBe(404);
    expect(f.wa).toHaveLength(0);
  });
});

describe("PUT /api/customers/:id/whatsapp", () => {
  it("opt-out is per org: the same phone in org B stays opted in (RF3); audited; returns Customer", async () => {
    install();
    const a = await setup("wb-rf3-a");
    const b = await setup("wb-rf3-b");
    const sa = await newSale(a.ck);
    const sb = await newSale(b.ck);
    const r = await call("PUT", `/customers/${sa.customer_id}/whatsapp`, a.ck, { opt_out: true });
    expect(r.status).toBe(200);
    expect(await json(r)).toMatchObject({ id: sa.customer_id, phone: "0501234567", wa_opt_out: true, visits: expect.any(Number) });
    const bRow = await env.DB.prepare("SELECT wa_opt_out FROM customers WHERE org_id = ? AND id = ?").bind(b.org.id, sb.customer_id).first<any>();
    expect(bRow.wa_opt_out).toBe(0);
    expect(await json(await call("POST", `/sales/${sa.id}/whatsapp`, a.ck))).toMatchObject({ status: "skipped", error: "opted out" });
    expect(await json(await call("POST", `/sales/${sb.id}/whatsapp`, b.ck))).toMatchObject({ status: "sent" });
    expect(f.wa).toHaveLength(1);
    expect(f.wa[0]!.cfg.phoneNumberId).not.toBe((await waConfigRepo(env.DB, a.org.id, env.SECRETS_KEY).meta())!.phoneNumberId);

    const au = await env.DB.prepare("SELECT entity, entity_id, action, actor_name, before, after FROM audit_log WHERE org_id = ? AND ref LIKE 'Customer %'").bind(a.org.id).all<any>();
    expect(au.results).toHaveLength(1);
    expect(au.results[0]).toMatchObject({ entity: "settings", entity_id: sa.customer_id, action: "update", actor_name: "own" });
    expect(JSON.parse(au.results[0].before)).toEqual({ wa_opt_out: false });
    expect(JSON.parse(au.results[0].after)).toEqual({ wa_opt_out: true });

    // opting back in
    expect(await json(await call("PUT", `/customers/${sa.customer_id}/whatsapp`, a.ck, { opt_out: false }))).toMatchObject({ wa_opt_out: false });
  });

  it("admin only, feature whatsapp, a boolean opt_out, 404 for an unknown id", async () => {
    install();
    const a = await setup("wb-put");
    const sale = await newSale(a.ck);
    expect((await call("PUT", `/customers/${sale.customer_id}/whatsapp`, a.k1, { opt_out: true })).status).toBe(403);
    expect((await call("PUT", `/customers/${sale.customer_id}/whatsapp`, a.ck, { opt_out: "yes" })).status).toBe(400);
    expect((await call("PUT", `/customers/${sale.customer_id}/whatsapp`, a.ck, {})).status).toBe(400);
    expect((await call("PUT", `/customers/999999/whatsapp`, a.ck, { opt_out: true })).status).toBe(404);
    const p = await setup("wb-put-pro", { plan: "pro", wa: false });
    const ps = await newSale(p.ck);
    expect((await call("PUT", `/customers/${ps.customer_id}/whatsapp`, p.ck, { opt_out: true })).status).toBe(403);
  });
});

describe("GET /api/public/bill/:token", () => {
  it("returns the PDF for an INR org without VAT: no TRN, INR amount, private cache", async () => {
    install();
    const a = await setup("wb-pub");
    await setSettings(a.org.id, "currency = 'INR', locale = 'en-IN', timezone = 'Asia/Kolkata', phone_country = '91', vat_enabled = 0, trn = '27ABCDE1234F1Z5'");
    const sale = await newSale(a.ck, { amount: 1500, customer_phone: "09511506049" });
    for (const path of [`/bill/${sale.token}`, `/bill/${sale.token}.pdf`]) {
      const r = await pub(path, `1.2.3.${path.length}`);
      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toBe("application/pdf");
      expect(r.headers.get("cache-control")).toBe("private, max-age=300");
      expect(r.headers.get("content-disposition")).toBe(`inline; filename="Bill_${sale.bill_no}.pdf"`);
      const bytes = new Uint8Array(await r.arrayBuffer());
      expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
      const t = await pdfText(bytes);
      expect(t).not.toContain("TRN");
      expect(t).toContain("INR 1,500.00");
      expect(t).toContain(`View online: ${APP}/r/?t=${sale.token}`);
    }
  });

  it("a VAT org gets a TAX INVOICE with its TRN", async () => {
    install();
    const a = await setup("wb-pub-vat");
    await setSettings(a.org.id, "vat_enabled = 1, vat_rate = 5, trn = '100123456700003'");
    const sale = await newSale(a.ck);
    const r = await pub(`/bill/${sale.token}`, "2.2.2.2");
    expect(r.status).toBe(200);
    const t = await pdfText(new Uint8Array(await r.arrayBuffer()));
    expect(t).toContain("TAX INVOICE");
    expect(t).toContain("TRN 100123456700003");
  });

  it("404 for a bad token, a deleted sale, an org without whatsapp, a deactivated org", async () => {
    install();
    const a = await setup("wb-pub-404");
    const gone = await newSale(a.ck);
    expect((await call("DELETE", `/sales/${gone.id}`, a.ck)).status).toBe(200);
    const p = await setup("wb-pub-pro", { plan: "pro", wa: false });
    const ps = await newSale(p.ck);
    const d = await setup("wb-pub-dead");
    const ds = await newSale(d.ck);
    await env.DB.prepare("UPDATE orgs SET status = 'deactivated' WHERE id = ?").bind(d.org.id).run();
    let ip = 0;
    for (const t of ["nope", "x".repeat(20), gone.token, ps.token, ds.token]) {
      const r = await pub(`/bill/${t}`, `3.3.3.${++ip}`);
      expect(r.status, t).toBe(404);
    }
  });

  it("is rate limited by the pdf bucket", async () => {
    install();
    const a = await setup("wb-pub-rl");
    const sale = await newSale(a.ck);
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await pub(`/bill/${sale.token}`, "4.4.4.4")).status);
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes[10]).toBe(429);
  });
});
