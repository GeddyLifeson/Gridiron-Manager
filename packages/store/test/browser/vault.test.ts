import { describe, expect, it } from 'vitest';
import { stateHash } from '@gm/engine-core';
import {
  BrowserSaveVault, opfsBackend, memoryBackend, openBrowserBackend, isValidSaveName, VaultError,
  QUOTA_WARN_RATIO, BROWSER_DEFAULT_RETENTION_PROFILE, PARAMS, MS_PER_DAY,
  type OpfsDirectoryLike, type OpfsFileHandleLike, type StorageManagerLike,
} from '../../src/browser/index.ts';
import { SaveStore, SqlJsDriver, SaveFormatError } from '../../src/index.ts';
import { SQL, playedCareer } from '../export/fixtures.ts';

/**
 * In-memory stand-in for an OPFS directory with the File System Standard's write semantics: a
 * writable stream writes to a swap buffer and replaces the file only on close. `failNextClose` makes
 * the next close throw QuotaExceededError, as a browser does when its estimate was stale.
 */
class FakeDir implements OpfsDirectoryLike {
  files = new Map<string, Uint8Array>();
  failNextClose = false;
  noWritable = false;
  async getFileHandle(name: string, o?: { create?: boolean }): Promise<OpfsFileHandleLike> {
    if (!this.files.has(name)) {
      if (!o?.create) throw Object.assign(new Error('not found'), { name: 'NotFoundError' });
      this.files.set(name, new Uint8Array());
    }
    const handle: OpfsFileHandleLike = {
      kind: 'file',
      getFile: async () => { const b = this.files.get(name)!; return { size: b.length, arrayBuffer: async () => b.slice().buffer } as never; },
    };
    if (!this.noWritable) {
      (handle as { createWritable?: unknown }).createWritable = async () => {
        let swap = new Uint8Array();
        return {
          write: async (d: Uint8Array) => { swap = d.slice(); },
          close: async () => {
            if (this.failNextClose) { this.failNextClose = false; throw Object.assign(new Error('full'), { name: 'QuotaExceededError' }); }
            this.files.set(name, swap);
          },
          abort: async () => undefined,
        };
      };
    }
    return handle;
  }
  async removeEntry(name: string) { if (!this.files.delete(name)) throw new Error('not found'); }
  async *entries(): AsyncIterable<[string, { kind: 'file' }]> { for (const k of [...this.files.keys()]) yield [k, { kind: 'file' }]; }
}

class FakeStorage implements StorageManagerLike {
  constructor(public quota: number | undefined, public usage: number | undefined, public isPersisted = false, public grant = true) {}
  persistCalls = 0;
  async estimate() { return { quota: this.quota, usage: this.usage }; }
  async persist() { this.persistCalls++; if (this.grant) this.isPersisted = true; return this.grant; }
  async persisted() { return this.isPersisted; }
}

const bytes = (n: number, fill = 7) => new Uint8Array(n).fill(fill);
let clock = 1_800_000_000_000;
const now = () => clock;

