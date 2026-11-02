import { Hono, type Context } from "hono";
import type { Service, ServiceInput } from "@ss/contract";
import type { AppEnv } from "../../env";
import { HttpError } from "../../core/errors";
import { isAdmin, requireAdmin } from "../../core/roles";
import { requireFeature } from "../../core/pipeline";
import { featuresFor } from "../../core/features-cache";
import { resolvePublicOrg, publicRateLimit } from "../../core/public";
import { settingsRepo, servicesRepo, STARTER_SERVICES, type ServiceRow, type ServiceWrite } from "../../data/tenant";
import { toMinor } from "../../lib/money";

const bad = (m: string) => new HttpError(400, m);
const notFound = () => new HttpError(404, "Service not found");

function clean(v: unknown, max: number): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().slice(0, max);
  return s || null;
}

function serviceId(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw bad("Invalid id");
  return n;
}

const toService = (r: ServiceRow): Service => ({
  id: r.id,
  category: r.category,
  name: r.name,
  description: r.description,
  price: r.price,
  sort_order: r.sort_order,
  active: !!r.active,
});

async function readInput(c: Context<AppEnv>): Promise<ServiceWrite> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw bad("Send the details as JSON");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw bad("Send the details as JSON");
  const b = raw as Partial<ServiceInput>;
  const category = clean(b.category, 40);
  const name = clean(b.name, 80);
  if (!category) throw bad("Enter a group, e.g. Haircuts");
  if (!name) throw bad("Enter the service name");
  const { currency_minor, currency } = await settingsRepo(c.env.DB, c.var.tenant.org.id).get();
  const priceRaw = typeof b.price === "string" ? b.price.trim() : b.price;
  const price = priceRaw === 0 || priceRaw === "0" ? 0 : toMinor(priceRaw, currency_minor);
  if (price === null) throw bad(`Enter the price in ${currency}, e.g. 25`);
  return {
    category,
    name,
    description: clean(b.description, 160),
    price,
    sort_order: Number.isInteger(b.sort_order) ? (b.sort_order as number) : null,
    active: b.active === undefined ? null : !!b.active,
  };
}

const actorOf = (c: Context<AppEnv>) => ({ id: c.var.tenant.user.id, name: c.var.tenant.user.name });
const repoOf = (c: Context<AppEnv>) => servicesRepo(c.env.DB, c.var.tenant.org.id);

export const services = new Hono<AppEnv>();
// Mounted at "/services": the feature gate covers only this prefix, so unknown paths elsewhere still 404.
services.use("*", requireFeature("core_sales"));

services.get("/", async (c) => {
  const all = c.req.query("all") === "1" && isAdmin(c.var.tenant.user);
  return c.json((await repoOf(c).list(all)).map(toService));
});

services.post("/", requireAdmin, async (c) => {
  const w = await readInput(c);
  return c.json(toService(await repoOf(c).create(w, actorOf(c))), 201);
});

/** FM's starting price sheet, only into an empty list. One summary audit row (action "starter"). */
services.post("/starter", requireAdmin, async (c) => {
  const repo = repoOf(c);
  const { currency_minor } = await settingsRepo(c.env.DB, c.var.tenant.org.id).get();
  const items = STARTER_SERVICES.map((s) => ({
    category: s.category,
    name: s.name,
    description: s.description,
    price: s.fils === 0 ? 0 : (toMinor(s.fils / 100, currency_minor) ?? Math.round((s.fils / 100) * currency_minor)),
    sort: s.sort,
  }));
  const rows = (await repo.count()) === 0 ? await repo.insertStarter(items, actorOf(c)) : null;
  if (!rows) throw new HttpError(409, "Your service list isn't empty");
  return c.json(rows.map(toService), 201);
});

services.put("/:id", requireAdmin, async (c) => {
  const id = serviceId(c.req.param("id"));
  const repo = repoOf(c);
  const before = await repo.byId(id);
  if (!before) throw notFound();
  const w = await readInput(c);
  const row = await repo.update(id, before, w, actorOf(c));
  if (!row) throw notFound();
  return c.json(toService(row));
});

services.delete("/:id", requireAdmin, async (c) => {
  const id = serviceId(c.req.param("id"));
  const repo = repoOf(c);
  const target = await repo.byId(id);
  if (!target) throw notFound();
  await repo.remove(target, actorOf(c));
  return c.json({ ok: true });
});

/** Public price list, mounted on publicApi at /services: GET /api/public/services. Needs the public_services_api feature. */
export const servicesPublic = new Hono<AppEnv>();
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "*", "Access-Control-Max-Age": "86400" };
servicesPublic.options("/", (c) => new Response(null, { status: 204, headers: CORS }));
servicesPublic.get("/", publicRateLimit("pub"), async (c) => {
  const org = await resolvePublicOrg(c);
  if (!org || !(await featuresFor(c.env.DB, org)).features.includes("public_services_api")) return c.json({ error: "Not found" }, 404);
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Cache-Control", "public, max-age=60");
  return c.json(await servicesRepo(c.env.DB, org.id).publicList());
});
