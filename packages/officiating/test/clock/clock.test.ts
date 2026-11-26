// Q1.1.1 rule cases for B1.2 to B1.7, B13.3, J11.4.1 and J11.8.1, and the Q1.2.2 invariants on the
// clock. Each test is named for the bible leaf it covers. Rule values are fixture values, not facts.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ClockResult, GameFlowPhase, ParamFile, PeriodTransition, RuleKeyManifest, type ClockStatus, type PlayOutcome, type RulingContext } from '@gm/schema';
import {
  clockRules, afterPlayWithFacts, advanceBetweenDowns, defenseConservesTime, injuryTimeout, playClockAfterStoppage, settleRunoff,
  PLAY_CLOCK_RUNS, RULE_KEYS, PARAMS, type InjuryTimeoutInput, type StoppageCause,
} from '../../src/clock/index.ts';
import { context, enforcement, fixtureRules, FIXTURE_KEYS, outcomeAt, type Setup } from '../scrimmage/fixtures.ts';

const A = fixtureRules('fixture_a');
const B = fixtureRules('fixture_b');
const SNAP: ClockStatus = 'stopped_start_on_snap';
const READY: ClockStatus = 'stopped_start_on_ready';
const s = (min: number, sec = 0) => (min * 60 + sec) * 10;

/** A down of `live` seconds from the given state, ending with a runner down in bounds unless `over` says otherwise. */
function after(setup: Setup, over: Partial<PlayOutcome> = {}, live = 6, on = 28) {
  const ctx = context({ ballOn: 25, ...setup });
  return clockRules.afterPlay(outcomeAt(ctx, on, over), live * 10, ctx);
}
const OOB = { endedOutOfBounds: true, runnerDownInBounds: false };
const INC = { incomplete: true, runnerDownInBounds: false, resultType: 'pass_incomplete' as const };
const FOUL = { enforcement: enforcement({ yardsWalked: -5 }) };

describe('clock module contract', () => {
  it('declares a valid rule-key manifest and parameter file, and reads only declared keys', () => {
    expect(() => RuleKeyManifest.parse(RULE_KEYS)).not.toThrow();
    expect(() => ParamFile.parse(PARAMS)).not.toThrow();
    for (const k of RULE_KEYS) expect(FIXTURE_KEYS).toContain(k.key);
  });
});

describe('B1.2.1 clock state machine', () => {
  it('a stopped clock starts at the snap; a try and an untimed down are never timed', () => {
    for (const st of ['running', SNAP, READY] as const) expect(clockRules.atSnap(s(5), st, context())).toBe('running');
    expect(clockRules.atSnap(s(5), SNAP, context({ playKind: 'try' }))).toBe('untimed');
    expect(clockRules.atSnap(0, SNAP, context({ untimedDown: true }))).toBe('untimed');
    expect(clockRules.atSnap(0, 'intermission', context())).toBe('intermission');
  });
  it('the clock never runs during a try', () => {
    const r = after({ playKind: 'try', clockS: 300, clockStatus: 'untimed' }, { resultType: 'try_failed' });
    expect(r).toMatchObject({ clockTenths: s(5), status: SNAP, periodExpired: false, playClockTenths: 250 });
  });
  it('rule 3: a runner down in bounds with no foul keeps the clock running, and the full play clock starts', () => {
    expect(after({ clockS: 600 })).toEqual({ clockTenths: s(9, 54), status: 'running', playClockTenths: 400, periodExpired: false, untimedDown: false, twoMinuteStop: false, runoff: null });
  });
});

