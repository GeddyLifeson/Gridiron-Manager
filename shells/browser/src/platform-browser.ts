// Browser platform (P2.3.2): SQLite WebAssembly in memory, persisted to the browser's private file
// storage (Origin Private File System) after each committed transaction, IndexedDB where that is
// missing (P1.4.1 fallback). Private browsing with no storage still runs; saves then last only
// for the tab.
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { SqlJsDriver, type Platform, type SaveListing, type SqlDriver } from '@gm/app-services';

let sql: Promise<SqlJsStatic> | undefined;
export const sqlJs = () => (sql ??= initSqlJs({ locateFile: () => wasmUrl }));

interface Bytes { get(name: string): Promise<Uint8Array | undefined>; put(name: string, b: Uint8Array): Promise<void>; del(name: string): Promise<void>; list(): Promise<SaveListing[]> }

const EXT = '.gmsave';

async function opfs(): Promise<Bytes | undefined> {
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('saves', { create: true });
    const probe = await dir.getFileHandle('.probe', { create: true });
    if (!('createWritable' in probe)) return undefined;
    return {
      async get(n) { try { const f = await (await dir.getFileHandle(n + EXT)).getFile(); return new Uint8Array(await f.arrayBuffer()); } catch { return undefined; } },
      async put(n, b) { const w = await (await dir.getFileHandle(n + EXT, { create: true })).createWritable(); await w.write(b as unknown as BufferSource); await w.close(); },
      async del(n) { await dir.removeEntry(n + EXT).catch(() => undefined); },
      async list() {
        const out: SaveListing[] = [];
        for await (const [k, h] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
          if (k.endsWith(EXT) && h.kind === 'file') out.push({ name: k.slice(0, -EXT.length), sizeBytes: (await (h as FileSystemFileHandle).getFile()).size });
        }
        return out.sort((a, b) => a.name.localeCompare(b.name));
      },
    };
  } catch { return undefined; }
}

function idb(): Bytes {
  const db = new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open('gridiron-manager', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('saves');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const tx = async <T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>) => {
    const d = await db;
    return new Promise<T>((res, rej) => { const q = f(d.transaction('saves', mode).objectStore('saves')); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  };
  return {
    get: (n) => tx<Uint8Array | undefined>('readonly', (s) => s.get(n) as IDBRequest<Uint8Array | undefined>),
    put: async (n, b) => { await tx('readwrite', (s) => s.put(b, n)); },
    del: async (n) => { await tx('readwrite', (s) => s.delete(n)); },
    list: async () => {
      const keys = (await tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys())) as string[];
      const out: SaveListing[] = [];
      for (const k of keys.sort()) out.push({ name: k, sizeBytes: (await tx<Uint8Array>('readonly', (s) => s.get(k) as IDBRequest<Uint8Array>)).length });
      return out;
    },
  };
}

export class BrowserPlatform implements Platform {
  readonly kind = 'browser' as const;
  private constructor(private readonly bytes: Bytes, readonly storage: 'opfs' | 'indexeddb') {}

  static async create(): Promise<BrowserPlatform> {
    const o = await opfs();
    return o ? new BrowserPlatform(o, 'opfs') : new BrowserPlatform(idb(), 'indexeddb');
  }

  async openSave(name: string, create: boolean): Promise<SqlDriver> {
    const existing = await this.bytes.get(name);
    if (create && existing) throw new Error(`a save named ${name} already exists`);
    if (!create && !existing) throw new Error(`no save named ${name}`);
    return SqlJsDriver.open(await sqlJs(), existing);
  }
  async flushSave(name: string, d: SqlDriver) { if (d.exportBytes) await this.bytes.put(name, await d.exportBytes()); }
  listSaves() { return this.bytes.list(); }
  deleteSave(name: string) { return this.bytes.del(name); }
  async exportSave(name: string) { const b = await this.bytes.get(name); if (!b) throw new Error(`no save named ${name}`); return b; }
  importSave(name: string, b: Uint8Array) { return this.bytes.put(name, b); }
  appVersion() { return `browser (${this.storage})`; }
}
