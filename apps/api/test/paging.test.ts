import { env } from "cloudflare:test";
import { it, expect } from "vitest";
import app from "../src/index";
import { makeOrg, makeUser, loginAs } from "./helpers";

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const get = (path: string, cookie: string) =>
  app.fetch(new Request(`https://x.test/api${path}`, { headers: { cookie } }), { ...env, ROOT_DOMAIN: "" }, ctx);

it("absurd ?page values are clamped: 200 with empty items, never 500", async () => {
  const org = await makeOrg({ slug: "paging", plan: "pro_max" });
  await makeUser(org.id, { username: "own", role: "owner" });
  const ck = await loginAs("paging", "own");
  for (const path of ["/sales", "/customers"]) {
    for (const page of ["1e20", "99999999999", "1e308", "100001"]) {
      const r = await get(`${path}?page=${page}`, ck);
      expect(r.status, `${path}?page=${page}`).toBe(200);
      const b = (await r.json()) as any;
      expect(b.items).toEqual([]);
      expect(b.page).toBeLessThanOrEqual(100000);
    }
  }
});
