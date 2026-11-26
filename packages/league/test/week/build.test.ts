import { describe, expect, it } from 'vitest';
import { weekday, WEEKDAY } from '../../src/calendar/date.ts';
import {
  allBlocks, applyTravel, checkWeek, clashes, countableMinutes, freeDays, mediaFindings, PARAMS, RULE_KEYS, BLOCK_OWNER,
  DEFAULT_SETS, WEEK_KEYS, weekLookup, rebuildWeek, clashFree, kindSequence,
} from '../../src/week/index.ts';
import { ParamFile, RuleKeyDef } from '@gm/schema';
import { SUN, at, collegeEnv, collegeRules, collegeWeek, proEnv, proLeague, proRules, proWeek, collegeLeague } from './fixtures.ts';

const shapes = () => [
  proWeek(),
  proWeek({ previousGameDay: SUN - 7, kickoff: at(SUN - 3, 20, 15) }), // Sunday then Thursday: short
  proWeek({ previousGameDay: SUN - 10, kickoff: at(SUN, 13) }), // Thursday then Sunday: long
  proWeek({ previousGameDay: SUN - 7, kickoff: at(SUN + 1, 20, 15) }), // Sunday then Monday
  proWeek({ previousGameDay: SUN - 14, kickoff: at(SUN, 13), bye: true }),
  proWeek({ playoff: true }),
  proWeek({ home: false }),
  collegeWeek(),
  collegeWeek({ previousGameDay: SUN - 15, bye: true }),
];

describe('week object (H1.1.1)', () => {
  it('every shape builds with no clash for any attendee', () => {
    for (const w of shapes()) expect(clashes(w), `${w.weekId} ${w.shape}`).toEqual([]);
  });

  it('numbers days by distance to the game for Sunday, Monday, Thursday and Saturday games', () => {
    const cases = [
      { w: proWeek(), wd: WEEKDAY.sun, first: 6 },
      { w: proWeek({ kickoff: at(SUN + 1, 20, 15) }), wd: WEEKDAY.mon, first: 7 },
      { w: proWeek({ kickoff: at(SUN - 3, 20, 15) }), wd: WEEKDAY.thu, first: 3 },
      { w: collegeWeek(), wd: WEEKDAY.sat, first: 6 },
    ];
    for (const c of cases) {
      const game = c.w.days[c.w.days.length - 1]!;
      expect(game.gMinus).toBe(0);
      expect(weekday(game.day)).toBe(c.wd);
      expect(c.w.days[0]!.gMinus).toBe(c.first);
      c.w.days.forEach((d, i) => expect(d.gMinus).toBe(c.w.days.length - 1 - i));
    }
  });

  it('classifies shapes', () => {
    expect(shapes().map((w) => w.shape)).toEqual(['normal', 'short', 'long', 'long', 'bye', 'playoff', 'normal', 'normal', 'bye']);
  });

  it('every block type has an owner screen', () => {
    for (const w of shapes()) for (const b of allBlocks(w)) expect(BLOCK_OWNER[b.type]).toMatch(/^[A-Z]/);
  });

  it('a moved game rebuilds from the template and keeps completed blocks', () => {
    const w = proWeek();
    const done = allBlocks(w).slice(0, 4).map((b) => b.id);
    const moved = rebuildWeek({ ...w, completed: done }, { teamId: 1, weekId: 'w1', previousGameDay: SUN - 7, kickoff: at(SUN + 1, 20, 15), home: true, bye: false, playoff: false, set: DEFAULT_SETS['pro_default']!, countable: false }, clashFree);
    for (const id of done) expect(allBlocks(moved).some((b) => b.id === id)).toBe(true);
    expect(clashes(moved)).toEqual([]);
    expect(moved.days[moved.days.length - 1]!.day).toBe(SUN + 1);
  });

  it('drops days in the configured order for weeks of four and five days', () => {
    const set = DEFAULT_SETS['pro_default']!;
    expect(kindSequence(set, 5, 'normal')).toEqual(['recovery', 'p1', 'p2', 'p3', 'final']);
    expect(kindSequence(set, 4, 'normal')).toEqual(['recovery', 'p1', 'p2', 'final']);
  });
});