describe('B1.2.2 what stops the clock', () => {
  it('(c) the ball out of bounds', () => expect(after({}, OOB).status).toBe(READY));
  it('(d) the ball dead on or behind a goal line: score and touchback', () => {
    expect(after({}, { score: { type: 'touchdown', side: 0, points: 6, scorerId: 22 }, runnerDownInBounds: false }).status).toBe('untimed');
    expect(after({}, { score: { type: 'safety', side: 1, points: 2, scorerId: null }, runnerDownInBounds: false }).status).toBe(SNAP);
    expect(after({}, { touchback: true, possessionAfter: 1, changeOfPossession: true, runnerDownInBounds: false }).status).toBe(SNAP);
  });
  it('(e) the end of a down during which a foul occurs', () => expect(after({}, FOUL).status).toBe(READY));
  it('(f) an incomplete pass, which restarts on the snap', () => expect(after({}, INC).status).toBe(SNAP));
  it('(g) a foul for which the ball stays dead', () => {
    expect(after({ clockStatus: 'running' }, { noPlay: true, resultType: 'no_play', ...FOUL }, 0).status).toBe(READY);
    expect(after({ clockStatus: SNAP }, { noPlay: true, resultType: 'no_play', ...FOUL }, 0).status).toBe(SNAP);
  });
  it('(h) the two-minute warning', () => expect(after({ period: 2, clockS: 125 })).toMatchObject({ twoMinuteStop: true, status: SNAP }));
  it('(i) a down with a change of possession, a failed last down included', () => {
    expect(after({}, { possessionAfter: 1, changeOfPossession: true, resultType: 'interception' })).toMatchObject({ status: SNAP, playClockTenths: 250 });
    expect(after({ down: 4 })).toMatchObject({ status: SNAP, playClockTenths: 250 });
  });
  it('(a) a down with a free kick or a scrimmage kick', () => {
    for (const resultType of ['kickoff', 'punt', 'field_goal_missed', 'safety_kick', 'fair_catch_kick'] as const) expect(after({}, { resultType }).status).toBe(SNAP);
  });
  it('(j) an injury timeout restarts as if it had not occurred (B1.5.1 rule 3)', () => {
    expect(after({}, { injuryStoppage: [22] }).status).toBe(READY);
    expect(after({}, { ...INC, injuryStoppage: [22] }).status).toBe(SNAP);
  });
  it('a first down gained in bounds with no other condition leaves the clock running', () => {
    expect(after({ down: 3, toGo: 2 }, {}, 6, 40).status).toBe('running');
  });
  it('a sack in bounds does not stop the clock', () => expect(after({}, { resultType: 'sack' }, 4, 18).status).toBe('running'));
});

describe('B1.2.3 restart on the snap or on the ready signal: table of states', () => {
  // Expected modes are written from the rule text, one function per stop reason, independent of the module.
  const periods = [1, 2, 3, 4];
  const clocks = [s(14), s(5, 1), s(5), s(3), s(2), s(1)];
  type Reason = 'out_of_bounds' | 'incomplete' | 'foul' | 'change_of_possession' | 'in_bounds';
  const overs: Record<Reason, Partial<PlayOutcome>> = {
    out_of_bounds: OOB, incomplete: INC, foul: FOUL, change_of_possession: { possessionAfter: 1, changeOfPossession: true }, in_bounds: {},
  };
  const afterWarning = (period: number, end: number) => period === 2 && end <= s(2);
  const lastFive = (period: number, end: number) => period === 4 && end <= s(5);
  const expected: Record<Reason, (period: number, end: number) => ClockStatus> = {
    out_of_bounds: (p, e) => (afterWarning(p, e) || lastFive(p, e) ? SNAP : READY),
    incomplete: () => SNAP,
    foul: (p, e) => (afterWarning(p, e) || lastFive(p, e) ? SNAP : READY),
    change_of_possession: () => SNAP,
    in_bounds: () => 'running',
  };
  let count = 0;
  for (const reason of Object.keys(overs) as Reason[]) for (const period of periods) for (const end of clocks) {
    count += 1;
    it(`${reason}, period ${period}, down ends at ${end / 10} s`, () => {
      // The down starts 6 s earlier. In periods 2 and 4 a state past the warning is entered with the flag already set.
      const inside = (period === 2 || period === 4) && end + 60 <= s(2);
      const r = after({ period, clockS: end / 10 + 6, insideTwoMinute: inside }, overs[reason]);
      expect(r.clockTenths).toBe(end);
      // The warning itself stops the clock and restarts on the snap (B1.4.4), whatever else happened.
      const want = r.twoMinuteStop ? SNAP : expected[reason](period, end);
      expect(r.status).toBe(want);
    });
  }
  it('covers at least 60 states', () => expect(count).toBeGreaterThanOrEqual(60));
  it('edge case: out of bounds with 5:01 left in the fourth quarter is the ready signal, with 5:00 the snap', () => {
    expect(after({ period: 4, clockS: 307 }, OOB).status).toBe(READY);
    expect(after({ period: 4, clockS: 306 }, OOB).status).toBe(SNAP);
  });
  it('exception 4: after a change of possession a runner out of bounds restarts on the snap', () => {
    expect(after({ period: 1 }, { ...OOB, possessionAfter: 1, changeOfPossession: true }).status).toBe(SNAP);
  });
  it('exception 5: a fumble or backward pass out of bounds restarts on the ready signal, even late', () => {
    const ctx = context({ period: 4, clockS: 60, insideTwoMinute: true });
    const o = outcomeAt(ctx, 28, OOB);
    expect(clockRules.afterPlay(o, 60, ctx).status).toBe(SNAP);
    expect(afterPlayWithFacts(o, 60, ctx, { looseBallOutOfBounds: true }).status).toBe(READY);
  });
  it('exception 9: a foul and an out-of-bounds runner in the same down take the foul rule', () => {
    expect(after({ period: 1 }, { ...OOB, ...FOUL }).status).toBe(READY);
    expect(after({ period: 4, clockS: 200 }, { ...OOB, ...FOUL }).status).toBe(SNAP);
  });
  it('exception 9, items 3 and 4: the listed offensive fouls restart on the snap', () => {
    const early = context({ period: 3, clockS: 500 });
    const late = context({ period: 4, clockS: 500 });
    const o = (c: RulingContext) => outcomeAt(c, 20, { noPlay: true, ...FOUL });
    expect(afterPlayWithFacts(o(early), 0, early, { looseBallOutOfBounds: false, offenseFoulAfterReady: true }).status).toBe(READY);
    expect(afterPlayWithFacts(o(late), 0, late, { looseBallOutOfBounds: false, offenseFoulAfterReady: true }).status).toBe(SNAP);
    expect(afterPlayWithFacts(o(early), 0, early, { looseBallOutOfBounds: false, successiveDelayOfGame: true }).status).toBe(SNAP);
  });
});

