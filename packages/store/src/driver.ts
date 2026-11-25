// SQL driver boundary (P2.3.1: all shell calls sit behind one platform interface). The store speaks
// only this interface; the browser and headless use SQLite's WebAssembly build (sql.js), the desktop
// shell uses native SQLite through its own driver. All three read and write the same file format.
export type SqlParam = string | number | null | Uint8Array;

export interface SqlStatement { readonly sql: string; readonly params?: readonly SqlParam[] }

export interface SqlDriver {
  /** Runs DDL or several statements with no parameters. */
  exec(sql: string): Promise<void>;
  /** Runs the statements in one transaction: all apply or none do (P5.2.1). */
  transaction(statements: readonly SqlStatement[]): Promise<void>;
  /** Returns all rows as plain objects. */
  all<T = Record<string, unknown>>(sql: string, params?: readonly SqlParam[]): Promise<T[]>;
  /** Raw database file bytes, where the driver holds the file in memory. */
  exportBytes?(): Promise<Uint8Array>;
  close(): Promise<void>;
}
