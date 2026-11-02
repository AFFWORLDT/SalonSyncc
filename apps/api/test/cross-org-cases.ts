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
