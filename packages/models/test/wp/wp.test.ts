// N2.2.2 (win probability). Each test names the leaf it covers.
import { describe, expect, it } from 'vitest';
import { ParamFile, RuleKeyManifest } from '@gm/schema';
import { KEY_DICTIONARY } from '@gm/rules-data';
import {
  fitWpModel, loadWpModel, wp, wpa, optionWp, canKneelOut, calibrationBands, wpRuleValues, WpModelError, PARAMS, RULE_KEYS,
} from '../../src/wp/index.ts';
import { MATH, baselineEp, baselineWp, fixtureRules, syntheticWpRows, wpState } from '../helpers/fixtures.ts';

const model = baselineWp();

describe('N2.2.2 the win probability model', () => {
  it('acceptance: a kneel-down state with a lead and no opponent timeouts returns at least 0.99', () => {
    const s = wpState({ scoreDiff: 3, gameSecondsLeft: 80 }, { down: 1, yardsToGoalYd: 60, timeoutsDefense: 0 });
    const v = wp(model, s, MATH);
    expect(v.value).toBeGreaterThanOrEqual(0.99);
    expect(v.ruled).toBe('kneel_out');
    // With timeouts left the defense can stop the clock: the fitted model answers instead.
    const withTimeouts = wp(model, { ...s, field: { ...s.field, timeoutsDefense: 3 } }, MATH);
    expect(withTimeouts.ruled).toBeNull();
    // Trailing, or in the first half, the rule never applies.
    expect(canKneelOut({ ...s, scoreDiff: -3 }, model.file.rules)).toBe(false);
    expect(canKneelOut({ ...s, firstHalf: true }, model.file.rules)).toBe(false);
    // Backed up to the own goal line a kneel risks a safety, so it is not ruled certain.
    expect(canKneelOut({ ...s, field: { ...s.field, yardsToGoalYd: 99 } }, model.file.rules)).toBe(false);
  });

  it('acceptance: calibration, states predicted in every 5-point band are won at that band’s rate (held-out simulated games)', () => {
    const train = syntheticWpRows(model, 60000, 31);
    const hold = syntheticWpRows(model, 60000, 32);
    const fitted = loadWpModel(fitWpModel(train, baselineEp(), fixtureRules(), { version: 't.1', trainedOn: 'synthetic' }, MATH), baselineEp());
    const bands = calibrationBands(hold.map((r) => wp(fitted, r.state, MATH).value), hold.map((r) => r.result));
    expect(bands).toHaveLength(20);
    for (const b of bands) {
      if (b.n < 200) continue;
      const se = Math.sqrt(b.meanPredicted * (1 - b.meanPredicted) / b.n);
      expect(b.observed, `band ${b.lo.toFixed(2)} (n ${b.n})`).toBeGreaterThanOrEqual(b.lo - 3 * se);
      expect(b.observed, `band ${b.lo.toFixed(2)} (n ${b.n})`).toBeLessThanOrEqual(b.hi + 3 * se);
    }
  });

  it('rule 1: win probability never falls as the offense’s lead grows (monotone limit)', () => {
    for (const t of [3500, 1800, 600, 120, 30]) {
      let prev = -1;
      for (let d = -28; d <= 28; d++) {
        const v = wp(model, wpState({ scoreDiff: d, gameSecondsLeft: t }, { timeoutsDefense: 3 }), MATH).value;
        expect(v, `${d} at ${t} s`).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
    }
    for (const t of model.file.monotoneTerms) expect(model.file.beta[model.file.terms.indexOf(t)]!).toBeGreaterThanOrEqual(0);
  });

  it('rule 1: ties count as half a win in training', () => {
    const rows = syntheticWpRows(model, 3000, 41).map((r, i) => (i % 3 === 0 ? { ...r, result: 0.5 } : r));
    const f = fitWpModel(rows, baselineEp(), fixtureRules(), { version: 't.1', trainedOn: 'synthetic' }, MATH);
    expect(f.converged).toBe(true);
  });

  it('rule 2: the pregame gap is a prior that fades as time runs out', () => {
    const gapEffect = (t: number) => wp(model, wpState({ pregameGap: 7, gameSecondsLeft: t }, { timeoutsDefense: 3 }), MATH).value
      - wp(model, wpState({ pregameGap: 0, gameSecondsLeft: t }, { timeoutsDefense: 3 }), MATH).value;
    expect(gapEffect(3500)).toBeGreaterThan(0.1);
    expect(gapEffect(3500)).toBeGreaterThan(gapEffect(1800));
    expect(gapEffect(1800)).toBeGreaterThan(gapEffect(120));
  });

  it('rule 3: WPA is the change in the possessing team’s win probability', () => {
    const before = wpState({ scoreDiff: -3, gameSecondsLeft: 300 });
    const after = wpState({ scoreDiff: -3, gameSecondsLeft: 290 }, { yardsToGoalYd: 50 });
    const v = (s: typeof before) => wp(model, s, MATH).value;
    expect(wpa(model, before, { kind: 'state', after, possessionChanged: false }, MATH)).toBeCloseTo(v(after) - v(before), 12);
    expect(wpa(model, before, { kind: 'state', after, possessionChanged: true }, MATH)).toBeCloseTo(1 - v(after) - v(before), 12);
    expect(wpa(model, before, { kind: 'final', offenseResult: 1 }, MATH)).toBeCloseTo(1 - v(before), 12);
  });

  it('rule 4: an option’s value is the outcome-weighted win probability from the decider’s view', () => {
    const made = wpState({ scoreDiff: 3, gameSecondsLeft: 600 }, { kind: 'kickoff', yardsToGoalYd: 35 });
    const missed = wpState({ scoreDiff: 0, gameSecondsLeft: 600 }, { yardsToGoalYd: 63 });
    const o = optionWp(model, [
      { probability: 0.8, state: made, deciderHasBall: false },
      { probability: 0.2, state: missed, deciderHasBall: false },
    ], MATH);
    const expected = 0.8 * (1 - wp(model, made, MATH).value) + 0.2 * (1 - wp(model, missed, MATH).value);
    expect(o.value).toBeCloseTo(expected, 12);
    expect(o.se).toBeGreaterThan(0);
    expect(optionWp(model, [{ probability: 1, final: 1 }], MATH).value).toBe(1);
    expect(() => optionWp(model, [{ probability: 0.5, final: 1 }], MATH)).toThrow(WpModelError);
  });

  it('edge cases: a finished game is decided by the score; overtime states are valued', () => {
    expect(wp(model, wpState({ scoreDiff: 1, gameSecondsLeft: 0 }), MATH)).toMatchObject({ value: 1, ruled: 'game_over' });
    expect(wp(model, wpState({ scoreDiff: -1, gameSecondsLeft: 0 }), MATH).value).toBe(0);
    expect(wp(model, wpState({ scoreDiff: 0, gameSecondsLeft: 0 }), MATH).value).toBe(0.5);
    const ot = wp(model, wpState({ overtime: true, gameSecondsLeft: 500, scoreDiff: 0 }, { yardsToGoalYd: 30, halfSecondsLeft: 500 }), MATH);
    expect(ot.value).toBeGreaterThan(0.5);
    expect(ot.value).toBeLessThan(1);
  });

  it('outputs: a standard error and support with every value; deterministic', () => {
    const s = wpState({ scoreDiff: 7, gameSecondsLeft: 1200 });
    const a = wp(model, s, MATH), b = wp(model, s, MATH);
    expect(a).toEqual(b);
    expect(a.se).toBeGreaterThan(0);
    expect(a.support).toBeGreaterThan(0);
  });

  it('a model fitted with another expected points model, or with a broken monotone limit, is refused', () => {
    expect(() => loadWpModel({ ...model.file, epModelVersion: 'other' }, baselineEp())).toThrow(WpModelError);
    const beta = [...model.file.beta];
    beta[model.file.terms.indexOf('v:adj')] = -1;
    expect(() => loadWpModel({ ...model.file, beta }, baselineEp())).toThrow(WpModelError);
  });

  it('rule values the model keeps come from the rule set', () => {
    expect(wpRuleValues(fixtureRules())).toEqual({ regulationSeconds: 3600, playClockS: 40, downs: 4 });
  });

  it('D-09 and D-19: the parameter file validates and every rule key is in the dictionary', () => {
    expect(() => ParamFile.parse(PARAMS)).not.toThrow();
    expect(() => RuleKeyManifest.parse(RULE_KEYS)).not.toThrow();
    const keys = new Set(KEY_DICTIONARY.map((k) => k.key));
    for (const k of RULE_KEYS) expect(keys.has(k.key), k.key).toBe(true);
  });
});
