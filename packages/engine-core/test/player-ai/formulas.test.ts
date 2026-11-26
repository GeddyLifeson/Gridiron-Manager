import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ParamFile, RuleKeyManifest } from '@gm/schema';
import {
  ERROR_FORMS, MOTIVES, MatchupMemory, PARAMS, RULE_KEYS, SELF_FORMS, TRIGGER_DEFS, accidentChance, buyInFactor, composureMult, confidence,
  correctionChance, commQuality, effortLevel, effortMean, effortNow, errorChances, experienceFactor, foulThreshold, gambleThreshold,
  interferenceCostEst, passesGate, scrambleRuleChance, selfWeight, situationMissChance, type ErrorInputs,
} from '../../src/player-ai/index.ts';
import { P, mind } from './helpers.ts';

const BASE: ErrorInputs = {
  knowledge: 100, difficulty: 1, changedAtLine: false, noiseFactor: 1, assignmentDiscipline: 50, temptation: 1, buyIn: 60,
  complexity: 0, fatigue: 0, footballIntelligence: 50, composure: 50, pressure: 0, highLeverageSnaps: 200,
};
const chances = (over: Partial<ErrorInputs>): [number, number] => { const out = new Float64Array(2); errorChances({ ...BASE, ...over }, P, out); return [out[0]!, out[1]!]; };

describe('player AI parameter file and rule keys', () => {
  it('is a valid parameter file with unique names', () => {
    expect(() => ParamFile.parse(PARAMS)).not.toThrow();
    expect(new Set(PARAMS.params.map((x) => x.name)).size).toBe(PARAMS.params.length);
  });
  it('lists every constant with its leaf, and nothing claims a real-world source (K1.7.8 acceptance)', () => {
    for (const row of PARAMS.params) { expect(row.leaf).toMatch(/^[A-Z]\d+\.\d+\.\d+$/); expect(['bible', 'assumption']).toContain(row.basis); expect(row.value).toBeGreaterThanOrEqual(row.min); expect(row.value).toBeLessThanOrEqual(row.max); }
    for (const leaf of ['K1.7.2', 'K1.7.3', 'K1.7.4', 'K1.7.5']) expect(PARAMS.params.some((x) => x.leaf === leaf)).toBe(true);
  });
  it('reads only rule keys that exist in the rule dictionary', () => {
    expect(() => RuleKeyManifest.parse(RULE_KEYS)).not.toThrow();
    const dictionary = JSON.parse(readFileSync(new URL('../../../rules-data/data/keys.json', import.meta.url), 'utf8')) as unknown;
    const text = JSON.stringify(dictionary);
    for (const k of RULE_KEYS) expect(text).toContain(`"${k.key}"`);
  });
});

describe('K1.2.1 effort', () => {
  it('gives motor z +2 a mean of 1.00 and z -2 a mean of 0.94', () => {
    expect(effortMean(mind({ motor: 70 }), 0, false, P)).toBeCloseTo(1, 12);
    expect(effortMean(mind({ motor: 30 }), 0, false, P)).toBeCloseTo(0.94, 12);
  });
  it('lowers the mean in a second-half blowout only for low competitiveness, and under an effort-drop stress breakpoint', () => {
    const base = effortMean(mind(), 0, false, P);
    expect(effortMean(mind({ competitiveness: 20 }), 24, true, P)).toBeCloseTo(base - 0.02, 12);
    expect(effortMean(mind({ competitiveness: 20 }), -24, true, P)).toBeCloseTo(base - 0.02, 12);
    expect(effortMean(mind({ competitiveness: 20 }), 24, false, P)).toBe(base);
    expect(effortMean(mind({ competitiveness: 60 }), 24, true, P)).toBe(base);
    expect(effortMean(mind({ stressEffortDrop: true }), 0, false, P)).toBeCloseTo(base - 0.03, 12);
    expect(effortMean(mind({ effortNeed: true }), 0, false, P)).toBeGreaterThan(base);
  });
  it('stays in 0.80 to 1.00, is floored at 0.97 at the point of attack, and drops with fatigue only away from it', () => {
    for (const eps of [-9, -1, 0, 1, 9]) { const e = effortLevel(0.9, eps, P); expect(e).toBeGreaterThanOrEqual(0.8); expect(e).toBeLessThanOrEqual(1); }
    expect(effortNow(0.85, true, 1, P)).toBe(0.97);
    expect(effortNow(0.99, true, 1, P)).toBe(0.99);
    expect(effortNow(0.99, false, 1, P)).toBeCloseTo(0.93, 12);
    expect(effortNow(0.99, false, 0, P)).toBe(0.99);
  });
});

