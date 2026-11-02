/**
 * D1 statement metering for the cron (R2). The Workers free plan counts every D1 statement toward its per-invocation
 * cap, each statement inside a batch included. `meteredEnv` wraps env.DB so every `first/all/run/raw` takes 1 and
 * every `batch(stmts)` takes stmts.length from `budget.stmts`. It only counts: callers check their worst-case cost
 * BEFORE a step (jobs/hourly.ts) so the counter never goes below 0 in practice.
 * FAIL-CLOSED: any other D1 method (withSession, dump, a future API) throws instead of running unmetered; meter it
 * here before a cron path uses it.
 */

/**
 * Our per-invocation ceilings on the Workers free plan (50 subrequests, 50 D1 statements; headroom kept). The cron
 * (jobs/hourly.ts) and every HTTP route that sends in a loop (manual WhatsApp job runs, campaign /next, the webhook)
 * share these two counters' sizes.
 */
export const FREE_SUBREQUESTS = 40;
export const FREE_STMTS = 45;

const REAL = Symbol("metered-real");
const STATEMENT_OK = new Set<PropertyKey>(["bind", "first", "all", "run", "raw"]);
const unmetered = (p: PropertyKey) => {
  throw new Error(`metered D1: ${String(p)}() is not metered; add it to lib/metered.ts before using it in the cron`);
};

export function meteredDb(real: D1Database, spend: (n: number) => void): D1Database {
  const wrap = (st: D1PreparedStatement): D1PreparedStatement =>
    new Proxy(st, {
      get(t, p) {
        if (p === REAL) return t;
        if (p === "bind") return (...a: unknown[]) => wrap(t.bind(...a));
        if (p === "first" || p === "all" || p === "run" || p === "raw")
          return (...a: unknown[]) => {
            spend(1);
            return (t as any)[p](...a);
          };
        const v = (t as any)[p];
        if (typeof v === "function" && !STATEMENT_OK.has(p)) return () => unmetered(p);
        return v;
      },
    });
  return new Proxy(real, {
    get(t, p) {
      if (p === "prepare") return (sql: string) => wrap(t.prepare(sql));
      if (p === "batch")
        return (stmts: D1PreparedStatement[]) => {
          spend(stmts.length);
          return t.batch(stmts.map((s) => (s as any)[REAL] ?? s));
        };
      if (p === "exec")
        return (sql: string) => {
          spend(1);
          return t.exec(sql);
        };
      const v = (t as any)[p];
      return typeof v === "function" ? () => unmetered(p) : v;
    },
  });
}

/** `env` with DB metered against `budget.stmts` (a budget without `stmts` is left unmetered). */
export function meteredEnv<E extends { DB: D1Database }>(env: E, budget: { stmts?: number }): E {
  return {
    ...env,
    DB: meteredDb(env.DB, (n) => {
      if (budget.stmts !== undefined) budget.stmts -= n;
    }),
  };
}
