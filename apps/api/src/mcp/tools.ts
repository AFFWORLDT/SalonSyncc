/**
 * AI connect tools. Each one is a thin, validated mapping onto an existing /api route: the tool runner (mcp/server.ts)
 * calls that route in-process as the token's user, so plan features, roles, read-only salons and the audit log behave
 * exactly as in the app. Money in results is in minor units (see `currency` in every result); write tools take major units.
 */
import type { FeatureKey } from "@ss/features";
import type { McpScope } from "../data/tenant/mcp";

type ParamType = "string" | "integer" | "number";
interface Param {
  type: ParamType;
  description: string;
  required?: boolean;
  pattern?: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  maxLength?: number;
}

export interface RouteCall {
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  scope: McpScope;
  feature: FeatureKey;
  params: Record<string, Param>;
  route: (a: Record<string, string | number>) => RouteCall;
}

const DAY = "^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$";
const MONTH = "^\\d{4}-(0[1-9]|1[0-2])$";
const day = (description: string): Param => ({ type: "string", pattern: DAY, description: `${description} (YYYY-MM-DD, the salon's business day)` });
const month: Param = { type: "string", pattern: MONTH, description: "Month (YYYY-MM); default this month" };
const page: Param = { type: "integer", minimum: 1, maximum: 1000, description: "Page number, from 1 (25 per page)" };
const id = (description: string, required = true): Param => ({ type: "integer", minimum: 1, maximum: 2_147_483_647, description, required });
const PAGE_SIZE = 25;
const MONEY_NOTE = "Money fields are integers in the currency's minor units (divide by `currency.minor_per_unit`).";

export const TOOLS: ToolDef[] = [
  {
    name: "get_overview",
    title: "Sales overview",
    description: `Sales, expenses, profit, bill count and per-barber totals for a date range (default today), with the previous period for comparison and recent bills. ${MONEY_NOTE}`,
    scope: "read",
    feature: "core_sales",
    params: { from: day("First day"), to: day("Last day; default today") },
    route: (a) => ({ method: "GET", path: "/api/reports/overview", query: { from: a.from, to: a.to } }),
  },
  {
    name: "search_sales",
    title: "Search bills",
    description: `Bills (sales), newest first, filtered by text (bill number, customer name or phone), day or date range, barber and payment mode. Returns items, total count and the sum. ${MONEY_NOTE}`,
    scope: "read",
    feature: "core_sales",
    params: {
      q: { type: "string", maxLength: 80, description: "Bill number, customer name or phone" },
      day: day("One day"),
      from: day("From"),
      to: day("To"),
      barber_id: id("Only this barber's bills (see list_staff)", false),
      payment_mode: { type: "string", enum: ["cash", "card"], description: "Cash or card" },
      page,
    },
    route: (a) => ({ method: "GET", path: "/api/sales", query: { ...a, page_size: PAGE_SIZE } }),
  },
  {
    name: "get_daily_sheet",
    title: "Daily sheet",
    description: `The month's day-by-day sheet: each day's sales per barber, expenses and totals. ${MONEY_NOTE}`,
    scope: "read",
    feature: "daily_sheet",
    params: { month },
    route: (a) => ({ method: "GET", path: "/api/reports/daily", query: { month: a.month } }),
  },
  {
    name: "get_monthly_report",
    title: "Monthly report",
    description: `Month-by-month sales, expenses and profit for a year. ${MONEY_NOTE}`,
    scope: "read",
    feature: "reports_advanced",
    params: { year: { type: "string", pattern: "^\\d{4}$", description: "Year (YYYY); default this year" } },
    route: (a) => ({ method: "GET", path: "/api/reports/monthly", query: { year: a.year } }),
  },
  {
    name: "get_ledger_balances",
    title: "Cash and bank balances",
    description: `Current shop cash and bank balances and what each barber is owed. ${MONEY_NOTE}`,
    scope: "read",
    feature: "ledger",
    params: {},
    route: () => ({ method: "GET", path: "/api/ledger/balances" }),
  },
  {
    name: "search_customers",
    title: "Search customers",
    description: `Customers with visits, total spent and last visit, filtered by name or phone. ${MONEY_NOTE}`,
    scope: "read",
    feature: "customers_crm",
    params: { q: { type: "string", maxLength: 80, description: "Name or phone" }, page },
    route: (a) => ({ method: "GET", path: "/api/customers", query: { q: a.q, page: a.page, page_size: PAGE_SIZE } }),
  },
  {
    name: "get_customer",
    title: "Customer profile",
    description: `One customer's profile and recent visits. ${MONEY_NOTE}`,
    scope: "read",
    feature: "customers_crm",
    params: { id: id("Customer id (from search_customers)") },
    route: (a) => ({ method: "GET", path: `/api/customers/${a.id}` }),
  },
  {
    name: "list_ratings",
    title: "Ratings",
    description: "Customer ratings and comments for a date range (default this month), with averages per barber.",
    scope: "read",
    feature: "ratings",
    params: { from: day("From; default the 1st of this month"), to: day("To; default today") },
    route: (a) => ({ method: "GET", path: "/api/ratings", query: { from: a.from, to: a.to } }),
  },
  {
    name: "list_staff",
    title: "Staff",
    description: "The salon's team: id, name, role, commission and whether active.",
    scope: "read",
    feature: "core_sales",
    params: {},
    route: () => ({ method: "GET", path: "/api/users" }),
  },
  {
    name: "list_services",
    title: "Services",
    description: `The service price list. ${MONEY_NOTE}`,
    scope: "read",
    feature: "core_sales",
    params: {},
    route: () => ({ method: "GET", path: "/api/services" }),
  },
  {
    name: "list_expenses",
    title: "Shop expenses",
    description: `The shop's (company) expenses for a month: rent, supplies, cleaning and so on. ${MONEY_NOTE}`,
    scope: "read",
    feature: "expenses",
    params: { month },
    route: (a) => ({ method: "GET", path: "/api/company-expenses", query: { month: a.month } }),
  },
  {
    name: "list_barber_expenses",
    title: "Barber expenses",
    description: `Barbers' daily expenses for a month or one day. ${MONEY_NOTE}`,
    scope: "read",
    feature: "expenses",
    params: { month, day: day("One day instead of the month") },
    route: (a) => ({ method: "GET", path: "/api/expenses", query: { month: a.month, day: a.day } }),
  },
  {
    name: "get_audit_log",
    title: "Audit log",
    description: "Who changed what and when (bills, expenses, staff, settings), newest first.",
    scope: "read",
    feature: "audit_log",
    params: { from: day("From"), to: day("To"), q: { type: "string", maxLength: 80, description: "Search text" }, page },
    route: (a) => ({ method: "GET", path: "/api/audit", query: { ...a, page_size: PAGE_SIZE } }),
  },
  {
    name: "add_expense",
    title: "Add a shop expense",
    description: "Records a shop (company) expense, e.g. rent or cleaning supplies. `amount` is in the salon's currency (major units, e.g. 40 or 12.5). Needs the write permission.",
    scope: "write",
    feature: "expenses",
    params: {
      amount: { type: "number", minimum: 0.01, maximum: 10_000_000, description: "Amount, e.g. 40", required: true },
      note: { type: "string", maxLength: 300, description: "What it was for, e.g. cleaning supplies", required: true },
      day: day("Day; default today; not in the future"),
      paid_from: { type: "string", enum: ["cash", "bank"], description: "Paid from cash (default) or bank" },
    },
    route: (a) => ({ method: "POST", path: "/api/company-expenses", body: { amount: a.amount, note: a.note, day: a.day, paid_from: a.paid_from ?? "cash" } }),
  },
  {
    name: "send_announcement",
    title: "Send a team announcement",
    description: "Sends an announcement to the whole team, or to one barber, in the app (and as a push notification where enabled). Needs the write permission.",
    scope: "write",
    feature: "announcements",
    params: {
      title: { type: "string", maxLength: 80, description: "Title", required: true },
      body: { type: "string", maxLength: 500, description: "Message", required: true },
      barber_id: id("Send only to this barber (see list_staff); default everyone", false),
    },
    route: (a) => ({
      method: "POST",
      path: "/api/announcements",
      body: a.barber_id ? { title: a.title, body: a.body, audience: "barber", barber_id: a.barber_id } : { title: a.title, body: a.body, audience: "all" },
    }),
  },
];

