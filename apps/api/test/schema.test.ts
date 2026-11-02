import { env } from "cloudflare:test";
import { it, expect } from "vitest";
import { PLAN_DEFAULTS } from "@ss/features";

const now = Date.now();
async function mkOrg(id: string, slug: string, status = "trial") {
  await env.DB.prepare(
    "INSERT INTO orgs(id,slug,name,status,plan_id,created_at) VALUES(?,?,?,?,?,?)",
  ).bind(id, slug, slug, status, "free", now).run();
}
async function mkUser(orgId: string, username: string) {
  await env.DB.prepare(
    "INSERT INTO users(org_id,username,name,role,password_hash,created_at) VALUES(?,?,?,?,?,?)",
  ).bind(orgId, username, username, "owner", "x", now).run();
}

it("plans seeded exactly from PLAN_DEFAULTS", async () => {
  const plans = await env.DB.prepare("SELECT id, price_monthly, currency FROM plans ORDER BY sort").all();
  expect(plans.results).toEqual([
    { id: "free", price_monthly: 0, currency: "AED" },
    { id: "pro", price_monthly: 200, currency: "AED" },
    { id: "pro_max", price_monthly: 499, currency: "AED" },
  ]);
  for (const id of ["free", "pro", "pro_max"] as const) {
    const f = await env.DB.prepare("SELECT feature_key FROM plan_features WHERE plan_id=?").bind(id).all();
    expect(f.results.map((r) => r.feature_key as string).sort()).toEqual([...PLAN_DEFAULTS[id].features].sort());
    const p = await env.DB.prepare("SELECT limits_json FROM plans WHERE id=?").bind(id).first<{ limits_json: string }>();
    expect(JSON.parse(p!.limits_json)).toEqual(PLAN_DEFAULTS[id].limits);
  }
});

it("username unique per org, not globally", async () => {
  await mkOrg("org_a", "a-salon");
  await mkOrg("org_b", "b-salon");
  await mkUser("org_a", "boss");
  await mkUser("org_b", "boss");
  await expect(mkUser("org_a", "boss")).rejects.toThrow(/UNIQUE/);
});

it("org status rejects unknown value", async () => {
  await expect(mkOrg("org_c", "c-salon", "paused")).rejects.toThrow(/CHECK/);
});

it("reserved slugs are seeded", async () => {
  const r = await env.DB.prepare("SELECT slug FROM reserved_slugs").all();
  expect(r.results.map((x) => x.slug as string).sort()).toEqual(
    ["admin","www","api","app","platform","mail","support","help","billing","status","static","assets","login","signup"].sort(),
  );
});
