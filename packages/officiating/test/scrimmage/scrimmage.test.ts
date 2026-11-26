// Q1.1.1 rule cases for B3.2, B3.3, B5.1, B5.2, B5.6 and B7 on plays with no kick. Each test is named
// for the bible leaf and acceptance case it covers. Rule values are fixture values, not facts.
import { describe, expect, it } from 'vitest';
import { PlayOutcome, RuleKeyManifest, ParamFile, playTruthProblems, type PlayTruth, type RulingContext, type TruthEvent } from '@gm/schema';
import { scrimmageRuling, clockFacts, RULE_KEYS, PARAMS } from '../../src/scrimmage/index.ts';
import { seriesRules } from '../../src/series/index.ts';
import { context, ev, fixtureRules, FIXTURE_KEYS, IDS, truthOf, xOn, type Setup } from './fixtures.ts';

const { QB, RB, WR, LB, CB } = IDS;
const B = fixtureRules('fixture_b');

function run(setup: Setup, events: (ctx: RulingContext) => TruthEvent[], impetus: 0 | 1 | null = null) {
  const ctx = context(setup);
  const truth: PlayTruth = truthOf(ctx, events(ctx), impetus);
  expect(playTruthProblems(truth)).toEqual([]);
  expect(scrimmageRuling.handles(truth)).toBe(true);
  const outcome = scrimmageRuling.rule(truth, ctx);
  expect(() => PlayOutcome.parse(outcome)).not.toThrow();
  return { ctx, truth, outcome, series: seriesRules.next(outcome, ctx) };
}
/** A handoff run that ends at the offense's own yard line `on`. */
const runTo = (on: number, reason: Parameters<typeof ev.dead>[1] = 'down_by_contact', y = 26.67) => (ctx: RulingContext) => {
  const d = ctx.situation.attackDir;
  return [ev.snap(), ev.poss(0.1, ctx.situation.offense, QB, xOn((ctx.situation.ballX - 10) * 1, 1), 'snap'), ev.poss(1, ctx.situation.offense, RB, ctx.situation.ballX - d * 4, 'exchange'),
    ev.dead(4, reason, xOn(on, d), ctx.situation.offense, RB, y)];
};

describe('scrimmage module contract', () => {
  it('declares a valid rule-key manifest and parameter file, and reads only declared keys', () => {
    expect(() => RuleKeyManifest.parse(RULE_KEYS)).not.toThrow();
    expect(() => ParamFile.parse(PARAMS)).not.toThrow();
    for (const k of RULE_KEYS) expect(FIXTURE_KEYS).toContain(k.key);
  });
  it('handles plays with no kick event only', () => {
    const ctx = context();
    expect(scrimmageRuling.handles(truthOf(ctx, [ev.snap(), ev.kick(2, xOn(15)), ev.dead(8, 'fair_catch', xOn(60), 1)]))).toBe(false);
  });
});

