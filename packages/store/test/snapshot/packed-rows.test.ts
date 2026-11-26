// Packed tables (save format 3): play rows stored as one compressed blob per game. What must hold:
// lossless round trips to the character, the same digest and state hash as plain storage, writes
// limited to the groups that changed, a fallback to plain rows when a table cannot be packed, and
// damage found on read.
import { describe, expect, it } from 'vitest';
import { bytesHash, stateHash } from '@gm/engine-core';
import { runSeasonArchive } from '../../src/retention/archive.ts';
import { measureSave } from '../../src/retention/size.ts';
import { SaveFile } from '../../src/save/save-file.ts';
import { RAW_CODEC, defaultCodec } from '../../src/snapshot/codec.ts';
import { DEFAULT_PACKED_TABLES, PackedRowsError, packPayload, unpackPayload } from '../../src/snapshot/packed-rows.ts';
import { StateTracker, encodeStateWrites, readStateRows, stateDigest, type StateWrite } from '../../src/snapshot/state-tables.ts';
import { STEP_2_TO_3 } from '../../src/migrations/steps.ts';
import { memoryDb } from '../save/helpers.ts';
import { VERSIONS, closeCmd, cmd, leagueDeps, leagueSave, type LeagueWorld } from '../retention/world.ts';

const PACK = [{ table: 'plays', groupBy: 'gameId' }];
const play = (gameId: number, index: number, extra: Record<string, unknown> = {}) => ({ gameId, index, yards: (gameId * 7 + index) % 13, text: `g${gameId}p${index} é—\u{1F3C8}`, ...extra });
const world = (games: number[], perGame = 3) => ({ name: 'w', plays: games.flatMap((g) => Array.from({ length: perGame }, (_, i) => play(g, i))) });
const ops = (writes: readonly StateWrite[]) => writes.map((w) => w.op);

async function writeAndRead(state: unknown, packing = PACK) {
  const d = await memoryDb();
  const { STATE_TABLES_DDL, replaceStateStatements } = await import('../../src/snapshot/state-tables.ts');
  await d.exec(STATE_TABLES_DDL);
  const r = await replaceStateStatements(bytesHash, state, defaultCodec(), packing);
  await d.transaction(r.statements);
  const read = await readStateRows((sql) => d.all(sql), bytesHash);
  return { d, r, read, loaded: StateTracker.load(bytesHash, read.fields, read.rows, read.packed, packing) };
}

describe('payload', () => {
  it('splits back into exactly the texts it was made from, including empty and non-ASCII rows', () => {
    const rows = ['{"a":1}', '', '"—\n\u{1F3C8}"', '[]'];
    expect(unpackPayload(packPayload(rows))).toEqual(rows);
    expect(unpackPayload(packPayload([]))).toEqual([]);
  });
  it('refuses a payload whose lengths do not fit', () => {
    expect(() => unpackPayload('[5]\n{}')).toThrow(PackedRowsError);
    expect(() => unpackPayload('[1]\n{}')).toThrow(PackedRowsError);
    expect(() => unpackPayload('no line')).toThrow(PackedRowsError);
  });
});