describe('B13.3 timing switches (fixture set B takes the other option of each)', () => {
  it('B13.3.1: 1:30 left in the half, first down gained in bounds: the clock stops and restarts on the ready signal', () => {
    expect(after({ rules: B, period: 2, clockS: 96, insideTwoMinute: true, down: 2, toGo: 2 }, {}, 6, 40)).toMatchObject({ status: READY, clockTenths: s(1, 30) });
  });
  it('B13.3.1: at 5:00 it does not stop; under the other option it never stops', () => {
    expect(after({ rules: B, period: 2, clockS: 306, down: 2, toGo: 2 }, {}, 6, 40).status).toBe('running');
    expect(after({ rules: A, period: 2, clockS: 96, insideTwoMinute: true, down: 2, toGo: 2 }, {}, 6, 40).status).toBe('running');
  });
  it('B13.3.1 edge case: the first down that crosses the two-minute mark stops for the two-minute timeout itself', () => {
    expect(after({ rules: B, period: 4, clockS: 123, down: 2, toGo: 2 }, {}, 6, 40)).toMatchObject({ twoMinuteStop: true, status: SNAP });
  });
  it('B13.3.2: 8:00 left in the fourth, runner out of bounds: ready signal; at 1:00: snap', () => {
    expect(after({ rules: B, period: 4, clockS: 486 }, OOB).status).toBe(READY);
    expect(after({ rules: B, period: 4, clockS: 240 }, OOB).status).toBe(READY);
    expect(after({ rules: B, period: 4, clockS: 66, insideTwoMinute: true }, OOB).status).toBe(SNAP);
  });
  it('the late-half foul rule is a switch', () => {
    expect(after({ rules: B, period: 4, clockS: 66, insideTwoMinute: true }, FOUL).status).toBe(READY);
  });
  it('B13.3.3: halftime length comes from the rule set', () => {
    const half = (rules: typeof A) => clockRules.endOfPeriod(context({ rules, period: 2, clockS: 0 }).before, { rules, params: context().params });
    expect(half(A).intermissionTenths).toBe(13 * 600);
    expect(half(B).intermissionTenths / half(A).intermissionTenths).toBeCloseTo(20 / 13, 9);
  });
});