describe('B3.2.1 dead-ball conditions on a scrimmage play', () => {
  for (const reason of ['down_by_contact', 'forward_progress_stopped', 'gave_himself_up', 'touched_on_ground', 'helmet_off', 'runner_down_without_contact'] as const) {
    it(`${reason}: dead in possession at the forward point of the ball, clock facts say in bounds`, () => {
      const { outcome } = run({ ballOn: 25 }, runTo(31.4, reason));
      expect(outcome).toMatchObject({ resultType: 'run', spotX: xOn(31.4), possessionAfter: 0, runnerDownInBounds: true, endedOutOfBounds: false, noPlay: false, score: null });
      expect(outcome.yardsGained).toBeCloseTo(6.4, 9);
    });
  }
  it('(c) kneel is its own result type', () => {
    expect(run({ ballOn: 25 }, (c) => [ev.snap(), ev.poss(0.1, 0, QB, c.situation.ballX - 1, 'snap'), ev.dead(1, 'kneel', xOn(24), 0, QB)]).outcome).toMatchObject({ resultType: 'kneel', spotX: xOn(24) });
  });
  it('(e) runner out of bounds: spotted at the forward point of the ball (B3.3.2 acceptance: 34.6)', () => {
    const { outcome, ctx, truth } = run({ ballOn: 25 }, runTo(34.6, 'runner_out_of_bounds', 0));
    expect(outcome).toMatchObject({ spotX: xOn(34.6), endedOutOfBounds: true, runnerDownInBounds: false });
    expect(clockFacts(truth, ctx).looseBallOutOfBounds).toBe(false);
  });
  it('a play that never became live, or struck an object (r), does not count and returns to the previous spot', () => {
    for (const reason of ['pre_snap_foul', 'period_ended_before_snap', 'engine_fault', 'struck_object'] as const) {
      const ctx = context({ ballOn: 40, down: 3 });
      const truth = truthOf(ctx, [ev.dead(0, reason, xOn(40), null)]);
      const o = scrimmageRuling.rule(truth, ctx);
      expect(o).toMatchObject({ resultType: 'no_play', noPlay: true, spotX: xOn(40), possessionAfter: 0 });
      expect(seriesRules.next(o, ctx)).toMatchObject({ down: 3, ballX: xOn(40) });
    }
  });
  it('a sack is a run behind the line with a sack event and no forward pass', () => {
    const { outcome } = run({ ballOn: 25 }, (c) => [ev.snap(), ev.poss(0.1, 0, QB, c.situation.ballX - 5, 'snap'), ev.sack(3, xOn(18)), ev.dead(3, 'down_by_contact', xOn(18), 0, QB)]);
    expect(outcome).toMatchObject({ resultType: 'sack', runnerDownInBounds: true });
    expect(outcome.yardsGained).toBeCloseTo(-7, 9);
  });
  it('reports players who could not finish the play as injury stoppages (B1.5)', () => {
    const { outcome } = run({}, (c) => [...runTo(30)(c).slice(0, 3), ev.injury(3, RB, false), ev.injury(3, LB, true), ev.dead(4, 'down_by_contact', xOn(30), 0, RB)]);
    expect(outcome.injuryStoppage).toEqual([RB]);
  });
});

describe('B5.2.2 incomplete pass', () => {
  const incomplete = (c: RulingContext, spike = false) => [ev.snap(), ev.poss(0.1, 0, QB, c.situation.ballX - 5, 'snap'), ev.pass(2, c.situation.ballX - 5, true, { spike }),
    ev.catchPoint(3.4, xOn(45), 'drop'), ev.dead(3.4, 'incomplete_pass', xOn(45), null, null, 2)];
  it('is a loss of down and the ball returns to the previous spot', () => {
    const { outcome, series } = run({ ballOn: 30, down: 2, ballY: 24 }, (c) => incomplete(c));
    expect(outcome).toMatchObject({ resultType: 'pass_incomplete', incomplete: true, spotX: xOn(30), spotY: 24, possessionAfter: 0, yardsGained: 0, runnerDownInBounds: false, endedOutOfBounds: false });
    expect(series).toMatchObject({ down: 3, ballX: xOn(30) });
  });
  it('a spike is an incomplete pass (B1.2.2 edge case)', () => {
    expect(run({}, (c) => incomplete(c, true)).outcome).toMatchObject({ resultType: 'spike', incomplete: true });
  });
  it('B7.5.1 rule 3: a forward pass incomplete in the passing team end zone is not a safety', () => {
    const { outcome } = run({ ballOn: 2 }, (c) => [ev.snap(), ev.poss(0.1, 0, QB, xOn(-4), 'snap'), ev.pass(2, xOn(-4), true), ev.dead(2.5, 'incomplete_pass', xOn(-2), null)]);
    expect(outcome).toMatchObject({ score: null, incomplete: true, spotX: xOn(2) });
  });
  it('a completed pass is a pass play with yards to the dead-ball spot', () => {
    const { outcome } = run({ ballOn: 30 }, (c) => [ev.snap(), ev.poss(0.1, 0, QB, c.situation.ballX - 5, 'snap'), ev.pass(2, c.situation.ballX - 5, true),
      ev.catchPoint(3, xOn(42), 'catch'), ev.poss(3, 0, WR, xOn(42), 'catch'), ev.dead(5, 'down_by_contact', xOn(49), 0, WR)]);
    expect(outcome).toMatchObject({ resultType: 'pass_complete', spotX: xOn(49), changeOfPossession: false });
    expect(outcome.yardsGained).toBeCloseTo(19, 9);
  });
});

