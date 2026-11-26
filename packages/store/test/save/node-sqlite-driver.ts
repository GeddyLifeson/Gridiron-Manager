// Test-only SQL driver over Node's built-in SQLite, writing a real file in write-ahead mode with
// full synchronisation: what the desktop shell's native driver does (P5.8.1). Used by the real
// process-kill test. Returns null where this Node has no built-in SQLite.
import type { SqlDriver, SqlParam, SqlStatement } from '../../src/driver.ts';

interface Stmt { run(...p: unknown[]): unknown; all(...p: unknown[]): unknown[] }
interface Db { exec(sql: string): void; prepare(sql: string): Stmt; close(): void }
export interface NodeSqlite { DatabaseSync: new (path: string) => Db }

export function nodeSqlite(): NodeSqlite | null {
  try {
    const get = (process as unknown as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule;
    const m = get ? (get('node:sqlite') as NodeSqlite | undefined) : undefined;
    return m?.DatabaseSync ? m : null;
  } catch {
    return null;
  }
}

export class NodeSqliteDriver implements SqlDriver {
  private readonly db: Db;
  constructor(sqlite: NodeSqlite, path: string) {
    this.db = new sqlite.DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;');
  }
  async exec(sql: string): Promise<void> { this.db.exec(sql); }
  async transaction(statements: readonly SqlStatement[]): Promise<void> {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const s of statements) this.db.prepare(s.sql).run(...((s.params ?? []) as SqlParam[]));
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  async all<T>(sql: string, params: readonly SqlParam[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as T[];
  }
  async close(): Promise<void> { this.db.close(); }
}