describe('B1.3.1 choosing the play clock', () => {
  it('reads both values from the rule set', () => {
    const src = { rules: fixtureRules('fixture_a', { 'clock.play_clock_s': 35, 'clock.play_clock_after_stoppage_s': 20 }), params: context().params };
    expect(clockRules.playClockTenths('normal', src)).toBe(350);
    expect(clockRules.playClockTenths('administrative', src)).toBe(200);
  });
  it('the full clock after a normal dead ball, an incompletion included', () => {
    expect(after({}).playClockTenths).toBe(400);
    expect(after({}, INC).playClockTenths).toBe(400);
    expect(after({}, OOB).playClockTenths).toBe(400);
  });
  it('the administrative clock after a change of possession, a penalty enforcement, a score, a kick, the two-minute warning and the end of a period', () => {
    expect(after({}, { possessionAfter: 1, changeOfPossession: true }).playClockTenths).toBe(250);
    expect(after({}, FOUL).playClockTenths).toBe(250);
    expect(after({}, { score: { type: 'touchdown', side: 0, points: 6, scorerId: 22 } }).playClockTenths).toBe(250);
    expect(after({}, { resultType: 'punt' }).playClockTenths).toBe(250);
    expect(after({ period: 2, clockS: 125 }).playClockTenths).toBe(250);
    expect(after({ period: 1, clockS: 4 }).playClockTenths).toBe(250);
  });
});

describe('B1.3.2 interrupted play clock and resets', () => {
  const src = { rules: A, params: context().params };
  const cases: [StoppageCause[], number, number][] = [
    [['team_timeout'], 80, 250], [['two_minute'], 80, 250], [['period_end'], 80, 250], [['penalty_enforcement'], 80, 250],
    [['excess_timeout_offense_no_runoff'], 80, 250], [['excess_timeout_both'], 80, 250],
    [['replay_administration'], 80, 250], [['replay_administration'], 310, 310],
    [['replay_reversal_no_runoff'], 80, 400], [['foul_nullified_no_runoff'], 80, 400], [['excess_timeout_defense'], 80, 400], [['defensive_foul_conserving_time'], 80, 400],
    [['runoff'], 80, 300], [['referee_timeout'], 170, 170], [['injury'], 170, 170], [['referee_timeout'], 60, 100], [['other'], 99, 100],
    // Two causes: the first match wins in the order runoff, full, administrative, floor, resume (the bible's Assumption).
    [['penalty_enforcement', 'runoff'], 80, 300], [['team_timeout', 'excess_timeout_defense'], 80, 400],
  ];
  for (const [causes, at, want] of cases) it(`${causes.join(' + ')} with ${at / 10} s showing gives ${want / 10} s`, () => expect(playClockAfterStoppage(causes, at, src)).toBe(want));
});

describe('B1.4.1 charged team timeouts', () => {
  const src = { rules: A, params: context().params };
  it('is granted only while the ball is dead and only when the team has one left', () => {
    expect(clockRules.timeoutAllowed(context({ phase: 'pre_snap' }).before, 0, src)).toEqual({ allowed: true, refusedKey: null });
    expect(clockRules.timeoutAllowed(context({ phase: 'play' }).before, 0, src)).toEqual({ allowed: false, refusedKey: 'timeout.refused.ball_live' });
    expect(clockRules.timeoutAllowed(context({ phase: 'pre_snap', timeoutsLeft: [0, 2] }).before, 0, src)).toEqual({ allowed: false, refusedKey: 'timeout.refused.none_left' });
    expect(clockRules.timeoutAllowed(context({ phase: 'pre_snap', timeoutsLeft: [0, 2] }).before, 1, src).allowed).toBe(true);
    expect(clockRules.timeoutAllowed(context({ phase: 'final' }).before, 0, src).refusedKey).toBe('timeout.refused.not_now');
  });
  it('answers for every phase of the game flow', () => {
    for (const phase of GameFlowPhase.options) expect(typeof clockRules.timeoutAllowed(context({ phase }).before, 0, src).allowed).toBe('boolean');
  });
});

