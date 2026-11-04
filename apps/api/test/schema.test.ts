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

it("0004: users (org_id,id) unique index, services uid unique per org, rate_hits, audit_log", async () => {
  const idx = await env.DB.prepare("SELECT name, \"unique\" AS u FROM pragma_index_list('users')").all();
  expect(idx.results.find((r) => r.name === "users_org_id")?.u).toBe(1);
  const cols = (await env.DB.prepare("SELECT name FROM pragma_table_info('rate_hits')").all()).results.map((r) => r.name);
  expect(cols).toEqual(["key", "window", "n"]);
  const rs = (await env.DB.prepare("SELECT name FROM pragma_table_info('org_settings')").all()).results.map((r) => r.name);
  for (const c of ["salon_name_ar", "tagline", "default_commission_pct", "quick_amounts", "thank_you_text", "summary_hour", "updated_at"]) expect(rs).toContain(c);
  const us = (await env.DB.prepare("SELECT name FROM pragma_table_info('users')").all()).results.map((r) => r.name);
  for (const c of ["phone", "commission_pct", "sort_order", "avatar", "avatar_type", "avatar_v", "can_add_expense"]) expect(us).toContain(c);
  const ac = (await env.DB.prepare("SELECT name FROM pragma_table_info('audit_log')").all()).results.map((r) => r.name);
  expect(ac).toEqual(["id", "org_id", "at", "actor_id", "actor_name", "entity", "entity_id", "ref", "action", "before", "after"]);
  const fks = (await env.DB.prepare("SELECT \"from\" FROM pragma_foreign_key_list('audit_log')").all()).results.map((r) => r.from);
  expect(fks).toEqual(["org_id"]);
});

it("services uid is unique per org, not globally; price >= 0", async () => {
  await mkOrg("org_s1", "s1-salon");
  await mkOrg("org_s2", "s2-salon");
  const ins = (org: string, uid: string, price = 10) =>
    env.DB.prepare("INSERT INTO services(org_id,uid,category,name,price,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
      .bind(org, uid, "Hair", "Cut", price, now, now).run();
  await ins("org_s1", "u1");
  await ins("org_s2", "u1");
  await expect(ins("org_s1", "u1")).rejects.toThrow(/UNIQUE/);
  await expect(ins("org_s1", "u2", -1)).rejects.toThrow(/CHECK/);
});

it("mobile tables exist", async () => {
  await mkOrg("org_mob", "mob-salon");
  await mkUser("org_mob", "boss");
  const u = await env.DB.prepare("SELECT id FROM users WHERE org_id='org_mob'").first<{ id: number }>();
  const ins = (platform: string) =>
    env.DB.prepare(
      "INSERT INTO mobile_sessions(id,org_id,user_id,token_hash,device_id,device_name,platform,session_version,created_at,last_used_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    ).bind(`ms_${platform}`, "org_mob", u!.id, `h_${platform}`, "dev12345", "Phone", platform, 1, now, now, now).run();
  await ins("ios");
  await expect(ins("web")).rejects.toThrow(/CHECK/);
  const role = (r: string) =>
    env.DB.prepare("INSERT INTO org_role_features(org_id,role,feature_key,enabled,updated_at) VALUES('org_mob',?,'expenses',0,?)").bind(r, now).run();
  await role("barber");
  await expect(role("owner")).rejects.toThrow(/CHECK/);
  const cfg = await env.DB.prepare("SELECT platform FROM app_config ORDER BY platform").all();
  expect(cfg.results.map((r) => r.platform)).toEqual(["android", "ios"]);
});
