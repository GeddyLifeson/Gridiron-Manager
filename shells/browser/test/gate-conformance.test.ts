// The shell gate's save conformance (Q1.3.1) on a Node stand-in platform: the recorded constants come
// out when storage keeps the file, and the gate fails when storage loses writes.
import { describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';
import { SqlJsDriver, type Platform, type SqlDriver } from '@gm/app-services';
import { save } from '@gm/store';
import { runGateConformance } from '../src/gate-conformance.ts';

function memoryPlatform(o: { dropWrites?: boolean } = {}): Platform & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  const sql = initSqlJs();
  return {
    kind: 'browser', files,
    async openSave(name: string, create: boolean): Promise<SqlDriver> {
      const b = files.get(name);
      if (create && b) throw new Error('exists');
      if (!create && !b) throw new Error('missing');
      if (create) files.set(name, new Uint8Array());
      return SqlJsDriver.open(await sql, b && b.length ? b : undefined);
    },
    async flushSave(name: string, d: SqlDriver) { if (!o.dropWrites) files.set(name, await d.exportBytes!()); },
    async listSaves() { return [...files].map(([name, b]) => ({ name, sizeBytes: b.length })); },
    async deleteSave(name: string) { files.delete(name); },
    async exportSave(name: string) { return files.get(name)!; },
    async importSave(name: string, b: Uint8Array) { files.set(name, b); },
    appVersion: () => 'test',
  };
}

describe('gate save conformance (Q1.3.1)', () => {
  it('gives the recorded constants through the platform storage and leaves no save behind', async () => {
    const p = memoryPlatform();
    const r = await runGateConformance(p);
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.got).toEqual({ ...save.CONFORMANCE_EXPECTED });
    expect(r.replays).toBeGreaterThan(15);
    expect(p.files.size).toBe(0);
  });

  it('fails when the storage loses what was written', async () => {
    const r = await runGateConformance(memoryPlatform({ dropWrites: true }));
    expect(r.ok).toBe(false);
    expect(r.problems.length).toBeGreaterThan(0);
  });
});
