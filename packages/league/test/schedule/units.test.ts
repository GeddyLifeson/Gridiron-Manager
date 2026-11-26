// Hand-built cases for C2.2.2 week types, C2.3.2 body clock, C2.3.3 flex and C2.6.1 reports.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  bodyClockKickoffMinutes, flexWeek, flexWindowOpen, orientBalanced, scheduleReport, slotWeek18, tagForDays, weekTypes,
  type ScheduledGame,
} from '../../src/schedule/index.ts';
import { rng } from './fixtures.ts';

const DAY = { wed: -4, thu: -3, fri: -2, sat: -1, sun: 0, mon: 1 } as const;
function game(id: string, week: number, home: string, away: string, day: keyof typeof DAY = 'sun', slot = 'sunday_early', national = false): ScheduledGame {
  return {
    id, season: 2026, phase: 'regular', week, home, away, venueId: `v.${home}`, neutral: false, international: false, region: null,
    kind: 'division', conferenceGame: true, day, dayOffset: DAY[day], dayIndex: null, slot, kickoffEtMinutes: 780,
    venueZone: 'America/New_York', national, flexEligible: true, status: 'scheduled',
  };
}

describe('C2.2.2 week types', () => {
  it('acceptance: 20 hand-built cases match the table', () => {
    const cases: [number, string][] = [
      [3, 'short'], [4, 'short'], [5, 'short_mild'], [6, 'normal_minus_one'], [7, 'normal'], [8, 'long'],
      [9, 'mini_bye'], [10, 'mini_bye'], [11, 'mini_bye'], [13, 'bye'], [14, 'bye'], [21, 'bye'],
      [2, 'illegal'], [12, 'mini_bye'], [4, 'short'], [6, 'normal_minus_one'], [7, 'normal'], [8, 'long'], [10, 'mini_bye'], [15, 'bye'],
    ];
    expect(cases).toHaveLength(20);
    for (const [d, tag] of cases) expect(tagForDays(d), `${d} days`).toBe(tag);
  });

  it('rows per week from a schedule: Sunday to Thursday is short, Thursday to Sunday a mini-bye, the bye week a bye', () => {
    const g = [game('a', 1, 'A', 'B'), game('b', 2, 'A', 'C', 'thu'), game('c', 3, 'D', 'A'), game('d', 5, 'A', 'B', 'mon')];
    const rows = weekTypes(g, ['A'], 5);
    expect(rows.map((r) => r.tag)).toEqual(['normal', 'short', 'mini_bye', 'bye', 'bye']);
    expect(rows[2]!.restDays).toBe(10);
    expect(rows[4]!.restDays).toBe(15);
  });
});

describe('C2.3.2 body clock', () => {
  it('acceptance: a west-coast club in an eastern 1:00 p.m. game shows 10:00 or 11:00 body time', () => {
    expect(bodyClockKickoffMinutes(780, 'America/New_York', 'America/Los_Angeles', 0)).toBe(600);
    expect(bodyClockKickoffMinutes(780, 'America/New_York', 'America/Los_Angeles', 1)).toBe(660);
    expect(bodyClockKickoffMinutes(780, 'America/New_York', 'America/New_York', 0)).toBe(780);
    expect(bodyClockKickoffMinutes(780, 'America/New_York', 'America/Los_Angeles', 9)).toBe(780);
  });
});

