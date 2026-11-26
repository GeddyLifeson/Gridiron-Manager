import { describe, expect, it } from 'vitest';
import { Contract } from '@gm/engine-core';
import { OPT, createGameFlow, situationOf, tossOutcome } from '../../src/flow/index.ts';
import { chartDecider, fakeGame, type ChartPolicy, type FakeGameOptions, type FakeOutcome, type FakeScript } from './fakes.ts';
import { eventsOfType, runChecked, type CheckedRun } from './harness.ts';

type Step = { event: Contract.GameEvent; before: Contract.GameState; after: Contract.GameState };

function run(o: FakeGameOptions): CheckedRun & { steps: Step[]; game: ReturnType<typeof fakeGame> } {
  const game = fakeGame(o);
  const r = runChecked(game);
  expect(r.problems).toEqual([]);
  const steps: Step[] = [];
  let s = r.flow.newGame(game.input, game.deps);
  for (const event of r.result.events) { const after = r.flow.apply(s, event); steps.push({ event, before: s, after }); s = after; }
  return { ...r, steps, game };
}

const huddleParams = fakeGame({ seed: 1 }).deps.params;

const pickFor = (type: Contract.DecisionType, choose: (request: Contract.DecisionRequest, situation: Contract.GameSituation) => string | undefined): ChartPolicy['pick'] =>
  (request, situation) => (request.type === type ? choose(request, situation) : undefined);

/** A quiet play: a short run in bounds with nothing else going on. */
const QUIET: Partial<FakeOutcome> = { kind: 'run', yards: 1, oob: false, foul: null, injury: false, reviewWrong: false, liveTenths: 40 };
/** A regulation with no points: nothing completes, no kick is good, no return goes anywhere. */
const scoreless: FakeScript = (sit, calls) => {
  if (calls.snapping.unit === 'kick') return { good: false, ret: 0, yards: 40, foul: null, injury: false };
  return { ...QUIET, kind: 'incomplete' };
};
const regulation = (sit: Contract.GameSituation) => !sit.overtime;

describe('the coin toss (B1.1.2)', () => {
  it('reads every first-half choice into the kickers of both halves', () => {
    // Winner receives: he kicks off the second half. Winner kicks: he kicks off both halves (the real mistake).
    expect(tossOutcome(0, OPT.receive, null)).toMatchObject({ receiver: 0, secondHalfReceiver: 1 });
    expect(tossOutcome(0, OPT.kick, null)).toMatchObject({ receiver: 1, secondHalfReceiver: 1 });
    // Winner defers: the loser chooses now, the winner has first choice in the second half.
    expect(tossOutcome(1, OPT.defer, OPT.receive)).toMatchObject({ receiver: 0, secondHalfReceiver: 1 });
    expect(tossOutcome(1, OPT.defer, OPT.kick)).toMatchObject({ receiver: 1, secondHalfReceiver: 1 });
    // Winner takes a goal: the loser has the kick-or-receive privilege.
    expect(tossOutcome(0, OPT.defendWest, OPT.receive)).toMatchObject({ receiver: 1, attackDir: [1, -1] });
    expect(tossOutcome(1, OPT.defendWest, OPT.kick)).toMatchObject({ receiver: 1, attackDir: [-1, 1] });
    expect(tossOutcome(0, OPT.defer, OPT.defendEast)).toMatchObject({ receiver: 0, attackDir: [1, -1] });
  });

  it('the kicker of each half follows the toss, and choosing to kick means kicking off twice', () => {
    for (const choice of [OPT.receive, OPT.kick, OPT.defer, OPT.defendEast]) {
      const r = run({ seed: 3, policy: { pick: pickFor('toss_choice', (req) => (req.options.some((o) => o.optionId === choice) ? choice : undefined)) } });
      const toss = eventsOfType(r.result.events, 'toss')[0]!;
      const state = r.steps.find((s) => s.event.type === 'toss')!.after;
      expect(state.phase).toBe('kickoff_setup');
      const first = r.result.records[0]!;
      expect(first.situation.playKind).toBe('kickoff');
      expect(first.situation.offense).toBe(state.toss!.firstHalfKicker);
      const half = r.steps.find((s) => s.event.type === 'period_ended' && s.event.next === 'halftime')!;
      expect(half.after.phase).toBe('kickoff_setup');
      expect(half.after.possession).toBe(state.toss!.secondHalfKicker);
      expect(half.after.timeoutsLeft).toEqual([r.game.rules.num('timeout.per_half'), r.game.rules.num('timeout.per_half')]);
      if (choice === OPT.kick) expect([state.toss!.firstHalfKicker, state.toss!.secondHalfKicker]).toEqual([toss.winner, toss.winner]);
      if (choice === OPT.receive) expect([state.toss!.firstHalfKicker, state.toss!.secondHalfKicker]).toEqual([Contract.otherSide(toss.winner), toss.winner]);
    }
  });

  it('the visiting captain wins about half of 2,000 seeded tosses', () => {
    let visitorWins = 0;
    const games = 2000;
    for (let seed = 0; seed < games; seed++) {
      // Stop at the first kick call: only the pre-game runs.
      const game = fakeGame({ seed, deciders: (env, input) => [0, 1].map((side) => {
        const inner = chartDecider(side as Contract.Side, env, input);
        return { side: inner.side, decide: (v: Contract.DecisionView) => (v.request.type === 'snapping_call' || v.request.type === 'opposing_call' ? null : inner.decide(v)) };
      }) as [Contract.Decider, Contract.Decider] });
      const flow = createGameFlow(game.deps);
      const step = flow.advance(flow.newGame(game.input, game.deps), game.input, game.deps);
      if (step.state.toss!.winner === 1) visitorWins++;
    }
    expect(visitorWins / games).toBeGreaterThan(0.46);
    expect(visitorWins / games).toBeLessThan(0.54);
  });
});

