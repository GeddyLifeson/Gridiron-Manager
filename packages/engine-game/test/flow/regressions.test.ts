// Regression tests for engine bugs found by module testing. Each test names the report it came from.
import { describe, expect, it } from 'vitest';
import { Contract, stateHash } from '@gm/engine-core';
import { overtime as realOvertime } from '@gm/officiating';
import { OPT, createGameFlow, deadlinePassed, type FlowResume } from '../../src/flow/index.ts';
import { chartDecider, fakeGame, type FakeGame, type FakeGameOptions, type FakeOutcome, type FakeScript } from './fakes.ts';
import { eventsOfType, replayHashes, runChecked } from './harness.ts';

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

type Step = { event: Contract.GameEvent; before: Contract.GameState; after: Contract.GameState };
function stepsOf(game: FakeGame): { steps: Step[]; result: Contract.GameResult; run: ReturnType<typeof runChecked> } {
  const run = runChecked(game);
  expect(run.problems).toEqual([]);
  const steps: Step[] = [];
  let s = run.flow.newGame(game.input, game.deps);
  for (const event of run.result.events) { const after = run.flow.apply(s, event); steps.push({ event, before: s, after }); s = after; }
  return { steps, result: run.result, run };
}

/**
 * Chart deciders where `taker` asks for a timeout on play `play`, once, at the timeout request that comes AFTER
 * its own call for that play. `at` is the play-clock value of the request, from the request's deadline (the snap).
 */
function lateTimeout(taker: Contract.Side, play: number, at: (snapAt: number) => number | null): FakeGameOptions['deciders'] {
  return (env, input) => [0, 1].map((side) => {
    const inner = chartDecider(side as Contract.Side, env, input);
    let called = false, taken = false;
    return { side: inner.side, decide(v: Contract.DecisionView) {
      const d = inner.decide(v);
      if (d === null || v.situation.playNumber !== play || side !== taker) return d;
      if (v.request.type === 'snapping_call' || v.request.type === 'opposing_call') { called = true; return d; }
      if (v.request.type !== 'timeout' || !called || taken) return d;
      taken = true;
      return { ...d, optionId: OPT.timeout, acceptedAtPlayClockTenths: at(v.request.deadlinePlayClockTenths!) };
    } };
  }) as [Contract.Decider, Contract.Decider];
}