export const toolByName = (name: string): ToolDef | undefined => TOOLS.find((t) => t.name === name);

/** The tools this caller may see: the salon has the feature, and the connection has the scope. */
export const visibleTools = (features: readonly FeatureKey[], scopes: readonly McpScope[]): ToolDef[] =>
  TOOLS.filter((t) => features.includes(t.feature) && scopes.includes(t.scope));

/** MCP `tools/list` entry (JSON Schema for the arguments). */
export function describe(t: ToolDef) {
  const properties: Record<string, object> = {};
  for (const [k, p] of Object.entries(t.params)) {
    const { required: _r, ...schema } = p;
    properties[k] = schema;
  }
  const required = Object.entries(t.params).filter(([, p]) => p.required).map(([k]) => k);
  return {
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: { type: "object", properties, ...(required.length ? { required } : {}), additionalProperties: false },
    annotations: { title: t.title, readOnlyHint: t.scope === "read", destructiveHint: false, idempotentHint: t.scope === "read", openWorldHint: false },
  };
}

/** Checks arguments against the tool's params: the cleaned arguments, or the first problem in words. */
export function validate(t: ToolDef, raw: unknown): { ok: true; args: Record<string, string | number> } | { ok: false; message: string } {
  if (raw !== undefined && raw !== null && (typeof raw !== "object" || Array.isArray(raw))) return { ok: false, message: "arguments must be an object" };
  const input = (raw ?? {}) as Record<string, unknown>;
  for (const k of Object.keys(input)) if (!(k in t.params)) return { ok: false, message: `Unknown argument "${k}"` };
  const args: Record<string, string | number> = {};
  for (const [k, p] of Object.entries(t.params)) {
    let v = input[k];
    if (v === undefined || v === null || v === "") {
      if (p.required) return { ok: false, message: `"${k}" is required` };
      continue;
    }
    if (p.type === "string") {
      if (typeof v !== "string") return { ok: false, message: `"${k}" must be text` };
      v = v.trim();
      const s = v as string;
      if (p.maxLength && s.length > p.maxLength) return { ok: false, message: `"${k}" is too long (max ${p.maxLength})` };
      if (p.pattern && !new RegExp(p.pattern).test(s)) return { ok: false, message: `"${k}" has the wrong format` };
      if (p.enum && !p.enum.includes(s)) return { ok: false, message: `"${k}" must be one of ${p.enum.join(", ")}` };
      if (!s && p.required) return { ok: false, message: `"${k}" is required` };
      if (s) args[k] = s;
    } else {
      const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
      if (typeof n !== "number" || !Number.isFinite(n) || (p.type === "integer" && !Number.isInteger(n))) return { ok: false, message: `"${k}" must be a${p.type === "integer" ? " whole" : ""} number` };
      if ((p.minimum !== undefined && n < p.minimum) || (p.maximum !== undefined && n > p.maximum)) return { ok: false, message: `"${k}" is out of range` };
      args[k] = n;
    }
  }
  return { ok: true, args };
}