describe('B1.4.4 two-minute warning', () => {
  it('a play that starts at 2:01 and ends at 1:52 gives the warning at 1:52', () => {
    expect(after({ period: 2, clockS: 121 }, {}, 9)).toMatchObject({ clockTenths: s(1, 52), twoMinuteStop: true, status: SNAP, playClockTenths: 250 });
  });
  it('exactly one warning: none once the half is inside it, none outside periods 2 and 4', () => {
    expect(after({ period: 2, clockS: 110, insideTwoMinute: true }).twoMinuteStop).toBe(false);
    expect(after({ period: 4, clockS: 125 }).twoMinuteStop).toBe(true);
    for (const period of [1, 3]) expect(after({ period, clockS: 125 }).twoMinuteStop).toBe(false);
    expect(after({ period: 2, clockS: 200 }).twoMinuteStop).toBe(false);
  });
  it('a down that ends exactly at 2:00 gives the warning there', () => {
    expect(after({ period: 4, clockS: 126 })).toMatchObject({ clockTenths: s(2), twoMinuteStop: true });
  });
  it('a running clock between downs stops when it reaches the mark, once', () => {
    const src = { rules: A, params: context().params };
    const st = context({ period: 2, clockS: 130, clockStatus: 'running' }).before;
    expect(advanceBetweenDowns(st, 250, src)).toEqual({ clockTenths: s(2), twoMinuteStop: true });
    expect(advanceBetweenDowns(st, 50, src)).toEqual({ clockTenths: s(2, 5), twoMinuteStop: false });
    expect(advanceBetweenDowns(context({ period: 2, clockS: 110, clockStatus: 'running', insideTwoMinute: true }).before, 250, src)).toEqual({ clockTenths: s(1, 25), twoMinuteStop: false });
    expect(advanceBetweenDowns(context({ period: 1, clockS: 130, clockStatus: 'running' }).before, 250, src).twoMinuteStop).toBe(false);
    expect(advanceBetweenDowns(context({ period: 2, clockS: 130, clockStatus: SNAP }).before, 250, src)).toEqual({ clockTenths: s(2, 10), twoMinuteStop: false });
  });
  it('the automatic stop is a switch and its time is a rule value', () => {
    expect(after({ rules: fixtureRules('fixture_a', { 'clock.two_minute_timeout': false }), period: 2, clockS: 125 }).twoMinuteStop).toBe(false);
    expect(after({ rules: fixtureRules('fixture_a', { 'clock.out_of_bounds_snap_window_first_half_s': 180 }), period: 2, clockS: 185 }).twoMinuteStop).toBe(true);
  });
});

describe('B1.5 injury timeouts: decision table', () => {
  const src = { rules: A, params: context().params };
  const base: InjuryTimeoutInput = { insideTwoMinute: true, offense: true, timeoutsLeft: 0, timeIn: true, exception: 'none', bothTeams: false, foulOnDown: false, excessThisHalf: 0, restartWithout: 'running' };
  it('B1.5.1: before the warning nothing is charged, the clock restarts as if it had not occurred, and the player sits a down', () => {
    expect(injuryTimeout({ ...base, insideTwoMinute: false, timeoutsLeft: 3 }, src)).toEqual({ timeoutCharged: false, excessTimeout: false, delayFoul: false, runoffOffered: false, status: READY, playClockTenths: null, sitsOneDown: true });
    expect(injuryTimeout({ ...base, insideTwoMinute: false, restartWithout: SNAP }, src).status).toBe(SNAP);
    expect(injuryTimeout({ ...base, insideTwoMinute: false, exception: 'opponent_foul' }, src).sitsOneDown).toBe(false);
  });
  it('B1.5.2 rule 1: with timeouts left the team is charged one, and the player may stay', () => {
    expect(injuryTimeout({ ...base, timeoutsLeft: 2 }, src)).toMatchObject({ timeoutCharged: true, excessTimeout: false, status: SNAP, playClockTenths: 250, sitsOneDown: false, runoffOffered: false });
  });
  it('rule 2: no charge when an opponent foul caused it or on an exempt down', () => {
    for (const exception of ['opponent_foul', 'exempt_down'] as const) expect(injuryTimeout({ ...base, exception }, src)).toMatchObject({ timeoutCharged: false, excessTimeout: false, runoffOffered: false });
  });
  it('rules 4 to 6: an excess timeout for the offense with time in offers the runoff; yardage from the second one', () => {
    expect(injuryTimeout(base, src)).toMatchObject({ excessTimeout: true, delayFoul: false, runoffOffered: true, status: READY, playClockTenths: 250, sitsOneDown: true });
    expect(injuryTimeout({ ...base, excessThisHalf: 1 }, src).delayFoul).toBe(true);
  });
  it('rules 5 and 9: charged to the defense the play clock is full and there is never a runoff', () => {
    expect(injuryTimeout({ ...base, offense: false }, src)).toMatchObject({ excessTimeout: true, runoffOffered: false, playClockTenths: 400, status: READY });
  });
  it('rules 7 and 8: injuries to both teams, or a foul on the down, prevent the runoff', () => {
    expect(injuryTimeout({ ...base, bothTeams: true, excessThisHalf: 3 }, src)).toMatchObject({ runoffOffered: false, delayFoul: false, excessTimeout: true });
    expect(injuryTimeout({ ...base, foulOnDown: true }, src)).toMatchObject({ runoffOffered: false, excessTimeout: true });
    expect(injuryTimeout({ ...base, timeIn: false, restartWithout: SNAP }, src)).toMatchObject({ runoffOffered: false, status: SNAP });
  });
  it('edge case: offense with no timeouts, clock running, 8 seconds left, player hurt: the defense takes the runoff and the half ends', () => {
    expect(injuryTimeout(base, src).runoffOffered).toBe(true);
    expect(settleRunoff('runoff', 80, src)).toMatchObject({ clockTenths: 0, halfEnds: true });
  });
});