describe('packed storage', () => {
  it('stores one row per game, reads back the same state, digest and key order', async () => {
    const s = world([3, 1, 2]);
    const { d, r, read, loaded } = await writeAndRead(s);
    expect(read.rows.filter((x) => x.tbl === 'plays')).toEqual([]);
    expect(read.packed.map((g) => [g.grp, g.seq, g.jsons.length])).toEqual([['3', 0, 3], ['1', 1, 3], ['2', 2, 3]]);
    expect(JSON.stringify(loaded.state)).toBe(JSON.stringify(s));
    expect(loaded.tracker.digest()).toBe(r.digest);
    expect(r.digest).toBe(stateDigest(bytesHash, s));
    expect(stateHash(loaded.state)).toBe(stateHash(s));
    const n = (await d.all<{ n: number }>('SELECT COUNT(*) AS n FROM packed_rows'))[0]!.n;
    expect(n).toBe(3);
  });

  it('is lossless to the character: the storage text of every row is unchanged', async () => {
    const s = { plays: [play(1, 0, { f: 0.1 + 0.2, big: 1e21, neg: -0, nested: { z: 1, a: [null, true, 'x"y'] } }), play(1, 1)] };
    const { read } = await writeAndRead(s);
    const plain = await writeAndRead(s, []);
    expect(read.packed[0]!.jsons).toEqual(plain.read.rows.filter((x) => x.tbl === 'plays').map((x) => x.json));
  });

  it('gives the same digest whether packed, plain or packed by another field', async () => {
    const s = world([1, 2]);
    const a = await writeAndRead(s);
    const b = await writeAndRead(s, []);
    const c = await writeAndRead(s, [{ table: 'plays', groupBy: 'index' }]);
    expect(a.loaded.tracker.digest()).toBe(b.loaded.tracker.digest());
    expect(b.loaded.tracker.digest()).toBe(c.loaded.tracker.digest());
  });

  it('rewrites only the game that changed, and only moves positions when older games are thinned', () => {
    const t = new StateTracker(bytesHash, PACK);
    const s1 = world([1, 2, 3]);
    t.plan(s1, true).commit();
    // A new game: one group written.
    const s2 = { ...s1, plays: [...s1.plays, play(4, 0)] };
    const p2 = t.plan(s2);
    expect(p2.writes).toEqual([expect.objectContaining({ op: 'gput', group: '4', seq: 3 })]);
    p2.commit();
    // One play of game 2 edited: game 2 alone is rewritten.
    const s3 = { ...s2, plays: s2.plays.map((p) => (p.gameId === 2 && p.index === 1 ? { ...p, yards: 99 } : p)) };
    const p3 = t.plan(s3);
    expect(p3.writes).toEqual([expect.objectContaining({ op: 'gput', group: '2', seq: 1 })]);
    p3.commit();
    // Game 1 thinned: one delete and position moves, no blob rewritten.
    const s4 = { ...s3, plays: s3.plays.filter((p) => p.gameId !== 1) };
    const p4 = t.plan(s4);
    expect(ops(p4.writes).sort()).toEqual(['gdel', 'gseq', 'gseq', 'gseq']);
    p4.commit();
    // Nothing changed: nothing written, even on a deep pass.
    expect(t.plan(s4, true).writes).toEqual([]);
    expect(t.digest()).toBe(stateDigest(bytesHash, s4));
  });

  it('falls back to plain rows when a game\'s plays are not together, and packs again when they are', () => {
    const t = new StateTracker(bytesHash, PACK);
    t.plan(world([1, 2]), true).commit();
    const mixed = { name: 'w', plays: [play(1, 0), play(2, 0), play(1, 1)] };
    const p = t.plan(mixed);
    expect(ops(p.writes)).toContain('gclear');
    expect(p.writes.filter((w) => w.op === 'put')).toHaveLength(3);
    p.commit();
    const back = world([1, 2]);
    const q = t.plan(back);
    expect(ops(q.writes)).toEqual(['clear', 'gput', 'gput']);
    q.commit();
    expect(t.digest()).toBe(stateDigest(bytesHash, back));
  });

  it('falls back to plain rows when a row has no usable group value', () => {
    const t = new StateTracker(bytesHash, PACK);
    const p = t.plan({ plays: [play(1, 0), { index: 1 }, play(1, 2, { gameId: { nested: 1 } })] }, true);
    expect(ops(p.writes).filter((o) => o.startsWith('g'))).toEqual([]);
    expect(p.writes.filter((w) => w.op === 'put')).toHaveLength(3);
  });

  it('keeps an id-keyed table\'s keys and refuses rows read back out of their group', async () => {
    const s = { plays: [{ id: 'a', gameId: 1 }, { id: 'b', gameId: 1 }, { id: 'c', gameId: 2 }] };
    const { d, loaded } = await writeAndRead(s);
    expect(JSON.stringify(loaded.state)).toBe(JSON.stringify(s));
    // Swap the two blobs' positions: game 2 now reads first; the state differs and loads in that order.
    await d.exec("UPDATE packed_rows SET grp = 'x' WHERE grp = '2'");
    const read = await readStateRows((sql) => d.all(sql), bytesHash);
    expect(() => StateTracker.load(bytesHash, read.fields, read.rows, read.packed, PACK)).toThrow(/not in its group/);
  });

  it('finds a damaged blob, a wrong hash and a wrong row count on read', async () => {
    const { d } = await writeAndRead(world([1]));
    const read = () => readStateRows((sql) => d.all(sql), bytesHash);
    await d.exec("UPDATE packed_rows SET hash = '0000'");
    await expect(read()).rejects.toThrow(/stored hash/);
    const { d: d2 } = await writeAndRead(world([1]));
    await d2.exec('UPDATE packed_rows SET n = 7');
    await expect(readStateRows((sql) => d2.all(sql), bytesHash)).rejects.toThrow(/7 recorded/);
    const { d: d3 } = await writeAndRead(world([1]));
    await d3.exec("UPDATE packed_rows SET blob = X'00ff00ff'");
    await expect(readStateRows((sql) => d3.all(sql), bytesHash)).rejects.toThrow(PackedRowsError);
  });

  it('reads a group written raw by a platform with no compressor', async () => {
    const s = world([5, 6]);
    const t = new StateTracker(bytesHash, PACK);
    const plan = t.plan(s, true);
    const d = await memoryDb();
    const { STATE_TABLES_DDL } = await import('../../src/snapshot/state-tables.ts');
    await d.exec(STATE_TABLES_DDL);
    await d.transaction(await encodeStateWrites(plan.writes, RAW_CODEC, bytesHash));
    const read = await readStateRows((sql) => d.all(sql), bytesHash);
    expect(JSON.stringify(StateTracker.load(bytesHash, read.fields, read.rows, read.packed).state)).toBe(JSON.stringify(s));
  });
});

