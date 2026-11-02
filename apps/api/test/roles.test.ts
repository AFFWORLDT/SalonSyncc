import { env } from "cloudflare:test";
import { it, expect } from "vitest";
import { Hono } from "hono";
import { tenantGuard } from "../src/index";
import { requireAdmin, isAdmin, forbidden } from "../src/core/roles";
import { makeOrg, makeUser, loginAs } from "./helpers";

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const t = new Hono<any>();
t.use("*", tenantGuard);
t.get("/adm", requireAdmin, (c) => c.json({ ok: true }));
const a = new Hono<any>();
a.route("/api", t);
a.onError((err, c) => c.json({ error: err.message }, (err as any).status ?? 500));
const hit = (cookie: string) =>
  a.fetch(new Request("https://x.test/api/adm", { headers: { cookie } }), { ...env, ROOT_DOMAIN: "" }, ctx);

it("barber gets 403, owner and admin pass", async () => {
  const o = await makeOrg({ slug: "roles-a" });
  await makeUser(o.id, { username: "own", role: "owner" });
  await makeUser(o.id, { username: "adm", role: "admin" });
  await makeUser(o.id, { username: "bar", role: "barber" });
  const bar = await hit(await loginAs("roles-a", "bar"));
  expect(bar.status).toBe(403);
  expect(await bar.json()).toEqual({ error: "You don't have access to this" });
  expect((await hit(await loginAs("roles-a", "own"))).status).toBe(200);
  expect((await hit(await loginAs("roles-a", "adm"))).status).toBe(200);
});

it("isAdmin / forbidden", () => {
  expect(isAdmin({ role: "owner" } as any)).toBe(true);
  expect(isAdmin({ role: "admin" } as any)).toBe(true);
  expect(isAdmin({ role: "barber" } as any)).toBe(false);
  expect(forbidden().status).toBe(403);
});