describe('B1.6.1 the 10-second runoff', () => {
  const src = { rules: A, params: context().params };
  it('rule 2: the three outcomes give the play clock and restart mode', () => {
    expect(settleRunoff('runoff', 300, src)).toEqual({ clockTenths: 200, status: READY, playClockTenths: 300, halfEnds: false, timeoutCharged: false });
    expect(settleRunoff('timeout_instead', 300, src)).toEqual({ clockTenths: 300, status: SNAP, playClockTenths: 250, halfEnds: false, timeoutCharged: true });
    expect(settleRunoff('declined', 300, src)).toEqual({ clockTenths: 300, status: SNAP, playClockTenths: 250, halfEnds: false, timeoutCharged: false });
  });
  it('rule 4: a runoff with 10 seconds or fewer left ends the half (a false start with 6 seconds left ends the game)', () => {
    expect(settleRunoff('runoff', 100, src).halfEnds).toBe(true);
    expect(settleRunoff('runoff', 60, src)).toMatchObject({ clockTenths: 0, halfEnds: true });
    expect(settleRunoff('runoff', 101, src).halfEnds).toBe(false);
  });
  it('a runoff chosen among the enforcement options is applied after the down: seconds off, runoff play clock, ready signal', () => {
    const r = after({ period: 4, clockS: 50, insideTwoMinute: true }, { ...INC, enforcement: enforcement({ yardsWalked: -10, lossOfDown: true, runoffTaken: true }) });
    expect(r).toMatchObject({ clockTenths: 340, status: READY, playClockTenths: 300, periodExpired: false, untimedDown: false });
    const end = after({ period: 4, clockS: 14, insideTwoMinute: true }, { ...INC, enforcement: enforcement({ yardsWalked: -10, lossOfDown: true, runoffTaken: true }) });
    expect(end).toMatchObject({ clockTenths: 0, periodExpired: true, untimedDown: false });
  });
  it('the seconds run off come from the rule set', () => {
    expect(settleRunoff('runoff', 300, { rules: fixtureRules('fixture_a', { 'clock.runoff_seconds': 7 }), params: src.params }).clockTenths).toBe(230);
  });
});

describe('B1.6.3 defensive fouls or injuries in the last 40 seconds', () => {
  const src = { rules: A, params: context().params };
  it('0:20 left, defensive act that conserves time, defense out of timeouts: the offense is offered the end of the half', () => {
    expect(defenseConservesTime(200, 0, src)).toEqual({ status: READY, playClockTenths: 400, offenseMayEndHalf: true });
  });
  it('with defensive timeouts remaining, or outside the window, the half does not end (B1.6.1 rule 3)', () => {
    expect(defenseConservesTime(200, 1, src).offenseMayEndHalf).toBe(false);
    expect(defenseConservesTime(410, 0, src).offenseMayEndHalf).toBe(false);
    expect(defenseConservesTime(400, 0, src).offenseMayEndHalf).toBe(true);
  });
});

describe('B1.7.1 time expires with the ball in play', () => {
  it('a snap at 0:01 is a legal last play: the down completes and the period has expired at the dead ball', () => {
    expect(after({ period: 2, clockS: 1, insideTwoMinute: true }, {}, 7)).toMatchObject({ clockTenths: 0, periodExpired: true, untimedDown: false, twoMinuteStop: false });
  });
  it('the clock never goes below zero', () => expect(after({ clockS: 3 }, {}, 12).clockTenths).toBe(0));
});

