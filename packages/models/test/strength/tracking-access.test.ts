// N2.4.2 variance brief, N2.5.1 tracking, N2.7.1 access and N2.7.2 confidence marks.
import { describe, it, expect } from 'vitest';
import { stream, seedFromNumber } from '@gm/engine-core';
import { MATH } from '../helpers/fixtures.ts';
import {
  confidence, coachsCall, LIMITS_NOTE, downsample, gameMovement, practiceLoad, loadRatio, topSpeedNote, trackingReports,
  reportPlan, delivered, estimateLever, varianceBrief, simsAllowed, PARAMS, type PairedResult, type Point,
} from '../../src/strength/index.ts';

const rng = (seed: number, name: string) => { const s = stream(seedFromNumber(seed), name, []); return () => s.uniform(); };

describe('N2.4.2 variance brief', () => {
  /** Toy game: each team has n possessions scoring 7 with its own chance. Fewer possessions helps the weaker team. */
  function toyGame(u: () => number, possessions: number, pUser: number, pOpp: number): number {
    let a = 0, b = 0;
    for (let i = 0; i < possessions; i++) { if (u() < pUser) a += 7; if (u() < pOpp) b += 7; }
    return a > b ? 1 : a < b ? 0 : 0.5;
  }

  it('acceptance 1 (toy model): shortening the game raises a clear underdog’s win share measurably', () => {
    const pairs: PairedResult[] = [];
    for (let i = 0; i < 10000; i++) {
      const seed = i + 1;
      pairs.push({ without: toyGame(rng(seed, 'v'), 12, 0.3, 0.45), with: toyGame(rng(seed, 'v'), 9, 0.3, 0.45) });
    }
    const est = estimateLever('fewer_possessions', pairs, MATH);
    expect(est.effect).toBeGreaterThan(0);
    expect(est.clear).toBe(true);
    expect(est.winShareWith).toBeGreaterThan(est.winShareWithout);
  });

  it('rule 1: an effect inside the error is "no clear effect"; edge case: a near-even game has no variance edge', () => {
    const same: PairedResult[] = Array.from({ length: 200 }, (_, i) => ({ without: i % 2, with: (i + (i % 7 === 0 ? 1 : 0)) % 2 }));
    expect(estimateLever('deep_shots', same, MATH).clear).toBe(false);
    expect(varianceBrief(1.5, [], MATH)).toMatchObject({ side: 'even', noVarianceEdge: true });
    expect(varianceBrief(-9, [], MATH)).toMatchObject({ side: 'underdog', noVarianceEdge: false });
  });

  it('rule 2: the brief carries estimates only, never an order; rule 3: simulations are capped by the test budget', () => {
    const b = varianceBrief(-9, [{ lever: 'surprise_kicks', pairs: [{ without: 0, with: 1 }, { without: 0, with: 0 }] }], MATH);
    expect(Object.keys(b).sort()).toEqual(['gapPoints', 'levers', 'noVarianceEdge', 'side']);
    expect(simsAllowed(null, 10000)).toBe(500);
    expect(simsAllowed(null, 120)).toBe(120);
    expect(simsAllowed(800, 0)).toBe(0);
  });
});

describe('N2.5.1 tracking', () => {
  it('rule 1 and acceptance: positions are down-sampled to 10 per second and distance equals the stored path length', () => {
    const tick: Point[] = Array.from({ length: 101 }, (_, i) => ({ x: i * 0.08, y: (i % 10) * 0.01 }));
    const stored = downsample(tick, 100);
    expect(stored.length).toBe(11);
    let path = 0;
    for (let i = 1; i < stored.length; i++) path += Math.hypot(stored[i]!.x - stored[i - 1]!.x, stored[i]!.y - stored[i - 1]!.y);
    const m = gameMovement([stored], MATH);
    expect(Math.abs(m.distanceYd - path) / path).toBeLessThan(0.01);
    expect(() => downsample(tick, 15)).toThrow();
  });

  it('top speed, high-speed distance, sprints and accelerations from a sprint track', () => {
    const v = [0, 2, 4, 6, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 6, 4, 2, 0, 0, 0, 0];
    const pts: Point[] = [{ x: 0, y: 0 }];
    for (const s of v.slice(1)) pts.push({ x: pts[pts.length - 1]!.x + s / 10, y: 0 });
    const m = gameMovement([pts], MATH);
    expect(m.topSpeedYdS).toBeCloseTo(8, 9);
    expect(m.sprints).toBe(1);
    expect(m.highSpeedYd).toBeGreaterThan(0);
    expect(m.accelerations).toBe(1);
    expect(m.decelerations).toBe(1);
  });

  it('rule 2 and acceptance: doubling a practice period’s reps doubles its load', () => {
    const prof = (t: string) => (t === 'team' ? { distancePerRepYd: 30, highSpeedPerRepYd: 6 } : undefined);
    const one = practiceLoad([{ periodType: 'team', reps: 10, tempo: 1 }], prof);
    const two = practiceLoad([{ periodType: 'team', reps: 20, tempo: 1 }], prof);
    expect(two.distanceYd).toBe(2 * one.distanceYd);
    expect(two.highSpeedYd).toBe(2 * one.highSpeedYd);
    expect(() => practiceLoad([{ periodType: 'walkthrough', reps: 1, tempo: 1 }], prof)).toThrow();
  });

  it('rule 3: the 7-day to 28-day ratio flags a spike and an underload; edge case: a returning player uses the return plan', () => {
    const steady = new Map<number, number>(Array.from({ length: 28 }, (_, i) => [i, 1000]));
    expect(loadRatio(steady, 27, 0)).toMatchObject({ ratio: 1, flag: 'normal' });
    const spike = new Map(steady); for (let d = 21; d <= 27; d++) spike.set(d, 2000);
    expect(loadRatio(spike, 27, 0).flag).toBe('spike');
    const light = new Map(steady); for (let d = 21; d <= 27; d++) light.set(d, 500);
    expect(loadRatio(light, 27, 0).flag).toBe('underloaded');
    const back = new Map<number, number>([[25, 1000], [26, 1000], [27, 1000]]);
    expect(loadRatio(back, 27, 25)).toMatchObject({ ratio: null, flag: null });
    expect(loadRatio(back, 27, 25, 5000)).toMatchObject({ flag: 'underloaded', fromReturnPlan: true });
  });

  it('rule 4: two straight games 5 percent under the season best raise a note; rule 5: availability by program', () => {
    expect(topSpeedNote([9.6, 9.8, 9.7, 9.2, 9.25])).toBe(true);
    expect(topSpeedNote([9.6, 9.8, 9.7, 9.2, 9.6])).toBe(false);
    expect(topSpeedNote([9.8, 9.0])).toBe(false);
    expect(trackingReports('none')).toEqual({ practice: false, games: false });
    expect(trackingReports('practice_only')).toEqual({ practice: true, games: false });
  });
});

