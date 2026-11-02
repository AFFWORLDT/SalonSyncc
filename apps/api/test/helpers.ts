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
      .bind(id, name, (opts.slug.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase() || "ORG")),
    env.DB.prepare("INSERT INTO subscriptions(org_id) VALUES(?)").bind(id),
  ]);
  return { id, slug: opts.slug, name, status, planId: plan, trialEndsAt: null, graceEndsAt: null, limitsOverride: null };
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

import app from "../src/index";

/** Logs in through the real route and returns the cookie string ("ss_session=..."). Use a https URL (Secure cookie). */
export async function loginAs(slug: string, username: string, password = "pass1234", host?: string): Promise<string> {
  const url = `https://${host ?? "x.test"}/api/auth/login`;
  const res = await app.fetch(
    new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ org: slug, username, password }),
    }),
    { ...env, ROOT_DOMAIN: host ? "salonkit.online" : env.ROOT_DOMAIN },
    { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext,
  );
  if (res.status !== 200) throw new Error(`loginAs failed: ${res.status} ${await res.text()}`);
  const cookie = res.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("no session cookie");
  return cookie;
}