describe('B5.1.1 forward pass, backward pass, or fumble', () => {
  it('a backward pass that is dropped is live: the defense may recover it', () => {
    const { outcome, series } = run({ ballOn: 30 }, (c) => [ev.snap(), ev.poss(0.1, 0, QB, xOn(25), 'snap'), ev.pass(1, xOn(25), false),
      ev.fumble(1.6, 0, WR, xOn(24.5), 'backward_pass_loose'), ev.poss(2.4, 1, LB, xOn(23), 'fumble_recovery'), ev.dead(3, 'down_by_contact', xOn(21), 1, LB)]);
    expect(outcome).toMatchObject({ resultType: 'fumble_lost', possessionAfter: 1, changeOfPossession: true, spotX: xOn(21) });
    expect(series).toMatchObject({ possession: 1, down: 1 });
    expect(c0(outcome.yardsGained)).toBeCloseTo(-5.5, 9);
  });
});
const c0 = (n: number) => n;

describe('B5.6.2 fumble: the fourth-down and two-minute limits', () => {
  const teammateRecovery = (fumbleOn: number, recoverOn: number, endOn: number) => (c: RulingContext) => [...runTo(0)(c).slice(0, 3), ev.fumble(3, 0, RB, xOn(fumbleOn)),
    ev.poss(3.8, 0, WR, xOn(recoverOn), 'fumble_recovery'), ev.dead(5, 'down_by_contact', xOn(endOn), 0, WR)];
  it('fourth and 1, fumble at the 30 short of the line, teammate recovers at the 34: dead, ball at the 30, turnover on downs', () => {
    const { outcome, series } = run({ ballOn: 29.5, down: 4, toGo: 1 }, teammateRecovery(30, 34, 38));
    expect(outcome).toMatchObject({ spotX: xOn(30), possessionAfter: 0, score: null });
    expect(series).toMatchObject({ possession: 1, turnoverOnDowns: true, ballX: xOn(30) });
  });
  it('same play on third down: first down wherever the teammate is tackled', () => {
    const { outcome, series } = run({ ballOn: 29.5, down: 3, toGo: 1 }, teammateRecovery(30, 34, 38));
    expect(outcome.spotX).toBe(xOn(38));
    expect(series).toMatchObject({ possession: 0, down: 1, firstDownAwarded: true });
  });
  it('fumble at 1:45 of the second quarter recovered 6 yards behind the fumble spot by a teammate: dead at the recovery spot', () => {
    const { outcome } = run({ ballOn: 40, down: 1, period: 2, clockS: 105, insideTwoMinute: true }, teammateRecovery(45, 39, 47));
    expect(outcome.spotX).toBe(xOn(39));
  });
  it('the two-minute limit comes from the rule set: with the other option the same recovery may be advanced', () => {
    const { outcome } = run({ rules: B, ballOn: 40, down: 1, period: 2, clockS: 105, insideTwoMinute: true }, teammateRecovery(45, 39, 47));
    expect(outcome.spotX).toBe(xOn(47));
  });
  it('the fumbler himself may recover and advance on fourth down', () => {
    const { outcome } = run({ ballOn: 29.5, down: 4, toGo: 1 }, (c) => [...runTo(0)(c).slice(0, 3), ev.fumble(3, 0, RB, xOn(30)), ev.poss(3.8, 0, RB, xOn(31), 'fumble_recovery'), ev.dead(5, 'down_by_contact', xOn(36), 0, RB)]);
    expect(outcome.spotX).toBe(xOn(36));
  });
  it('after a change of possession the fourth-down limit no longer binds', () => {
    const { outcome } = run({ ballOn: 30, down: 4 }, (c) => [...runTo(0)(c).slice(0, 3), ev.fumble(3, 0, RB, xOn(33)), ev.poss(3.5, 1, LB, xOn(33), 'fumble_recovery'),
      ev.fumble(4, 1, LB, xOn(30)), ev.poss(4.5, 1, CB, xOn(29), 'fumble_recovery'), ev.dead(6, 'down_by_contact', xOn(20), 1, CB)]);
    expect(outcome).toMatchObject({ spotX: xOn(20), possessionAfter: 1, resultType: 'fumble_lost' });
    expect(outcome.yardsGained).toBeCloseTo(3, 9);
  });
  it('a backward pass that gets loose is not under the limit (B5.6.1 edge case)', () => {
    const { outcome } = run({ ballOn: 30, down: 4 }, (c) => [ev.snap(), ev.poss(0.1, 0, QB, xOn(25), 'snap'), ev.pass(1, xOn(25), false), ev.fumble(1.5, 0, RB, xOn(24), 'backward_pass_loose'),
      ev.poss(2, 0, WR, xOn(23), 'fumble_recovery'), ev.dead(5, 'down_by_contact', xOn(41), 0, WR)]);
    expect(outcome.spotX).toBe(xOn(41));
  });
  it('B7.3.2 rule 6: the limit applies during a try', () => {
    const { outcome } = run({ playKind: 'try', ballOn: 98 }, (c) => [...runTo(0)(c).slice(0, 3), ev.fumble(2, 0, RB, xOn(99)), ev.poss(2.5, 0, WR, xOn(100.5), 'fumble_recovery'),
      ev.dead(2.5, 'ball_across_goal_line_in_possession', xOn(100.5), 0, WR)]);
    expect(outcome).toMatchObject({ resultType: 'try_failed', score: null });
  });
});

