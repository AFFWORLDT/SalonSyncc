import { TENANT_TABLES } from "../src/data/tenant";

/**
 * Static SQL guard: every SQL literal that touches a tenant table must be scoped by org_id.
 * Text-based, so it still CANNOT catch: a wrong bound value (e.g. binding another org's id),
 * subqueries/joins reaching other tables unscoped, or interpolated table names (`FROM ${t}`).
 * Those limits are covered by code review and the cross-org tests in data.test.ts.
 */

const TABLES = TENANT_TABLES.join("|");
const VERB = new RegExp("\\b(SELECT|INSERT|UPDATE|DELETE)\\b", "i");
const TABLE_ANY = new RegExp(`\\b(${TABLES})\\b`, "i");
// Context reference: even a verb-less fragment like " FROM users WHERE id = ?" counts.
const TABLE_CTX = new RegExp(`\\b(FROM|JOIN|INTO|UPDATE)\\s+(${TABLES})\\b`, "i");

/** Every string/template literal in the source. */
export function literals(code: string): string[] {
  const re = /`((?:[^`\\]|\\.)*)`|"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'/g;
  return [...code.matchAll(re)].map((m) => m[1] ?? m[2] ?? m[3] ?? "");
}

export function touchesTenantTable(s: string): boolean {
  return TABLE_CTX.test(s) || (VERB.test(s) && TABLE_ANY.test(s));
}

/** Returns a problem description, or null when the statement is scoped (or not tenant SQL). */
export function checkStatement(sql: string): string | null {
  if (!touchesTenantTable(sql)) return null;
  const bad = `unscoped tenant SQL: ${sql}`;
  const body = sql.replace(/\bINSERT\s+OR\s+\w+/gi, "INSERT");
  if (/\bOR\b/i.test(body)) return bad;
  if (/\bINSERT\b/i.test(body)) {
    const cols = /\bINSERT\s+INTO\s+\w+\s*\(([^)]*)\)/i.exec(body)?.[1] ?? "";
    return /\borg_id\b/i.test(cols) ? null : bad;
  }
  const w = body.search(/\bWHERE\b/i);
  if (w < 0) return bad;
  return /\borg_id\s*=\s*\?/i.test(body.slice(w)) ? null : bad;
}

export function tenantStatements(src: string): string[] {
  return literals(src).filter(touchesTenantTable);
}

export function scanSource(src: string): { checked: number; violations: string[] } {
  const stmts = tenantStatements(src);
  return { checked: stmts.length, violations: stmts.map(checkStatement).filter((v): v is string => !!v) };
}
