/** env.DB with every statement counted (`statements`: each statement in a batch counts, as on the free plan; `calls`: round trips). */
export function countingDb(real: D1Database) {
  const count = { calls: 0, statements: 0 };
  const REAL = Symbol("real");
  const wrap = (st: D1PreparedStatement): D1PreparedStatement =>
    new Proxy(st, {
      get(t, p) {
        if (p === REAL) return t;
        if (p === "bind") return (...a: unknown[]) => wrap(t.bind(...a));
        if (p === "first" || p === "all" || p === "run" || p === "raw")
          return (...a: unknown[]) => {
            count.calls++;
            count.statements++;
            return (t as any)[p](...a);
          };
        const v = (t as any)[p];
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
  const db = new Proxy(real, {
    get(t, p) {
      if (p === "prepare") return (sql: string) => wrap(t.prepare(sql));
      if (p === "batch")
        return (stmts: D1PreparedStatement[]) => {
          count.calls++;
          count.statements += stmts.length;
          return t.batch(stmts.map((s) => (s as any)[REAL] ?? s));
        };
      const v = (t as any)[p];
      return typeof v === "function" ? v.bind(t) : v;
    },
  });
  return { db, count };
}
