import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { stateHash } from '@gm/engine-core';
import type { Person, WorldState } from '@gm/schema';
import {
  planBugBundle, encodeBugBundle, decodeBugBundle, replayBugBundle, BugBundleError, BUG_BUNDLE_FORMAT_VERSION, isGzip,
} from '../../src/export/index.ts';
import { headlessDeps, playedCareer, ENGINE } from './fixtures.ts';

const deps = headlessDeps();

/** Round trip through the file bytes, as a builder receives it. */
async function viaFile(b: Parameters<typeof encodeBugBundle>[0]) {
  const bytes = await encodeBugBundle(b);
  expect(isGzip(bytes)).toBe(true);
  return decodeBugBundle(bytes);
}

function importedPerson(id: number): Person {
  return {
    id, origin: 'imported', externalRef: { source: 'people-pack', key: 'real-key-77' },
    name: { first: 'Realfirst', last: 'Reallast' }, birthDate: { year: 1990, dayIndex: 10 }, appearanceSeed: 3, roles: ['player'],
  };
}

describe('bug bundle (P5.7.1)', () => {
  it('a bundle made at random points of a test career replays to the same state hash (acceptance)', async () => {
    const c = await playedCareer(20);
    await c.snapshot('week'); // a later snapshot the bundle should start from when the target is past it
    for (let i = 0; i < 6; i++) await c.run('AdvanceDay', { days: 5 + i });
    const last = c.lastSeq();
    // Fixed pseudo-random targets (a linear congruential sequence), plus both ends.
    const targets = new Set([0, last]);
    let x = 12345;
    for (let i = 0; i < 10; i++) { x = (x * 1103515245 + 12345) % 2147483648; targets.add(x % (last + 1)); }
    for (const t of targets) {
      const plan = await planBugBundle(c.store, deps, { appVersion: 'test app', targetSeq: t });
      const b = await viaFile(plan.build({ namesReplaced: false }));
      expect(b.target.stateHash).toBe(c.hashes.get(t));
      const r = replayBugBundle(b, deps, ENGINE);
      expect(r.problems).toEqual([]);
      expect(r.ok).toBe(true);
      expect(r.replayedHash).toBe(c.hashes.get(t));
    }
  });

  it('holds the smallest set: the latest snapshot at or before the target and only the commands after it', async () => {
    const c = await playedCareer(9);
    const snapSeq = c.lastSeq();
    await c.snapshot('week');
    for (let i = 0; i < 4; i++) await c.run('AdvanceDay', { days: 7 });
    const b = (await planBugBundle(c.store, deps, { appVersion: 'a' })).build({ namesReplaced: false });
    expect(b.snapshot.kind).toBe('week');
    expect(b.snapshot.logSeq).toBe(snapSeq);
    expect(b.log.map((r) => r.seq)).toEqual([snapSeq + 1, snapSeq + 2, snapSeq + 3, snapSeq + 4]);
    expect(b.target.stateHash).toBe(stateHash(await c.store.world()));
    // A target before the week snapshot falls back to the creation snapshot.
    const early = (await planBugBundle(c.store, deps, { appVersion: 'a', targetSeq: 3 })).build({ namesReplaced: false });
    expect(early.snapshot.kind).toBe('creation');
    expect(early.log.map((r) => r.seq)).toEqual([1, 2, 3]);
  });

  it('carries header, content copies, settings and the error log, and the summary lists them', async () => {
    const c = await playedCareer(3);
    const plan = await planBugBundle(c.store, deps, { appVersion: 'a', errorLog: ['12:00 render warning', '12:01 worker restarted'] });
    const b = await viaFile(plan.build({ namesReplaced: false }));
    expect(b.header.engineVersion).toBe(ENGINE);
    expect(b.content).toEqual([{ id: 'ruleset:test', kind: 'ruleset', hash: 'h1', body: { values: [1, 2, 3] } }]);
    expect(b.settings).toEqual({ worldSize: 'small', retentionProfile: 'standard' });
    expect(b.errorLog).toEqual(['12:00 render warning', '12:01 worker restarted']);
    const text = plan.summary.join('\n');
    expect(text).toMatch(/1 content copies \(ruleset\)/);
    expect(text).toMatch(/2 lines of the game's error log/);
    expect(text).toMatch(/nothing is sent anywhere/);
    expect(text).toMatch(/no imported names/);
    expect(plan.importedPeople).toBe(0);
  });

  it('a defect shows up: a bundle whose log was changed no longer reaches the reported state', async () => {
    const c = await playedCareer(6);
    const b = (await planBugBundle(c.store, deps, { appVersion: 'a' })).build({ namesReplaced: false });
    const i = b.log.findIndex((r) => r.type === 'AdvanceDay');
    const bad = { ...b, log: b.log.map((r, k) => (k === i ? { ...r, command: { ...r.command, payload: { days: 200 } } } : r)) };
    const r = replayBugBundle(bad, deps);
    expect(r.ok).toBe(false);
    expect(r.problems.join(' ')).toMatch(/reported state .* not reached/);
    expect(r.problems.join(' ')).toMatch(/differs on replay/);
  });

  it('records the engine version and says when the running engine differs (edge case)', async () => {
    const c = await playedCareer(2);
    const b = (await planBugBundle(c.store, deps, { appVersion: 'a' })).build({ namesReplaced: false });
    const r = replayBugBundle(b, deps, 'engine 9');
    expect(r.engine).toEqual({ bundle: ENGINE, running: 'engine 9', match: false });
    expect(r.ok).toBe(false);
    expect(replayBugBundle(b, deps).engine.match).toBeNull();
  });

  it('names replaced: imported names are swapped for placeholders and the replay still reaches the state', async () => {
    const c = await playedCareer(4);
    const w: WorldState = { ...c.world, people: [importedPerson(1), { ...importedPerson(2), origin: 'generated', externalRef: undefined, name: { first: 'Gen', last: 'Erated' } }], nextIds: { ...c.world.nextIds, person: 3 } };
    await c.setWorld(w);
    await c.snapshot('week');
    for (let i = 0; i < 3; i++) await c.run('AdvanceDay', { days: 3 });
    const plan = await planBugBundle(c.store, deps, { appVersion: 'a' });
    expect(plan.importedPeople).toBe(1);
    expect(plan.summary.join('\n')).toMatch(/names of 1 imported people/);

    const plain = await encodeBugBundle(plan.build({ namesReplaced: false }));
    const replaced = await encodeBugBundle(plan.build({ namesReplaced: true }));
    const text = async (bytes: Uint8Array) => JSON.stringify(await decodeBugBundle(bytes));
    expect(await text(plain)).toContain('Realfirst');
    const rt = await text(replaced);
    expect(rt).not.toContain('Realfirst');
    expect(rt).not.toContain('Reallast');
    expect(rt).not.toContain('real-key-77');
    expect(rt).toContain('Gen'); // generated people keep their names

    const b = await decodeBugBundle(replaced);
    expect(b.namesReplaced).toBe(true);
    expect(b.target.hashView).toBe('names_replaced');
    const r = replayBugBundle(b, deps, ENGINE);
    expect(r.problems).toEqual([]);
    // The replaced world differs from the real one only in the names.
    const live = await c.store.world();
    expect(r.replayedHash).not.toBe(stateHash(live));
    expect(b.snapshot.world.people[0]!.name).toEqual({ first: 'Imported', last: 'Person 1' });
  });

  it('refuses files that are not bundles, and bundles of a newer format', async () => {
    await expect(decodeBugBundle(new TextEncoder().encode('{"format":"gm-bug-bundle"}'))).rejects.toThrow(BugBundleError);
    await expect(decodeBugBundle(gzipSync(Buffer.from('not json')))).rejects.toThrow(/not a valid bug bundle/);
    await expect(decodeBugBundle(gzipSync(Buffer.from(JSON.stringify({ format: 'other' }))))).rejects.toThrow(/wrong format id/);
    const c = await playedCareer(1);
    const b = (await planBugBundle(c.store, deps, { appVersion: 'a' })).build({ namesReplaced: false });
    const newer = gzipSync(Buffer.from(JSON.stringify({ ...b, formatVersion: BUG_BUNDLE_FORMAT_VERSION + 1 })));
    await expect(decodeBugBundle(newer)).rejects.toThrow(/newer than this build reads/);
    // Node's own gzip reads the file too: it is an ordinary gzip file.
    const ours = await encodeBugBundle(b);
    expect((await decodeBugBundle(gzipSync((await import('node:zlib')).gunzipSync(ours)))).target).toEqual(b.target);
  });

  it('rejects targets outside the log', async () => {
    const c = await playedCareer(1);
    await expect(planBugBundle(c.store, deps, { appVersion: 'a', targetSeq: 99 })).rejects.toThrow(/outside the log/);
    await expect(planBugBundle(c.store, deps, { appVersion: 'a', targetSeq: -1 })).rejects.toThrow(/outside the log/);
  });
});
