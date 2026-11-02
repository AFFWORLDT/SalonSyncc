import { env } from "cloudflare:test";
import { it, expect } from "vitest";
import { platformRepo } from "../src/data/platform";
import { tenantRepo } from "../src/data/tenant";
import { makeOrg, makeUser } from "./helpers";

it("tenantRepo never sees another org's user", async () => {
  const a = await makeOrg({ slug: "alpha" });
  const b = await makeOrg({ slug: "bravo" });
  const u = await makeUser(a.id, { username: "sam" });
  expect(await tenantRepo(env.DB, b.id).userById(u.id)).toBeNull();
  expect(await tenantRepo(env.DB, b.id).userByUsername("sam")).toBeNull();
  expect((await tenantRepo(env.DB, a.id).userById(u.id))?.username).toBe("sam");
  expect((await tenantRepo(env.DB, a.id).userByUsername("sam"))?.id).toBe(u.id);
});

it("nextSeq counts per org", async () => {
  const a = await makeOrg({ slug: "charlie" });
  const b = await makeOrg({ slug: "delta" });
  const ra = tenantRepo(env.DB, a.id);
  expect(await ra.nextSeq("bill")).toBe(1);
  expect(await ra.nextSeq("bill")).toBe(2);
  expect(await tenantRepo(env.DB, b.id).nextSeq("bill")).toBe(1);
});

it("settings maps to camelCase and is org-scoped", async () => {
  const a = await makeOrg({ slug: "echo" });
  const s = await tenantRepo(env.DB, a.id).settings();
  expect(s.orgId).toBe(a.id);
  expect(s.displayName).toBe("echo");
  expect(s.billPrefix).toBe("ECH");
  expect(s.currency).toBe("AED");
  expect(s.dayStartHour).toBe(4);
});

it("platformRepo reads orgs, plans and overrides", async () => {
  const o = await makeOrg({ slug: "foxtrot", plan: "pro", status: "trial" });
  const p = platformRepo(env.DB);
  expect(await p.orgBySlug("foxtrot")).toEqual(o);
  expect((await p.orgById(o.id))?.slug).toBe("foxtrot");
  expect(await p.orgBySlug("nope")).toBeNull();
  expect(await p.planFeatures("free")).toContain("core_sales");
  expect(await p.planLimits("free")).toEqual({ max_staff: 2 });
  expect(await p.planLimits("pro_max")).toEqual({ max_staff: null });
  await env.DB.prepare("INSERT INTO org_feature_overrides(org_id,feature_key,enabled,set_at) VALUES(?,?,?,?)")
    .bind(o.id, "ledger", 1, Date.now()).run();
  expect(await p.overrides(o.id)).toEqual([{ feature_key: "ledger", enabled: 1 }]);
});
