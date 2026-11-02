/**
 * Cross-org registry. Every tenant route that takes an id appends a case here (later tasks add theirs).
 * test/cross-org.test.ts replays each: org B's owner calls the route with org A's id and must get 404,
 * and A's row must be unchanged afterwards. Then A's own owner repeats the call and must NOT get 404 (positive control).
 */
export interface CrossOrgCase {
  name: string;
  method: string;
  path: (id: number) => string;
  body?: unknown;
  /** Seeds a row in the given org and returns its id. */
  seed: (orgId: string) => Promise<number>;
  /** REQUIRED: a comparable snapshot of the row through org A's scoped repo (compared before/after org B's attempt). */
  read: (orgId: string, id: number) => Promise<unknown>;
}
export const CASES: CrossOrgCase[] = [];

// ---- Task 4: staff ----
import { env } from "cloudflare:test";
import { randomToken } from "../src/core/crypto";

const seedStaff = async (orgId: string): Promise<number> => {
  const r = await env.DB.prepare("INSERT INTO users(org_id,username,name,role,password_hash,created_at) VALUES(?,?,?,?,?,?) RETURNING id")
    .bind(orgId, `s${randomToken(4)}`, "Staff", "barber", "x", Date.now())
    .first<{ id: number }>();
  return r!.id;
};
const readStaff = (orgId: string, id: number) => env.DB.prepare("SELECT * FROM users WHERE org_id = ? AND id = ?").bind(orgId, id).first();
const staffCase = (method: string, pattern: string, body?: unknown): CrossOrgCase => ({
  name: `${method} ${pattern}`,
  method,
  path: (id) => pattern.replace(":id", String(id)),
  body,
  seed: seedStaff,
  read: readStaff,
});
CASES.push(
  staffCase("PUT", "/api/users/:id", { name: "Pwned", username: "pwned" }),
  staffCase("DELETE", "/api/users/:id"),
  staffCase("POST", "/api/users/:id/reset-password", { password: "hacked1" }),
  staffCase("PUT", "/api/users/:id/avatar", undefined),
  staffCase("DELETE", "/api/users/:id/avatar"),
);

// ---- Task 5: services ----
const seedService = async (orgId: string): Promise<number> => {
  const r = await env.DB.prepare("INSERT INTO services(org_id,uid,category,name,price,created_at,updated_at) VALUES(?,?,?,?,?,?,?) RETURNING id")
    .bind(orgId, randomToken(9), "Haircuts", "Cut", 1000, 1, 1)
    .first<{ id: number }>();
  return r!.id;
};
const readService = (orgId: string, id: number) => env.DB.prepare("SELECT * FROM services WHERE org_id = ? AND id = ?").bind(orgId, id).first();
const serviceCase = (method: string, body?: unknown): CrossOrgCase => ({
  name: `${method} /api/services/:id`,
  method,
  path: (id) => `/api/services/${id}`,
  body,
  seed: seedService,
  read: readService,
});
CASES.push(serviceCase("PUT", { category: "Pwned", name: "Pwned", price: 1 }), serviceCase("DELETE"));
