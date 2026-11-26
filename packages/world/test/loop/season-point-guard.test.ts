// Break test #9: the season point must not run mid-season when the caller says how long the season is.
import { describe, expect, it } from 'vitest';
import { NAMES, loop, setup, testSchedule, testSystems, trimmed } from '../fixtures.ts';

describe('season point guard', () => {
  it('refuses mid-season, leaves the world untouched, and runs once the weeks are done', () => {
    const w = loop.createWorld({ setup: setup(), content: trimmed(), names: NAMES });
    const sys = testSystems({});
    const weeks = testSchedule.weeksInSeason(w);
    loop.runWeek(w, sys);
    const hash = loop.worldHash(w);
    expect(() => loop.runSeasonPoint(w, sys, { weeksInSeason: weeks })).toThrow(loop.SeasonNotOverError);
    expect(loop.worldHash(w)).toBe(hash);
    while (w.week < weeks) loop.runWeek(w, sys);
    const year = w.date.seasonYear;
    expect(loop.runSeasonPoint(w, sys, { weeksInSeason: weeks }).seasonYear).toBe(year);
    expect(w.date.seasonYear).toBe(year + 1);
  });
});