describe('C2.3.3 flexible scheduling', () => {
  it('windows and notice by night, 2026 values', () => {
    const u = { sundayNightLimited: 0, thursday: 0 };
    expect(flexWindowOpen('sunday_night', 4, 30, u)).toBe(false);
    expect(flexWindowOpen('sunday_night', 6, 12, u)).toBe(true);
    expect(flexWindowOpen('sunday_night', 6, 11, u)).toBe(false);
    expect(flexWindowOpen('sunday_night', 6, 12, { sundayNightLimited: 2, thursday: 0 })).toBe(false);
    expect(flexWindowOpen('sunday_night', 15, 6, u)).toBe(true);
    expect(flexWindowOpen('monday_night', 11, 30, u)).toBe(false);
    expect(flexWindowOpen('monday_night', 12, 12, u)).toBe(true);
    expect(flexWindowOpen('thursday_night', 13, 20, u)).toBe(false);
    expect(flexWindowOpen('thursday_night', 13, 21, u)).toBe(true);
    expect(flexWindowOpen('thursday_night', 13, 21, { sundayNightLimited: 0, thursday: 2 })).toBe(false);
  });

  it('acceptance: a flex swaps the low-stakes night game with the best Sunday afternoon game and respects the notice', () => {
    const games = [
      game('n', 14, 'A', 'B', 'sun', 'sunday_night', true), game('x', 14, 'C', 'D'), game('y', 14, 'E', 'F', 'sun', 'sunday_late'),
      game('pa', 13, 'A', 'G'), game('pc', 13, 'C', 'H'), game('pe', 13, 'E', 'I'),
    ];
    const u = { sundayNightLimited: 0, thursday: 0 };
    expect(flexWeek(games, 14, { n: 0.1, x: 0.5, y: 0.9 }, 5, u)).toHaveLength(0);
    const ch = flexWeek(games, 14, { n: 0.1, x: 0.5, y: 0.9 }, 6, u);
    expect(ch.map((c) => c.gameId)).toEqual(['y', 'n']);
    expect(games.find((g) => g.id === 'y')!.slot).toBe('sunday_night');
    expect(games.find((g) => g.id === 'n')!.slot).toBe('sunday_late');
    expect(games.find((g) => g.id === 'n')!.status).toBe('moved');
  });

  it('rule 4: no move leaves fewer than 6 days between a club\'s games', () => {
    // E played Monday of week 13; a Sunday night move in week 14 is still 6 days, a Thursday move is not allowed.
    const games = [game('n', 14, 'A', 'B', 'thu', 'thursday_night', true), game('y', 14, 'E', 'F'), game('pe', 13, 'E', 'I', 'mon', 'monday_night', true)];
    const ch = flexWeek(games, 14, { n: 0, y: 1 }, 30, { sundayNightLimited: 0, thursday: 0 });
    expect(ch).toHaveLength(0);
  });

  it('rule 3: week 18 slots after week 17; the top stakes game gets Sunday night, three go to Saturday, groups kick off together', () => {
    const wk = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => ({ ...game(id, 18, `H${i}`, `V${i}`, 'sun', 'tbd'), kickoffEtMinutes: null }));
    slotWeek18(wk, { a: 0.9, b: 0.8, c: 0.7, d: 0.6, e: 0.1, f: 0.2 }, [['e', 'f']], rng(1));
    expect(wk.find((g) => g.id === 'a')!.slot).toBe('sunday_night');
    expect(wk.filter((g) => g.day === 'sat')).toHaveLength(3);
    expect(wk.find((g) => g.id === 'e')!.kickoffEtMinutes).toBe(wk.find((g) => g.id === 'f')!.kickoffEtMinutes);
  });
});

describe('C2.6.1 schedule report', () => {
  it('acceptance: values match a hand calculation', () => {
    const g = [game('1', 1, 'A', 'B'), game('2', 2, 'C', 'A'), game('3', 3, 'A', 'D'), game('4', 4, 'B', 'A'), game('5', 6, 'A', 'C', 'thu')];
    const records = { B: { wins: 10, losses: 7, ties: 0 }, C: { wins: 4, losses: 12, ties: 1 }, D: { wins: 8, losses: 8, ties: 1 } };
    const places = { 'v.A': { latitude: 40, longitude: -75 }, 'v.B': { latitude: 40, longitude: -75 }, 'v.C': { latitude: 40, longitude: -75 }, 'v.D': { latitude: 40, longitude: -75 } };
    const r = scheduleReport('A', g, records, places, 'v.A', 6);
    // Opponents B, C, D, B, C: wins 10+4+8+10+4 = 36, losses 7+12+8+7+12 = 46, ties 1+1+1 = 3 (half each).
    expect(r.strengthOfSchedule).toBeCloseTo((36 + 1.5) / 85, 10);
    expect(r.travelKm).toBe(0);
    expect(r.shortWeeks).toBe(0);
    expect(r.hardestStretch!.startWeek).toBe(1);
    expect(r.restDifference).toHaveLength(5);
  });
});

describe('home and away balance', () => {
  it('orientBalanced always meets the bounds on random even-degree graphs (property)', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 10_000 }), (seed) => {
      const r = rng(seed, 'orient');
      const n = 8;
      const edges: { a: number; b: number; pref: number }[] = [];
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (r.chance(0.6)) edges.push({ a, b, pref: r.chance(0.5) ? a : b });
      const deg = new Array<number>(n).fill(0);
      for (const e of edges) { deg[e.a]!++; deg[e.b]!++; }
      const host = orientBalanced(n, edges, deg.map((d) => Math.floor(d / 2)), deg.map((d) => Math.ceil(d / 2)), () => r.chance(0.5));
      expect(host).not.toBeNull();
      const homes = new Array<number>(n).fill(0);
      host!.forEach((h) => { homes[h]!++; });
      homes.forEach((h, i) => { expect(h).toBeGreaterThanOrEqual(Math.floor(deg[i]! / 2)); expect(h).toBeLessThanOrEqual(Math.ceil(deg[i]! / 2)); });
    }), { numRuns: 200 });
  });
});