describe('scores, tries and restarts (J11.7.1)', () => {
  const scoreOn2 = (second: Partial<FakeOutcome>, third: Partial<FakeOutcome> = {}): FakeScript => (sit) =>
    (sit.playNumber === 1 ? { yards: 60, ret: 10 } : sit.playNumber === 2 ? { ...QUIET, ...second } : sit.playNumber === 3 ? { foul: null, injury: false, ...third } : undefined);

  it('touchdown, then the try from the spot of the choice, then a kickoff by the scoring team', () => {
    for (const base of ['pro_2026', 'college_2026'] as const) for (const choice of [OPT.tryKick, OPT.tryTwo]) {
      const r = run({ base, seed: 4, script: scoreOn2({ yards: 200 }, { good: true, defenseScoresOnTry: false }), policy: { pick: pickFor('try_choice', () => choice) } });
      const [, td, attempt, kickoff] = r.result.records;
      const scorer = td!.situation.offense;
      expect(td!.final.score).toMatchObject({ type: 'touchdown', side: scorer, points: r.game.rules.num('score.touchdown') });
      expect(r.steps.find((s) => s.event.type === 'play_resolved' && s.event.record.index === 2)!.after.phase).toBe('dead_ball');
      expect(r.steps.find((s) => s.event.type === 'decision_requested' && s.event.request.type === 'try_choice')!.before.phase).toBe('try_decision');
      // One untimed down from the rule set's spot for the choice.
      const yard = r.game.rules.num(choice === OPT.tryKick ? 'try.kick_snap_yardline' : 'try.two_point_snap_yardline');
      expect(attempt!.situation.playKind).toBe('try');
      expect(attempt!.situation.offense).toBe(scorer);
      expect(Contract.yardsToGoal(r.game.deps.geometry, attempt!.situation.ballX, attempt!.situation.attackDir)).toBeCloseTo(yard, 9);
      expect(attempt!.clockAfter.clockTenths).toBe(td!.clockAfter.clockTenths);
      const tryPoints = attempt!.final.score!.points;
      expect(attempt!.scoreAfter[scorer]).toBe(r.game.rules.num('score.touchdown') + tryPoints);
      expect(kickoff!.situation.playKind).toBe('kickoff');
      expect(kickoff!.situation.offense).toBe(scorer);
      expect(kickoff!.situation.down).toBeNull();
    }
  });

  it('a defensive score on the try counts for the defense and the scoring team still kicks off', () => {
    const r = run({ seed: 4, script: scoreOn2({ yards: 200 }, { kind: 'try_two', good: false, defenseScoresOnTry: true }), policy: { pick: pickFor('try_choice', () => OPT.tryTwo) } });
    const [, td, attempt, kickoff] = r.result.records;
    const scorer = td!.situation.offense;
    expect(attempt!.final.score).toMatchObject({ type: 'defensive_try', side: Contract.otherSide(scorer) });
    expect(attempt!.scoreAfter[Contract.otherSide(scorer)]).toBe(r.game.rules.num('try.two_point_points'));
    expect(kickoff!.situation.offense).toBe(scorer);
  });

  it('safety: points to the other team, then a free kick by the team scored upon', () => {
    const r = run({ seed: 4, script: scoreOn2({ kind: 'sack', yards: -200 }) });
    const [, safety, kick] = r.result.records;
    const offense = safety!.situation.offense;
    expect(safety!.final.score).toMatchObject({ type: 'safety', side: Contract.otherSide(offense), points: r.game.rules.num('score.safety') });
    expect(kick!.situation.playKind).toBe('safety_kick');
    expect(kick!.situation.offense).toBe(offense);
    expect(r.result.drives[0]).toMatchObject({ driveNumber: 1, side: offense, result: 'safety', plays: 1 });
  });

  it('field goal: points and a kickoff by the scoring team; a miss changes possession at the spot', () => {
    const fieldGoalOn2 = (good: boolean): FakeScript => (sit) => (sit.playNumber === 1 ? { yards: 60, ret: 10 } : sit.playNumber === 2 ? { foul: null, injury: false, good } : undefined);
    const fg: ChartPolicy = {};
    const deciders: FakeGameOptions['deciders'] = (env, input) => [0, 1].map((side) => {
      const inner = chartDecider(side as Contract.Side, env, input, fg);
      return { side: inner.side, decide(v: Contract.DecisionView) {
        const d = inner.decide(v);
        if (d && v.request.type === 'snapping_call' && v.situation.playNumber === 2) return { ...d, snappingCall: { unit: 'kick' as const, kickKind: 'field_goal' as const, callContentId: null, contentHash: null, direction: null, players: [] } };
        return d;
      } };
    }) as [Contract.Decider, Contract.Decider];
    const good = run({ seed: 4, script: fieldGoalOn2(true), deciders });
    expect(good.result.records[1]!.final.score).toMatchObject({ type: 'field_goal', points: good.game.rules.num('score.field_goal') });
    expect(good.result.records[2]!.situation).toMatchObject({ playKind: 'kickoff', offense: good.result.records[1]!.situation.offense });
    expect(good.result.drives[0]!.result).toBe('field_goal');
    const miss = run({ seed: 4, script: fieldGoalOn2(false), deciders });
    const [, attempt, next] = miss.result.records;
    expect(next!.situation).toMatchObject({ playKind: 'scrimmage', offense: Contract.otherSide(attempt!.situation.offense), down: 1, ballX: attempt!.situation.ballX });
    expect(miss.result.drives[0]!.result).toBe('missed_field_goal');
    // A call with no players at all still ran: the flow never repairs or refuses a call.
    expect(attempt!.calls.snapping.players).toEqual([]);
  });
});