describe('B5.6.3 fumble out of bounds and into the end zone', () => {
  const fumbleOut = (fumbleOn: number, outOn: number) => (c: RulingContext) => [...runTo(0)(c).slice(0, 3), ev.fumble(3, 0, RB, xOn(fumbleOn)), ev.dead(4, 'ball_out_of_bounds', xOn(outOn), null, null, 0)];
  it('fumble at the 40 rolls forward out at the 45: offense ball at the 40', () => {
    const { outcome, ctx, truth } = run({ ballOn: 35 }, fumbleOut(40, 45));
    expect(outcome).toMatchObject({ spotX: xOn(40), possessionAfter: 0, endedOutOfBounds: true, changeOfPossession: false });
    expect(clockFacts(truth, ctx).looseBallOutOfBounds).toBe(true);
  });
  it('fumble at the 40 rolls back out at the 36: offense ball at the 36, next snap on the hash', () => {
    const { outcome, series, ctx } = run({ ballOn: 35 }, fumbleOut(40, 36));
    expect(outcome).toMatchObject({ spotX: xOn(36), possessionAfter: 0 });
    expect(series.ballY).toBe(ctx.geometry.hashSouthY);
  });
  it('fumble at the opponent 2 rolls through the end zone and out: touchback, defense ball at its touchback yard line', () => {
    const { outcome, series } = run({ ballOn: 90 }, fumbleOut(98, 104), 0);
    expect(outcome).toMatchObject({ touchback: true, possessionAfter: 1, score: null, resultType: 'fumble_lost', changeOfPossession: true, spotX: xOn(80) });
    expect(series).toMatchObject({ possession: 1, down: 1 });
    expect(run({ rules: B, ballOn: 90 }, fumbleOut(98, 104), 0).outcome.spotX).toBe(xOn(75));
  });
  it('fumble out of bounds in the fumbling team own end zone: safety when that team gave the impetus, touchback when the opponent did', () => {
    expect(run({ ballOn: 3 }, fumbleOut(1, -2), 0).outcome).toMatchObject({ score: { type: 'safety', side: 1, points: 2 } });
    expect(run({ ballOn: 3 }, fumbleOut(1, -2), 1).outcome).toMatchObject({ score: null, touchback: true, possessionAfter: 0, spotX: xOn(20) });
  });
  it('B5.6.1 rule 3: a backward pass out of bounds stays with the passing team where it went out', () => {
    const { outcome } = run({ ballOn: 30 }, (c) => [ev.snap(), ev.poss(0.1, 0, QB, xOn(25), 'snap'), ev.pass(1, xOn(25), false), ev.dead(2, 'ball_out_of_bounds', xOn(22), null, null, 0)]);
    expect(outcome).toMatchObject({ spotX: xOn(22), possessionAfter: 0, endedOutOfBounds: true });
  });
  it('B3.2.1 (i): a loose ball at rest goes to the team last in possession; behind a goal line it is placed on the yard line the rule names', () => {
    const rest = (on: number) => (c: RulingContext) => [...runTo(0)(c).slice(0, 3), ev.fumble(3, 0, RB, xOn(8)), ev.dead(6, 'loose_ball_at_rest', xOn(on), null)];
    expect(run({ ballOn: 10 }, rest(5)).outcome).toMatchObject({ spotX: xOn(5), possessionAfter: 0, score: null });
    expect(run({ ballOn: 10 }, rest(-3)).outcome).toMatchObject({ spotX: xOn(1), possessionAfter: 0, score: null });
    expect(run({ rules: B, ballOn: 10 }, rest(-3)).outcome.spotX).toBe(xOn(2));
  });
  it('a rule set that states no placement (value zero) rules the ball at rest behind a goal line by impetus', () => {
    const none = fixtureRules('fixture_a', { 'deadball.loose_at_rest_yardline': 0 });
    const rest = (c: RulingContext) => [...runTo(0)(c).slice(0, 3), ev.fumble(3, 0, RB, xOn(8)), ev.dead(6, 'loose_ball_at_rest', xOn(-3), null)];
    expect(run({ rules: none, ballOn: 10 }, rest, 0).outcome.score).toMatchObject({ type: 'safety', side: 1 });
    expect(run({ rules: none, ballOn: 10 }, rest, 1).outcome).toMatchObject({ score: null, touchback: true, possessionAfter: 0 });
  });
});

