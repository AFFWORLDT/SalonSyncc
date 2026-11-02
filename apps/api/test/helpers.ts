import { env } from "cloudflare:test";
import type { PlanId } from "@ss/features";
import { hashPassword, randomToken } from "../src/core/crypto";
import type { Org, OrgStatus } from "../src/data/platform";
import type { UserRow } from "../src/data/tenant";

export async function makeOrg(opts: { slug: string; plan?: PlanId; status?: OrgStatus }): Promise<Org> {
  const id = `org_${randomToken(12)}`;
  const plan = opts.plan ?? "free";
  const status = opts.status ?? "active";
  const name = opts.slug;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO orgs(id,slug,name,status,plan_id,created_at) VALUES(?,?,?,?,?,?)")
      .bind(id, opts.slug, name, status, plan, Date.now()),
    env.DB.prepare("INSERT INTO org_settings(org_id,display_name,bill_prefix) VALUES(?,?,?)")
      .bind(id, name, opts.slug.slice(0, 3).toUpperCase()),
    env.DB.prepare("INSERT INTO subscriptions(org_id) VALUES(?)").bind(id),
  ]);
  return { id, slug: opts.slug, name, status, planId: plan, trialEndsAt: null, graceEndsAt: null };
}

export async function makeUser(
  orgId: string,
  opts: { username: string; role?: UserRow["role"]; password?: string },
): Promise<UserRow> {
  const hash = await hashPassword(opts.password ?? "pass1234");
  const role = opts.role ?? "owner";
  const row = await env.DB.prepare(
    "INSERT INTO users(org_id,username,name,role,password_hash,created_at) VALUES(?,?,?,?,?,?) RETURNING id,org_id,username,name,role,password_hash,active,session_version",
  ).bind(orgId, opts.username, opts.username, role, hash, Date.now()).first<UserRow>();
  return row!;
}
