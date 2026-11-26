// Byte stores behind browser saves (P5.6.1, P2.3.2). The save database lives in memory (sql.js) and
// its file bytes are written here after each committed transaction. Order of preference: the
// browser's private file storage (Origin Private File System), then IndexedDB, then memory only
// (some private modes have neither: play continues with a permanent banner, P5.6.1 edge case).
//
// Each backend is written against the few calls it needs, so tests can drive the real code with a
// small in-memory stand-in for the browser object.

export type BackendKind = 'opfs' | 'indexeddb' | 'memory';

export interface StoredFile { readonly key: string; readonly sizeBytes: number }

export interface BytesBackend {
  readonly kind: BackendKind;
  /** False for memory: data is gone when the tab closes. */
  readonly durable: boolean;
  get(key: string): Promise<Uint8Array | undefined>;
  /** Replaces the file whole. A failed write leaves the previous bytes in place. */
  put(key: string, bytes: Uint8Array): Promise<void>;
  del(key: string): Promise<void>;
  list(): Promise<StoredFile[]>;
}

/** Thrown by put when the browser refuses the write for lack of space. */
export class StorageFullError extends Error {}

/** DOMException name browsers use when storage is full (WHATWG DOM, "QuotaExceededError"). */
export function isQuotaError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'QuotaExceededError';
}

// ---- memory -------------------------------------------------------------------------------------

export function memoryBackend(): BytesBackend {
  const files = new Map<string, Uint8Array>();
  return {
    kind: 'memory',
    durable: false,
    async get(k) { const b = files.get(k); return b ? b.slice() : undefined; },
    async put(k, b) { files.set(k, b.slice()); },
    async del(k) { files.delete(k); },
    async list() { return [...files].map(([key, b]) => ({ key, sizeBytes: b.length })).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)); },
  };
}

// ---- Origin Private File System -----------------------------------------------------------------

export interface OpfsWritableLike { write(data: Uint8Array): Promise<void>; close(): Promise<void>; abort?(reason?: unknown): Promise<void> }
export interface OpfsFileHandleLike { readonly kind: 'file'; getFile(): Promise<{ readonly size: number; arrayBuffer(): Promise<ArrayBuffer> }>; createWritable?(): Promise<OpfsWritableLike> }
export interface OpfsDirectoryLike {
  getFileHandle(name: string, o?: { create?: boolean }): Promise<OpfsFileHandleLike>;
  removeEntry(name: string): Promise<void>;
  entries(): AsyncIterable<[string, { readonly kind: 'file' | 'directory' }]>;
}

/**
 * OPFS backend over one directory. Writes go through createWritable, which writes to a swap file and
 * replaces the real file only on close (File System Standard), so a crash or a full disk mid-write
 * leaves the previous save intact.
 */
export function opfsBackend(dir: OpfsDirectoryLike): BytesBackend {
  return {
    kind: 'opfs',
    durable: true,
    async get(k) {
      let h: OpfsFileHandleLike;
      try { h = await dir.getFileHandle(k); } catch { return undefined; }
      return new Uint8Array(await (await h.getFile()).arrayBuffer());
    },
    async put(k, b) {
      const h = await dir.getFileHandle(k, { create: true });
      if (!h.createWritable) throw new Error('this browser cannot write files to private storage');
      const w = await h.createWritable();
      try {
        await w.write(b);
        await w.close();
      } catch (e) {
        await w.abort?.(e).catch(() => undefined);
        if (isQuotaError(e)) throw new StorageFullError('the browser refused the write: storage is full');
        throw e;
      }
    },
    async del(k) { await dir.removeEntry(k).catch(() => undefined); },
    async list() {
      const out: StoredFile[] = [];
      for await (const [key, h] of dir.entries()) {
        if (h.kind !== 'file') continue;
        out.push({ key, sizeBytes: (await (await dir.getFileHandle(key)).getFile()).size });
      }
      return out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    },
  };
}

// ---- IndexedDB ----------------------------------------------------------------------------------

/** Database and object store names. Separate from the phase 0 shell's database so both can coexist. */
export const IDB_NAME = 'gm-store';
export const IDB_STORE = 'files';

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}

export async function openIndexedDb(factory: IDBFactory): Promise<IDBDatabase> {
  const r = factory.open(IDB_NAME, 1);
  r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(IDB_STORE)) r.result.createObjectStore(IDB_STORE); };
  return req(r);
}

export function indexedDbBackend(db: IDBDatabase): BytesBackend {
  const run = <T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const tx = db.transaction(IDB_STORE, mode);
    const done = new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onabort = () => rej(tx.error); tx.onerror = () => rej(tx.error); });
    return Promise.all([req(f(tx.objectStore(IDB_STORE))), done]).then(([v]) => v);
  };
  return {
    kind: 'indexeddb',
    durable: true,
    async get(k) {
      const v = await run<unknown>('readonly', (s) => s.get(k));
      return v instanceof Uint8Array ? v : v instanceof ArrayBuffer ? new Uint8Array(v) : undefined;
    },
    async put(k, b) {
      // One transaction: the write lands whole or not at all.
      try { await run('readwrite', (s) => s.put(b.slice(), k)); } catch (e) {
        if (isQuotaError(e)) throw new StorageFullError('the browser refused the write: storage is full');
        throw e;
      }
    },
    async del(k) { await run('readwrite', (s) => s.delete(k)); },
    async list() {
      const keys = (await run<IDBValidKey[]>('readonly', (s) => s.getAllKeys())).map(String).sort();
      const out: StoredFile[] = [];
      for (const key of keys) {
        const v = await run<unknown>('readonly', (s) => s.get(key));
        const size = v instanceof Uint8Array ? v.length : v instanceof ArrayBuffer ? v.byteLength : 0;
        out.push({ key, sizeBytes: size });
      }
      return out;
    },
  };
}

// ---- choosing a backend -------------------------------------------------------------------------

/** The parts of the browser global this module touches. Tests pass stand-ins. */
export interface BrowserEnv {
  readonly navigator?: { readonly storage?: { getDirectory?(): Promise<unknown> } };
  readonly indexedDB?: IDBFactory;
}

/** Folder inside the private file storage that holds career files. */
export const OPFS_DIR = 'saves';

async function tryOpfs(env: BrowserEnv): Promise<BytesBackend | undefined> {
  try {
    const getDirectory = env.navigator?.storage?.getDirectory;
    if (!getDirectory) return undefined;
    const root = (await getDirectory.call(env.navigator!.storage)) as OpfsDirectoryLike & { getDirectoryHandle(n: string, o?: { create?: boolean }): Promise<OpfsDirectoryLike> };
    const dir = await root.getDirectoryHandle(OPFS_DIR, { create: true });
    // Some browsers offer OPFS without createWritable on the main thread; fall through to IndexedDB then.
    const probeName = '.probe';
    const probe = await dir.getFileHandle(probeName, { create: true });
    const ok = typeof probe.createWritable === 'function';
    await dir.removeEntry(probeName).catch(() => undefined);
    return ok ? opfsBackend(dir) : undefined;
  } catch { return undefined; }
}

async function tryIdb(env: BrowserEnv): Promise<BytesBackend | undefined> {
  try {
    if (!env.indexedDB) return undefined;
    return indexedDbBackend(await openIndexedDb(env.indexedDB));
  } catch { return undefined; }
}

/** Picks the best available backend: OPFS, then IndexedDB, then memory. */
export async function openBrowserBackend(env: BrowserEnv = globalThis as unknown as BrowserEnv): Promise<BytesBackend> {
  return (await tryOpfs(env)) ?? (await tryIdb(env)) ?? memoryBackend();
}
