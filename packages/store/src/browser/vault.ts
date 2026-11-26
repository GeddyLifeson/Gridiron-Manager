// Browser save vault (P5.6.1). Keeps career files in browser storage and owns everything the user
// must be told about it: the first-save notice, the request for persistent storage, the quota stop
// before a write that would not fit, the export reminder at each season boundary, and the banner
// when the browser offers no storage at all.
//
// The vault is an app-side module: the clock and the browser storage manager are passed in, so tests
// drive it with fixed values and the same code runs in the browser.
import type { SqlJsStatic } from 'sql.js';
import type { SaveHeader } from '@gm/schema';
import { SAVE_FILE_EXTENSION } from '../save-store.ts';
import { readSaveFileHeader, saveFileName } from '../export/save-file.ts';
import { StorageFullError, type BackendKind, type BytesBackend } from './backends.ts';
import { MS_PER_DAY, QUOTA_STOP_RATIO, QUOTA_WARN_RATIO } from './params.ts';

/** The parts of `navigator.storage` (WHATWG Storage Standard) the vault uses. All optional. */
export interface StorageManagerLike {
  estimate?(): Promise<{ quota?: number; usage?: number }>;
  persist?(): Promise<boolean>;
  persisted?(): Promise<boolean>;
}

export type BannerKind = 'storage_unavailable';

export interface VaultStatus {
  readonly backend: BackendKind;
  /** Null when the browser cannot say. */
  readonly persisted: boolean | null;
  readonly quotaBytes: number | null;
  readonly usageBytes: number | null;
  /** Permanent banner (P5.6.1 edge case): no storage, saves last only for this tab. */
  readonly banner: BannerKind | null;
}

/** P5.6.1 first-save notice. The screen package words it; these are the facts and the two actions. */
export interface FirstSaveNotice {
  readonly kind: 'first_save';
  /** The browser may delete saved careers when storage is low or site data is cleared. */
  readonly mayBeEvicted: true;
  readonly persisted: boolean | null;
  readonly actions: readonly ('request_persistent_storage' | 'download_career_file')[];
}

/** P5.6.1 reminder at each season boundary. */
export interface ExportReminder {
  readonly kind: 'season_export_reminder';
  readonly saveName: string;
  /** Whole days since the last export of this career; null when it was never exported. */
  readonly daysSinceLastExport: number | null;
  readonly persisted: boolean | null;
}

export interface QuotaWarning { readonly kind: 'quota_near'; readonly usageAfterBytes: number; readonly quotaBytes: number }

export type WriteResult =
  | { readonly ok: true; readonly warning: QuotaWarning | null }
  /** P5.6.1: the write was not made; the game stops and offers export or thinning. */
  | { readonly ok: false; readonly reason: 'quota_exceeded'; readonly neededBytes: number; readonly availableBytes: number | null; readonly offers: readonly ('export' | 'thin')[] };

export class VaultError extends Error {}

interface Meta { v: 1; firstSaveNoticeSeen: boolean; persistRequested: boolean; lastExportMs: Record<string, number> }

const META_KEY = 'vault-meta.json';
const emptyMeta = (): Meta => ({ v: 1, firstSaveNoticeSeen: false, persistRequested: false, lastExportMs: {} });
const OFFERS = ['export', 'thin'] as const;