describe('B1.7.2 extension by an untimed down', () => {
  const last = { period: 2, clockS: 3, insideTwoMinute: true };
  it('(a) an accepted live-ball foul by the defense extends the period', () => {
    expect(after(last, { enforcement: enforcement({ yardsWalked: 5, replayDown: true }) })).toMatchObject({ periodExpired: true, untimedDown: true, status: 'untimed' });
    expect(after(last, { enforcement: enforcement({ automaticFirstDown: true }) }).untimedDown).toBe(true);
  });
  it('(b) a foul by the offense does not', () => {
    expect(after(last, { enforcement: enforcement({ yardsWalked: -10, replayDown: true }) })).toMatchObject({ periodExpired: true, untimedDown: false });
  });
  it('a declined penalty does not', () => {
    expect(after(last, { enforcement: enforcement({ enforced: [], declined: [0] }) }).untimedDown).toBe(false);
  });
  it('(c) a touchdown on the last play is followed by the try', () => {
    const td = { score: { type: 'touchdown' as const, side: 0 as const, points: 6, scorerId: 22 }, runnerDownInBounds: false };
    expect(after({ ...last }, td)).toMatchObject({ periodExpired: true, untimedDown: true, status: 'untimed' });
    expect(after({ period: 4, clockS: 3, insideTwoMinute: true, score: [14, 20] }, td)).toMatchObject({ untimedDown: true });
    expect(after({ period: 4, clockS: 3, insideTwoMinute: true, score: [14, 21] }, td)).toMatchObject({ untimedDown: true });
  });
  it('(c) except when the down ended period 4 and a successful try could not affect the result', () => {
    const td = { score: { type: 'touchdown' as const, side: 0 as const, points: 6, scorerId: 22 }, runnerDownInBounds: false };
    // Ahead by 1 after a walk-off touchdown: no try (the bible edge case). Behind by more than a try can add: no try.
    expect(after({ period: 4, clockS: 3, insideTwoMinute: true, score: [14, 19] }, td)).toMatchObject({ periodExpired: true, untimedDown: false });
    expect(after({ period: 4, clockS: 3, insideTwoMinute: true, score: [14, 23] }, td).untimedDown).toBe(false);
    expect(after({ period: 4, clockS: 3, insideTwoMinute: true, score: [14, 22] }, td).untimedDown).toBe(true);
  });
  it('(h) a double foul that replays the down extends the last period of a half, not period 1 or 3', () => {
    const dbl = { enforcement: enforcement({ enforced: [], offsetting: true, replayDown: true }), noPlay: true };
    expect(after(last, dbl).untimedDown).toBe(true);
    expect(after({ period: 1, clockS: 3 }, dbl).untimedDown).toBe(false);
  });
  it('an untimed down takes no time and the period then ends', () => {
    expect(after({ period: 2, clockS: 0, clockStatus: 'untimed', untimedDown: true, insideTwoMinute: true })).toMatchObject({ clockTenths: 0, periodExpired: true, untimedDown: false });
  });
});

describe('J11.8.1 and B1.1 period changes', () => {
  const src = (rules = A) => ({ rules, params: context().params });
  const end = (period: number, score: [number, number] = [7, 3]) => clockRules.endOfPeriod(context({ period, clockS: 0, score }).before, src());
  it('periods 1 and 3: change of goals, series carried over, the period break from the rule set', () => {
    for (const p of [1, 3]) expect(end(p)).toEqual({ next: 'next_period', swapEnds: true, resetTimeouts: false, intermissionTenths: 1200, carryOverSeries: true });
  });
  it('period 2: halftime, timeouts reset, a kickoff follows', () => {
    expect(end(2)).toEqual({ next: 'halftime', swapEnds: false, resetTimeouts: true, intermissionTenths: 7800, carryOverSeries: false });
  });
  it('period 4: final, or overtime when tied (B1.1.1 rule 4)', () => {
    expect(end(4).next).toBe('final');
    expect(end(4, [10, 10])).toMatchObject({ next: 'overtime', carryOverSeries: false });
    expect(end(5, [10, 10]).next).toBe('overtime');
    expect(end(5, [13, 10]).next).toBe('final');
  });
  it('the shape of the game is rule data: a game of two periods has no quarter break', () => {
    const rules = fixtureRules('fixture_a', { 'clock.periods': 2 });
    const at = (period: number) => clockRules.endOfPeriod(context({ rules, period, clockS: 0, score: [7, 3] }).before, src(rules));
    expect(at(1).next).toBe('halftime');
    expect(at(2).next).toBe('final');
  });
  it('every transition is a valid contract record', () => {
    for (const p of [1, 2, 3, 4, 5]) expect(() => PeriodTransition.parse(end(p, [p, 2]))).not.toThrow();
  });
});

