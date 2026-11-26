// Memory over a long run: the playing block of people who can never play again is dropped at the season point.
import { describe, expect, it } from 'vitest';
import { NAMES, loop, setup, testSchedule, testSystems, trimmed } from '../fixtures.ts';

describe('slimming the retired', () => {
  it('drops the playing block of the dead and of the old who are on no roster, and of nobody else', () => {
    const w = loop.createWorld({ setup: setup(), content: trimmed(), names: NAMES });
    const onRoster = new Set([...w.rosters.values()].flat());
    const players = [...w.people.values()].filter((p) => p.playing !== undefined);
    const [dead, old, young] = [players[0]!, players[1]!, players.find((p, i) => i > 1 && onRoster.has(p.id) && w.date.seasonYear - p.birthDate.seasonYear < 50)!];
    w.status.set(dead.id, 'deceased');
    // An old man taken off every roster.
    w.people.set(old.id, { ...old, birthDate: { seasonYear: w.date.seasonYear - 60, dayIndex: 0 } });
    for (const [t, ids] of w.rosters) w.rosters.set(t, ids.filter((id) => id !== old.id));
    const n = loop.slimRetired(w);
    expect(n).toBeGreaterThanOrEqual(2);
    expect(w.people.get(dead.id)!.playing).toBeUndefined();
    expect(w.people.get(old.id)!.playing).toBeUndefined();
    expect(w.people.get(young.id)!.playing).toBeDefined();
    expect(w.people.get(dead.id)!.name).toEqual(dead.name);
    expect(loop.slimRetired(w)).toBe(0);
  });

  it('a run with slimming plays the same seasons as one without', () => {
    const run = (slim: boolean) => {
      const w = loop.createWorld({ setup: setup(), content: trimmed(), names: NAMES });
      loop.runHistory(w, testSystems(slim ? { compaction: loop.slimStep() } : {}), { seasons: 6, schedule: testSchedule });
      return w;
    };
    const a = run(true), b = run(false);
    expect(a.seasons.map((s) => ({ ...s }))).toEqual(b.seasons.map((s) => ({ ...s })));
  });
});