describe('browser save vault (P5.6.1)', () => {
  it('a career saved in the browser survives a reload with the same state hash', async () => {
    const c = await playedCareer(8);
    const file = await c.driver.exportBytes();
    const dir = new FakeDir();
    const v1 = await BrowserSaveVault.open({ backend: opfsBackend(dir), storage: new FakeStorage(1e9, 1e6), now });
    expect((await v1.save('Career 1', file)).ok).toBe(true);
    // Reload: a fresh backend and vault over the same browser storage.
    const v2 = await BrowserSaveVault.open({ backend: opfsBackend(dir), storage: new FakeStorage(1e9, 1e6), now });
    expect(await v2.list()).toEqual([{ name: 'Career 1', sizeBytes: file.length }]);
    const back = await v2.load('Career 1');
    const store = await SaveStore.open(SqlJsDriver.open(await SQL(), back));
    expect(stateHash(await store.world())).toBe(stateHash(c.world));
    expect((await store.commandLog()).length).toBe(c.lastSeq());
  });

  it('stops before a write that would exceed the reported quota and offers export or thinning', async () => {
    const dir = new FakeDir();
    const storage = new FakeStorage(1000, 300);
    const v = await BrowserSaveVault.open({ backend: opfsBackend(dir), storage, now });
    expect(await v.save('s', bytes(200, 1))).toEqual({ ok: true, warning: null });
    storage.usage = 900; // other data filled the quota
    const r = await v.save('s', bytes(400, 2)); // 900 - 200 + 400 = 1100 > 1000
    expect(r).toEqual({ ok: false, reason: 'quota_exceeded', neededBytes: 100, availableBytes: 100, offers: ['export', 'thin'] });
    expect(await v.load('s')).toEqual(bytes(200, 1)); // nothing was written
  });

  it('warns when a write passes the warning share of the quota', async () => {
    const storage = new FakeStorage(1000, 700);
    const v = await BrowserSaveVault.open({ backend: opfsBackend(new FakeDir()), storage, now });
    const r = await v.save('s', bytes(150));
    expect(r).toEqual({ ok: true, warning: { kind: 'quota_near', usageAfterBytes: 850, quotaBytes: 1000 } });
    expect(850 > 1000 * QUOTA_WARN_RATIO).toBe(true);
  });

  it('when the browser refuses a write its estimate allowed, the previous file stays and the stop result comes back', async () => {
    const dir = new FakeDir();
    const v = await BrowserSaveVault.open({ backend: opfsBackend(dir), storage: new FakeStorage(1e6, 10), now });
    await v.save('s', bytes(50, 1));
    dir.failNextClose = true;
    const r = await v.save('s', bytes(60, 2));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe('quota_exceeded');
    expect(await v.load('s')).toEqual(bytes(50, 1));
  });

  it('writes go ahead when the browser reports no estimate', async () => {
    const v = await BrowserSaveVault.open({ backend: opfsBackend(new FakeDir()), storage: new FakeStorage(undefined, undefined), now });
    expect(await v.save('s', bytes(10))).toEqual({ ok: true, warning: null });
  });

  it('shows the first-save notice once, with the persistent-storage and download actions', async () => {
    const dir = new FakeDir();
    const storage = new FakeStorage(1e9, 0);
    const v = await BrowserSaveVault.open({ backend: opfsBackend(dir), storage, now });
    expect(await v.firstSaveNotice()).toEqual({ kind: 'first_save', mayBeEvicted: true, persisted: false, actions: ['request_persistent_storage', 'download_career_file'] });
    expect(await v.requestPersistentStorage()).toBe(true);
    expect(storage.persistCalls).toBe(1);
    expect((await v.firstSaveNotice())?.actions).toEqual(['download_career_file']);
    await v.acknowledgeFirstSaveNotice();
    expect(await v.firstSaveNotice()).toBeNull();
    // Still seen after a reload.
    const again = await BrowserSaveVault.open({ backend: opfsBackend(dir), storage, now });
    expect(await again.firstSaveNotice()).toBeNull();
    expect((await again.status()).persisted).toBe(true);
  });

  it('reminds at each season boundary with the days since the last export', async () => {
    const dir = new FakeDir();
    const v = await BrowserSaveVault.open({ backend: opfsBackend(dir), storage: new FakeStorage(1e9, 0), now });
    await v.save('s', bytes(10));
    expect((await v.seasonBoundaryReminder('s')).daysSinceLastExport).toBeNull();
    const ex = await v.exportCareer('s');
    expect(ex.fileName).toBe('s.gmsave');
    expect(ex.bytes).toEqual(bytes(10));
    clock += 3 * MS_PER_DAY + 5_000;
    const again = await BrowserSaveVault.open({ backend: opfsBackend(dir), storage: new FakeStorage(1e9, 0), now });
    expect(await again.seasonBoundaryReminder('s')).toEqual({ kind: 'season_export_reminder', saveName: 's', daysSinceLastExport: 3, persisted: false });
    // The vault's own metadata file never shows up as a career.
    expect((await again.list()).map((s) => s.name)).toEqual(['s']);
  });

  it('with no storage at all, play continues in memory with a permanent banner (edge case)', async () => {
    const v = await BrowserSaveVault.open({ backend: memoryBackend(), now });
    expect(await v.status()).toEqual({ backend: 'memory', persisted: false, quotaBytes: null, usageBytes: null, banner: 'storage_unavailable' });
    expect(await v.firstSaveNotice()).toBeNull();
    expect((await v.save('s', bytes(5))).ok).toBe(true);
    expect((await v.exportCareer('s')).bytes).toEqual(bytes(5)); // the download button still works
    expect(await v.requestPersistentStorage()).toBe(false);
  });

  it('imports a career file made outside the browser (same format), refusing junk and name clashes', async () => {
    const c = await playedCareer(3);
    const file = await c.driver.exportBytes();
    const v = await BrowserSaveVault.open({ backend: opfsBackend(new FakeDir()), storage: new FakeStorage(1e9, 0), now });
    const { header, result } = await v.importCareer(await SQL(), 'Imported', file);
    expect(header.summary).toBe('Test career');
    expect(result.ok).toBe(true);
    expect(await v.load('Imported')).toEqual(file);
    await expect(v.importCareer(await SQL(), 'Imported', file)).rejects.toThrow(VaultError);
    await expect(v.importCareer(await SQL(), 'Junk', new TextEncoder().encode('not a save'))).rejects.toThrow(SaveFormatError);
    expect((await v.list()).map((s) => s.name)).toEqual(['Imported']);
  });

  it('rejects career names that cannot be file names', async () => {
    expect(isValidSaveName('Career 1')).toBe(true);
    for (const bad of ['', 'a/b', 'a\\b', '.hidden', 'trail.', ' lead', 'x'.repeat(121)]) expect(isValidSaveName(bad)).toBe(false);
    const v = await BrowserSaveVault.open({ backend: memoryBackend(), now });
    await expect(v.save('a/b', bytes(1))).rejects.toThrow(VaultError);
  });

  it('removing a career deletes its file', async () => {
    const v = await BrowserSaveVault.open({ backend: opfsBackend(new FakeDir()), storage: new FakeStorage(1e9, 0), now });
    await v.save('a', bytes(3));
    await v.save('b', bytes(3));
    await v.remove('a');
    expect((await v.list()).map((s) => s.name)).toEqual(['b']);
  });
});