describe('B7.1.1 and B7.2.1 touchdown', () => {
  it('the ball tip touching the plane is a touchdown worth the rule-set value', () => {
    const { outcome, series } = run({ ballOn: 95 }, runTo(100, 'ball_across_goal_line_in_possession'));
    expect(outcome).toMatchObject({ score: { type: 'touchdown', side: 0, points: 6, scorerId: RB }, spotX: 110, runnerDownInBounds: false });
    expect(series.playKind).toBe('try');
    expect(run({ rules: B, ballOn: 95 }, runTo(100, 'ball_across_goal_line_in_possession')).outcome.score?.points).toBe(7);
  });
  it('a runner down at the half-yard line before the ball reaches the plane is short', () => {
    expect(run({ ballOn: 95 }, runTo(99.5)).outcome).toMatchObject({ score: null, spotX: xOn(99.5) });
  });
  it('a runner ruled down by contact with the ball on the plane is a touchdown whatever the dead-ball reason says', () => {
    expect(run({ ballOn: 95 }, runTo(100, 'down_by_contact')).outcome.score?.type).toBe('touchdown');
  });
  it('works for a team attacking west and for side 1', () => {
    const { outcome } = run({ ballOn: 95, attackDir: -1, offense: 1 }, runTo(100.2, 'ball_across_goal_line_in_possession'));
    expect(outcome).toMatchObject({ score: { type: 'touchdown', side: 1 }, spotX: 10 });
  });
  const fumbleInto = (c: RulingContext) => [...runTo(0)(c).slice(0, 3), ev.fumble(3, 0, RB, xOn(98)), ev.poss(3.6, 0, WR, xOn(102), 'fumble_recovery'), ev.dead(3.6, 'ball_dead_in_end_zone', xOn(102), 0, WR)];
  it('fumble into the end zone recovered by the offense on third down: touchdown', () => {
    expect(run({ ballOn: 95, down: 3 }, fumbleInto, 0).outcome.score).toMatchObject({ type: 'touchdown', side: 0 });
  });
  it('same on fourth down by a teammate of the fumbler: no touchdown, ball back to the fumble spot', () => {
    const { outcome, series } = run({ ballOn: 95, down: 4, toGo: 5 }, fumbleInto, 0);
    expect(outcome).toMatchObject({ score: null, spotX: xOn(98) });
    expect(series).toMatchObject({ possession: 1, turnoverOnDowns: true });
  });
  it('an interception returned to the other end zone is a touchdown for the defense', () => {
    const { outcome, series } = run({ ballOn: 30 }, (c) => [ev.snap(), ev.poss(0.1, 0, QB, xOn(25), 'snap'), ev.pass(2, xOn(25), true), ev.catchPoint(3, xOn(40), 'interception'),
      ev.poss(3, 1, CB, xOn(40), 'interception'), ev.dead(9, 'ball_across_goal_line_in_possession', xOn(-0.5), 1, CB)]);
    expect(outcome).toMatchObject({ resultType: 'interception', score: { type: 'touchdown', side: 1, scorerId: CB }, possessionAfter: 1, changeOfPossession: true, yardsGained: 0 });
    expect(series).toMatchObject({ playKind: 'try', possession: 1 });
  });
});

