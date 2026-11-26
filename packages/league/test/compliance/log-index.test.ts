// The violation log index must give the same answer as scanning the whole log, for logs that grow, logs
// copied with rows changed (as `detect.ts` does), older shorter logs read after newer ones, and branches.
import { describe, expect, it } from 'vitest';
import type { WorldDate } from '@gm/schema';
import { someActorClassRow } from '../../src/compliance/log-index.ts';
import type { ViolationLogRow } from '../../src/compliance/types.ts';

let nextId = 1;
const row = (personId: number, classId: string, day: number): ViolationLogRow => ({
  id: nextId++, classId, actor: { personId, teamId: 1 } as ViolationLogRow['actor'], orderedBy: null, knew: [],
  date: { seasonYear: 2030, dayIndex: day } as WorldDate, competitionId: null, gain: 0, severity: 'minor' as ViolationLogRow['severity'],
  certainTrace: false, actSourcesDrawn: false, caseId: null, eventId: 0,
});

// A small deterministic generator (the test may not use platform random either).
function lcg(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32); }

const CLASSES = ['a', 'b', 'c'];
const reference = (log: readonly ViolationLogRow[], p: number, c: string, test: (d: WorldDate) => boolean) =>
  log.some((r) => r.actor.personId === p && r.classId === c && test(r.date));

function checkAll(log: readonly ViolationLogRow[], rnd: () => number) {
  for (let q = 0; q < 20; q++) {
    const p = Math.floor(rnd() * 6), c = CLASSES[Math.floor(rnd() * 3)]!, lo = Math.floor(rnd() * 40), hi = lo + Math.floor(rnd() * 20);
    const test = (d: WorldDate) => d.dayIndex >= lo && d.dayIndex < hi;
    expect(someActorClassRow(log, p, c, test)).toBe(reference(log, p, c, test));
  }
}

describe('violation log index', () => {
  it('matches a full scan as the log grows, is copied, branches and is read out of order', () => {
    const rnd = lcg(7);
    const kept: (readonly ViolationLogRow[])[] = [];
    let log: readonly ViolationLogRow[] = [];
    for (let step = 0; step < 400; step++) {
      const r = rnd();
      if (r < 0.6) log = [...log, row(Math.floor(rnd() * 6), CLASSES[Math.floor(rnd() * 3)]!, Math.floor(rnd() * 60))];
      else if (r < 0.7) log = log.map((x) => (rnd() < 0.3 ? { ...x, caseId: 1, actSourcesDrawn: true } : x));
      else if (r < 0.8 && kept.length > 0) log = kept[Math.floor(rnd() * kept.length)]!; // go back to an older log and grow a branch from it
      else if (r < 0.85) log = JSON.parse(JSON.stringify(log)) as ViolationLogRow[]; // a log read back from a save
      if (rnd() < 0.2) kept.push(log);
      checkAll(log, rnd);
      if (kept.length > 0) checkAll(kept[Math.floor(rnd() * kept.length)]!, rnd);
    }
  });

  it('answers false for an empty log and an unknown person', () => {
    expect(someActorClassRow([], 1, 'a', () => true)).toBe(false);
    expect(someActorClassRow([row(1, 'a', 3)], 2, 'a', () => true)).toBe(false);
  });
});
