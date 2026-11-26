// G8.2.1 predictability index.
import { describe, expect, it } from 'vitest';
import { ParamFile } from '@gm/schema';
import { stream, seedFromNumber } from '@gm/engine-core';
import {
  buildBaseline, predictability, situationKey, isForced, OFFENSE_CATEGORIES, DEFENSE_CATEGORIES, PARAMS,
  type CallRecord, type PreSnapInfo,
} from '../../src/predictability/index.ts';
import { MATH } from '../helpers/fixtures.ts';

const CATS = ['run', 'pass'];
const isRun = (c: string) => c === 'run';

/** League run share by down: a simple, situation-dependent league mix. */
const leagueRun = (down: number) => [0, 0.5, 0.42, 0.25, 0.3][down]!;

function situations(n: number, seed: number): PreSnapInfo[] {
  const s = stream(seedFromNumber(seed), 'test.situations', []);
  return Array.from({ length: n }, () => {
    const down = 1 + s.int(0, 2);
    return { down, distanceYd: down === 1 ? 10 : 1 + s.int(0, 11), yardsToGoalYd: 1 + s.int(0, 98), scoreDiff: s.int(-14, 14), halfSecondsLeft: 200 + s.int(0, 1600), gameSecondsLeft: 2000 + s.int(0, 1500), shotgun: s.chance(0.6) };
  });
}

function caller(n: number, seed: number, runChance: (i: PreSnapInfo) => number): CallRecord[] {
  const s = stream(seedFromNumber(seed), 'test.caller', []);
  return situations(n, seed + 1000).map((info) => ({ info, category: s.chance(runChance(info)) ? 'run' : 'pass' }));
}

const league = buildBaseline(caller(40000, 1, (i) => leagueRun(i.down)), CATS);
const opt = { withFormation: false, isRun };

describe('G8.2.1 predictability index', () => {
  it('acceptance: a caller who always runs on first down scores worse than one who mixes at league rates', () => {
    const mixed = predictability(caller(1500, 2, (i) => leagueRun(i.down)), league, opt, MATH);
    const runFirst = predictability(caller(1500, 2, (i) => (i.down === 1 ? 1 : leagueRun(i.down))), league, opt, MATH);
    expect(runFirst.index).toBeGreaterThan(mixed.index + 0.05);
    expect(runFirst.runPassAccuracy!).toBeGreaterThan(mixed.runPassAccuracy!);
    // The first-down situations are the cuts that add most.
    expect(runFirst.cuts[0]!.situation.startsWith('1|')).toBe(true);
  });

  it('acceptance: a random caller (league rates) scores near zero gain', () => {
    const r = predictability(caller(3000, 3, (i) => leagueRun(i.down)), league, opt, MATH);
    expect(Math.abs(r.index)).toBeLessThan(0.02);
  });

  it('rules: the model never sees the future: adding later calls leaves earlier gains unchanged', () => {
    const calls = caller(800, 4, (i) => (i.down === 2 ? 0.8 : leagueRun(i.down)));
    const prefix = predictability(calls.slice(0, 400), league, opt, MATH);
    const full = predictability(calls, league, opt, MATH);
    expect(full.perCall.slice(0, 400)).toEqual(prefix.perCall);
    expect(full.calls).toBe(800);
    const sum = prefix.perCall.reduce<number>((x, g) => x + (g ?? 0), 0);
    expect(sum / prefix.calls).toBeCloseTo(prefix.index, 12);
  });

  it('formation features: a caller who tips the call by formation is more predictable once formation is used', () => {
    const s = stream(seedFromNumber(5), 'test.tell', []);
    const calls: CallRecord[] = situations(1500, 6).map((info) => {
      const run = s.chance(leagueRun(info.down));
      return { info: { ...info, formation: run ? 'i_form' : 'trips' }, category: run ? 'run' : 'pass' };
    });
    const without = predictability(calls, league, opt, MATH);
    const withF = predictability(calls, league, { ...opt, withFormation: true }, MATH);
    expect(withF.index).toBeGreaterThan(without.index + 0.2);
  });

  it('edge cases: forced calls (kneel-downs, late desperation) are excluded', () => {
    const base = situations(3, 7);
    const calls: CallRecord[] = [
      { info: base[0]!, category: 'run', forced: true },
      { info: { ...base[1]!, gameSecondsLeft: 60, scoreDiff: -14 }, category: 'pass' },
      { info: base[2]!, category: 'run' },
    ];
    expect(isForced(calls[0]!)).toBe(true);
    expect(isForced(calls[1]!)).toBe(true);
    const r = predictability(calls, league, opt, MATH);
    expect(r.calls).toBe(1);
    expect(r.excluded).toBe(2);
  });

  it('deterministic, and unknown categories are refused', () => {
    const calls = caller(300, 8, (i) => leagueRun(i.down));
    expect(predictability(calls, league, opt, MATH)).toEqual(predictability(calls, league, opt, MATH));
    expect(() => predictability([{ info: situations(1, 9)[0]!, category: 'punt' }], league, opt, MATH)).toThrow();
  });

  it('categories of G8.2.1 and situation keys', () => {
    expect(OFFENSE_CATEGORIES).toHaveLength(15);
    expect(DEFENSE_CATEGORIES).toHaveLength(8);
    const i = situations(1, 10)[0]!;
    expect(situationKey(i)).toBe(situationKey({ ...i, formation: 'x', personnel: '11' }));
    expect(() => ParamFile.parse(PARAMS)).not.toThrow();
  });
});
