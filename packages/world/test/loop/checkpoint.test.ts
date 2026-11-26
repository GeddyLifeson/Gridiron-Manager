// Checkpoint and resume (master data run): a run resumed from a checkpoint ends on the same deep world
// hash as an unbroken run. structuredClone stands in for the node:v8 serializer the run tool writes with
// (both use the structured clone algorithm), so the restored data shares nothing with the original.
import { serialize, deserialize } from 'node:v8';
import { describe, expect, it } from 'vitest';
import { loop, miniWorld, testSchedule, testSystems } from '../fixtures.ts';

const SEED = '00000000000000a7';

describe('checkpoint and resume', () => {
  it('a run stopped at season k and resumed from its checkpoint ends on the unbroken hash', () => {
    const N = 8;
    const unbroken = miniWorld({ historySeasons: N });
    loop.runHistory(unbroken, testSystems(), { seasons: N, schedule: testSchedule });

    for (const k of [1, 3, 7]) {
      const first = miniWorld({ historySeasons: N });
      let saved: Buffer | null = null;
      loop.runHistory(first, testSystems(), {
        seasons: N, schedule: testSchedule,
        onSeason: (_s, done) => { if (done === k) { saved = serialize(loop.checkpointData(first, SEED, { done })); return 'stop'; } },
      });
      // The first machine is gone; a new one builds the same world and restores into it.
      const cp = deserialize(saved!) as loop.WorldCheckpoint;
      expect(cp.extra).toEqual({ done: k });
      const resumed = loop.restoreCheckpoint(miniWorld({ historySeasons: N }), cp, SEED);
      expect(loop.worldHash(resumed)).toBe(cp.worldHash);
      loop.runHistory(resumed, testSystems(), { seasons: N, schedule: testSchedule, alreadyDone: k });
      expect(loop.worldHash(resumed)).toBe(loop.worldHash(unbroken));
      // worldHash leaves out some fields (hall, seasons, staff seasons, results, team spans), so compare every field too.
      const a = loop.checkpointData(resumed, SEED), b = loop.checkpointData(unbroken, SEED);
      expect(a.fields).toEqual(b.fields);
      expect(a.logRows).toEqual(b.logRows);
    }
  });
  it('refuses another seed, another version, and a world that does not match', () => {
    const w = miniWorld({ historySeasons: 2 });
    loop.runHistory(w, testSystems(), { seasons: 2, schedule: testSchedule });
    const cp = structuredClone(loop.checkpointData(w, SEED));
    expect(() => loop.restoreCheckpoint(miniWorld({ historySeasons: 2 }), cp, '00000000000000a8')).toThrow(/seed/);
    expect(() => loop.restoreCheckpoint(miniWorld({ historySeasons: 2 }), { ...cp, version: 2 }, SEED)).toThrow(/version 2/);
    const tampered = structuredClone(cp);
    (tampered.fields.passes as number) += 1;
    expect(() => loop.restoreCheckpoint(miniWorld({ historySeasons: 2 }), tampered, SEED)).toThrow(/world hash/);
  });
  it('alreadyDone is checked', () => {
    expect(() => loop.runHistory(miniWorld(), testSystems(), { seasons: 2, schedule: testSchedule, alreadyDone: 3 })).toThrow(/alreadyDone/);
  });
});