describe('N2.7.1 access', () => {
  const analysts = [{ personId: 1, share: 1, rate: 1 }, { personId: 2, share: 1, rate: 1 }];

  it('acceptance: removing the analytics staff from a pro club removes the weekly chart from the schedule', () => {
    expect(delivered(reportPlan({ workers: analysts, tracking: 'full' }), 'decision_chart')).toBe(true);
    const none = reportPlan({ workers: [], tracking: 'full' });
    expect(delivered(none, 'decision_chart')).toBe(false);
    expect(none.find((p) => p.report === 'decision_chart')!.delivery).toBe('user_builds');
  });

  it('rule 1: a thin staff gets the first reports in order and the rest late; edge case: a new hire starts next week', () => {
    const thin = reportPlan({ workers: [{ personId: 1, share: 0.5, rate: 1 }], tracking: 'full' });
    expect(thin[0]!.delivery).toBe('on_schedule');
    expect(thin.some((p) => p.delivery === 'late')).toBe(true);
    const fresh = reportPlan({ workers: [{ personId: 3, share: 1, rate: 1, startedThisWeek: true }], tracking: 'full' });
    expect(fresh.every((p) => p.delivery === 'user_builds')).toBe(true);
  });

  it('a program without tracking shows load and game tracking as not available', () => {
    const p = reportPlan({ workers: analysts, tracking: 'none' });
    expect(p.find((x) => x.report === 'load_report')!.delivery).toBe('not_available');
    expect(p.find((x) => x.report === 'game_tracking')!.delivery).toBe('not_available');
  });
});

describe('N2.7.2 limits of the model', () => {
  it('rule 1: thin, fair and solid marks with reasons', () => {
    expect(confidence({ se: 0.04, density: 5000 })).toEqual({ mark: 'thin', reasons: ['high_error'] });
    expect(confidence({ se: 0.005, density: 150 }).mark).toBe('thin');
    expect(confidence({ se: 0.02, density: 5000 }).mark).toBe('fair');
    expect(confidence({ se: 0.005, density: 5000 }).mark).toBe('solid');
    expect(confidence({ sample: 9 })).toEqual({ mark: 'thin', reasons: ['small_sample'], sample: 9 });
    expect(confidence({ se: 0.001, density: 9000, noFittedModel: true }).mark).toBe('thin');
  });

  it('acceptance: a 0.4-point edge with a 1.0-point band is a coach’s call either way', () => {
    expect(coachsCall(0.004, 0.001, 0.001, Math.sqrt)).toBe(true);
    expect(coachsCall(0.05, 0.001, 0.001, Math.sqrt)).toBe(false);
    // the band widens with the error of the difference
    expect(coachsCall(0.02, 0.02, 0.02, Math.sqrt)).toBe(true);
  });

  it('rule 3: the standing note has every item and no switch hides it', () => {
    expect(LIMITS_NOTE.length).toBe(6);
    expect(PARAMS.params.some((p) => /hide|show/i.test(p.name))).toBe(false);
  });
});

describe('parameters', () => {
  it('every parameter is in range, named under the module, and assumptions say so', () => {
    for (const p of PARAMS.params) {
      expect(p.name.startsWith('models.strength.')).toBe(true);
      expect(p.value).toBeGreaterThanOrEqual(p.min);
      expect(p.value).toBeLessThanOrEqual(p.max);
      expect(['bible', 'assumption']).toContain(p.basis);
    }
  });
});
