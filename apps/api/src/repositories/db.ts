// Small helper so a statement can reuse one value several times with ?1, ?2 ... and still bind
// exactly the parameters it uses (D1 rejects a bind count that does not match the SQL).
export function stmt(db: D1Database, sql: string, params: unknown[]): D1PreparedStatement {
  const used = new Set([...sql.matchAll(/\?(\d+)/g)].map((m) => Number(m[1])));
  const max = Math.max(0, ...used);
  for (let i = 1; i <= max; i++) {
    if (!used.has(i)) throw new Error(`sql_param_gap:${i}`);
  }
  if (params.length !== max) throw new Error(`sql_param_count:${max}:${params.length}`);
  return db.prepare(sql).bind(...params);
}
