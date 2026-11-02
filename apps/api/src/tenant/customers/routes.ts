import { Hono } from "hono";
import type { CustomerSuggestion, Paged } from "@ss/contract";
import type { AppEnv } from "../../env";
import { requireFeature } from "../../core/pipeline";
import { customersRepo, settingsRepo } from "../../data/tenant";
import { canonicalPhone } from "../../lib/phone";

const PAGE = 8;

export const customers = new Hono<AppEnv>();
// The sale form's autocomplete is part of core_sales. Task 9 adds the admin full list (customers_crm) and the detail.
customers.use("*", requireFeature("core_sales"));

/**
 * FM's barber branch, for every user in Plan 2a: no q = the caller's own recent customers; q under 3 chars = nothing;
 * otherwise customers the caller has served matching name/phone, plus any customer by their exact full phone.
 */
customers.get("/", async (c) => {
  const me = c.var.tenant.user;
  const orgId = c.var.tenant.org.id;
  const repo = customersRepo(c.env.DB, orgId);
  const q = (c.req.query("q") ?? "").trim().slice(0, 80);
  let items: CustomerSuggestion[] = [];
  if (!q) items = await repo.recentForBarber(me.id);
  else if (q.length >= 3) {
    const { phone_country } = await settingsRepo(c.env.DB, orgId).get();
    items = await repo.searchForBarber(me.id, q, canonicalPhone(q, phone_country) ?? "");
  }
  const body: Paged<CustomerSuggestion> = { items, total: items.length, page: 1, page_size: PAGE };
  return c.json(body);
});
