// Regression tests for engine bugs found by module testing. Each test names the report it came from.
import { describe, expect, it } from 'vitest';
import { Contract } from '@gm/engine-core';
import { overtime as realOvertime } from '@gm/officiating';
import { chartDecider, fakeGame, type FakeGameOptions, type FakeOutcome, type FakeScript } from './fakes.ts';
import { eventsOfType, runChecked } from './harness.ts';

const QUIET: Partial<FakeOutcome> = { kind: 'run', yards: 1, oob: false, foul: null, injury: false, reviewWrong: false, liveTenths: 40 };
const scoreless: FakeScript = (_sit, calls) => (calls.snapping.unit === 'kick' ? { good: false, ret: 0, yards: 40, foul: null, injury: false } : { ...QUIET, kind: 'incomplete' });
const tieThen = (overtime: FakeScript): FakeScript => (sit, calls) => (sit.overtime ? overtime(sit, calls) : scoreless(sit, calls));

/**
 * The overtime rules of @gm/officiating in place of the fake ones. They fill a restart only when they are
 * handed a RulingContext (a spot needs the field), which the fake rules never asked for.
 */
const withRealOvertime: FakeGameOptions['officiating'] = (fake) => ({ ...fake, overtime: realOvertime.createOvertimeRules(fake.restarts) });
/** By-game overtime keys the real module reads. FIXTURE values where the rule-set file on this branch lacks the key. */
const OT_KEYS = (timeouts: number, maxPeriods: number) => Object.fromEntries((['regular', 'postseason'] as const).flatMap((g) => [
  [`overtime.${g}.max_periods`, g === 'regular' ? maxPeriods : 0], [`overtime.${g}.timeouts`, timeouts], [`overtime.${g}.periods_per_half`, 2],
  [`overtime.${g}.new_toss_after_periods`, 0], [`overtime.${g}.loser_chooses_at_period`, 0],
]));

describe('overtime starts with the real overtime rules (PR 132 and PR 140: every game that reached the overtime toss threw)', () => {
  it('timed period: the toss leads to a kickoff by the team that did not get first possession', () => {
    const game = fakeGame({
      seed: 2, officiating: withRealOvertime, rulesOver: OT_KEYS(2, 1),
      script: tieThen((_sit, calls) => (calls.snapping.unit === 'kick' ? { yards: 60, ret: 10 } : { ...QUIET, yards: 200 })),
    });
    const r = runChecked(game);
    expect(r.problems).toEqual([]);
    const toss = eventsOfType(r.result.events, 'toss').find((e) => e.tossIndex === 1)!;
    expect(toss).toBeDefined();
    const ot = r.result.records.filter((x) => x.situation.overtime);
    expect(ot.map((x) => x.situation.playKind).slice(0, 2)).toEqual(['kickoff', 'scrimmage']);
    const first = r.result.final.overtime!.firstPossession;
    expect(ot[0]!.situation.offense).toBe(Contract.otherSide(first));
    expect(r.result.final.phase).toBe('final');
    expect(r.result.events[r.result.events.length - 1]).toMatchObject({ type: 'game_final' });
  });

  it('alternating series: the toss leads to a series from the rule yard line, and a tied period leads to another', () => {
    const base = 'college_2026' as const;
    const periods = fakeGame({ base }).rules.num('clock.periods');
    let secondPeriodFirstDrive = 0;
    // Period 1: both teams score a touchdown and the try. Period 2: the first team to play scores, the other fails on downs.
    const script = tieThen((sit) => {
      if (sit.playKind === 'try') return { good: true, defenseScoresOnTry: false, foul: null, injury: false };
      if (sit.period === periods + 1) return { ...QUIET, yards: 200 };
      if (secondPeriodFirstDrive === 0) secondPeriodFirstDrive = sit.driveNumber;
      return sit.driveNumber === secondPeriodFirstDrive ? { ...QUIET, yards: 200 } : { ...QUIET, kind: 'incomplete' };
    });
    const game = fakeGame({
      base, seed: 2, script, officiating: withRealOvertime, rulesOver: OT_KEYS(1, 0),
      deciders: (env, input) => [0, 1].map((side) => {
        const inner = chartDecider(side as Contract.Side, env, input);
        return { side: inner.side, decide(v: Contract.DecisionView) {
          const d = inner.decide(v);
          return d && v.request.type === 'snapping_call' && v.situation.overtime && v.situation.playKind === 'scrimmage' ? inner.decide({ ...v, situation: { ...v.situation, down: 1 } }) : d;
        } };
      }) as [Contract.Decider, Contract.Decider],
    });
    const r = runChecked(game);
    expect(r.problems).toEqual([]);
    const ot = r.result.records.filter((x) => x.situation.overtime);
    const yard = game.rules.num('overtime.series_start_yardline');
    const starts = ot.filter((x, i) => x.situation.playKind === 'scrimmage' && (i === 0 || ot[i - 1]!.situation.driveNumber !== x.situation.driveNumber));
    expect(starts.length).toBe(4);
    for (const s of starts) expect(Contract.yardsToGoal(game.deps.geometry, s.situation.ballX, s.situation.attackDir)).toBeCloseTo(yard, 9);
    // The order of the series alternates from one period to the next (B13.7.1).
    const p1 = ot.filter((x) => x.situation.period === periods + 1), p2 = ot.filter((x) => x.situation.period === periods + 2);
    expect(p2[0]!.situation.offense).toBe(Contract.otherSide(p1[0]!.situation.offense));
    expect(r.result.final).toMatchObject({ phase: 'final', period: periods + 2 });
    expect(r.result.events[r.result.events.length - 1]).toMatchObject({ type: 'game_final', tie: false });
  });
});