describe('a team timeout while the play clock runs, after the calls and before the snap (calling console request; B1.4.1, J11.6.1)', () => {
  const PLAY = 6;
  for (const taker of [0, 1] as const) {
    it(`side ${taker} takes a timeout after both calls are in: the clock stops, the calls are made again and the play is run`, () => {
      const game = fakeGame({ seed: 2, deciders: lateTimeout(taker, PLAY, (snapAt) => snapAt + 20) });
      const { steps, result } = stepsOf(game);
      const charged = steps.filter((s) => s.event.type === 'timeout_charged' && s.event.kind === 'team');
      expect(charged.length).toBe(1);
      const c = charged[0]!;
      expect(c.event).toMatchObject({ side: taker });
      // Both calls were already in: the game was past the call window.
      expect(c.before.phase).toBe('pre_snap');
      expect(c.before.pendingDecisions).toEqual([]);
      expect(c.after.phase).toBe('timeout');
      expect(c.after.timeoutsLeft[taker]).toBe(c.before.timeoutsLeft[taker] - 1);
      expect(c.after.timeoutsLeft[Contract.otherSide(taker)]).toBe(c.before.timeoutsLeft[Contract.otherSide(taker)]);
      expect(c.after.clockStatus).toBe('stopped_start_on_snap');
      expect(c.after.playClockTenths).toBe(game.rules.num('clock.play_clock_after_stoppage_s') * 10);
      // The play clock ran down to 2 seconds before the snap while the coach waited, and the snap did not happen.
      const i = steps.indexOf(c);
      const request = [...steps.slice(0, i)].reverse().find((s) => s.event.type === 'decision_requested')!;
      const snapAt = (request.event as Extract<Contract.GameEvent, { type: 'decision_requested' }>).request.deadlinePlayClockTenths!;
      expect((request.event as Extract<Contract.GameEvent, { type: 'decision_requested' }>).request).toMatchObject({ type: 'timeout', side: taker });
      expect(request.before.phase).toBe('pre_snap');
      expect(c.before.playClockTenths).toBe(snapAt + 20);
      expect(c.before.playCounter).toBe(PLAY - 1);
      // After the timeout the game is back in the call window and both coaches call again.
      const back = steps[i + 1]!;
      expect(back.event).toMatchObject({ type: 'clock_advanced', reason: 'intermission', tenths: game.rules.num('timeout.length_seconds') * 10 });
      expect(back.after).toMatchObject({ phase: 'call_window', playClockRunning: true, playCounter: PLAY - 1 });
      const record = result.records.find((x) => x.index === PLAY)!;
      expect(record.decisions.filter((d) => d.type === 'snapping_call').length).toBe(2);
      expect(record.decisions.filter((d) => d.type === 'opposing_call').length).toBe(2);
      expect(record.decisions.filter((d) => d.type === 'timeout' && d.optionId === OPT.timeout).length).toBe(1);
      expect(result.final.phase).toBe('final');
    });
  }

  it('a request at or after the snap, or with the play clock at zero, is not granted', () => {
    // One tenth after the snap moment.
    const late = stepsOf(fakeGame({ seed: 2, deciders: lateTimeout(0, PLAY, (snapAt) => snapAt - 1) }));
    expect(late.steps.some((s) => s.event.type === 'timeout_charged' && s.event.kind === 'team')).toBe(false);
    expect(late.result.records.find((x) => x.index === PLAY)!.decisions.some((d) => d.type === 'timeout' && d.optionId === OPT.timeout)).toBe(true);
    // The offense calls with the play clock at zero, so the snap is at zero: a timeout request then comes too late.
    const zero = stepsOf(fakeGame({ seed: 2, deciders: (env, input) => {
      const base = lateTimeout(0, PLAY, () => 0)!(env, input);
      return [{ side: 0, decide(v) { const d = base[0].decide(v); return d && v.request.type === 'snapping_call' && v.situation.playNumber === PLAY ? { ...d, acceptedAtPlayClockTenths: 0 } : d; } }, base[1]];
    } }));
    expect(zero.steps.some((s) => s.event.type === 'timeout_charged' && s.event.kind === 'team')).toBe(false);
  });

  it('a team with no timeout left is not asked', () => {
    const game = fakeGame({ seed: 2, rulesOver: { 'timeout.per_half': 0 }, deciders: lateTimeout(0, PLAY, (snapAt) => snapAt + 20) });
    const { result } = stepsOf(game);
    expect(eventsOfType(result.events, 'decision_requested').some((e) => e.request.type === 'timeout')).toBe(false);
  });

  it('before a free kick: the kicking or the receiving team may take a timeout after the kick calls', () => {
    // Play 1 is the opening kickoff.
    const game = fakeGame({ seed: 2, deciders: lateTimeout(1, 1, (snapAt) => snapAt + 10) });
    const { steps, result } = stepsOf(game);
    const c = steps.find((s) => s.event.type === 'timeout_charged' && s.event.kind === 'team')!;
    expect(c.before).toMatchObject({ phase: 'kickoff_setup', playCounter: 0 });
    expect(c.after.phase).toBe('timeout');
    expect(steps[steps.indexOf(c) + 1]!.after.phase).toBe('kickoff_setup');
    expect(result.records[0]!.situation.playKind).toBe('kickoff');
    expect(result.records[0]!.decisions.filter((d) => d.type === 'snapping_call').length).toBe(2);
  });

  it('the event log with a late timeout replays to the same hashes, and a stepped game gives the same log (J11.1.1, J14.1.1)', () => {
    const make = () => fakeGame({ seed: 2, deciders: lateTimeout(1, PLAY, (snapAt) => snapAt + 20) });
    const game = make();
    const { result, run } = stepsOf(game);
    const replay = replayHashes(game, run.flow, JSON.parse(JSON.stringify(result.events)) as Contract.GameEvent[]);
    expect(replay.final).toBe(stateHash(result.final));
    expect(replay.perPlay).toEqual(result.records.map((r) => r.stateHash));

    // Stepped: every decider answers null the first time it is asked, so the flow stops at each request and re-runs the unit.
    const stepped = make();
    const asked = new Set<number>();
    const deciders = stepped.deps.deciders.map((d) => ({ side: d.side, decide(v: Contract.DecisionView) {
      if (!asked.has(v.request.requestId)) { asked.add(v.request.requestId); return null; }
      return d.decide(v) ?? deadlinePassed(v.request);
    } })) as unknown as [Contract.Decider, Contract.Decider];
    const deps = { ...stepped.deps, deciders };
    const flow = createGameFlow(deps);
    let state = flow.newGame(stepped.input, deps);
    let resume: FlowResume | null = null;
    const events: Contract.GameEvent[] = [];
    for (let i = 0; i < 100000 && state.phase !== 'final'; i++) {
      const out = flow.advance(state, stepped.input, deps, resume);
      events.push(...out.events); state = out.state; resume = out.resume;
    }
    expect(state.phase).toBe('final');
    expect(stateHash(events)).toBe(stateHash(result.events));
  });
});

