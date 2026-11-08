/**
 * Cross-org registry. Every tenant route that takes an id appends a case here (later tasks add theirs).
 * test/cross-org.test.ts replays each: org B's owner calls the route with org A's id and must get 404,
 * and A's row must be unchanged afterwards. Then A's own owner repeats the call and must NOT get 404 (positive control).
 */
export interface CrossOrgCase {
  name: string;
  method: string;
  path: (id: number) => string;
  body?: unknown;
  /** Optional: a body built from org A's seeded row (e.g. it must name A's own barber); overrides `body`. */
  bodyFor?: (orgId: string, id: number) => Promise<unknown>;
  /** Seeds a row in the given org and returns its id. */
  seed: (orgId: string) => Promise<number>;
  /** REQUIRED: a comparable snapshot of the row through org A's scoped repo (compared before/after org B's attempt). */
  read: (orgId: string, id: number) => Promise<unknown>;
}
export const CASES: CrossOrgCase[] = [];

// ---- Task 4: staff ----
import { env } from "cloudflare:test";
import { randomToken } from "../src/core/crypto";

const seedStaff = async (orgId: string): Promise<number> => {
  const r = await env.DB.prepare("INSERT INTO users(org_id,username,name,role,password_hash,created_at) VALUES(?,?,?,?,?,?) RETURNING id")
    .bind(orgId, `s${randomToken(4)}`, "Staff", "barber", "x", Date.now())
    .first<{ id: number }>();
  return r!.id;
};
const readStaff = (orgId: string, id: number) => env.DB.prepare("SELECT * FROM users WHERE org_id = ? AND id = ?").bind(orgId, id).first();
const staffCase = (method: string, pattern: string, body?: unknown): CrossOrgCase => ({
  name: `${method} ${pattern}`,
  method,
  path: (id) => pattern.replace(":id", String(id)),
  body,
  seed: seedStaff,
  read: readStaff,
});
CASES.push(
  staffCase("PUT", "/api/users/:id", { name: "Pwned", username: "pwned" }),
  staffCase("DELETE", "/api/users/:id"),
  staffCase("POST", "/api/users/:id/reset-password", { password: "hacked1" }),
  staffCase("POST", "/api/users/:id/invite", {}),
  staffCase("PUT", "/api/users/:id/avatar", undefined),
  staffCase("DELETE", "/api/users/:id/avatar"),
  staffCase("GET", "/api/users/:id/devices"),
  {
    // A phone session of org A's barber, id derived from the user id so the path can name it.
    name: "DELETE /api/users/:id/devices/:sid",
    method: "DELETE",
    path: (id) => `/api/users/${id}/devices/ms_seed_${id}`,
    seed: async (orgId) => {
      const id = await seedStaff(orgId);
      await env.DB.prepare(
        "INSERT INTO mobile_sessions(id,org_id,user_id,token_hash,device_id,device_name,platform,session_version,created_at,last_used_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      ).bind(`ms_seed_${id}`, orgId, id, `h_${id}_${randomToken(6)}`, "device-seed", "Phone", "android", 1, 1, 1, Date.now() + 86_400_000).run();
      return id;
    },
    read: (orgId, id) => env.DB.prepare("SELECT * FROM mobile_sessions WHERE org_id = ? AND id = ?").bind(orgId, `ms_seed_${id}`).first(),
  },
);

// ---- Task 5: services ----
const seedService = async (orgId: string): Promise<number> => {
  const r = await env.DB.prepare("INSERT INTO services(org_id,uid,category,name,price,created_at,updated_at) VALUES(?,?,?,?,?,?,?) RETURNING id")
    .bind(orgId, randomToken(9), "Haircuts", "Cut", 1000, 1, 1)
    .first<{ id: number }>();
  return r!.id;
};
const readService = (orgId: string, id: number) => env.DB.prepare("SELECT * FROM services WHERE org_id = ? AND id = ?").bind(orgId, id).first();
const serviceCase = (method: string, body?: unknown): CrossOrgCase => ({
  name: `${method} /api/services/:id`,
  method,
  path: (id) => `/api/services/${id}`,
  body,
  seed: seedService,
  read: readService,
});
CASES.push(serviceCase("PUT", { category: "Pwned", name: "Pwned", price: 1 }), serviceCase("DELETE"));

// ---- Task 7: sales edit/delete ----
const seedSale = async (orgId: string): Promise<number> => {
  const barber = await seedStaff(orgId);
  const r = await env.DB.prepare(
    `INSERT INTO sales(org_id,bill_no,token,day,barber_id,customer_label,amount,payment_mode,commission_pct,commission,vat_rate,vat_amount,created_by,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
  )
    .bind(orgId, `XO-${randomToken(6)}`, randomToken(12), "2026-11-01", barber, "Customer 1", 1000, "cash", 0, 0, 0, 0, barber, 1, 1)
    .first<{ id: number }>();
  return r!.id;
};
const readSale = async (orgId: string, id: number) => ({
  sale: await env.DB.prepare("SELECT * FROM sales WHERE org_id = ? AND id = ?").bind(orgId, id).first(),
  items: (await env.DB.prepare("SELECT * FROM sale_items WHERE org_id = ? AND sale_id = ?").bind(orgId, id).all()).results,
  ledger: (await env.DB.prepare("SELECT * FROM ledger_entries WHERE source = 'sale' AND source_id = ?").bind(id).all()).results,
});
const saleCase = (method: string, body?: unknown): CrossOrgCase => ({
  name: `${method} /api/sales/:id`,
  method,
  path: (id) => `/api/sales/${id}`,
  body,
  seed: seedSale,
  read: readSale,
});
CASES.push(saleCase("PUT", { amount: 25, payment_mode: "card", note: "Pwned" }), saleCase("DELETE"));

// ---- Task 9: company expenses, customers CRM ----
const seedCompanyExpense = async (orgId: string): Promise<number> => {
  const r = await env.DB.prepare("INSERT INTO company_expenses(org_id,uid,day,amount,note,paid_from,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) RETURNING id")
    .bind(orgId, randomToken(9), "2026-11-01", 1000, "rent", "cash", 1, 1)
    .first<{ id: number }>();
  return r!.id;
};
const readCompanyExpense = async (orgId: string, id: number) => ({
  row: await env.DB.prepare("SELECT * FROM company_expenses WHERE org_id = ? AND id = ?").bind(orgId, id).first(),
  ledger: (await env.DB.prepare("SELECT * FROM ledger_entries WHERE source = 'company_expense' AND source_id = ?").bind(id).all()).results,
  audit: (await env.DB.prepare("SELECT * FROM audit_log WHERE entity = 'company_expense' AND entity_id = ?").bind(id).all()).results,
});
const companyCase = (method: string, body?: unknown): CrossOrgCase => ({
  name: `${method} /api/company-expenses/:id`,
  method,
  path: (id) => `/api/company-expenses/${id}`,
  body,
  seed: seedCompanyExpense,
  read: readCompanyExpense,
});
CASES.push(companyCase("PUT", { amount: 5, note: "Pwned", paid_from: "bank" }), companyCase("DELETE"));

const seedCustomer = async (orgId: string): Promise<number> => {
  const r = await env.DB.prepare("INSERT INTO customers(org_id,name,phone,created_at) VALUES(?,?,?,?) RETURNING id")
    .bind(orgId, "Ali", `05${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`, 1)
    .first<{ id: number }>();
  return r!.id;
};
CASES.push({
  name: "GET /api/customers/:id",
  method: "GET",
  path: (id) => `/api/customers/${id}`,
  seed: seedCustomer,
  read: (orgId, id) => env.DB.prepare("SELECT * FROM customers WHERE org_id = ? AND id = ?").bind(orgId, id).first(),
});

// ---- Task 10: ledger (payouts, transfers, barber book) ----
const seedPayout = async (orgId: string): Promise<number> => {
  const barber = await seedStaff(orgId);
  const r = await env.DB.prepare(
    "INSERT INTO barber_payouts(org_id,uid,barber_id,day,amount,paid_from,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) RETURNING id",
  )
    .bind(orgId, randomToken(9), barber, "2026-11-01", 1000, "cash", 1, 1)
    .first<{ id: number }>();
  return r!.id;
};
const readPayout = async (orgId: string, id: number) => ({
  row: await env.DB.prepare("SELECT * FROM barber_payouts WHERE org_id = ? AND id = ?").bind(orgId, id).first(),
  ledger: (await env.DB.prepare("SELECT * FROM ledger_entries WHERE source = 'payout' AND source_id = ?").bind(id).all()).results,
  audit: (await env.DB.prepare("SELECT * FROM audit_log WHERE entity = 'payout' AND entity_id = ?").bind(id).all()).results,
});
CASES.push(
  {
    name: "PUT /api/payouts/:id",
    method: "PUT",
    path: (id) => `/api/payouts/${id}`,
    // Valid for A's owner: A's own (seeded) barber.
    bodyFor: async (orgId, id) => {
      const r = await env.DB.prepare("SELECT barber_id FROM barber_payouts WHERE org_id = ? AND id = ?").bind(orgId, id).first<{ barber_id: number }>();
      return { barber_id: r!.barber_id, amount: 5, paid_from: "bank", note: "Pwned" };
    },
    seed: seedPayout,
    read: readPayout,
  },
  { name: "DELETE /api/payouts/:id", method: "DELETE", path: (id) => `/api/payouts/${id}`, seed: seedPayout, read: readPayout },
);

const seedTransfer = async (orgId: string): Promise<number> => {
  const r = await env.DB.prepare(
    "INSERT INTO money_transfers(org_id,uid,day,amount,from_account,to_account,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) RETURNING id",
  )
    .bind(orgId, randomToken(9), "2026-11-01", 1000, "cash", "bank", 1, 1)
    .first<{ id: number }>();
  return r!.id;
};
const readTransfer = async (orgId: string, id: number) => ({
  row: await env.DB.prepare("SELECT * FROM money_transfers WHERE org_id = ? AND id = ?").bind(orgId, id).first(),
  ledger: (await env.DB.prepare("SELECT * FROM ledger_entries WHERE source = 'transfer' AND source_id = ?").bind(id).all()).results,
  audit: (await env.DB.prepare("SELECT * FROM audit_log WHERE entity = 'transfer' AND entity_id = ?").bind(id).all()).results,
});
CASES.push(
  {
    name: "PUT /api/transfers/:id",
    method: "PUT",
    path: (id) => `/api/transfers/${id}`,
    body: { amount: 5, from_account: "bank", to_account: "cash", note: "Pwned" },
    seed: seedTransfer,
    read: readTransfer,
  },
  { name: "DELETE /api/transfers/:id", method: "DELETE", path: (id) => `/api/transfers/${id}`, seed: seedTransfer, read: readTransfer },
  {
    name: "GET /api/ledger/barbers/:id",
    method: "GET",
    path: (id) => `/api/ledger/barbers/${id}`,
    seed: seedStaff,
    read: readStaff,
  },
);

// ---- Plan 2b Task 2: audit viewer ----
CASES.push({
  name: "GET /api/sales/:id/history",
  method: "GET",
  path: (id) => `/api/sales/${id}/history`,
  seed: async (orgId) => {
    const id = await seedSale(orgId);
    await env.DB.prepare("INSERT INTO audit_log(org_id,at,actor_name,entity,entity_id,ref,action) VALUES(?,?,?,?,?,?,?)")
      .bind(orgId, 1, "Owner", "sale", id, "XO", "create").run();
    return id;
  },
  read: async (orgId, id) => (await env.DB.prepare("SELECT * FROM audit_log WHERE org_id = ? AND entity = 'sale' AND entity_id = ?").bind(orgId, id).all()).results,
});

// ---- Plan 2b Task 7: WhatsApp bills and opt-out ----
const readSaleMessages = async (orgId: string, id: number) => ({
  sale: await readSale(orgId, id),
  messages: (await env.DB.prepare("SELECT * FROM wa_messages WHERE sale_id = ?").bind(id).all()).results,
});
CASES.push(
  { name: "GET /api/sales/:id/whatsapp", method: "GET", path: (id) => `/api/sales/${id}/whatsapp`, seed: seedSale, read: readSaleMessages },
  { name: "POST /api/sales/:id/whatsapp", method: "POST", path: (id) => `/api/sales/${id}/whatsapp`, seed: seedSale, read: readSaleMessages },
  {
    name: "PUT /api/customers/:id/whatsapp",
    method: "PUT",
    path: (id) => `/api/customers/${id}/whatsapp`,
    body: { opt_out: true },
    seed: seedCustomer,
    read: async (orgId, id) => ({
      row: await env.DB.prepare("SELECT * FROM customers WHERE org_id = ? AND id = ?").bind(orgId, id).first(),
      audit: (await env.DB.prepare("SELECT * FROM audit_log WHERE entity_id = ? AND ref LIKE 'Customer %'").bind(id).all()).results,
    }),
  },
);

// ---- Plan 2b Task 10: WhatsApp campaigns ----
const seedCampaign = async (orgId: string): Promise<number> => {
  const k = await env.DB.prepare("INSERT INTO wa_campaigns(org_id,uid,template,language,params,total,created_at) VALUES(?,?,?,?,?,?,?) RETURNING id")
    .bind(orgId, randomToken(9), "eid_offer", "en", "[]", 1, 1)
    .first<{ id: number }>();
  await env.DB.prepare("INSERT INTO wa_messages(org_id,kind,phone,template,status,campaign_id,created_at) VALUES(?,?,?,?,?,?,?)")
    .bind(orgId, "announcement", "+919800000001", "eid_offer", "queued", k!.id, 1)
    .run();
  return k!.id;
};
CASES.push({
  name: "POST /api/wa/campaigns/:id/next",
  method: "POST",
  path: (id) => `/api/wa/campaigns/${id}/next`,
  seed: seedCampaign,
  read: async (orgId, id) => ({
    campaign: await env.DB.prepare("SELECT * FROM wa_campaigns WHERE org_id = ? AND id = ?").bind(orgId, id).first(),
    messages: (await env.DB.prepare("SELECT * FROM wa_messages WHERE org_id = ? AND campaign_id = ?").bind(orgId, id).all()).results,
  }),
});

// ---- AI connect (MCP): connections and OAuth approvals have text ids; the harness's numeric id maps to them ----
const mcpIds = new Map<number, string>();
let mcpN = 0;
/** Every org in the harness gets AI connect, so org B's owner reaches the route (and must get 404, not 403). */
const mcpOnForAll = () =>
  env.DB.prepare("INSERT OR IGNORE INTO org_feature_overrides(org_id,feature_key,enabled,set_at) SELECT id,'mcp_api',1,0 FROM orgs").run();
const seedMcpConnection = async (orgId: string): Promise<number> => {
  await mcpOnForAll();
  const user = await env.DB.prepare("SELECT id FROM users WHERE org_id = ? LIMIT 1").bind(orgId).first<{ id: number }>();
  const conn = `cn_${randomToken(9)}`;
  await env.DB.prepare("INSERT INTO mcp_tokens(id,org_id,user_id,user_sv,kind,connection_id,name,token_hash,last4,scopes,created_at) VALUES(?,?,?,0,'key',?,?,?,?,'read',?)")
    .bind(`mt_${randomToken(9)}`, orgId, user!.id, conn, "Key", randomToken(24), "abcd", Date.now()).run();
  mcpIds.set(++mcpN, conn);
  return mcpN;
};
const readMcpConnection = (orgId: string, n: number) =>
  env.DB.prepare("SELECT scopes, name, revoked_at FROM mcp_tokens WHERE org_id = ? AND connection_id = ?").bind(orgId, mcpIds.get(n)).first();
const seedMcpRequest = async (orgId: string): Promise<number> => {
  await mcpOnForAll();
  const id = `ar_${randomToken(12)}`;
  await env.DB.prepare("INSERT INTO mcp_auth_requests(id,org_id,client_id,redirect_uri,code_challenge,scopes,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)")
    .bind(id, orgId, "mc_x", "https://claude.ai/api/mcp/auth_callback", "c".repeat(43), "read write", Date.now() + 600_000, Date.now()).run();
  mcpIds.set(++mcpN, id);
  return mcpN;
};
const readMcpRequest = (orgId: string, n: number) =>
  env.DB.prepare("SELECT user_id, code_hash, scopes FROM mcp_auth_requests WHERE org_id = ? AND id = ?").bind(orgId, mcpIds.get(n)).first();
const mcpCase = (method: string, pattern: string, kind: "conn" | "req", body?: unknown): CrossOrgCase => ({
  name: `${method} ${pattern}`,
  method,
  path: (n) => pattern.replace(":id", mcpIds.get(n)!),
  body,
  seed: kind === "conn" ? seedMcpConnection : seedMcpRequest,
  read: kind === "conn" ? readMcpConnection : readMcpRequest,
});
CASES.push(
  mcpCase("PUT", "/api/mcp/connections/:id", "conn", { scope: "write", name: "Pwned" }),
  mcpCase("DELETE", "/api/mcp/connections/:id", "conn"),
  mcpCase("GET", "/api/mcp/requests/:id", "req"),
  mcpCase("POST", "/api/mcp/requests/:id", "req", { approve: true, write: true }),
);
