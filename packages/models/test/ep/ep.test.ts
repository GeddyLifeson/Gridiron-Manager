// N2.2.1 (expected points) and N2.2.3 (per-play measures). Each test names the leaf it covers.
import { describe, expect, it } from 'vitest';
import { ParamFile, RuleKeyManifest } from '@gm/schema';
import { KEY_DICTIONARY } from '@gm/rules-data';
import {
  fitEpModel, loadEpModel, ep, epa, epProbabilities, classValues, EpModelError, NEXT_SCORE_CLASSES,
  measurePlays, defaultDefinitions, isSuccess, PARAMS, RULE_KEYS, type EpTrainingRow, type MeasuredPlay,
} from '../../src/ep/index.ts';
import { MATH, baselineEp, fixtureRules, scrimmage, syntheticEpRows } from '../helpers/fixtures.ts';

const fitOpt = { version: 'test.1', trainedOn: 'synthetic', tryValue: 0.95 };

describe('N2.2.1 the expected points model', () => {
  const model = baselineEp();

  it('acceptance 1: first and 10 expected points rise monotonically from the own 1 to the opponent 1', () => {
    for (const halfSecondsLeft of [1500, 900, 400]) {
      let prev = -Infinity;
      for (let yd = 99; yd >= 1; yd--) {
        const v = ep(model, scrimmage({ yardsToGoalYd: yd, distanceYd: Math.min(10, yd), halfSecondsLeft }), MATH).value;
        expect(v, `yard ${yd}, ${halfSecondsLeft} s`).toBeGreaterThan(prev);
        prev = v;
      }
    }
  });

  it('acceptance 2: on held-out simulated games, class shares match within 1 point in every yard-line decile', () => {
    // The baseline model plays the simulated league; a fresh fit on its plays must reproduce it on new plays.
    // The bible sets the limit for 20,000-game batches. A test batch is smaller, so the observed shares are
    // allowed 1 point plus three sampling standard errors, and the fit itself must sit within 1 point of
    // the league's true shares.
    const train = syntheticEpRows(model, 100000, 11);
    const hold = syntheticEpRows(model, 100000, 12).filter((r) => r.state.kind === 'scrimmage');
    const fitted = loadEpModel(fitEpModel(train, fixtureRules(), fitOpt, MATH));
    for (let d = 0; d < 10; d++) {
      const rs = hold.filter((r) => Math.min(9, Math.floor((r.state.yardsToGoalYd - 1) / 10)) === d);
      const pred = new Array<number>(7).fill(0), truth = new Array<number>(7).fill(0), obs = new Array<number>(7).fill(0);
      for (const r of rs) {
        epProbabilities(fitted, r.state, MATH).forEach((x, k) => { pred[k]! += x; });
        epProbabilities(model, r.state, MATH).forEach((x, k) => { truth[k]! += x; });
        obs[r.nextScore]! += 1;
      }
      const n = rs.length;
      for (let k = 0; k < 7; k++) {
        const p = pred[k]! / n;
        const se = Math.sqrt(p * (1 - p) / n);
        expect(Math.abs(p - truth[k]! / n), `decile ${d} ${NEXT_SCORE_CLASSES[k]} against the league`).toBeLessThan(0.01);
        expect(Math.abs(p - obs[k]! / n), `decile ${d} ${NEXT_SCORE_CLASSES[k]} against observed`).toBeLessThan(0.01 + 3 * se);
      }
    }
  });

  it('acceptance 3: changing kickoff outcomes and refitting changes the value of the kickoff state', () => {
    const rows = syntheticEpRows(model, 8000, 21, 0.3);
    const kick = { ...scrimmage(), kind: 'kickoff' as const, halfSecondsLeft: 1700 };
    const a = ep(loadEpModel(fitEpModel(rows, fixtureRules(), fitOpt, MATH)), kick, MATH).value;
    // A kickoff rule that favours the receiving team: half of kickoff drives now end in its touchdown.
    const changed: EpTrainingRow[] = rows.map((r, i) => (r.state.kind === 'kickoff' && i % 2 === 0 ? { ...r, nextScore: 0 } : r));
    const b = ep(loadEpModel(fitEpModel(changed, fixtureRules(), fitOpt, MATH)), kick, MATH).value;
    expect(b).toBeGreaterThan(a + 0.5);
    // Scrimmage states are fitted separately and do not move.
    const s = scrimmage();
    expect(ep(loadEpModel(fitEpModel(changed, fixtureRules(), fitOpt, MATH)), s, MATH).value)
      .toBeCloseTo(ep(loadEpModel(fitEpModel(rows, fixtureRules(), fitOpt, MATH)), s, MATH).value, 12);
  });

  it('rule 2: class values come from the rule set and the model\'s own try value', () => {
    expect(classValues(fixtureRules(), 0.95)).toEqual([6.95, 3, 2, 0, -2, -3, -6.95]);
    expect(classValues(fixtureRules({ 'score.touchdown': 8 }), 1)).toEqual([9, 3, 2, 0, -2, -3, -9]);
    const file = fitEpModel(syntheticEpRows(model, 3000, 5), fixtureRules({ 'score.field_goal': 4 }, 'other_2026'), fitOpt, MATH);
    expect(file.classValues[1]).toBe(4);
    expect(file.ruleSetId).toBe('other_2026');
  });

  it('rule 3: a fit is deterministic, bit for bit', () => {
    const rows = syntheticEpRows(model, 4000, 7);
    const a = fitEpModel(rows, fixtureRules(), fitOpt, MATH);
    const b = fitEpModel(rows, fixtureRules(), fitOpt, MATH);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.scrimmage.converged).toBe(true);
  });

  it('rule 4: EPA is the change in value, sign flipped on a change of possession, class value on a score', () => {
    const before = scrimmage({ yardsToGoalYd: 60 });
    const after = scrimmage({ yardsToGoalYd: 50 });
    const v = (s: typeof before) => ep(model, s, MATH).value;
    expect(epa(model, before, { kind: 'state', after, possessionChanged: false }, MATH)).toBeCloseTo(v(after) - v(before), 12);
    const turnover = scrimmage({ yardsToGoalYd: 40 });
    expect(epa(model, before, { kind: 'state', after: turnover, possessionChanged: true }, MATH)).toBeCloseTo(-v(turnover) - v(before), 12);
    const td = model.file.classValues[0]!;
    expect(epa(model, before, { kind: 'score', scorer: 'offense', score: 'touchdown' }, MATH)).toBeCloseTo(td - v(before), 12);
    expect(epa(model, before, { kind: 'score', scorer: 'defense', score: 'touchdown' }, MATH)).toBeCloseTo(-td - v(before), 12);
    expect(epa(model, before, { kind: 'score', scorer: 'defense', score: 'safety' }, MATH)).toBeCloseTo(-2 - v(before), 12);
  });

  it('rule 5 and outputs: every value carries a standard error and a support count; sparse states are flagged', () => {
    const common = ep(model, scrimmage(), MATH);
    expect(common.support).toBeGreaterThan(30);
    expect(common.sparse).toBe(false);
    expect(common.se).toBeGreaterThan(0);
    const rare = ep(model, scrimmage({ down: 4, distanceYd: 18, yardsToGoalYd: 95, halfSecondsLeft: 60 }), MATH);
    expect(rare.sparse).toBe(true);
    expect(rare.se).toBeGreaterThan(common.se);
    expect(common.probabilities.reduce((a, x) => a + x, 0)).toBeCloseTo(1, 12);
  });

  it('edge case: at the end of the half nothing more can score, so the value is 0', () => {
    const v = ep(model, scrimmage({ halfSecondsLeft: 0, yardsToGoalYd: 2 }), MATH);
    expect(v.value).toBe(0);
    expect(v.probabilities[3]).toBe(1);
  });

  it('a malformed model file is refused', () => {
    expect(() => loadEpModel({ ...model.file, classValues: [1, 2] })).toThrow(EpModelError);
    expect(() => loadEpModel({ ...model.file, scrimmage: { ...model.file.scrimmage, beta: [0] } })).toThrow(EpModelError);
  });

  it('D-09 and D-19: the parameter file validates and every rule key is in the dictionary', () => {
    expect(() => ParamFile.parse(PARAMS)).not.toThrow();
    expect(() => RuleKeyManifest.parse(RULE_KEYS)).not.toThrow();
    const keys = new Set(KEY_DICTIONARY.map((k) => k.key));
    for (const k of RULE_KEYS) expect(keys.has(k.key), k.key).toBe(true);
  });
});