describe('J4.5.2 error chances', () => {
  it('matches D9.4.1: knowledge 100 gives 0, 80 gives 2 percent, 60 gives 8 percent, 40 gives 18 percent', () => {
    expect(chances({ knowledge: 100 })[0]).toBe(0);
    expect(chances({ knowledge: 80 })[0]).toBeCloseTo(0.02, 12);
    expect(chances({ knowledge: 60 })[0]).toBeCloseTo(0.08, 12);
    expect(chances({ knowledge: 40 })[0]).toBeCloseTo(0.18, 12);
    expect(chances({ knowledge: 60, changedAtLine: true, difficulty: 1.6, noiseFactor: 1.2 })[0]).toBeCloseTo(0.08 * 1.3 * 1.6 * 1.2, 12);
  });
  it('matches D4.2.1: 1.5 percent at discipline 50, the stated ratio from 40 to 70, the floor, temptation and buy-in', () => {
    expect(chances({})[1]).toBeCloseTo(0.015, 12);
    expect(chances({ assignmentDiscipline: 40 })[1] / chances({ assignmentDiscipline: 70 })[1]).toBeCloseTo(1.2 / 0.6, 12);
    expect(chances({ assignmentDiscipline: 40 })[0]).toBe(chances({ assignmentDiscipline: 70 })[0]);
    expect(chances({ assignmentDiscipline: 99 })[1]).toBeCloseTo(0.002, 12);
    expect(chances({ temptation: 3 })[1]).toBeCloseTo(0.045, 12);
    expect(buyInFactor(60, P)).toBe(1); expect(buyInFactor(100, P)).toBeCloseTo(0.8, 12); expect(buyInFactor(0, P)).toBeCloseTo(1.3, 12);
  });
  it('applies the engine multipliers to both kinds and caps the sum at 0.6', () => {
    const [k, d] = chances({ knowledge: 60, complexity: 1, fatigue: 1 });
    expect(k).toBeCloseTo(0.08 * 2 * 2, 12); expect(d).toBeCloseTo(0.015 * 2 * 2, 12);
    expect(chances({ knowledge: 60, footballIntelligence: 70 })[0]).toBeCloseTo(0.08 * 0.9, 12);
    expect(chances({ knowledge: 60, footballIntelligence: 0 })[0]).toBeCloseTo(0.08 * 1.2, 12);
    const [k2, d2] = chances({ knowledge: 0, complexity: 1, fatigue: 1, temptation: 3 });
    expect(k2 + d2).toBeCloseTo(0.6, 12);
  });
  it('computes the D4.3.1 composure multiplier: none at 50, +8 percent at 30 and -12 percent at 80 under full pressure for a new player', () => {
    expect(composureMult(1, 50, 0, P)).toBe(1);
    expect(composureMult(1, 30, 0, P)).toBeCloseTo(1.08, 12);
    expect(composureMult(1, 80, 0, P)).toBeCloseTo(0.88, 12);
    expect(experienceFactor(0, P)).toBe(1); expect(experienceFactor(200, P)).toBeCloseTo(0.6, 12); expect(experienceFactor(900, P)).toBeCloseTo(0.6, 12);
  });
});

describe('K1.7.4 self weight and K1.3.1 threshold', () => {
  it('computes wSelf from ego, team orientation, need and buy-in, clipped to 0 to 0.8', () => {
    expect(selfWeight(mind(), P)).toBeCloseTo(0.1, 12);
    expect(selfWeight(mind({ ego: 100, teamOrientation: 0, needSelf: 1, buyIn: 20 }), P)).toBe(0.8);
    expect(selfWeight(mind({ ego: 75 }), P)).toBeCloseTo(0.35, 12);
    expect(selfWeight(mind({ teamOrientation: 100 }), P)).toBe(0);
    expect(selfWeight(mind({ needSelf: 1 }), P)).toBeCloseTo(0.25, 12);
    expect(selfWeight(mind({ buyIn: 20 }), P)).toBeCloseTo(0.2, 12);
  });
  it('holds a real imported person at the base weight whatever his trait block says (X14)', () => {
    expect(selfWeight(mind({ neutralBlock: true, ego: 100, teamOrientation: 0, needSelf: 1 }), P)).toBeCloseTo(0.1, 12);
  });
  it('keeps the threshold in 0.55 to 0.90, lower for risk takers, higher under instruction and for the last line of defense', () => {
    expect(gambleThreshold(mind({ riskTolerance: 100 }), 50, undefined, false, false, P)).toBeCloseTo(0.55, 12);
    expect(gambleThreshold(mind({ riskTolerance: 0 }), 50, undefined, false, false, P)).toBeCloseTo(0.9, 12);
    const base = gambleThreshold(mind(), 50, undefined, false, false, P);
    expect(gambleThreshold(mind(), 50, { stayOnTop: true }, false, false, P)).toBeCloseTo(base + 0.1, 12);
    expect(gambleThreshold(mind(), 50, undefined, false, true, P)).toBeCloseTo(base + 0.15, 12);
    // K1.7.4 rule 6 and K1.7.5 edge case: "no freelancing" raises the bar less for a team-minded adjustment.
    const self = gambleThreshold(mind(), 50, { noFreelancing: true }, false, false, P), team = gambleThreshold(mind(), 50, { noFreelancing: true }, true, false, P);
    expect(self).toBeGreaterThan(team); expect(team).toBeGreaterThan(base);
    expect(confidence(9, 99, 9, 1, true, P)).toBe(0.95); expect(confidence(0, 0, 0, 0, false, P)).toBe(0.05);
  });
  it('gates the veteran adjustment at knowledge 85, intelligence z +0.5 and two seasons in the system', () => {
    expect(passesGate(85, 55, 2, P)).toBe(true);
    expect(passesGate(84, 55, 2, P)).toBe(false); expect(passesGate(85, 54, 2, P)).toBe(false); expect(passesGate(85, 55, 1, P)).toBe(false);
  });
});

