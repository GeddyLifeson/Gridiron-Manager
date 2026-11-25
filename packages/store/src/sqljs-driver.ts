// SQLite WebAssembly driver (sql.js). Used by the browser build and the headless runner.
import type { Database, SqlJsStatic } from 'sql.js';
import type { SqlDriver, SqlParam, SqlStatement } from './driver.ts';

export class SqlJsDriver implements SqlDriver {
  private constructor(private readonly db: Database) {}

  static open(SQL: SqlJsStatic, bytes?: Uint8Array): SqlJsDriver {
    const db = bytes ? new SQL.Database(bytes) : new SQL.Database();
    db.exec('PRAGMA foreign_keys = ON;');
    return new SqlJsDriver(db);
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async transaction(statements: readonly SqlStatement[]): Promise<void> {
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      for (const s of statements) this.db.run(s.sql, (s.params ?? []) as SqlParam[]);
      this.db.exec('COMMIT;');
    } catch (e) {
      this.db.exec('ROLLBACK;');
      throw e;
    }
  }

  async all<T>(sql: string, params: readonly SqlParam[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params as SqlParam[]);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      return rows;
    } finally {
      stmt.free();
    }
  }

  async exportBytes(): Promise<Uint8Array> {
    return this.db.export();
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