/** Names become file names, so they keep to characters every file system accepts. */
export function isValidSaveName(name: string): boolean {
  return /^[^\\/:*?"<>|\u0000-\u001f]{1,120}$/.test(name) && !/^[.\s]|[.\s]$/.test(name);
}

const fileKey = (name: string) => {
  if (!isValidSaveName(name)) throw new VaultError(`"${name}" cannot be used as a career name`);
  return name + SAVE_FILE_EXTENSION;
};

export interface VaultOptions {
  readonly backend: BytesBackend;
  /** `navigator.storage`, or nothing where the browser has no storage manager. */
  readonly storage?: StorageManagerLike;
  /** Wall clock in milliseconds since the epoch. Only used for "days since the last export". */
  readonly now: () => number;
}

export class BrowserSaveVault {
  private constructor(private readonly backend: BytesBackend, private readonly storage: StorageManagerLike | undefined, private readonly now: () => number, private meta: Meta) {}

  static async open(o: VaultOptions): Promise<BrowserSaveVault> {
    let meta = emptyMeta();
    const raw = await o.backend.get(META_KEY).catch(() => undefined);
    if (raw) {
      try {
        const m = JSON.parse(new TextDecoder().decode(raw)) as Partial<Meta>;
        if (m.v === 1) meta = { ...emptyMeta(), ...m, lastExportMs: { ...(m.lastExportMs ?? {}) } };
      } catch { /* a damaged meta file only resets notices; saves are untouched */ }
    }
    return new BrowserSaveVault(o.backend, o.storage, o.now, meta);
  }

  get backendKind(): BackendKind { return this.backend.kind; }

  private async writeMeta(): Promise<void> {
    // Small and rewritten whole; a refused write here never blocks play.
    await this.backend.put(META_KEY, new TextEncoder().encode(JSON.stringify(this.meta))).catch(() => undefined);
  }

  private async persisted(): Promise<boolean | null> {
    if (!this.backend.durable) return false;
    try { return this.storage?.persisted ? await this.storage.persisted() : null; } catch { return null; }
  }

  private async estimate(): Promise<{ quota: number | null; usage: number | null }> {
    try {
      const e = this.storage?.estimate ? await this.storage.estimate() : undefined;
      const quota = typeof e?.quota === 'number' && Number.isFinite(e.quota) ? e.quota : null;
      const usage = typeof e?.usage === 'number' && Number.isFinite(e.usage) ? e.usage : null;
      return { quota, usage };
    } catch { return { quota: null, usage: null }; }
  }

  async status(): Promise<VaultStatus> {
    const { quota, usage } = this.backend.durable ? await this.estimate() : { quota: null, usage: null };
    return { backend: this.backend.kind, persisted: await this.persisted(), quotaBytes: quota, usageBytes: usage, banner: this.backend.durable ? null : 'storage_unavailable' };
  }

  /** The P5.6.1 notice, until the user has seen it once. Never shown for memory-only play (the banner covers it). */
  async firstSaveNotice(): Promise<FirstSaveNotice | null> {
    if (this.meta.firstSaveNoticeSeen || !this.backend.durable) return null;
    const persisted = await this.persisted();
    return {
      kind: 'first_save', mayBeEvicted: true, persisted,
      actions: persisted ? ['download_career_file'] : ['request_persistent_storage', 'download_career_file'],
    };
  }

  async acknowledgeFirstSaveNotice(): Promise<void> {
    this.meta.firstSaveNoticeSeen = true;
    await this.writeMeta();
  }

  /** Asks the browser to keep this site's data (navigator.storage.persist). Returns whether it agreed. */
  async requestPersistentStorage(): Promise<boolean> {
    this.meta.persistRequested = true;
    await this.writeMeta();
    if (!this.backend.durable || !this.storage?.persist) return false;
    try { return await this.storage.persist(); } catch { return false; }
  }

  async list(): Promise<{ name: string; sizeBytes: number }[]> {
    return (await this.backend.list())
      .filter((f) => f.key.endsWith(SAVE_FILE_EXTENSION))
      .map((f) => ({ name: f.key.slice(0, -SAVE_FILE_EXTENSION.length), sizeBytes: f.sizeBytes }));
  }

  load(name: string): Promise<Uint8Array | undefined> { return this.backend.get(fileKey(name)); }

  async remove(name: string): Promise<void> {
    await this.backend.del(fileKey(name));
    delete this.meta.lastExportMs[name];
    await this.writeMeta();
  }

  /**
   * Checks a write against the reported quota without making it. A write that would pass the quota
   * is refused (P5.6.1); one that would pass the warning share goes ahead with a warning.
   */
  async checkWrite(name: string, sizeBytes: number): Promise<WriteResult> {
    if (!this.backend.durable) return { ok: true, warning: null };
    const { quota, usage } = await this.estimate();
    if (quota === null || usage === null) return { ok: true, warning: null };
    const existing = (await this.backend.list()).find((f) => f.key === fileKey(name))?.sizeBytes ?? 0;
    const after = usage - existing + sizeBytes;
    if (after > quota * QUOTA_STOP_RATIO) {
      return { ok: false, reason: 'quota_exceeded', neededBytes: after - quota * QUOTA_STOP_RATIO, availableBytes: Math.max(0, quota - usage), offers: OFFERS };
    }
    return { ok: true, warning: after > quota * QUOTA_WARN_RATIO ? { kind: 'quota_near', usageAfterBytes: after, quotaBytes: quota } : null };
  }

  /**
   * Writes a career file. Checks the quota first and makes no write that would not fit. If the
   * browser still refuses (its estimate was stale), the previous file stays and the same stop result
   * comes back.
   */
  async save(name: string, bytes: Uint8Array): Promise<WriteResult> {
    const check = await this.checkWrite(name, bytes.length);
    if (!check.ok) return check;
    try {
      await this.backend.put(fileKey(name), bytes);
    } catch (e) {
      if (e instanceof StorageFullError) {
        const { quota, usage } = await this.estimate();
        return { ok: false, reason: 'quota_exceeded', neededBytes: bytes.length, availableBytes: quota !== null && usage !== null ? Math.max(0, quota - usage) : null, offers: OFFERS };
      }
      throw e;
    }
    return check;
  }

  /** Bytes and a file name for "download the career file". Records the export for the reminder. */
  async exportCareer(name: string): Promise<{ fileName: string; bytes: Uint8Array }> {
    const bytes = await this.load(name);
    if (!bytes) throw new VaultError(`no career named ${name}`);
    this.meta.lastExportMs[name] = this.now();
    await this.writeMeta();
    return { fileName: saveFileName(name), bytes };
  }

  /**
   * Imports a career file made by the browser or the desktop build (same format). The header is read
   * and checked before anything is stored; an existing career of the same name is never overwritten.
   */
  async importCareer(SQL: SqlJsStatic, name: string, bytes: Uint8Array): Promise<{ header: SaveHeader; result: WriteResult }> {
    const header = await readSaveFileHeader(SQL, bytes);
    if ((await this.list()).some((s) => s.name === name)) throw new VaultError(`a career named ${name} already exists`);
    return { header, result: await this.save(name, bytes) };
  }

  /** The reminder shown at each season boundary (P5.6.1): days since this career was last exported. */
  async seasonBoundaryReminder(name: string): Promise<ExportReminder> {
    const last = this.meta.lastExportMs[name];
    const days = last === undefined ? null : Math.max(0, Math.floor((this.now() - last) / MS_PER_DAY));
    return { kind: 'season_export_reminder', saveName: name, daysSinceLastExport: days, persisted: await this.persisted() };
  }
}