describe('N2.2.3 success rate, explosive plays and the per-play measures', () => {
  const play = (p: Partial<MeasuredPlay>): MeasuredPlay => ({ down: 1, distanceYd: 10, yardsGained: 0, pass: false, epa: 0, kneelOrSpike: false, turnover: false, negative: false, ...p });
  const plays: MeasuredPlay[] = [
    play({ down: 1, yardsGained: 4, epa: -0.1 }),
    play({ down: 2, distanceYd: 6, yardsGained: 4, epa: 0.2 }),
    play({ down: 3, distanceYd: 3, yardsGained: 2, epa: -0.8 }),
    play({ down: 1, yardsGained: 25, pass: true, epa: 1.9 }),
    play({ down: 2, distanceYd: 10, yardsGained: 12, epa: 1.1 }),
    play({ down: 1, yardsGained: -3, negative: true, epa: -0.6 }),
    play({ kneelOrSpike: true, yardsGained: -1, epa: -0.3 }),
  ];

  it('rule 1: the coaching definition uses 40, 60 and 100 percent of the distance', () => {
    const def = defaultDefinitions().success;
    expect(isSuccess(play({ down: 1, yardsGained: 4 }), def)).toBe(true);
    expect(isSuccess(play({ down: 1, yardsGained: 3 }), def)).toBe(false);
    expect(isSuccess(play({ down: 2, distanceYd: 5, yardsGained: 3 }), def)).toBe(true);
    expect(isSuccess(play({ down: 3, distanceYd: 3, yardsGained: 2 }), def)).toBe(false);
    expect(isSuccess(play({ down: 4, distanceYd: 1, yardsGained: 1 }), def)).toBe(true);
  });

  it('acceptance: switching the success definition changes the success column and nothing else', () => {
    const a = measurePlays(plays, defaultDefinitions());
    const b = measurePlays(plays, { ...defaultDefinitions(), success: { kind: 'model' } });
    expect(a.successRate.value).toBeCloseTo(4 / 6, 12);
    expect(b.successRate.value).toBeCloseTo(3 / 6, 12);
    expect({ ...a, successRate: null }).toEqual({ ...b, successRate: null });
  });

  it('rules 2, 3 and edge case: explosive thresholds, sample sizes with greying, kneel-downs excluded', () => {
    const m = measurePlays(plays, defaultDefinitions());
    expect(m.plays).toBe(6);
    expect(m.explosiveRate.value).toBeCloseTo(2 / 6, 12);
    expect(m.explosiveRate.greyed).toBe(true);
    expect(m.negativeRate.n).toBe(6);
    const lower = measurePlays(plays, { ...defaultDefinitions(), explosive: { runYd: 10, passYd: 30 } });
    expect(lower.explosiveRate.value).toBeCloseTo(1 / 6, 12);
  });

  it('rule 5: the garbage-time switch drops plays outside the win probability window', () => {
    const ps = [play({ wp: 0.5, yardsGained: 5 }), play({ wp: 0.02, yardsGained: 50 }), play({ wp: 0.99, yardsGained: 50 })];
    expect(measurePlays(ps, defaultDefinitions()).plays).toBe(3);
    expect(measurePlays(ps, { ...defaultDefinitions(), garbageTimeWp: 0.05 }).plays).toBe(1);
  });
});
