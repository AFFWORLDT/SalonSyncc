import { Hono } from "hono";
import type { Customer, CustomerSuggestion, Paged } from "@ss/contract";
import type { AppEnv } from "../../env";
import { HttpError } from "../../core/errors";
import { isAdmin, requireAdmin } from "../../core/roles";
import { requireFeature } from "../../core/pipeline";
import { customersRepo, settingsRepo } from "../../data/tenant";
import { clampPage } from "../../lib/money";
import { canonicalPhone } from "../../lib/phone";

const PAGE = 8;

export const customers = new Hono<AppEnv>();
// The sale form's autocomplete is part of core_sales; the admin list and the detail additionally need customers_crm.
customers.use("*", requireFeature("core_sales"));

/**
 * GET /api/customers serves two features from one path, so the feature is checked per branch, not by middleware:
 * - an admin (owner/admin) whose org has customers_crm gets FM's admin branch: the full paged list (visits, spent, wa_opt_out);
 * - everyone else, INCLUDING an admin whose plan lacks customers_crm, gets FM's barber branch (core_sales), never a 403,
 *   because the sale form's autocomplete must keep working on every plan. Barber branch: no q = the caller's own recent
 *   customers; q under 3 chars = nothing; otherwise customers the caller has served matching name/phone, plus any
 *   customer by their exact full phone.
 */
customers.get("/", async (c) => {
  const me = c.var.tenant.user;
  const orgId = c.var.tenant.org.id;
  const repo = customersRepo(c.env.DB, orgId);
  const q = (c.req.query("q") ?? "").trim().slice(0, 80);
  if (isAdmin(me) && c.var.tenant.features.includes("customers_crm")) {
    const page = clampPage(c.req.query("page"));
    const page_size = Math.min(200, Math.max(1, Math.floor(Number(c.req.query("page_size"))) || 50));
    const r = await repo.adminList(q, page, page_size);
    const body: Paged<Customer> = { items: r.items, total: r.total, page, page_size };
    return c.json(body);
  }
  let items: CustomerSuggestion[] = [];
  if (!q) items = await repo.recentForBarber(me.id);
  else if (q.length >= 3) {
    const { phone_country } = await settingsRepo(c.env.DB, orgId).get();
    items = await repo.searchForBarber(me.id, q, canonicalPhone(q, phone_country) ?? "");
  }
  const body: Paged<CustomerSuggestion> = { items, total: items.length, page: 1, page_size: PAGE };
  return c.json(body);
});

/** FM GET /customers/:id (admin, customers_crm): the customer's profile in this org; another org's id is 404. */
customers.get("/:id", requireFeature("customers_crm"), requireAdmin, async (c) => {
  const n = Number(c.req.param("id"));
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, "Invalid id");
  const d = await customersRepo(c.env.DB, c.var.tenant.org.id).detail(n);
  if (!d) throw new HttpError(404, "Not found");
  return c.json(d);
});