describe('K1.3.3 deliberate foul arithmetic', () => {
  it('costs more under a spot foul than under a capped one, and the threshold rises with discipline and falls with competitiveness', () => {
    const spot = interferenceCostEst(40, 60, true, 0, 0, true, P), capped = interferenceCostEst(40, 60, true, 0, 15, true, P);
    expect(spot).toBeCloseTo(40 * 0.07 + 0.5, 12); expect(capped).toBeCloseTo(15 * 0.07 + 0.5, 12);
    // In the end zone a spot foul puts the ball at the 1.
    expect(interferenceCostEst(30, 25, true, 0, 0, true, P)).toBeCloseTo(24 * 0.07 + 0.5, 12);
    const t = foulThreshold(mind(), undefined, P);
    expect(t).toBeCloseTo(1.75, 12);
    expect(foulThreshold(mind({ discipline: 90 }), undefined, P)).toBeGreaterThan(t);
    expect(foulThreshold(mind({ competitiveness: 90 }), undefined, P)).toBeLessThan(t);
    expect(foulThreshold(mind({ discipline: 100, competitiveness: 0 }), undefined, P)).toBe(3);
    expect(foulThreshold(mind({ discipline: 0, competitiveness: 100 }), undefined, P)).toBe(0.5);
    expect(foulThreshold(mind(), { deliberateFouls: 1 }, P)).toBeCloseTo(t + 1, 12);
    expect(foulThreshold(mind(), { deliberateFouls: -1 }, P)).toBeCloseTo(t - 1, 12);
  });
});

describe('K1.7.2 and K1.7.3 chances', () => {
  it('is the base 2 percent with every multiplier at 1, capped at 15 percent, and moves the stated ways', () => {
    expect(accidentChance(2, 0, false, 0, 1, P)).toBeCloseTo(0.02, 12);
    expect(accidentChance(0, 0, false, 0, 1, P)).toBeCloseTo(0.03, 12);
    expect(accidentChance(9, 0, false, 0, 1, P)).toBeCloseTo(0.02, 12);
    expect(accidentChance(0, 1, true, 2, 1, P)).toBeCloseTo(0.03 * 2 * 1.5 * 1.6, 12);
    expect(accidentChance(-2, 1, true, 9, 1.08, P)).toBe(0.15);
    expect(accidentChance(1, 0.5, false, 0, 1, P)).toBeGreaterThan(accidentChance(1, 0, false, 0, 1, P));
    expect(accidentChance(1, 0, false, 0, 1, P)).toBeLessThan(accidentChance(-1, 0, false, 0, 1, P));
  });
  it('computes the situational miss chance of rule 2', () => {
    expect(situationMissChance(1, 4, 50, false, 1, P)).toBeCloseTo(0.02, 12);
    expect(situationMissChance(0, 4, 50, false, 1, P)).toBeCloseTo(0.27, 12);
    expect(situationMissChance(1, 0, 50, false, 1, P)).toBeCloseTo(0.08, 12);
    expect(situationMissChance(1, 4, 70, false, 1, P)).toBeCloseTo(0.005, 12);
    expect(situationMissChance(0, 0, 0, false, 1, P)).toBeCloseTo(0.43, 12);
    expect(situationMissChance(0, 4, 50, true, 1, P)).toBeCloseTo(0.22, 12);
    expect(situationMissChance(0, 4, 50, false, 1.08, P)).toBeCloseTo(0.27 * 1.08, 12);
  });
});

