// The one platform interface (P2.3.1). Two implementations: desktop (native SQLite through the
// shell) and browser (SQLite WebAssembly on private browser storage). The game logic never knows
// which one it runs on.
import type { SqlDriver } from '@gm/store';

export interface SaveListing { readonly name: string; readonly sizeBytes: number }

export interface Platform {
  readonly kind: 'desktop' | 'browser' | 'headless';
  /** Opens (or creates when absent) the named save database. */
  openSave(name: string, create: boolean): Promise<SqlDriver>;
  /** Persists the database after a committed transaction where the driver keeps it in memory. */
  flushSave(name: string, driver: SqlDriver): Promise<void>;
  listSaves(): Promise<SaveListing[]>;
  deleteSave(name: string): Promise<void>;
  /** Bytes of a save for export (O5, P5.7) and bytes to import. */
  exportSave(name: string): Promise<Uint8Array>;
  importSave(name: string, bytes: Uint8Array): Promise<void>;
  /** Version string of the application build. */
  appVersion(): string;
}
