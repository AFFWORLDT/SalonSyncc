import { it, expect } from "vitest";
import src from "../src/data/tenant.ts?raw";
import { TENANT_TABLES } from "../src/data/tenant";

const VERB = /\b(SELECT|INSERT|UPDATE|DELETE)\b/;

/** Every string/template literal in the source that looks like SQL. */
function sqlStatements(code: string): string[] {
  const out: string[] = [];
  const re = /`((?:[^`\\]|\\.)*)`|"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'/g;
  for (const m of code.matchAll(re)) {
    const s = m[1] ?? m[2] ?? m[3] ?? "";
    if (VERB.test(s)) out.push(s);
  }
  return out;
}

function mentionsTenantTable(sql: string): boolean {
  return TENANT_TABLES.some((t) => new RegExp(`\\b${t}\\b`).test(sql));
}

/** Returns a problem description, or null when the statement is scoped. */
export function checkStatement(sql: string): string | null {
  if (!mentionsTenantTable(sql)) return null;
  if (/\borg_id\s*=\s*\?/.test(sql)) return null;
  if (/\bINSERT\b/.test(sql) && /\(\s*org_id\b/.test(sql)) return null;
  return `unscoped tenant SQL: ${sql}`;
}

it("every tenant SQL statement is scoped by org_id", () => {
  const stmts = sqlStatements(src).filter(mentionsTenantTable);
  expect(stmts.length).toBeGreaterThan(0);
  // login_failures has no repo statement yet (added with the login rate limiter); add it here then.
  for (const t of TENANT_TABLES.filter((t) => t !== "login_failures")) {
    expect(stmts.some((s) => new RegExp(`\\b${t}\\b`).test(s)), `no statement checked for ${t}`).toBe(true);
  }
  expect(stmts.map(checkStatement).filter(Boolean)).toEqual([]);
});

it("the guard flags unscoped statements", () => {
  expect(checkStatement("SELECT * FROM users WHERE id = ?")).not.toBeNull();
  expect(checkStatement("UPDATE users SET name = ? WHERE id = ?")).not.toBeNull();
  expect(checkStatement("INSERT INTO users(username) VALUES(?)")).not.toBeNull();
  expect(checkStatement("SELECT * FROM users WHERE org_id = ? AND id = ?")).toBeNull();
  expect(checkStatement("INSERT INTO counters(org_id,name,value) VALUES(?,?,1)")).toBeNull();
  expect(checkStatement("SELECT * FROM plans WHERE id = ?")).toBeNull();
});