describe('default templates validate (H1.2.1, H1.5.1, H7.1.1)', () => {
  it('the pro normal week has zero findings in every regular-season week', () => {
    for (let wk = 1; wk <= 18; wk++) {
      const w = proWeek({ weekId: `w${wk}` });
      expect(checkWeek(w, proEnv(wk)), `week ${wk}`).toEqual([]);
      expect(mediaFindings(w, proRules)).toEqual([]);
    }
  });

  it('the short week has no day off, no padded practice and no finding', () => {
    const w = proWeek({ kickoff: at(SUN - 3, 20, 15) });
    expect(w.days.length).toBe(4);
    expect(freeDays(w)).toEqual([]);
    expect(allBlocks(w).some((b) => b.equipment === 'pads')).toBe(false);
    expect(checkWeek(w, proEnv())).toEqual([]);
    expect(mediaFindings(w, proRules)).toEqual([]);
  });

  it('the long week after a Thursday game starts with the days off the rule requires', () => {
    const w = proWeek({ previousGameDay: SUN - 10 });
    const free = freeDays(w);
    for (let i = 1; i <= 3; i++) expect(free).toContain(SUN - 10 + i);
    expect(checkWeek(w, proEnv())).toEqual([]);
  });

  it('the bye week gives four consecutive days off including Saturday and Sunday', () => {
    const w = proWeek({ previousGameDay: SUN - 14, bye: true });
    const free = new Set(freeDays(w));
    expect(free.has(SUN - 8) && free.has(SUN - 7) && free.has(SUN - 9) && free.has(SUN - 10)).toBe(true);
    expect(weekday(SUN - 8)).toBe(WEEKDAY.sat);
    expect(checkWeek(w, proEnv(9, [], { ctxFor: () => ({ season: 2026, phaseId: 'regular_season', seasonWeek: 9, byeWeekDays: [SUN - 13, SUN - 12, SUN - 11, SUN - 10, SUN - 9, SUN - 8, SUN - 7] }) }))).toEqual([]);
    expect(mediaFindings(w, proRules)).toEqual([]);
  });

  it('the college week stays inside the countable hours with exactly one zero day', () => {
    const w = collegeWeek();
    const mins = countableMinutes(w, collegeRules);
    const total = [...mins.values()].reduce((s, x) => s + x, 0);
    expect(total).toBe(18.5 * 60);
    const zeroDays = [...mins.entries()].filter(([day, m]) => m === 0 && day !== w.days[w.days.length - 1]!.day);
    expect(zeroDays.length).toBe(1);
    expect(checkWeek(w, collegeEnv())).toEqual([]);
    expect(mediaFindings(w, collegeRules)).toEqual([]);
  });

  it('the college game day charges exactly the configured hours', () => {
    const w = collegeWeek();
    expect(countableMinutes(w, collegeRules).get(w.kickoff!.day)).toBe(3 * 60);
  });

  it('the college open date stays inside the hours', () => {
    expect(checkWeek(collegeWeek({ previousGameDay: SUN - 15, bye: true }), collegeEnv())).toEqual([]);
  });

  it('away weeks stay clash-free after travel', () => {
    const w = proWeek({ home: false });
    const r = applyTravel(w, 'g1', { zonesCrossed: 1, flightHours: 2.5, roadHours: 9, international: false, thursdayGame: false, tier: null }, 'standard');
    expect(clashes(r.week)).toEqual([]);
  });
});

describe('numbers and keys', () => {
  it('parameters and rule keys parse', () => {
    expect(() => ParamFile.parse(PARAMS)).not.toThrow();
    for (const k of RULE_KEYS) expect(() => RuleKeyDef.parse(k)).not.toThrow();
  });
  it('week rows never contradict a G-10 value', () => {
    const pro = weekLookup(proLeague, 'pro');
    const col = weekLookup(collegeLeague, 'college');
    for (const r of WEEK_KEYS) { expect(() => pro(r.key)).not.toThrow(); expect(() => col(r.key)).not.toThrow(); }
  });
  it('week rows apply only at their levels', () => {
    expect(proRules('college.cara_week_hours')).toBeUndefined();
    expect(collegeRules('media.head_coach_days_per_week')).toBeUndefined();
  });
});
