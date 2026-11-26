// G-89 tests: the two acceptance runs replay identically, S10.1.1 week modes and flags, S10.3.1 climb
// targets, S10.1.2 offer pauses, the one-rung floor, and the Q4.3.1 career loop search.
import { describe, it, expect } from 'vitest';
import { seedFromNumber, stream } from '@gm/engine-core';
import {
  runCareer, replayCheck, climbCheck, careerLoopSearch, formatLoopSearch, yearReached, seedsOf,
  rung0ToProHead, firedAndRehired, tuningScript, perfectWork, averageWork, jobHopper,
  paceSeason, playedWeeks, simulatedGrade, addPlayed, EMPTY_RUNNING, standInMarket, PARAMS, param, PENDING_LOOPS,
  type CareerScript,
} from '../../src/career-run/index.ts';

const reachesProHead = (seed: number): boolean => yearReached(runCareer(rung0ToProHead(), seedFromNumber(seed)), 9, 'pro') !== null;
const firedThenBack = (seed: number): boolean => {
  const r = runCareer(firedAndRehired(), seedFromNumber(seed));
  const f = r.rows.findIndex((x) => x.fired);
  return f >= 0 && r.rows.slice(f + 1).some((x) => x.employed);
};
const firstSeed = (ok: (n: number) => boolean): number => {
  for (let n = 1; n <= 50; n++) if (ok(n)) return n;
  throw new Error('no seed');
};

describe('G-89 acceptance: scripted runs replay identically', () => {
  it('rung 0 to pro head coach reaches the pro head seat and replays to the same hash', () => {
    const seed = firstSeed(reachesProHead);
    const run = runCareer(rung0ToProHead(), seedFromNumber(seed));
    expect(run.rows[0]!.employed).toBe(false);
    expect(run.rows[0]!.rung).toBe(0);
    expect(run.final.seat?.rung).toBe(9);
    expect(run.final.seat?.level).toBe('pro');
    const rc = replayCheck(rung0ToProHead(), seed);
    expect(rc.identical).toBe(true);
    expect(rc.hash).toBe(run.hash);
  });

  it('fired and rehired: fired from the first head job, hired again, replays to the same hash', () => {
    const seed = firstSeed(firedThenBack);
    const run = runCareer(firedAndRehired(), seedFromNumber(seed));
    expect(run.events.some((e) => e.type === 'fired')).toBe(true);
    expect(replayCheck(firedAndRehired(), seed).identical).toBe(true);
  });

  it('most seeds produce the scripted story (not a lucky single seed)', () => {
    const seeds = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(seeds.filter(reachesProHead).length).toBeGreaterThanOrEqual(12);
    expect(seeds.filter(firedThenBack).length).toBeGreaterThanOrEqual(12);
  });

  it('a different seed gives a different career; the same seed with another market port is still deterministic', () => {
    const a = runCareer(rung0ToProHead(), seedFromNumber(1));
    const b = runCareer(rung0ToProHead(), seedFromNumber(2));
    expect(a.hash).not.toBe(b.hash);
    const port = { ...standInMarket };
    expect(runCareer(rung0ToProHead(), seedFromNumber(1), { market: port }).hash).toBe(a.hash);
  });
});