describe('a save with packed play rows', () => {
  it('packs plays, drives, inputs and film per game, survives reopen, replay and the archive step', async () => {
    const d = await memoryDb();
    const save = await leagueSave(d, 'standard');
    for (let s = 0; s < 3; s++) {
      expect((await save.issue(cmd(save, 'league.PlaySeason', { postseason: false }), { advancesTime: true, checkpoint: { kind: 'week', ...VERSIONS } })).ok).toBe(true);
      expect((await runSeasonArchive(save, { seasonYear: save.state().calendar.seasonYear, versions: VERSIONS, closeCommand: closeCmd(save, 'standard') })).failure).toBeNull();
    }
    const tables = (await d.all<{ tbl: string }>('SELECT DISTINCT tbl FROM packed_rows ORDER BY tbl')).map((r) => r.tbl);
    expect(tables).toEqual(['drives', 'gameInputs', 'plays', 'trajectories']);
    expect((await d.all<{ n: number }>("SELECT COUNT(*) AS n FROM state_rows WHERE tbl IN ('plays', 'drives', 'gameInputs', 'trajectories')"))[0]!.n).toBe(0);
    const games = new Set(save.state().plays.map((p) => p.gameId)).size;
    expect((await d.all<{ n: number }>("SELECT COUNT(*) AS n FROM packed_rows WHERE tbl = 'plays'"))[0]!.n).toBe(games);
    expect(await save.verifyLive()).toEqual([]);
    for (const sn of await save.snapshots()) expect((await save.verifyByReplay(sn.id)).problems).toEqual([]);
    const hash = stateHash(save.state());
    const again = await SaveFile.open(await memoryDb(await d.exportBytes()), leagueDeps());
    expect(stateHash(again.state())).toBe(hash);
    expect(JSON.stringify(again.state())).toBe(JSON.stringify(save.state()));
    const size = await measureSave(d);
    expect(size.packedRaw).toBeGreaterThan(size.world.plays!);
  }, 60_000);

  it('a compact save also packs season summaries, one blob per season', async () => {
    const d = await memoryDb();
    const save = await leagueSave(d, 'compact');
    for (let s = 0; s < 2; s++) {
      await save.issue(cmd(save, 'league.PlaySeason', { postseason: false }), { advancesTime: true, checkpoint: { kind: 'week', ...VERSIONS } });
      await runSeasonArchive(save, { seasonYear: save.state().calendar.seasonYear, versions: VERSIONS, closeCommand: closeCmd(save, 'compact') });
    }
    const seasons = new Set(save.state().seasonSummaries.map((x) => x.seasonYear)).size;
    expect(seasons).toBeGreaterThan(0);
    expect((await d.all<{ n: number }>("SELECT COUNT(*) AS n FROM packed_rows WHERE tbl = 'seasonSummaries'"))[0]!.n).toBe(seasons);
    expect(await save.verifyLive()).toEqual([]);
  }, 60_000);

  it('moves tables between storages when the packing list changes, with no hash change', async () => {
    const d = await memoryDb();
    const save = await SaveFile.create(d, leagueDeps(), { header: (await import('../retention/world.ts')).leagueHeader('standard'), state: (await import('../retention/world.ts')).leagueWorld(), versions: VERSIONS }, { packedTables: [] });
    await save.issue(cmd(save, 'league.PlaySeason', { postseason: false }), { advancesTime: true, checkpoint: { kind: 'week', ...VERSIONS } });
    expect((await d.all<{ n: number }>('SELECT COUNT(*) AS n FROM packed_rows'))[0]!.n).toBe(0);
    const digest = save.digest();
    const packed = await SaveFile.open(d, leagueDeps());
    await packed.issue(cmd(packed, 'league.PlaySeason', { postseason: false }), { advancesTime: true, checkpoint: { kind: 'week', ...VERSIONS } });
    expect((await d.all<{ n: number }>("SELECT COUNT(*) AS n FROM state_rows WHERE tbl = 'plays'"))[0]!.n).toBe(0);
    expect(await packed.verifyLive()).toEqual([]);
    for (const sn of await packed.snapshots()) expect((await packed.verifyByReplay(sn.id)).problems).toEqual([]);
    expect(digest).not.toBe(packed.digest());
  }, 60_000);
});

