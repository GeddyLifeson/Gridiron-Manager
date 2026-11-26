// I4.1.1 in the pre-snap phase: a kicking unit coming on for fourth down costs its dead-ball-to-set
// time, more when it was not alerted, and the full run-off and run-on after a change of mind, which
// also raises the J5.1.1 substitution hazard. FIXTURE units; the four times are the bible's starting values.
import { describe, expect, it } from 'vitest';
import { planPresnap, presnapParams, substitutionErrorChance, unitLateS, unitSetS, type UnitChange } from '../../src/presnap/index.ts';
import { TABLE, input, offenseInput, ofType, run, tableWith, world } from './support.ts';

const P = presnapParams(TABLE);
const SEEDS = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const unit = (over: Partial<UnitChange> = {}): UnitChange => ({ unit: 'punt', alerted: true, reversed: false, ...over });

describe('I4.1.1 the time a kicking unit takes to come on', () => {
  it('uses the bible starting values: punt 8 s, field goal 9 s, 5 s more when not alerted, 10 s more after a change of mind', () => {
    expect(unitSetS(unit(), P)).toBe(8);
    expect(unitSetS(unit({ unit: 'field_goal' }), P)).toBe(9);
    expect(unitSetS(unit({ alerted: false }), P)).toBe(13);
    expect(unitSetS(unit({ reversed: true }), P)).toBe(18);
    expect(unitSetS(unit({ unit: 'field_goal', alerted: false, reversed: true }), P)).toBe(24);
  });
  it('counts the time already run since the dead ball, and never goes below zero', () => {
    expect(unitSetS(unit({ sinceDeadBallS: 3 }), P)).toBe(5);
    expect(unitSetS(unit({ sinceDeadBallS: 30 }), P)).toBe(0);
  });
  it('holds the snap until the unit is set, whatever the tempo asks for', () => {
    for (const seed of SEEDS(10)) {
      const base = planPresnap(world({ seed }), input({ tempo: 'hurry_up' }));
      expect(base.snapS).toBeLessThan(8);
      for (const u of [unit(), unit({ unit: 'field_goal' }), unit({ alerted: false }), unit({ reversed: true })]) {
        const plan = planPresnap(world({ seed }), input({ tempo: 'hurry_up', unitChange: u }));
        expect(plan.snapS).toBeGreaterThanOrEqual(unitSetS(u, P) - 0.05);
        expect(plan.fouls.some((f) => f.foulId === 'delay_of_game')).toBe(false);
        expect(plan.log.some((e) => e.name.startsWith('kicking_unit_on') && e.status === 'done')).toBe(true);
      }
    }
  });
  it('a later unit leaves less play clock: alerted, then not alerted, then a change of mind', () => {
    const left = (u: UnitChange | null): number => planPresnap(world({ seed: 3 }), input({ tempo: 'hurry_up', unitChange: u })).playClockAtSnapTenths;
    expect(left(unit())).toBeLessThan(left(null));
    expect(left(unit({ alerted: false }))).toBeLessThan(left(unit()));
    expect(left(unit({ reversed: true }))).toBeLessThan(left(unit({ alerted: false })));
    expect(left(unit({ alerted: false, reversed: true }))).toBeLessThan(left(unit({ reversed: true })));
  });
  it('does not move a snap that was already later than the unit', () => {
    const a = planPresnap(world({ seed: 4 }), input({ tempo: 'huddle' })), b = planPresnap(world({ seed: 4 }), input({ tempo: 'huddle', unitChange: unit() }));
    expect(a.snapS).toBeGreaterThan(8);
    expect(b.snapS).toBe(a.snapS);
  });
  it('is delay of game when the unit cannot be set before the play clock runs out (25 s clock, not alerted, change of mind)', () => {
    const u = unit({ unit: 'field_goal', alerted: false, reversed: true });
    const ok = run(input({ playClockStartTenths: 250, unitChange: unit({ unit: 'field_goal' }) }));
    expect(ofType(ok.w, 'snap')).toHaveLength(1);
    const late = run(input({ playClockStartTenths: 200, unitChange: u }));
    expect(ofType(late.w, 'foul_committed').map((x) => x.foulId)).toEqual(['delay_of_game']);
    expect(ofType(late.w, 'snap')).toHaveLength(0);
  });
});

describe('I4.1.1 a change of mind raises the 12-men and substitution hazard', () => {
  it('counts the run-off and run-on as late-call seconds in the J5.1.1 draw, for a reversal only', () => {
    expect(unitLateS(unit(), P)).toBe(0);
    expect(unitLateS(unit({ alerted: false }), P)).toBe(0);
    expect(unitLateS(null, P)).toBe(0);
    expect(unitLateS(unit({ reversed: true }), P)).toBe(10);
    expect(substitutionErrorChance('huddle', 10, 50, P)).toBeGreaterThan(3 * substitutionErrorChance('huddle', 0, 50, P));
  });
  it('produces more missing and extra men over many snaps', () => {
    const big = tableWith({ 'presnap.sub.errorBasePerPlayer': 0.01 });
    const subs = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const errors = (u: UnitChange): number => SEEDS(300).reduce((n, seed) => {
      const plan = planPresnap(world({ seed, params: big }), input({ offense: offenseInput({ substituted: subs }), unitChange: u }));
      return n + plan.missing.length + (plan.fouls.some((f) => f.foulId === 'too_many_in_formation') ? 1 : 0);
    }, 0);
    const calm = errors(unit()), changed = errors(unit({ reversed: true }));
    expect(changed).toBeGreaterThan(calm * 2);
  });
});
