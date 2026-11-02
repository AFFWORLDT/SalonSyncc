import { it, expect } from "vitest";
import infraSrc from "../src/data/infra.ts?raw";
import { TENANT_TABLES } from "../src/data/tenant";
import { checkStatement, scanSource, tenantStatements } from "./sql-guard";

// Every .ts under src/data/tenant/ is scanned, each must hold at least one checked statement.
const files = import.meta.glob("../src/data/tenant/*.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

it("scans every file under src/data/tenant/ and each has checked statements", () => {
  const names = Object.keys(files);
  expect(names.some((n) => n.endsWith("/core.ts"))).toBe(true);
  for (const [name, code] of Object.entries(files)) {
    const { checked, violations } = scanSource(code);
    expect(checked, `${name} has no checked statement`).toBeGreaterThan(0);
    expect(violations, name).toEqual([]);
  }
});

it("infra.ts (rate_hits) is global and not flagged", () => {
  expect(infraSrc).toMatch(/rate_hits/);
  expect(scanSource(infraSrc)).toEqual({ checked: 0, violations: [] });
  expect(TENANT_TABLES).not.toContain("rate_hits");
});

it("every tenant table has a checked statement somewhere", () => {
  const stmts = Object.values(files).flatMap((code) => tenantStatements(code));
  // Tables added by later tasks get their repo statements in their own task; they are listed here as they gain one.
  // expenses/company_expenses: reports.ts SELECTs (Task 8) and expenses.ts reads/writes (Task 9).
  // Plan 2b Task 1 creates the engagement tables; each later task removes its tables from here as it adds their SQL.
  const pending: string[] = ["announcements", "ratings", "wa_campaigns", "wa_messages"];
  // Pending tables must really have no statement yet; once a task adds SQL for one, remove it from `pending`.
  for (const t of pending) {
    expect(stmts.some((s) => new RegExp(`\\b${t}\\b`, "i").test(s)), `${t} now has statements: remove it from pending`).toBe(false);
  }
  for (const t of TENANT_TABLES.filter((t) => !pending.includes(t))) {
    expect(stmts.some((s) => new RegExp(`\\b${t}\\b`, "i").test(s)), `no statement checked for ${t}`).toBe(true);
  }
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