describe('the play clock always runs (B1.3.1, I2.1.2)', () => {
  it('runs in every phase in which B1 says it runs, and has an entry for every phase', () => {
    expect(Object.keys(PLAY_CLOCK_RUNS).sort()).toEqual([...GameFlowPhase.options].sort());
    for (const phase of ['dead_ball', 'call_window', 'pre_snap', 'kickoff_setup'] as const) expect(PLAY_CLOCK_RUNS[phase]).toBe(true);
    for (const phase of ['play', 'ruling', 'review', 'timeout', 'period_end', 'final'] as const) expect(PLAY_CLOCK_RUNS[phase]).toBe(false);
  });
  it('every dead ball returns a play clock that is one of the rule values, never zero', () => {
    fc.assert(fc.property(arbDown, (a) => {
      const r = play(a);
      expect([400, 250, 300]).toContain(r.playClockTenths);
    }), { numRuns: 500 });
  });
});

const arbDown = fc.record({
  set: fc.constantFrom('fixture_a' as const, 'fixture_b' as const), period: fc.integer({ min: 1, max: 4 }), clockS: fc.integer({ min: 0, max: 900 }),
  live: fc.integer({ min: 0, max: 200 }), status: fc.constantFrom<ClockStatus>('running', SNAP, READY), inside: fc.boolean(), down: fc.integer({ min: 1, max: 3 }),
  on: fc.double({ min: 1, max: 99, noNaN: true }), oob: fc.boolean(), inc: fc.boolean(), lost: fc.boolean(), foul: fc.constantFrom('none', 'offense', 'defense', 'runoff'), td: fc.boolean(), injured: fc.boolean(),
});
function play(a: typeof arbDown extends fc.Arbitrary<infer T> ? T : never) {
  const ctx = context({ rules: fixtureRules(a.set), period: a.period, clockS: a.clockS, clockStatus: a.status, insideTwoMinute: a.inside, down: a.down, ballOn: 25 });
  const enf = a.foul === 'none' ? null : enforcement({ yardsWalked: a.foul === 'defense' ? 5 : -5, runoffTaken: a.foul === 'runoff' });
  const o = outcomeAt(ctx, a.on, {
    endedOutOfBounds: a.oob && !a.inc, incomplete: a.inc, runnerDownInBounds: !a.oob && !a.inc, possessionAfter: a.lost ? 1 : 0, changeOfPossession: a.lost,
    enforcement: enf, score: a.td ? { type: 'touchdown', side: a.lost ? 1 : 0, points: 6, scorerId: 22 } : null, injuryStoppage: a.injured ? [22] : [],
  });
  return clockRules.afterPlay(o, a.live, ctx);
}

describe('Q1.2.2 invariants on the clock', () => {
  it('after any down the clock is a whole number of tenths between zero and its value at the snap, in exactly one legal state', () => {
    fc.assert(fc.property(arbDown, (a) => {
      const r = play(a);
      expect(() => ClockResult.parse(r)).not.toThrow();
      expect(Number.isInteger(r.clockTenths)).toBe(true);
      expect(r.clockTenths).toBeGreaterThanOrEqual(0);
      expect(r.clockTenths).toBeLessThanOrEqual(a.clockS * 10);
      expect(['running', SNAP, READY, 'untimed']).toContain(r.status);
      expect(r.periodExpired).toBe(r.clockTenths === 0);
      // An untimed down is owed only at the end of a period, and the automatic stop never comes with an expired period.
      if (r.untimedDown) expect(r.periodExpired).toBe(true);
      if (r.twoMinuteStop) { expect(r.periodExpired).toBe(false); expect(r.status === SNAP || r.status === 'untimed').toBe(true); expect(a.inside).toBe(false); }
      // An incompletion, a score or a change of possession never leaves the clock running.
      if (a.inc || a.lost || a.td || a.foul !== 'none') expect(r.status).not.toBe('running');
    }), { numRuns: 3000 });
  });
  it('is deterministic: the same down gives the same result', () => {
    fc.assert(fc.property(arbDown, (a) => { expect(play(a)).toEqual(play(a)); }), { numRuns: 300 });
  });
});
