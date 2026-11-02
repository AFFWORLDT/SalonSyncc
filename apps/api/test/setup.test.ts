import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../src/index";
import { makeOrg, makeUser, loginAs } from "./helpers";

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const get = (cookie: string) => app.fetch(new Request("https://x.test/api/settings/setup", { headers: { cookie } }), { ...env, ROOT_DOMAIN: "" }, ctx);

describe("setup checklist", () => {
  it("reports what a salon has set up, for its own org only", async () => {
    const a = await makeOrg({ slug: "setup-a", plan: "pro_max" });
    const b = await makeOrg({ slug: "setup-b", plan: "pro_max" });
    await makeUser(a.id, { username: "own", role: "owner" });
    await makeUser(b.id, { username: "own", role: "owner" });
    await makeUser(b.id, { username: "bb", role: "barber" });
    await env.DB.prepare("INSERT INTO services(org_id,category,name,price,sort_order,active,created_at) VALUES(?,'Hair','Cut',2000,0,1,?)").bind(b.id, Date.now()).run().catch(() => {});
    await env.DB.prepare("UPDATE org_settings SET vat_enabled = 1, google_review_url = 'https://g.page/x' WHERE org_id = ?").bind(b.id).run();
    const ra: any = await (await get(await loginAs("setup-a", "own"))).json();
    expect(ra).toEqual({ logo: false, services: false, staff: false, vat: false, google_review: false });
    const rb: any = await (await get(await loginAs("setup-b", "own"))).json();
    expect(rb).toMatchObject({ staff: true, vat: true, google_review: true });
  });
  it("barbers can't read it", async () => {
    const o = await makeOrg({ slug: "setup-c" });
    await makeUser(o.id, { username: "bar", role: "barber" });
    expect((await get(await loginAs("setup-c", "bar"))).status).toBe(403);
  });
});