describe('B7.3.2 results of a try', () => {
  it('a touchdown by the offense scores the two-point value', () => {
    expect(run({ playKind: 'try', ballOn: 98 }, runTo(100, 'ball_across_goal_line_in_possession')).outcome).toMatchObject({ resultType: 'try_good', score: { type: 'try_two', side: 0, points: 2 }, possessionAfter: 0 });
    expect(run({ rules: B, playKind: 'try', ballOn: 98 }, runTo(100, 'ball_across_goal_line_in_possession')).outcome.score?.points).toBe(5);
  });
  const returned = (c: RulingContext) => [ev.snap(), ev.poss(0.1, 0, QB, xOn(93), 'snap'), ev.pass(1, xOn(93), true), ev.catchPoint(2, xOn(101), 'interception'), ev.poss(2, 1, CB, xOn(101), 'interception'),
    ev.dead(14, 'ball_across_goal_line_in_possession', xOn(-1), 1, CB)];
  it('interception on a two-point try returned the length of the field: defense scores the two-point value', () => {
    const { outcome, series } = run({ playKind: 'try', ballOn: 98 }, returned);
    expect(outcome).toMatchObject({ resultType: 'try_failed', score: { type: 'defensive_try', side: 1, points: 2 }, possessionAfter: 0, changeOfPossession: false });
    expect(series).toMatchObject({ playKind: 'kickoff', possession: 0 });
  });
  it('the defensive score on a try is a rule-set switch', () => {
    expect(run({ rules: fixtureRules('fixture_a', { 'try.defense_can_score': false }), playKind: 'try', ballOn: 98 }, returned).outcome.score).toBeNull();
  });
  it('ball recovered by the defense in the field of play and the runner tackled: try over, no points', () => {
    const { outcome, series } = run({ playKind: 'try', ballOn: 98 }, (c) => [...runTo(0)(c).slice(0, 3), ev.fumble(2, 0, RB, xOn(97)), ev.poss(2.5, 1, LB, xOn(96), 'fumble_recovery'), ev.dead(4, 'down_by_contact', xOn(80), 1, LB)]);
    expect(outcome).toMatchObject({ resultType: 'try_failed', score: null, possessionAfter: 0 });
    expect(series.playKind).toBe('kickoff');
  });
  it('rule 3: a play that would be a safety scores the try-safety value for the opponent; rule 4: a touchback means the try failed', () => {
    const picked = (endOn: number) => (c: RulingContext) => [ev.snap(), ev.poss(0.1, 0, QB, xOn(93), 'snap'), ev.pass(1, xOn(93), true), ev.poss(2, 1, CB, xOn(97), 'interception'), ev.dead(4, 'ball_dead_in_end_zone', xOn(endOn), 1, CB)];
    expect(run({ playKind: 'try', ballOn: 98 }, picked(102), 1).outcome).toMatchObject({ resultType: 'try_good', score: { type: 'try_safety', side: 0, points: 1 } });
    expect(run({ rules: B, playKind: 'try', ballOn: 98 }, picked(102), 1).outcome.score?.points).toBe(4);
    expect(run({ playKind: 'try', ballOn: 98 }, picked(102), 0).outcome).toMatchObject({ resultType: 'try_failed', score: null, touchback: false });
  });
});

describe('B7.5.1 safety', () => {
  it('quarterback sacked in his end zone: safety worth the rule-set value, and the team scored upon kicks', () => {
    const sacked = (c: RulingContext) => [ev.snap(), ev.poss(0.1, 0, QB, xOn(-3), 'snap'), ev.sack(3, xOn(-4)), ev.dead(3, 'ball_dead_in_end_zone', xOn(-4), 0, QB)];
    const { outcome, series } = run({ ballOn: 3 }, sacked);
    expect(outcome).toMatchObject({ resultType: 'sack', score: { type: 'safety', side: 1, points: 2, scorerId: null }, possessionAfter: 0, changeOfPossession: false, spotX: 10 });
    expect(series).toMatchObject({ playKind: 'safety_kick', possession: 0 });
    expect(run({ rules: B, ballOn: 3 }, sacked).outcome.score?.points).toBe(3);
  });
  it('forward progress stopped with the tip of the ball in the field but part of the ball still on the goal line: safety', () => {
    expect(run({ ballOn: 3 }, runTo(0.3, 'forward_progress_stopped')).outcome.score?.type).toBe('safety');
  });
  it('a rule set with no ball length yet decides by the forward point of the ball alone, and a zero momentum limit spots the ball where possession began', () => {
    const base = fixtureRules('fixture_a');
    const bare = { ...base, num: (k: string) => { if (k === 'field.ball_length_yd') throw new Error('missing'); return base.num(k); }, keys: () => base.keys().filter((k) => k !== 'field.ball_length_yd') };
    expect(run({ rules: bare, ballOn: 3 }, runTo(0.3, 'forward_progress_stopped')).outcome.score).toBeNull();
    expect(run({ rules: bare, ballOn: 3 }, runTo(0, 'forward_progress_stopped')).outcome.score?.type).toBe('safety');
  });
  it('the entire ball in the field of play is not a safety', () => {
    expect(run({ ballOn: 3 }, runTo(0.4, 'forward_progress_stopped')).outcome).toMatchObject({ score: null, spotX: xOn(0.4) });
  });
  it('B7.7.1: a defender bats a fumble into his own end zone where his team recovers it: safety against his team', () => {
    const { outcome } = run({ ballOn: 92 }, (c) => [...runTo(0)(c).slice(0, 3), ev.fumble(3, 0, RB, xOn(96)), ev.poss(4, 1, LB, xOn(101), 'fumble_recovery'), ev.dead(4.5, 'ball_dead_in_end_zone', xOn(101), 1, LB)], 1);
    expect(outcome).toMatchObject({ score: { type: 'safety', side: 0 }, possessionAfter: 1 });
  });
});

