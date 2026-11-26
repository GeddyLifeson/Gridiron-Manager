// Browser platform (P2.3.2, P5.6.1): SQLite WebAssembly in memory, persisted after each committed
// transaction through the store's browser save vault. The vault picks the browser's private file
// storage (Origin Private File System), then IndexedDB, then memory only (private modes with no
// storage still run; saves then last only for the tab and the vault reports a permanent banner). It
// also owns the quota stop, the first-save notice and the export reminder the screens show.
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { SqlJsDriver, type Platform, type SaveListing, type SqlDriver } from '@gm/app-services';
import { browser } from '@gm/store';

let sql: Promise<SqlJsStatic> | undefined;
export const sqlJs = () => (sql ??= initSqlJs({ locateFile: () => wasmUrl }));

/** Thrown by flushSave and importSave when a write would not fit (P5.6.1): the game stops and offers export or thinning. */
export class SaveQuotaError extends Error {
  constructor(readonly saveName: string, readonly result: Extract<browser.WriteResult, { ok: false }>) {
    super(`not enough browser storage to save ${saveName}: about ${Math.ceil(result.neededBytes / 1_048_576)} MB more is needed. Export the career file or thin old seasons.`);
  }
}

/**
 * Phase 0 shells kept IndexedDB saves in the database "gridiron-manager", store "saves", keyed by
 * name without an extension. Where the vault ends up on IndexedDB (no usable private file storage),
 * those careers are copied in once so they still list. OPFS saves already sit where the vault looks.
 */
async function adoptLegacyIndexedDb(vault: browser.BrowserSaveVault): Promise<void> {
  if (vault.backendKind !== 'indexeddb' || typeof indexedDB === 'undefined') return;
  const req = <T>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  let db: IDBDatabase;
  try {
    const open = indexedDB.open('gridiron-manager', 1);
    open.onupgradeneeded = () => { open.transaction?.abort(); }; // never create the old database
    db = await req(open);
  } catch { return; }
  try {
    if (!db.objectStoreNames.contains('saves')) return;
    const store = () => db.transaction('saves', 'readonly').objectStore('saves');
    const have = new Set((await vault.list()).map((s) => s.name));
    for (const key of (await req(store().getAllKeys())).map(String)) {
      if (have.has(key) || !browser.isValidSaveName(key)) continue;
      const v = await req(store().get(key)) as unknown;
      const bytes = v instanceof Uint8Array ? v : v instanceof ArrayBuffer ? new Uint8Array(v) : undefined;
      if (bytes) await vault.save(key, bytes);
    }
  } catch { /* an unreadable old store only means those careers stay where they were */ } finally { db.close(); }
}

export class BrowserPlatform implements Platform {
  readonly kind = 'browser' as const;
  /** Result of the last save write: a `quota_near` warning the screens can show, or null. */
  lastWriteWarning: browser.QuotaWarning | null = null;
  private constructor(readonly vault: browser.BrowserSaveVault) {}

  static async create(): Promise<BrowserPlatform> {
    const vault = await browser.BrowserSaveVault.open({
      backend: await browser.openBrowserBackend(),
      storage: typeof navigator !== 'undefined' ? navigator.storage : undefined,
      now: () => Date.now(),
    });
    await adoptLegacyIndexedDb(vault);
    return new BrowserPlatform(vault);
  }

  get storage(): browser.BackendKind { return this.vault.backendKind; }

  async openSave(name: string, create: boolean): Promise<SqlDriver> {
    const existing = await this.vault.load(name);
    if (create && existing) throw new Error(`a save named ${name} already exists`);
    if (!create && !existing) throw new Error(`no save named ${name}`);
    return SqlJsDriver.open(await sqlJs(), existing);
  }

  async flushSave(name: string, d: SqlDriver) {
    if (!d.exportBytes) return;
    const r = await this.vault.save(name, await d.exportBytes());
    if (!r.ok) throw new SaveQuotaError(name, r);
    this.lastWriteWarning = r.warning;
  }

  async listSaves(): Promise<SaveListing[]> { return this.vault.list(); }
  deleteSave(name: string) { return this.vault.remove(name); }
  /** Records the export, so the season-boundary reminder counts days from it (P5.6.1). */
  async exportSave(name: string) { return (await this.vault.exportCareer(name)).bytes; }
  /** Reads the header first and never overwrites a career of the same name. */
  async importSave(name: string, b: Uint8Array) {
    const { result } = await this.vault.importCareer(await sqlJs(), name, b);
    if (!result.ok) throw new SaveQuotaError(name, result);
  }
  appVersion() { return `browser (${this.storage})`; }
}