describe('periods and clocks (J11.4, J11.8.1)', () => {
  it('after a quarter change the offense attacks the other goal from the mirrored spot with the same down and distance', () => {
    let checked = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const r = run({ seed });
      for (const s of r.steps) {
        if (s.event.type !== 'period_ended' || s.event.next !== 'next_period' || s.before.nextPlayKind !== 'scrimmage') continue;
        const a = situationOf(r.game.deps, s.before), b = situationOf(r.game.deps, s.after);
        const g = r.game.deps.geometry;
        expect(b.attackDir).toBe(-a.attackDir);
        expect(b.offense).toBe(a.offense);
        expect(b.down).toBe(a.down);
        expect(b.distanceYd).toBeCloseTo(a.distanceYd!, 9);
        expect(Contract.yardsToGoal(g, b.ballX, b.attackDir)).toBeCloseTo(Contract.yardsToGoal(g, a.ballX, a.attackDir), 9);
        expect(b.ballY).toBeCloseTo(g.widthYd - a.ballY, 9);
        expect(s.after.clockTenths).toBe(r.game.rules.num('clock.period_length_s') * 10);
        expect(s.after.timeoutsLeft).toEqual(s.before.timeoutsLeft);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(5);
  });

  it('between plays a running game clock loses exactly the play clock used; a stopped one loses nothing (J11.4.1 rule 4)', () => {
    const r = run({ seed: 7 });
    let running = 0, stopped = 0;
    const timeoutPlays = new Set(r.steps.filter((s) => s.event.type === 'timeout_charged').map((s) => s.after.playCounter));
    for (let i = 1; i < r.result.records.length; i++) {
      const prev = r.result.records[i - 1]!, next = r.result.records[i]!;
      if (prev.situation.period !== next.situation.period || timeoutPlays.has(prev.index) || prev.clockAfter.runoff) continue;
      const used = prev.clockAfter.playClockTenths - next.situation.playClockAtSnapTenths;
      expect(used).toBeGreaterThan(0);
      if (prev.clockAfter.status === 'running') { expect(next.situation.clockTenths).toBe(Math.max(0, prev.clockAfter.clockTenths - used)); running++; }
      if (prev.clockAfter.status === 'stopped_start_on_snap') { expect(next.situation.clockTenths).toBe(prev.clockAfter.clockTenths); stopped++; }
    }
    expect(running).toBeGreaterThan(20);
    expect(stopped).toBeGreaterThan(20);
  });

  it('in hurry-up the earliest snap is limited by the spotting delay, not by the offense (J11.4.2)', () => {
    const r = run({ seed: 8, paramsOver: { 'flow.preSnapHurryUpTenths': 0 }, policy: { tempo: 'hurry_up' } });
    const min = r.game.deps.params.num('flow.spottingMinTenths');
    const full = r.game.rules.num('clock.play_clock_s') * 10;
    let checked = 0, afterStoppage = 0;
    for (let i = 1; i < r.result.records.length; i++) {
      const prev = r.result.records[i - 1]!, next = r.result.records[i]!;
      if (next.calls.snapping.unit !== 'offense' || prev.situation.period !== next.situation.period) continue;
      if (r.steps.some((s) => s.event.type === 'timeout_charged' && s.after.playCounter === prev.index)) continue;
      // The full play clock starts at the dead ball, so the spotting delay is on it. A shorter clock starts on the
      // ready signal, after the spotting (Rule 4-6-2), so no spotting time shows on it.
      if (prev.clockAfter.playClockTenths !== full) { afterStoppage++; continue; }
      expect(prev.clockAfter.playClockTenths - next.situation.playClockAtSnapTenths).toBeGreaterThanOrEqual(min);
      checked++;
    }
    expect(checked).toBeGreaterThan(50);
    expect(afterStoppage).toBeGreaterThan(5);
  });

  it('the snap comes at the tempo\'s target: a huddle offense uses most of the play clock, no-huddle less, hurry-up least (J5.8.1)', () => {
    const used = (tempo: 'huddle' | 'no_huddle' | 'hurry_up') => {
      const r = run({ seed: 21, policy: { tempo } });
      const full = r.game.rules.num('clock.play_clock_s') * 10;
      const xs: number[] = [];
      for (let i = 1; i < r.result.records.length; i++) {
        const prev = r.result.records[i - 1]!, next = r.result.records[i]!;
        if (next.calls.snapping.unit !== 'offense' || prev.situation.period !== next.situation.period || prev.clockAfter.playClockTenths !== full) continue;
        if (r.steps.some((s) => s.event.type === 'timeout_charged' && s.after.playCounter === prev.index)) continue;
        expect(next.situation.playClockAtSnapTenths).toBeGreaterThanOrEqual(0);
        xs.push(full - next.situation.playClockAtSnapTenths);
      }
      expect(xs.length).toBeGreaterThan(30);
      return { mean: xs.reduce((a, b) => a + b, 0) / xs.length, min: Math.min(...xs), max: Math.max(...xs) };
    };
    const huddle = used('huddle'), noHuddle = used('no_huddle'), hurry = used('hurry_up');
    // Dead ball to snap, in tenths. The real gaps these follow are in flow/pace-facts.json (snap to snap, so with the live play).
    expect(huddle.mean).toBeGreaterThan(300);
    expect(huddle.mean).toBeLessThan(380);
    expect(noHuddle.mean).toBeGreaterThan(200);
    expect(noHuddle.mean).toBeLessThan(huddle.mean - 50);
    expect(hurry.mean).toBeGreaterThan(120);
    expect(hurry.mean).toBeLessThan(noHuddle.mean - 30);
    // Nobody snaps before the ball is spotted and the offense is set.
    const p = (name: string) => huddleParams.num(name);
    expect(hurry.min).toBeGreaterThanOrEqual(p('flow.spottingMinTenths') + p('flow.preSnapHurryUpTenths') * (1 - p('flow.preSnapSpreadShare')) - 1);
  });

  it('a play clock set after a stoppage starts on the ready signal, the full one at the dead ball (Rule 4-6)', () => {
    const r = run({ seed: 22 });
    const full = r.game.rules.num('clock.play_clock_s') * 10;
    let stopped = 0, ran = 0;
    for (const s of r.steps) {
      if (s.event.type !== 'clock_advanced' || s.event.reason !== 'spotting' || s.before.phase !== 'dead_ball') continue;
      expect(s.after.playClockRunning).toBe(true);
      // An official stoppage (injury, two-minute timeout) holds even the full clock until the ready signal.
      if (s.before.playClockRunning) { expect(s.before.playClockTenths).toBe(full); expect(s.after.playClockTenths).toBe(Math.max(0, full - s.event.tenths)); ran++; }
      else { expect(s.after.playClockTenths).toBe(s.before.playClockTenths); if (s.before.playClockTenths !== full) stopped++; }
    }
    expect(ran).toBeGreaterThan(20);
    expect(stopped).toBeGreaterThan(5);
  });

  it('a coach who calls late snaps with the play clock at zero; the flow reports it and plays on', () => {
    const r = run({ seed: 9, policy: { acceptedAt: (req) => (req.type === 'snapping_call' ? 5 : null) } });
    const scrimmage = r.result.records.filter((x) => x.situation.playKind === 'scrimmage');
    expect(scrimmage.every((x) => x.situation.playClockAtSnapTenths === 0)).toBe(true);
    expect(r.result.final.phase).toBe('final');
  });

  it('a period that ends on an accepted defensive foul is extended by one untimed down (B1.7.2)', () => {
    const script: FakeScript = (sit) => {
      if (sit.period !== 1 || sit.playKind !== 'scrimmage') return undefined;
      return sit.untimedDown ? QUIET : { ...QUIET, liveTenths: 100000, foul: { on: 'defense', yards: 5 } };
    };
    const r = run({ seed: 5, script, policy: { pick: pickFor('penalty_choice', () => 'accept') } });
    const fouled = r.result.records.find((x) => x.clockAfter.untimedDown)!;
    expect(fouled.clockAfter).toMatchObject({ clockTenths: 0, periodExpired: true, untimedDown: true });
    const extra = r.result.records[fouled.index]!;
    expect(extra.situation).toMatchObject({ period: 1, clockTenths: 0, untimedDown: true, playKind: 'scrimmage' });
    expect(r.result.records[extra.index]!.situation.period).toBe(2);
    expect(eventsOfType(r.result.events, 'period_ended')[0]).toMatchObject({ period: 1, next: 'next_period' });
  });

  it('a charged timeout stops the clock, costs one timeout and resets the play clock; an illegal answer is no answer', () => {
    const policy: ChartPolicy = {
      pick: (req, sit) => (req.type === 'timeout' && sit.playNumber === 6 && req.side === 0 ? OPT.timeout : undefined),
      acceptedAt: (req) => (req.type === 'timeout' ? 300 : null),
    };
    const r = run({ seed: 2, policy });
    const charged = r.steps.find((s) => s.event.type === 'timeout_charged' && s.event.kind === 'team')!;
    expect(charged.before.phase).toBe('call_window');
    expect(charged.after.phase).toBe('timeout');
    expect(charged.after.timeoutsLeft[0]).toBe(charged.before.timeoutsLeft[0] - 1);
    expect(charged.after.clockStatus).toBe('stopped_start_on_snap');
    expect(charged.after.playClockTenths).toBe(r.game.rules.num('clock.play_clock_after_stoppage_s') * 10);
    const back = r.steps[r.steps.indexOf(charged) + 1]!;
    expect(back.event).toMatchObject({ type: 'clock_advanced', reason: 'intermission', tenths: r.game.rules.num('timeout.length_seconds') * 10 });
    expect(back.after).toMatchObject({ phase: 'call_window', clockTenths: charged.after.clockTenths, playClockRunning: true });
    expect(back.after.elapsedTenths - back.before.elapsedTenths).toBe(r.game.rules.num('timeout.length_seconds') * 10);

    // An answer naming an option that was not offered is treated as no answer: the deadline event and the default.
    const bad = run({ seed: 3, policy: { pick: undefined }, deciders: (env, input) => [chartDecider(0, env, input), {
      side: 1, decide(v) { const d = chartDecider(1, env, input).decide(v); return d && v.request.type === 'try_choice' ? { ...d, optionId: 'three_points' } : d; },
    }] });
    const tries = eventsOfType(bad.result.events, 'decision_requested').filter((e) => e.request.type === 'try_choice' && e.request.side === 1);
    expect(tries.length).toBeGreaterThan(0);
    const missed = new Set(eventsOfType(bad.result.events, 'deadline_missed').map((e) => e.requestId));
    expect(tries.every((e) => missed.has(e.request.requestId))).toBe(true);
  });

  it('runoff: the opponent may take it or decline it, and the offender may spend a timeout instead (B1.6.1)', () => {
    // Short periods inside the fixture two-minute mark; every second snap after it draws a foul on the offense.
    const rulesOver = { 'clock.period_length_s': 300, 'fixture.two_minute_s': 290 };
    const script: FakeScript = (sit, calls) => {
      if (calls.snapping.unit === 'kick') return { foul: null, injury: false, ret: 0 };
      return { ...QUIET, liveTenths: 30, foul: sit.insideTwoMinute && sit.playNumber % 2 === 0 ? { on: 'offense', yards: 5 } : null };
    };
    const outcomes = { taken: 0, declined: 0, bought: 0 };
    for (const [opponent, offender] of [[OPT.runoffTake, OPT.runoffAccept], [OPT.runoffDecline, OPT.runoffAccept], [OPT.runoffTake, OPT.runoffTimeout]] as const) {
      const pick: ChartPolicy['pick'] = (req) => (req.type === 'penalty_choice' ? 'accept' : req.type !== 'runoff_choice' ? undefined : req.options.some((o) => o.optionId === opponent) ? opponent : offender);
      const r = run({ seed: 6, rulesOver, script, policy: { pick } });
      for (const s of r.steps) {
        if (s.before.pendingRunoff === null || s.after.pendingRunoff !== null) continue;
        const size = s.before.pendingRunoff.tenths;
        expect(s.event.type).toBe('decision_made');
        const option = s.event.type === 'decision_made' ? s.event.decision.optionId : null;
        if (option === OPT.runoffDecline) { expect(s.after.clockTenths).toBe(s.before.clockTenths); outcomes.declined++; }
        if (option === OPT.runoffTimeout) {
          expect(s.after.clockTenths).toBe(s.before.clockTenths);
          const next = r.steps[r.steps.indexOf(s) + 1]!;
          expect(next.event).toMatchObject({ type: 'timeout_charged', kind: 'team', side: s.before.pendingRunoff.against });
          expect(next.after.timeoutsLeft[s.before.pendingRunoff.against]).toBe(next.before.timeoutsLeft[s.before.pendingRunoff.against] - 1);
          outcomes.bought++;
        }
        if (option === OPT.runoffAccept || option === OPT.runoffTake) { expect(s.after.clockTenths).toBe(Math.max(0, s.before.clockTenths - size)); outcomes.taken++; }
      }
    }
    expect(outcomes.taken).toBeGreaterThan(0);
    expect(outcomes.declined).toBeGreaterThan(0);
    expect(outcomes.bought).toBeGreaterThan(0);
  });
});

describe('ruling, penalty choice and replay (J11.2.1)', () => {
  const foulOn3: FakeScript = (sit) => (sit.playNumber === 1 ? { yards: 60, ret: 10 } : sit.playNumber === 2 ? QUIET : sit.playNumber === 3 ? { ...QUIET, yards: 2, foul: { on: 'defense', yards: 5 } } : undefined);

  it('the offended coach accepts or declines; a nullified play is flagged no play and replays the down', () => {
    const accept = run({ seed: 3, script: foulOn3, policy: { pick: pickFor('penalty_choice', () => 'accept') } });
    const a = accept.result.records[2]!;
    expect(a.chosenOptionId).toBe('accept');
    expect(a.final).toMatchObject({ noPlay: true, resultType: 'no_play' });
    expect(a.called.fouls).toHaveLength(1);
    expect(a.seriesAfter).toMatchObject({ down: 1, possession: a.situation.offense });
    expect(Math.abs(a.seriesAfter.ballX - a.situation.ballX)).toBeCloseTo(5, 9);
    expect(a.decisions.some((d) => d.type === 'penalty_choice' && d.side === Contract.otherSide(a.called.fouls[0]!.side))).toBe(true);
    const request = accept.steps.find((s) => s.event.type === 'decision_requested' && s.event.request.type === 'penalty_choice')!;
    // Both coaches passed on a challenge first, so the choice is asked from the ruling phase.
    expect([request.before.phase, request.after.phase]).toEqual(['ruling', 'penalty_decision']);
    // The no-play is not a play of the drive (J11.9.1).
    expect(accept.steps.find((s) => s.event.type === 'play_resolved' && s.event.record.index === 3)!.after.drive!.plays).toBe(1);

    const decline = run({ seed: 3, script: foulOn3, policy: { pick: pickFor('penalty_choice', () => 'decline') } });
    const d = decline.result.records[2]!;
    expect(d.final).toMatchObject({ noPlay: false, resultType: 'run', yardsGained: 2 });
    expect(d.final.enforcement).toMatchObject({ declined: [0], enforced: [] });
    expect(d.seriesAfter.down).toBe(3);
  });

  const wrongOn3 = (reviewWrong: boolean): FakeScript => (sit) =>
    (sit.playNumber === 1 ? { yards: 60, ret: 10 } : sit.playNumber === 2 ? QUIET : sit.playNumber === 3 ? { ...QUIET, yards: 4, reviewWrong } : undefined);
  const challengeOn3: ChartPolicy = { pick: (req, sit) => (req.type === 'challenge' && sit.playNumber === 3 && req.side === sit.offense ? 'spot' : undefined) };

  it('a won challenge corrects the play before it is logged and costs nothing', () => {
    const r = run({ seed: 3, script: wrongOn3(true), policy: challengeOn3 });
    const rec = r.result.records[2]!;
    const review = r.steps.find((s) => s.event.type === 'review_resolved')!;
    expect(review.before.phase).toBe('review');
    expect(review.after.phase).toBe('ruling');
    expect(review.event).toMatchObject({ reversed: true, request: { source: 'coach_challenge', side: rec.situation.offense } });
    expect(review.after.challengesUsed[rec.situation.offense]).toBe(1);
    expect(review.after.challengesWon[rec.situation.offense]).toBe(1);
    expect(rec.final.yardsGained).toBe(4);
    expect(rec.called.calledOutcome.spotX).toBe(rec.called.trueOutcome.spotX);
    const play = r.steps.find((s) => s.event.type === 'play_resolved' && s.event.record.index === 3)!;
    expect(play.after.timeoutsLeft).toEqual(play.before.timeoutsLeft);
    expect(r.steps.indexOf(review)).toBeLessThan(r.steps.indexOf(play));
    // Without the challenge the crew's short spot stands, and only the truth block knows better.
    const stood = run({ seed: 3, script: wrongOn3(true) }).result.records[2]!;
    expect(stood.final.yardsGained).toBe(3);
    expect(stood.called.trueOutcome.yardsGained).toBe(4);
  });

  it('a lost challenge costs a timeout and the ruling stands', () => {
    const r = run({ seed: 3, script: wrongOn3(false), policy: challengeOn3 });
    const rec = r.result.records[2]!;
    const review = r.steps.find((s) => s.event.type === 'review_resolved')!;
    expect(review.event).toMatchObject({ reversed: false });
    expect(review.after.challengesUsed[rec.situation.offense]).toBe(1);
    expect(review.after.challengesWon[rec.situation.offense]).toBe(0);
    const charge = r.steps[r.steps.indexOf(review) + 1]!;
    expect(charge.event).toMatchObject({ type: 'timeout_charged', side: rec.situation.offense, kind: 'team' });
    expect(charge.after.timeoutsLeft[rec.situation.offense]).toBe(charge.before.timeoutsLeft[rec.situation.offense] - 1);
    expect(rec.final.yardsGained).toBe(4);
  });
});

describe('overtime by the format in the rule set (J11.8.2)', () => {
  const tieThen = (overtime: FakeScript): FakeScript => (sit, calls) => (regulation(sit) ? scoreless(sit, calls) : overtime(sit, calls));
  const otPlays = (r: CheckedRun) => r.result.records.filter((x) => x.situation.overtime);
  /** Ordinal of a scrimmage series in overtime, from the drive numbers. */
  const series = (r: CheckedRun, rec: Contract.PlayRecord) => rec.situation.driveNumber - otPlays(r).find((x) => x.situation.playKind === 'scrimmage')!.situation.driveNumber + 1;

  it('timed period: toss, kickoff, and the first touchdown wins', () => {
    const r = run({ seed: 2, script: tieThen((sit, calls) => (calls.snapping.unit === 'kick' ? { yards: 60, ret: 10 } : { ...QUIET, yards: 200 })) });
    const periods = r.game.rules.num('clock.periods');
    const ended = r.steps.find((s) => s.event.type === 'period_ended' && s.event.next === 'overtime')!;
    expect(ended.after).toMatchObject({ phase: 'overtime_toss', period: periods + 1, clockTenths: r.game.rules.num('overtime.period_length_s') * 10, overtime: null });
    expect(ended.after.timeoutsLeft).toEqual([r.game.rules.num('fixture.ot_timeouts'), r.game.rules.num('fixture.ot_timeouts')]);
    const toss = r.steps.find((s) => s.event.type === 'toss' && s.event.tossIndex === 1)!;
    expect(toss.after.phase).toBe('kickoff_setup');
    expect(toss.after.overtime).toMatchObject({ otPeriod: 1, tossWinner: (toss.event as { winner: number }).winner });
    expect(toss.after.possession).toBe(Contract.otherSide(toss.after.overtime!.firstPossession));
    const plays = otPlays(r);
    expect(plays.map((x) => x.situation.playKind)).toEqual(['kickoff', 'scrimmage']);
    expect(r.result.final).toMatchObject({ phase: 'final', period: periods + 1 });
    expect(r.result.final.score[toss.after.overtime!.firstPossession]).toBe(r.game.rules.num('score.touchdown'));
    expect(r.result.events[r.result.events.length - 1]).toMatchObject({ type: 'game_final', tie: false });
  });

  it('timed period: a scoreless overtime ends tied in the regular season and goes on in the postseason', () => {
    const regular = run({ seed: 2, script: tieThen(scoreless) });
    expect(regular.result.events[regular.result.events.length - 1]).toMatchObject({ type: 'game_final', tie: true, score: [0, 0] });
    expect(regular.result.final.period).toBe(regular.game.rules.num('clock.periods') + 1);

    // Postseason: the second overtime period is played, and the first score in it ends the game.
    const periods = regular.game.rules.num('clock.periods');
    const post = run({ seed: 2, gameType: 'postseason', script: tieThen((sit, calls) => (sit.period === periods + 1 ? scoreless(sit, calls) : calls.snapping.unit === 'kick' ? { yards: 60, ret: 10 } : { ...QUIET, yards: 200 })) });
    expect(post.result.final.period).toBe(periods + 2);
    expect(post.result.final.overtime!.otPeriod).toBe(2);
    expect(post.result.events[post.result.events.length - 1]).toMatchObject({ type: 'game_final', tie: false });
    expect(eventsOfType(post.result.events, 'toss')).toHaveLength(2);
  });

  it('timed period: a field goal on the first possession gives the other team its possession', () => {
    const fieldGoal = { unit: 'kick' as const, kickKind: 'field_goal' as const, callContentId: null, contentHash: null, direction: null, players: [] };
    const kicksInOvertime: FakeGameOptions['deciders'] = (env, input) => [0, 1].map((side) => {
      const inner = chartDecider(side as Contract.Side, env, input);
      return { side: inner.side, decide(v: Contract.DecisionView) {
        const d = inner.decide(v);
        return d && v.request.type === 'snapping_call' && v.situation.overtime && v.situation.playKind === 'scrimmage' ? { ...d, snappingCall: fieldGoal } : d;
      } };
    }) as [Contract.Decider, Contract.Decider];
    // First series: good. Second series: missed, so the first team wins.
    let firstDrive = 0;
    const script = tieThen((sit, calls) => {
      if (sit.playKind !== 'scrimmage') return { yards: 60, ret: 10 };
      if (firstDrive === 0) firstDrive = sit.driveNumber;
      return { good: sit.driveNumber === firstDrive, foul: null, injury: false };
    });
    const r = run({ seed: 2, script, deciders: kicksInOvertime });
    const plays = otPlays(r);
    expect(plays.map((x) => x.situation.playKind)).toEqual(['kickoff', 'scrimmage', 'kickoff', 'scrimmage']);
    const first = plays[1]!.situation.offense;
    expect(plays[3]!.situation.offense).toBe(Contract.otherSide(first));
    expect(series(r, plays[3]!)).toBe(2);
    const fg = r.game.rules.num('score.field_goal');
    expect(r.result.final.score[first]).toBe(fg);
    expect(r.result.final.score[Contract.otherSide(first)]).toBe(0);
    expect(r.result.final.phase).toBe('final');
  });

  it('alternating series: no clock, each team a series from the fixture yard line, a new period while tied, never a tie', () => {
    const base = 'college_2026' as const;
    // Period 1: both teams score a touchdown and the try. Period 2: the first team scores, the second throws four incompletions.
    const periods = fakeGame({ base }).rules.num('clock.periods');
    let secondPeriodFirstDrive = 0;
    const script = tieThen((sit) => {
      if (sit.playKind === 'try') return { good: true, defenseScoresOnTry: false, foul: null, injury: false };
      if (sit.period === periods + 1) return { ...QUIET, yards: 200 };
      if (secondPeriodFirstDrive === 0) secondPeriodFirstDrive = sit.driveNumber;
      return sit.driveNumber === secondPeriodFirstDrive ? { ...QUIET, yards: 200 } : { ...QUIET, kind: 'incomplete' };
    });
    const r = run({ base, seed: 2, script, deciders: (env, input) => [0, 1].map((side) => {
      // Go for it on every down in overtime, so the second series ends on downs.
      const inner = chartDecider(side as Contract.Side, env, input);
      return { side: inner.side, decide(v: Contract.DecisionView) {
        const d = inner.decide(v);
        return d && v.request.type === 'snapping_call' && v.situation.overtime && v.situation.playKind === 'scrimmage' ? inner.decide({ ...v, situation: { ...v.situation, down: 1 } }) : d;
      } };
    }) as [Contract.Decider, Contract.Decider] });
    const toss = r.steps.find((s) => s.event.type === 'toss' && s.event.tossIndex === 1)!;
    const yard = r.game.rules.num('fixture.ot_series_yardline');
    expect(toss.after).toMatchObject({ phase: 'call_window', clockStatus: 'untimed', clockTenths: 0, nextPlayKind: 'scrimmage', down: 1 });
    expect(toss.after.possession).toBe(toss.after.overtime!.firstPossession);
    const plays = otPlays(r);
    const starts = plays.filter((x, i) => x.situation.playKind === 'scrimmage' && (i === 0 || plays[i - 1]!.situation.driveNumber !== x.situation.driveNumber));
    for (const s of starts) expect(Contract.yardsToGoal(r.game.deps.geometry, s.situation.ballX, s.situation.attackDir)).toBeCloseTo(yard, 9);
    expect(plays.every((x) => x.situation.clockStatus === 'untimed' && x.situation.clockTenths === 0)).toBe(true);
    expect(plays.every((x) => x.situation.playClockAtSnapTenths >= 0)).toBe(true);
    // Period 1: series, try, series, try. Period 2: the other team goes first; series, try, then four downs.
    const first = toss.after.overtime!.firstPossession, second = Contract.otherSide(first);
    expect(plays.filter((x) => x.situation.period === periods + 1).map((x) => [x.situation.offense, x.situation.playKind])).toEqual([[first, 'scrimmage'], [first, 'try'], [second, 'scrimmage'], [second, 'try']]);
    const p2 = plays.filter((x) => x.situation.period === periods + 2);
    expect(p2.map((x) => x.situation.offense)).toEqual([second, second, first, first, first, first]);
    expect(p2.slice(2).map((x) => x.situation.down)).toEqual([1, 2, 3, 4]);
    const ended = eventsOfType(r.result.events, 'period_ended').filter((e) => e.next === 'overtime');
    expect(ended.map((e) => e.period)).toEqual([periods, periods + 1]);
    expect(r.steps.find((s) => s.event.type === 'period_ended' && s.event.period === periods + 1)!.before.phase).toBe('dead_ball');
    expect(r.result.final).toMatchObject({ phase: 'final', period: periods + 2 });
    expect(r.result.final.score[second]).toBeGreaterThan(r.result.final.score[first]);
    expect(r.result.events[r.result.events.length - 1]).toMatchObject({ type: 'game_final', tie: false });
  });
});
