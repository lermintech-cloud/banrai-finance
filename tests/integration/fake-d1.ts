// A tiny D1 stand-in backed by REAL SQLite (node:sqlite) so the Worker runs against the real
// schema, triggers and constraints. It mimics only what the Worker uses: prepare/bind/first/all/run/batch.
// Foreign keys are ON, as on D1. batch() is one transaction and rolls back on any error.
import { DatabaseSync } from 'node:sqlite';

class FakeStmt {
  db: DatabaseSync;
  sql: string;
  params: unknown[];
  constructor(db: DatabaseSync, sql: string, params: unknown[] = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }
  bind(...p: unknown[]) {
    return new FakeStmt(this.db, this.sql, p);
  }
  returnsRows() {
    return /^\s*(select|with)\b/i.test(this.sql) || /\breturning\b/i.test(this.sql);
  }
  exec() {
    const st = this.db.prepare(this.sql);
    const p = this.params.map((v) => (v === undefined ? null : v)) as never[];
    if (this.returnsRows()) {
      const rows = st.all(...p) as Record<string, unknown>[];
      return { results: rows.map((r) => ({ ...r })), success: true, meta: { changes: 0 } };
    }
    const r = st.run(...p);
    return { results: [], success: true, meta: { changes: Number(r.changes) } };
  }
  async first() {
    return this.exec().results[0] ?? null;
  }
  async all() {
    return this.exec();
  }
  async run() {
    return this.exec();
  }
}

export function createFakeD1(db: DatabaseSync) {
  db.exec('PRAGMA foreign_keys = ON');
  return {
    prepare: (sql: string) => new FakeStmt(db, sql),
    async batch(stmts: FakeStmt[]) {
      db.exec('BEGIN');
      try {
        const out = stmts.map((s) => s.exec());
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
