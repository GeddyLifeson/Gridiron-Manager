// Desktop platform (P2.3.1): native SQLite in the Tauri shell. The Rust side owns the database file
// in the app data folder; every store transaction runs as one native transaction.
import { invoke } from '@tauri-apps/api/core';
import type { Platform, SaveListing, SqlDriver, SqlParam, SqlStatement } from '@gm/app-services';

const enc = (p: readonly SqlParam[] = []) => p.map((x) => (x instanceof Uint8Array ? { bytes: Array.from(x) } : x));

class NativeDriver implements SqlDriver {
  constructor(private readonly handle: number) {}
  exec(sql: string) { return invoke<void>('db_exec', { handle: this.handle, sql }); }
  transaction(statements: readonly SqlStatement[]) {
    return invoke<void>('db_transaction', { handle: this.handle, statements: statements.map((s) => ({ sql: s.sql, params: enc(s.params) })) });
  }
  all<T>(sql: string, params: readonly SqlParam[] = []) { return invoke<T[]>('db_all', { handle: this.handle, sql, params: enc(params) }); }
  close() { return invoke<void>('db_close', { handle: this.handle }); }
}

export const isDesktop = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export class DesktopPlatform implements Platform {
  readonly kind = 'desktop' as const;
  async openSave(name: string, create: boolean): Promise<SqlDriver> {
    return new NativeDriver(await invoke<number>('db_open', { name, create }));
  }
  async flushSave() { /* native SQLite writes the file on commit */ }
  listSaves() { return invoke<SaveListing[]>('saves_list'); }
  deleteSave(name: string) { return invoke<void>('saves_delete', { name }); }
  async exportSave(name: string) { return new Uint8Array(await invoke<number[]>('saves_read', { name })); }
  importSave(name: string, bytes: Uint8Array) { return invoke<void>('saves_write', { name, bytes: Array.from(bytes) }); }
  appVersion() { return 'desktop (Tauri)'; }
}