describe('choosing the browser backend (P2.3.2, P5.6.1)', () => {
  it('uses private file storage when the browser offers it with writable files', async () => {
    const root = new FakeDir();
    const sub = new FakeDir();
    const env = { navigator: { storage: { getDirectory: async () => Object.assign(root, { getDirectoryHandle: async () => sub }) } } };
    const b = await openBrowserBackend(env);
    expect(b.kind).toBe('opfs');
    expect(sub.files.size).toBe(0); // the probe file is removed again
  });
  it('falls back to memory when there is neither writable private storage nor IndexedDB', async () => {
    const sub = Object.assign(new FakeDir(), { noWritable: true });
    const env = { navigator: { storage: { getDirectory: async () => Object.assign(new FakeDir(), { getDirectoryHandle: async () => sub }) } } };
    expect((await openBrowserBackend(env)).kind).toBe('memory');
    expect((await openBrowserBackend({})).kind).toBe('memory');
    expect((await openBrowserBackend({ navigator: { storage: { getDirectory: async () => { throw new Error('SecurityError'); } } } })).kind).toBe('memory');
  });
});

describe('browser parameters', () => {
  it('defaults the browser build to the compact retention profile (P5.6.1)', () => {
    expect(BROWSER_DEFAULT_RETENTION_PROFILE).toBe('compact');
  });
  it('every tuning constant is a row with a basis and leaf', () => {
    for (const p of PARAMS.params) {
      expect(['bible', 'assumption']).toContain(p.basis);
      expect(p.leaf).toBe('P5.6.1');
      expect(p.value).toBeGreaterThanOrEqual(p.min);
      expect(p.value).toBeLessThanOrEqual(p.max);
    }
  });
});
