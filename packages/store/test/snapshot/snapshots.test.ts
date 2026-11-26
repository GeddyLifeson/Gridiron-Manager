import { describe, expect, it } from 'vitest';
import { CHAIN_GENESIS, bytesHash, chainNext } from '@gm/engine-core';
import { ParamFile } from '@gm/schema';
import { CHAIN_DDL, chainAppend, readChain, verifyChainLinks } from '../../src/snapshot/chain.ts';
import { RAW_CODEC, codecById, defaultCodec, deflateCodec } from '../../src/snapshot/codec.ts';
import { PARAMS, retentionFor } from '../../src/snapshot/params.ts';
import { SNAPSHOT_DDL, SnapshotError, listSnapshots, pruneStatements, readSnapshot, snapshotInsert } from '../../src/snapshot/snapshots.ts';
import { memoryDb } from '../save/helpers.ts';

const fns = { chainNext, genesis: CHAIN_GENESIS };

describe('blob codecs', () => {
  it('round-trips bytes, and compresses repetitive state', async () => {
    const deflate = deflateCodec();
    expect(deflate).not.toBeNull();
    const raw = new TextEncoder().encode(JSON.stringify(Array.from({ length: 2000 }, (_, i) => ({ id: i, name: 'Player', rating: 50.25 }))));
    const packed = await deflate!.encode(raw);
    expect(packed.length).toBeLessThan(raw.length / 4);
    expect(await codecById(deflate!.id).decode(packed)).toEqual(raw);
    expect(await RAW_CODEC.decode(await RAW_CODEC.encode(raw))).toEqual(raw);
    expect(await deflate!.decode(await deflate!.encode(new Uint8Array(0)))).toEqual(new Uint8Array(0));
    expect(defaultCodec().id).toBe('deflate-raw');
  });
  it('reports damaged compressed bytes and unknown codecs', async () => {
    await expect(deflateCodec()!.decode(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).rejects.toThrow(/does not decode/);
    expect(() => codecById('zstd')).toThrow(/unknown blob codec/);
  });
});

describe('snapshots', () => {
  const snap = (kind: 'week' | 'season' | 'creation', logSeq: number, state: unknown) =>
    snapshotInsert({ kind, logSeq, seasonYear: 2026, stateHash: `s${logSeq}`, digest: `d${logSeq}`, state, headerJson: '{}' }, defaultCodec(), bytesHash);

  it('stores state so it reads back with the same value and key order', async () => {
    const d = await memoryDb();
    await d.exec(SNAPSHOT_DDL);
    const state = { z: 1, a: { '10': 'x', b: [0.1 + 0.2, -1e-7, 2 ** 53] }, people: [{ id: 2 }, { id: 1 }] };
    await d.transaction([await snap('week', 7, state)]);
    const meta = (await listSnapshots(d))[0]!;
    expect(meta).toMatchObject({ kind: 'week', logSeq: 7, stateHash: 's7', digest: 'd7', codec: 'deflate-raw' });
    const back = await readSnapshot(d, meta.id, bytesHash);
    expect(JSON.stringify(back.state)).toBe(JSON.stringify(state));
    expect(back.headerJson).toBe('{}');
  });

  it('detects a changed blob before decoding it', async () => {
    const d = await memoryDb();
    await d.exec(SNAPSHOT_DDL);
    await d.transaction([await snap('week', 1, { a: 1 })]);
    await d.exec("UPDATE snapshots SET blob = x'0001'");
    await expect(readSnapshot(d, 1, bytesHash)).rejects.toThrow(SnapshotError);
    await expect(readSnapshot(d, 1, bytesHash)).rejects.toThrow(/stored bytes changed/);
    await expect(readSnapshot(d, 99, bytesHash)).rejects.toThrow(/no snapshot 99/);
  });

  it('prunes by kind and never touches the creation snapshot', async () => {
    const d = await memoryDb();
    await d.exec(SNAPSHOT_DDL);
    await d.transaction([await snap('creation', 0, {})]);
    for (let i = 1; i <= 6; i++) await d.transaction([await snap('week', i, {}), await snap('season', i + 100, {}), ...pruneStatements({ week: 3, season: 2 })]);
    const kept = (await listSnapshots(d)).map((s) => `${s.kind}:${s.logSeq}`);
    expect(kept).toEqual(['creation:0', 'week:4', 'week:5', 'week:6', 'season:105', 'season:106']);
    for (let i = 7; i <= 9; i++) await d.transaction([await snap('season', i + 100, {}), ...pruneStatements({ week: 3, season: null })]);
    expect((await listSnapshots(d)).filter((s) => s.kind === 'season').length).toBe(5);
  });

  it('retention follows the profile, and the numbers are declared with their basis', () => {
    expect(retentionFor('standard')).toEqual({ week: 3, season: 3 });
    expect(retentionFor('full')).toEqual({ week: 3, season: null });
    expect(retentionFor('compact')).toEqual({ week: 3, season: 1 });
    expect(retentionFor('a later profile')).toEqual({ week: 3, season: 3 });
    const file = ParamFile.parse(PARAMS);
    expect(file.params.map((p) => [p.name, p.value, p.basis, p.leaf])).toEqual([
      ['store.snapshot.keepWeek', 3, 'bible', 'P5.3.1'],
      ['store.snapshot.keepSeasonStandard', 3, 'bible', 'P5.3.1'],
      ['store.snapshot.keepSeasonCompact', 1, 'assumption', 'P5.4.1'],
    ]);
  });
});

describe('hash chain (P5.3.2)', () => {
  it('chain[n] = H(chain[n-1], stateHash, logSequence, engineVersion, parameterSetVersion), and any edit breaks it', async () => {
    const d = await memoryDb();
    await d.exec(CHAIN_DDL);
    let prev = CHAIN_GENESIS;
    for (let i = 0; i < 5; i++) {
      const a = chainAppend(fns, { prev, stateHash: `state${i}`, logSeq: i * 10, engineVersion: 'e1', parameterSetVersion: i < 3 ? 'p1' : 'p2', kind: 'week' });
      expect(a.head).toBe(chainNext({ prev, stateHash: `state${i}`, logSequence: i * 10, engineVersion: 'e1', parameterSetVersion: i < 3 ? 'p1' : 'p2' }));
      await d.transaction([a.statement]);
      prev = a.head;
    }
    const rows = await readChain(d);
    expect(rows.map((r) => r.n)).toEqual([1, 2, 3, 4, 5]);
    expect(verifyChainLinks(fns, rows)).toEqual({ problems: [], head: prev });
    const edits: ((r: typeof rows) => void)[] = [
      (r) => { r[2]!.stateHash = 'other'; },
      (r) => { r[1]!.logSeq = 11; },
      (r) => { r[3]!.parameterSetVersion = 'p1'; },
      (r) => { r[0]!.engineVersion = 'e2'; },
      (r) => { r[2]!.head = 'ffffffffffffffff'; },
      (r) => { r.splice(1, 1); },
      // A row rewritten so that it matches its own contents still fails to carry the rows after it.
      (r) => { const x = r[2]!; x.stateHash = 'forged'; x.head = chainNext({ prev: x.prev, stateHash: x.stateHash, logSequence: x.logSeq, engineVersion: x.engineVersion, parameterSetVersion: x.parameterSetVersion }); },
      (r) => { [r[1], r[2]] = [r[2]!, r[1]!]; },
    ];
    for (const edit of edits) {
      const copy = rows.map((r) => ({ ...r }));
      edit(copy);
      expect(verifyChainLinks(fns, copy).problems.length).toBeGreaterThan(0);
    }
    // Dropping the newest row leaves a valid, shorter chain: the header's head is what catches that.
    expect(verifyChainLinks(fns, rows.slice(0, 4)).head).not.toBe(prev);
  });
});