describe('deciders cannot learn the truth of the last play (EX-0001, exploit search PR 135, Q1.4.1)', () => {
  /**
   * Officiating whose answers carry different truth: every truth-class field is changed and an uncalled foul is
   * added, while every called value stays the same. The real officiating is handed back its own objects, so
   * the game itself cannot change.
   */
  const scrambledTruth: FakeGameOptions['officiating'] = (fake) => {
    const original = new WeakMap<Contract.CalledPlay, Contract.CalledPlay>();
    const scramble = (c: Contract.CalledPlay): Contract.CalledPlay => {
      const ghost = c.fouls[0] ? [{ ...c.fouls[0], foulId: 'ghost', called: false, correct: false, eventIndex: 3 }] : [];
      const out: Contract.CalledPlay = {
        ...c,
        trueOutcome: { ...c.trueOutcome, spotX: c.trueOutcome.spotX + 7, yardsGained: c.trueOutcome.yardsGained + 7, touchback: !c.trueOutcome.touchback },
        rulings: c.rulings.map((r) => ({ ...r, eventIndex: r.eventIndex + 1, trueValue: 'X', marginYd: 9.5, marginS: 1.5, visibility: r.visibility === 'pile' ? 'open' : 'pile' })),
        fouls: [...c.fouls.map((f) => ({ ...f, correct: !f.correct, eventIndex: f.eventIndex === null ? 0 : f.eventIndex + 1 })), ...ghost],
      };
      original.set(out, c);
      return out;
    };
    return {
      ...fake,
      rulePlay: (truth, ctx) => scramble(fake.rulePlay(truth, ctx)),
      review: (called, truth, request, ctx) => {
        const r = fake.review(original.get(called) ?? called, truth, request, ctx);
        return { ...r, called: scramble(r.called) };
      },
    };
  };
  /** Every view handed to either decider, in order, as text. */
  const views = (opts: Partial<FakeGameOptions>) => {
    const seen: string[] = [];
    const game = fakeGame({
      seed: 5, ...opts,
      deciders: (env, input) => [0, 1].map((side) => {
        const inner = chartDecider(side as Contract.Side, env, input);
        return { side: inner.side, decide(view: Contract.DecisionView) { seen.push(JSON.stringify(view)); return inner.decide(view); } };
      }) as [Contract.Decider, Contract.Decider],
    });
    const r = runChecked(game);
    return { seen, records: r.result.records };
  };

  it('two games whose officiating differs only in truth hand the deciders identical views', () => {
    const plain = views({});
    const scrambled = views({ officiating: scrambledTruth });
    expect(plain.seen.length).toBeGreaterThan(100);
    expect(scrambled.seen).toEqual(plain.seen);
    // The truth really did differ, and some views carried a ruling, so the check is not vacuous.
    expect(scrambled.records.some((r, i) => JSON.stringify(r.called.trueOutcome) !== JSON.stringify(plain.records[i]!.called.trueOutcome))).toBe(true);
    expect(plain.seen.some((v) => v.includes('"calledOutcome"'))).toBe(true);
  });

  it('the view of the last play holds no truth-class key, by the strict contract schema', () => {
    for (const v of views({ officiating: scrambledTruth }).seen) {
      const last = (JSON.parse(v) as Contract.DecisionView).lastCalled;
      if (last) expect(Contract.ObservedCalledPlay.safeParse(last).success).toBe(true);
    }
  });
});