describe('B7.5.2 momentum exception (through the local type alias of change request CR-02-1)', () => {
  const pick = (on: number, momentum: boolean | undefined) => (c: RulingContext) => {
    const p = { ...ev.poss(3, 1, CB, xOn(on), 'interception'), ...(momentum === undefined ? {} : { momentum }) } as TruthEvent;
    return [ev.snap(), ev.poss(0.1, 0, QB, xOn(75), 'snap'), ev.pass(2, xOn(75), true), p, ev.dead(4, 'ball_dead_in_end_zone', xOn(102), 1, CB)];
  };
  // The strict contract schema rejects the extra flag, so these cases bypass the schema check of `run`.
  const rule = (setup: Setup, events: (c: RulingContext) => TruthEvent[]) => { const ctx = context(setup); return scrimmageRuling.rule(truthOf(ctx, events(ctx), 1), ctx); };
  it('interception at the 3 running toward his own goal, downed in the end zone: his team ball at the 3', () => {
    expect(rule({ ballOn: 80 }, pick(97, true))).toMatchObject({ score: null, touchback: false, possessionAfter: 1, spotX: xOn(97), changeOfPossession: true });
  });
  it('same at the half-yard line: ball at the 1', () => {
    expect(rule({ ballOn: 80 }, pick(99.5, true)).spotX).toBe(xOn(99));
    expect(rule({ rules: B, ballOn: 80 }, pick(99.5, true)).spotX).toBe(xOn(97));
    expect(rule({ rules: fixtureRules('fixture_a', { 'touchback.momentum_min_yardline': 0 }), ballOn: 80 }, pick(99.5, true)).spotX).toBe(xOn(99.5));
  });
  it('possession established in the end zone: touchback', () => {
    expect(rule({ ballOn: 80 }, pick(101, true))).toMatchObject({ touchback: true, spotX: xOn(80) });
  });
  it('with no momentum the same play is a safety', () => {
    expect(rule({ ballOn: 80 }, pick(97, false)).score).toMatchObject({ type: 'safety', side: 0 });
    expect(rule({ ballOn: 80 }, pick(97, undefined)).score).toMatchObject({ type: 'safety', side: 0 });
  });
});

describe('B7.6.1 touchback', () => {
  it('interception 4 yards deep, kneel: ball at the touchback yard line, between the inbounds lines', () => {
    const { outcome, series, ctx } = run({ ballOn: 80 }, (c) => [ev.snap(), ev.poss(0.1, 0, QB, xOn(75), 'snap'), ev.pass(2, xOn(75), true), ev.catchPoint(3, xOn(104), 'interception'),
      ev.poss(3, 1, CB, xOn(104), 'interception', 5), ev.dead(4, 'ball_dead_in_end_zone', xOn(104), 1, CB, 5)], 0);
    expect(outcome).toMatchObject({ resultType: 'interception', touchback: true, score: null, possessionAfter: 1, spotX: xOn(80), spotY: ctx.geometry.centreY });
    expect(series).toMatchObject({ possession: 1, down: 1, lineToGainX: xOn(70) });
  });
});
