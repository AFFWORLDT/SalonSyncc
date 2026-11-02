import { it, expect } from "vitest";
import src from "../src/data/tenant.ts?raw";
import { TENANT_TABLES } from "../src/data/tenant";
import { checkStatement, scanSource, tenantStatements } from "./sql-guard";

it("every tenant SQL statement is scoped by org_id", () => {
  const { checked, violations } = scanSource(src);
  expect(checked).toBeGreaterThan(0);
  const stmts = tenantStatements(src);
  // login_failures has no repo statement yet (added with the login rate limiter); add it here then.
  for (const t of TENANT_TABLES.filter((t) => t !== "login_failures")) {
    expect(stmts.some((s) => new RegExp(`\\b${t}\\b`, "i").test(s)), `no statement checked for ${t}`).toBe(true);
  }
  expect(violations).toEqual([]);
});

it("the guard flags unscoped statements", () => {
  for (const bad of [
    "SELECT * FROM users WHERE id = ?",
    "UPDATE users SET name = ? WHERE id = ?",
    "INSERT INTO users(username) VALUES(?)",
    "select * from users where id = ?",
    "SELECT * FROM USERS WHERE id = ?",
    "SELECT * FROM users WHERE org_id = ? OR id = ?",
    "UPDATE users SET org_id = ? WHERE id = ?",
    "SELECT * FROM users",
    " FROM users WHERE id = ?",
  ]) expect(checkStatement(bad), bad).not.toBeNull();
  expect(scanSource('const q = "SELECT *" + " FROM users WHERE id = ?";').violations.length).toBe(1);
});

it("the guard accepts scoped statements", () => {
  for (const ok of [
    "SELECT * FROM users WHERE org_id = ? AND id = ?",
    "select * from USERS where ORG_ID=? and id = ?",
    "INSERT INTO counters(org_id,name,value) VALUES(?,?,1)",
    "INSERT INTO users(name, org_id) VALUES(?,?)",
    "SELECT * FROM plans WHERE id = ?",
  ]) expect(checkStatement(ok), ok).toBeNull();
});