describe('format 2 to 3 migration with play rows', () => {
  it('packs the play rows of a format 2 save and keeps its digest, state hash and log', async () => {
    const d = await memoryDb();
    const deps = leagueDeps();
    const { leagueHeader, leagueWorld } = await import('../retention/world.ts');
    const save = await SaveFile.create(d, deps, { header: leagueHeader('standard'), state: leagueWorld(), versions: VERSIONS }, { packedTables: [] });
    await save.issue(cmd(save, 'league.PlaySeason', { postseason: false }), { advancesTime: true, checkpoint: { kind: 'week', ...VERSIONS } });
    const before = { digest: save.digest(), hash: stateHash(save.state()), seq: save.lastSeq(), json: JSON.stringify(save.state()) };
    // Make it a format 2 file: plain rows, no packed table, version 2.
    const h = (await d.all<{ json: string }>('SELECT json FROM header'))[0]!.json;
    await d.transaction([{ sql: 'DROP TABLE packed_rows' }, { sql: 'UPDATE header SET save_format_version = 2, json = ?', params: [JSON.stringify({ ...JSON.parse(h), saveFormatVersion: 2 })] }]);
    const r = await STEP_2_TO_3.run({ driver: d, deps, versions: VERSIONS });
    expect(r.notes).toMatchObject({ packedTables: ['drives', 'gameInputs', 'plays', 'trajectories'] });
    expect(r.stateHashBefore).toBe(before.hash);
    const opened = await SaveFile.open(d, deps);
    expect(opened.digest()).toBe(before.digest);
    expect(stateHash(opened.state())).toBe(before.hash);
    expect(JSON.stringify(opened.state())).toBe(before.json);
    expect(opened.lastSeq()).toBe(before.seq);
    expect((await d.all<{ n: number }>("SELECT COUNT(*) AS n FROM state_rows WHERE tbl = 'plays'"))[0]!.n).toBe(0);
    expect(await opened.verifyLive()).toEqual([]);
  }, 60_000);

  it('refuses a format 2 save whose tables were edited', async () => {
    const d = await memoryDb();
    const deps = leagueDeps();
    const { leagueHeader, leagueWorld } = await import('../retention/world.ts');
    const save = await SaveFile.create(d, deps, { header: leagueHeader('standard'), state: leagueWorld(), versions: VERSIONS }, { packedTables: [] });
    await save.issue(cmd(save, 'league.PlaySeason', { postseason: false }), { advancesTime: true, checkpoint: { kind: 'week', ...VERSIONS } });
    await d.exec("UPDATE state_rows SET json = replace(json, '\"yards\":', '\"yards\":1') WHERE tbl = 'plays' AND key = '0'");
    await expect(STEP_2_TO_3.run({ driver: d, deps, versions: VERSIONS })).rejects.toThrow(/differ from the state the command log recorded/);
  }, 60_000);
});

describe('defaults', () => {
  it('packs the world contract\'s per-game tables by gameId', () => {
    expect(DEFAULT_PACKED_TABLES.map((t) => t.table)).toEqual(['plays', 'drives', 'playGrades', 'decisionGrades', 'gameInputs', 'trajectories']);
    expect(new Set(DEFAULT_PACKED_TABLES.map((t) => t.groupBy))).toEqual(new Set(['gameId']));
  });
});

export type { LeagueWorld };