describe('K1.4.1 matchup learning', () => {
  it('builds a read against a rusher who uses one move, half the effect at 6 reps, scaled by football intelligence', () => {
    const m = new MatchupMemory();
    let last = 0;
    for (let rep = 1; rep <= 12; rep++) {
      m.record(1, 2, 'passBlock', 'spin');
      const r = m.read(1, 2, 'passBlock', 'spin', 70, P);
      expect(r).toBeGreaterThan(last); last = r;
      if (rep === 6) expect(r).toBeCloseTo(0.25 / 2, 12);
    }
    expect(m.read(1, 2, 'passBlock', 'spin', 30, P)).toBe(0);
    expect(m.read(1, 2, 'passBlock', 'spin', 50, P)).toBeCloseTo(last / 2, 12);
    expect(m.read(1, 2, 'passBlock', 'rip', 70, P)).toBeCloseTo(-last, 12); // the counter, set up
  });
  it('gives little away to a rusher who alternates two moves, and nothing on a substitute', () => {
    const m = new MatchupMemory();
    let total = 0;
    for (let rep = 0; rep < 12; rep++) {
      const move = rep % 2 === 0 ? 'spin' : 'rip';
      total += m.read(1, 2, 'passBlock', move, 70, P);
      m.record(1, 2, 'passBlock', move);
    }
    expect(Math.abs(total / 12)).toBeLessThan(0.02);
    expect(m.read(1, 3, 'passBlock', 'spin', 70, P)).toBe(0);
    expect(m.reps(1, 3, 'passBlock')).toBe(0);
  });
  it('carries a quarter of the counts to the next meeting', () => {
    const m = new MatchupMemory();
    for (let rep = 0; rep < 8; rep++) m.record(1, 2, 'passBlock', 'spin');
    const next = m.carryOver(P);
    expect(next.reps(1, 2, 'passBlock')).toBe(2);
    expect(next.read(1, 2, 'passBlock', 'spin', 70, P)).toBeCloseTo(0.25 * 2 / 8, 12);
    expect(next.strongest(1, 2, 'passBlock', 70, P)).toBeCloseTo(0.25 * 2 / 8, 12);
  });
});

describe('K1.5.1 and K1.3.2 formulas', () => {
  it('rates a communicator by skill, noise and tempo, and gives him more chance to fix a teammate with more play clock', () => {
    expect(commQuality(50, 50, 0, 0, P)).toBeCloseTo(0.5, 12);
    expect(commQuality(80, 50, 0, 0, P)).toBeGreaterThan(commQuality(50, 50, 0, 0, P));
    expect(commQuality(50, 50, 1, 0, P)).toBeLessThan(commQuality(50, 50, 0, 0, P));
    expect(commQuality(50, 50, 0, 1, P)).toBeLessThan(commQuality(50, 50, 0, 0, P));
    expect(correctionChance(1, 10, P)).toBeCloseTo(0.6, 12); expect(correctionChance(1, 5, P)).toBeCloseTo(0.3, 12); expect(correctionChance(0, 10, P)).toBe(0);
    expect(scrambleRuleChance(1, P)).toBeCloseTo(0.98, 12); expect(scrambleRuleChance(0, P)).toBeCloseTo(0.1, 12);
  });
});

describe('content tables', () => {
  it('gives every behavior of the J4.5.3 list at least three error forms with positive weights (acceptance)', () => {
    for (const b of ['route', 'passSet', 'runBlock', 'runFit', 'zoneDrop', 'deepZone', 'manCover', 'blitz', 'passRush'] as const) {
      const list = ERROR_FORMS[b]!;
      expect(list.length).toBeGreaterThanOrEqual(3);
      expect(new Set(list.map((x) => x.form)).size).toBe(list.length);
      for (const x of list) expect(x.weight).toBeGreaterThan(0);
    }
  });
  it('names a producing leaf and one kind for every motive, and covers the K1.7.4 forms', () => {
    for (const m of Object.values(MOTIVES)) { expect(['accident', 'didNotKnow', 'forSelf', 'forTeam']).toContain(m.kind); expect(m.leaf).toMatch(/^[JK]\d+\.\d+\.\d+$/); }
    expect(SELF_FORMS.stats.rush![0]!.form).toBe('leftRushLaneForSack');
    expect(SELF_FORMS.touches.carry![0]!.form).toBe('bouncedOutside');
    expect(SELF_FORMS.protest.route![0]!.form).toBe('didNotBlock');
  });
  it('lists the in-play acts in the arbiter order of K1.7.1 rule 3', () => {
    const leaves = TRIGGER_DEFS.map((d) => d.leaf);
    expect(leaves).toEqual([...leaves].sort((a, b) => ['K1.7.5', 'K1.3.1', 'K1.7.4'].indexOf(a) - ['K1.7.5', 'K1.3.1', 'K1.7.4'].indexOf(b)));
  });
});