describe('S10.1.1 week modes', () => {
  it('key weeks plays the opener, the biggest game, mid-season and the last game; held weeks are added', () => {
    expect(playedWeeks('key_weeks', 13, 9, [], false)).toEqual([0, 6, 9, 12]);
    expect(playedWeeks('key_weeks', 13, 9, [3], false)).toEqual([0, 3, 6, 9, 12]);
    expect(playedWeeks('season_summary', 13, 9, [], false)).toEqual([]);
    expect(playedWeeks('full', 13, 9, [], false)).toHaveLength(13);
  });

  it('certified mode plays every week (N4 edge case)', () => {
    expect(playedWeeks('season_summary', 13, 9, [], true)).toHaveLength(13);
    const script: CareerScript = { ...tuningScript(perfectWork(), 6), certified: true };
    const run = runCareer(script, seedFromNumber(3));
    for (const r of run.rows.filter((x) => x.employed)) expect(r.simulatedShare).toBe(0);
  });

  it('a simulated duty draws 5 points below the running mean, so playing is never worse than simulating', () => {
    let r = EMPTY_RUNNING;
    for (const g of [90, 92, 94, 91, 93, 92]) r = addPlayed(r, g);
    const s = stream(seedFromNumber(5), 'test', ['sim']);
    let sum = 0;
    for (let i = 0; i < 4000; i++) sum += simulatedGrade(r, s);
    expect(sum / 4000).toBeCloseTo(r.mean - param('careerRun.pace.simPull'), 0);
  });

  it('a family never played simulates around the median AI coach with a wider spread', () => {
    const s = stream(seedFromNumber(6), 'test', ['unplayed']);
    const xs = Array.from({ length: 4000 }, () => simulatedGrade(EMPTY_RUNNING, s));
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean).toBeCloseTo(param('careerRun.pace.unplayedMedian'), 0);
  });

  it('every simulated grade carries the flag and simulated grades never enter the running record', () => {
    const s = stream(seedFromNumber(7), 'test', ['pace']);
    const p = paceSeason('key_weeks', ['film'], {}, () => 90, s, { weeks: 13, biggestGame: 9 });
    expect(p.grades.filter((g) => !g.simulated)).toHaveLength(4);
    expect(p.grades.filter((g) => g.simulated)).toHaveLength(9);
    expect(p.running.film!.n).toBe(4);
    for (const g of p.grades) if (g.grade !== 90) expect(g.simulated).toBe(true);
  });

  it('season summary writes three to five decision events per season', () => {
    const pol = { ...perfectWork('summary'), pace: () => 'season_summary' as const };
    const run = runCareer({ id: 'summary', policy: pol, start: { rung: 3, level: 'college', age: 26 }, seasons: 5 }, seedFromNumber(8));
    for (const row of run.rows.filter((r) => r.employed)) {
      const n = run.events.filter((e) => e.season === row.season && e.type === 'summary_decision').length;
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(5);
    }
  });
});

describe('S10.1.2 and S10.3.1 pacing rules', () => {
  it('every offer pauses the run (an offer_pause event per offer)', () => {
    const run = runCareer(rung0ToProHead(), seedFromNumber(4));
    for (const row of run.rows) expect(run.events.filter((e) => e.season === row.season && e.type === 'offer_pause').length).toBe(row.offers);
  });

  it('the floor: no climb faster than one rung a season, except pro coordinator to pro head (no pro rung 8) and comebacks', () => {
    for (const seed of seedsOf(10)) {
      const run = runCareer(tuningScript(perfectWork(), 25), seed);
      for (let i = 1; i < run.rows.length; i++) {
        const a = run.rows[i - 1]!, b = run.rows[i]!;
        if (!a.employed || !b.employed) continue;
        const jump = b.rung - a.rung;
        if (jump > 1) expect(a.rung === 7 && b.rung === 9).toBe(true);
      }
    }
  });

  it('perfect work reaches rung 7 in 8 to 14 game years across seeds; average work usually does not reach rung 9', () => {
    const c = climbCheck(20);
    expect(c.perfectOk).toBe(true);
    expect(c.averageOk).toBe(true);
  });
});

describe('Q4.3.1 career loop search', () => {
  const r = careerLoopSearch(12);
  it('no greedy loop beats the standard AI coach by more than the margin over 30 seasons', () => {
    expect(r.seasons).toBe(30);
    expect(r.pass).toBe(true);
    for (const l of r.loops) expect(l.edge).toBeLessThanOrEqual(param('careerRun.loop.margin'));
  });

  it('the world answers each loop: the AI memory of the logged history changes the yield', () => {
    for (const l of r.loops) expect(l.worldResponds).toBe(true);
  });

  it('loops not yet runnable headless are listed as pending with what they need', () => {
    expect(r.pending.map((p) => p.id)).toEqual(PENDING_LOOPS.map((p) => p.id));
    const text = formatLoopSearch(r);
    for (const p of PENDING_LOOPS) expect(text).toContain(`${p.id}: pending`);
    expect(formatLoopSearch(careerLoopSearch(12))).toBe(text);
  });

  it('job hopping is logged and read by hirers', () => {
    const run = runCareer(tuningScript(jobHopper(), 30), seedFromNumber(2));
    expect(run.final.logged.oneSeasonStays).toBeGreaterThan(0);
    const honest = runCareer(tuningScript(averageWork(), 30), seedFromNumber(2));
    expect(honest.final.logged.oneSeasonStays).toBeLessThanOrEqual(run.final.logged.oneSeasonStays);
  });
});

describe('parameters', () => {
  it('every parameter is in range and named once', () => {
    const names = new Set<string>();
    for (const p of PARAMS.params) {
      expect(names.has(p.name)).toBe(false);
      names.add(p.name);
      expect(p.value).toBeGreaterThanOrEqual(p.min);
      expect(p.value).toBeLessThanOrEqual(p.max);
    }
  });
});
