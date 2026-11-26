import { describe, expect, it } from 'vitest';
import { Contract, stateHash } from '@gm/engine-core';
import { createGameFlow, deadlinePassed, stateInvariantProblems, PARAMS, RULE_KEYS, UNIT_START_PHASES, type FlowResume } from '../../src/flow/index.ts';
import { chartDecider, fakeGame, silentDecider, type FakeGameOptions } from './fakes.ts';
import { checkingSink, eventsOfType, replayHashes, runChecked } from './harness.ts';

const RULE_SETS: FakeGameOptions[] = [
  { base: 'pro_2026', format: 'timed_period' },
  { base: 'college_2026', format: 'alternating_series_25' },
];
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

describe('game flow: whole games against fake officiating and a fake resolver (WP-06 acceptance)', () => {
  for (const rs of RULE_SETS) {
    it(`${rs.base}: games run from the toss to the final whistle with every state invariant holding (Q1.2.2)`, () => {
      for (const seed of SEEDS) {
        const game = fakeGame({ ...rs, seed });
        const run = runChecked(game);
        expect(run.problems).toEqual([]);
        const { final, events, records, drives } = run.result;
        expect(final.phase).toBe('final');
        expect(events[0]!.type).toBe('game_started');
        expect(events[events.length - 1]!.type).toBe('game_final');
        expect(run.transitions).toBe(events.length);
        expect(records.length).toBe(final.playCounter);
        expect(records.length).toBeGreaterThan(60);
        expect(final.period).toBeGreaterThanOrEqual(game.rules.num('clock.periods'));
        expect(drives.length).toBe(final.driveCounter);
        expect(drives.every((d) => d.result !== 'in_progress')).toBe(true);
        // The statistics sink saw each final record once, in order (J11.9.1).
        expect(run.statsRecords.map((r) => r.index)).toEqual(records.map((r) => r.index));
        // The scoreboard equals the sum of the scores in the play records.
        const sum = [0, 0];
        for (const r of records) if (r.final.score && !r.final.noPlay) sum[r.final.score.side]! += r.final.score.points;
        expect(sum).toEqual(final.score);
        // A game that is not tied in regulation has no overtime period; a tie is only final where the fixture format allows it.
        if (final.score[0] === final.score[1]) expect(rs.format).toBe('timed_period');
      }
    });

    it(`${rs.base}: replaying the event log from a new game reproduces every state hash (J11.1.1)`, () => {
      for (const seed of SEEDS.slice(0, 3)) {
        const game = fakeGame({ ...rs, seed });
        const run = runChecked(game);
        // The log survives a save round trip: plain data, no generator state (J13.5.2).
        const log = JSON.parse(JSON.stringify(run.result.events)) as Contract.GameEvent[];
        const replay = replayHashes(game, run.flow, log);
        expect(replay.final).toBe(stateHash(run.result.final));
        expect(replay.perPlay).toEqual(run.result.records.map((r) => r.stateHash));
      }
    });

    it(`${rs.base}: the same seed gives the identical event log, another seed a different one (J13)`, () => {
      const a = runChecked(fakeGame({ ...rs, seed: 11 })).result;
      const b = runChecked(fakeGame({ ...rs, seed: 11 })).result;
      const c = runChecked(fakeGame({ ...rs, seed: 12 })).result;
      expect(stateHash(a.events)).toBe(stateHash(b.events));
      expect(stateHash(a.final)).toBe(stateHash(b.final));
      expect(stateHash(a.events)).not.toBe(stateHash(c.events));
    });

    it(`${rs.base}: a game finishes with deciders that never answer (J11.6.1)`, () => {
      const game = fakeGame({ ...rs, seed: 21, deciders: () => [silentDecider(0), silentDecider(1)] });
      const run = runChecked(game);
      expect(run.problems).toEqual([]);
      expect(run.result.final.phase).toBe('final');
      const requested = eventsOfType(run.result.events, 'decision_requested');
      const missed = eventsOfType(run.result.events, 'deadline_missed');
      const made = eventsOfType(run.result.events, 'decision_made');
      // Every request has a deadline and a default; every one was missed and answered by the default.
      expect(missed.length).toBe(requested.length);
      expect(made.length).toBe(requested.length);
      expect(made.every((e) => e.decision.actor.kind === 'default')).toBe(true);
      for (const { request } of requested) {
        expect(request.deadlinePlayClockTenths !== null || request.windowTenths !== null).toBe(true);
        if (request.options.length > 0) expect(request.options.map((o) => o.optionId)).toContain(request.defaultOptionId);
      }
      const types = new Set(requested.map((e) => e.request.type));
      for (const t of ['toss_call', 'toss_choice', 'snapping_call', 'opposing_call', 'timeout', 'try_choice'] as const) expect(types).toContain(t);
      // The play clock always runs: a default call still snaps the ball with time on it or at zero, never above the clock.
      const max = game.deps.officiating.clock.playClockTenths('normal', game.deps);
      expect(run.result.records.every((r) => r.situation.playClockAtSnapTenths >= 0 && r.situation.playClockAtSnapTenths <= max)).toBe(true);
    });
  }

  it('events, records and the final state are valid contract shapes', () => {
    for (const rs of RULE_SETS) {
      const run = runChecked(fakeGame({ ...rs, seed: 3 }));
      for (const e of run.result.events) expect(Contract.GameEvent.safeParse(e).success, e.type).toBe(true);
      expect(Contract.GameState.safeParse(run.result.final).success).toBe(true);
      for (const r of run.result.records) expect(Contract.playTruthProblems(r.truth)).toEqual([]);
      for (const d of run.result.drives) expect(Contract.DriveRecord.safeParse(d).success).toBe(true);
    }
  });

  it('the module files are valid contract shapes and every parameter says where its number came from', () => {
    expect(Contract.ParamFile.safeParse(PARAMS).success).toBe(true);
    expect(Contract.RuleKeyManifest.safeParse(RULE_KEYS).success).toBe(true);
    for (const p of PARAMS.params) {
      expect(p.value).toBeGreaterThanOrEqual(p.min);
      expect(p.value).toBeLessThanOrEqual(p.max);
      expect(['bible', 'assumption']).toContain(p.basis);
      expect(p.leaf).toMatch(/^[A-Z]\d+(\.\d+)*$/);
    }
    const game = fakeGame();
    for (const k of RULE_KEYS) expect(game.rules.keys()).toContain(k.key);
  });

  it('deciders see called values only: no truth field of the last play reaches them (Q1.4.1)', () => {
    const seen: Contract.CalledPlay[] = [];
    const game = fakeGame({
      seed: 5,
      deciders: (env, input) => [0, 1].map((side) => {
        const inner = chartDecider(side as Contract.Side, env, input);
        return { side: inner.side, decide(view: Contract.DecisionView) { if (view.lastCalled) seen.push(view.lastCalled); return inner.decide(view); } };
      }) as [Contract.Decider, Contract.Decider],
    });
    const run = runChecked(game);
    expect(seen.length).toBeGreaterThan(100);
    for (const c of seen) {
      expect(c.trueOutcome).toEqual(c.calledOutcome);
      expect(c.rulings.every((r) => r.trueValue === r.calledValue && r.marginYd === null)).toBe(true);
      expect(c.fouls.every((f) => f.called)).toBe(true);
    }
    // The fake crew did err in this game, so the check above is not vacuous.
    expect(run.result.records.some((r) => r.called.trueOutcome.spotX !== r.called.calledOutcome.spotX)).toBe(true);
  });
});

describe('game flow: stepping a game with advance (J14.1.1, J13.5.2)', () => {
  /** A coach who answers only the second time he is asked the same question, like a user taking his time. */
  function slowDecider(inner: Contract.Decider, asked: Set<number>, every = 1): Contract.Decider {
    return {
      side: inner.side,
      decide(view) {
        if (view.request.requestId % every !== 0 || asked.has(view.request.requestId)) return inner.decide(view);
        asked.add(view.request.requestId);
        return null;
      },
    };
  }

  it('a game stepped through prompts gives the same event log as the headless game', () => {
    for (const rs of RULE_SETS) {
      const headless = runChecked(fakeGame({ ...rs, seed: 31 })).result;
      const asked = new Set<number>();
      const game = fakeGame({ ...rs, seed: 31, deciders: (env, input) => [slowDecider(chartDecider(0, env, input), asked, 3), chartDecider(1, env, input)] });
      const problems: string[] = [];
      const count = { n: 0 };
      const flow = createGameFlow(game.deps, { sink: checkingSink(game, problems, count) });
      let state = flow.newGame(game.input, game.deps);
      const events: Contract.GameEvent[] = [];
      let resume: FlowResume | null = null;
      let stops = 0;
      const midPlayStops = new Set<string>();
      for (;;) {
        const step = flow.advance(state, game.input, game.deps, resume);
        events.push(...step.events);
        state = step.state;
        resume = step.resume;
        if (state.phase === 'final') break;
        // It stopped with exactly the unanswered request pending.
        expect(resume).not.toBeNull();
        expect(state.pendingDecisions.length).toBeGreaterThan(0);
        if (!UNIT_START_PHASES.includes(state.phase)) midPlayStops.add(state.phase);
        stops++;
      }
      expect(problems).toEqual([]);
      expect(stops).toBeGreaterThan(50);
      // It stopped inside plays too (a penalty choice or a challenge) and still continued identically.
      expect(midPlayStops.size).toBeGreaterThan(0);
      expect(count.n).toBe(events.length);
      expect(stateHash(events)).toBe(stateHash(headless.events));
      expect(stateHash(state)).toBe(stateHash(headless.final));
    }
  });

  it('save at a call window, load and continue equals continuing without saving (J13.5.2)', () => {
    const full = runChecked(fakeGame({ seed: 41 })).result;
    for (const stopAt of [5, 40, 90]) {
      // Side 1 goes silent once at a call window; the state there is saved and reloaded as plain data.
      let silentAt: number | null = null;
      const game = fakeGame({
        seed: 41,
        deciders: (env, input) => {
          const inner = chartDecider(1, env, input);
          const waiting: Contract.Decider = {
            side: 1,
            decide(view) {
              const call = view.request.type === 'snapping_call' || view.request.type === 'opposing_call';
              if (call && view.situation.playNumber === stopAt && silentAt === null) { silentAt = view.request.requestId; return null; }
              return inner.decide(view);
            },
          };
          return [chartDecider(0, env, input), waiting];
        },
      });
      const flow = createGameFlow(game.deps);
      const first = flow.advance(flow.newGame(game.input, game.deps), game.input, game.deps);
      expect(silentAt).not.toBeNull();
      expect(['call_window', 'kickoff_setup']).toContain(first.state.phase);
      // Save: the state at the last save point (the start of the call window) and the events up to it, as plain data.
      const unitEvents = first.resume!.returned;
      const saved = JSON.parse(JSON.stringify(first.events.slice(0, first.events.length - unitEvents))) as Contract.GameEvent[];
      const loaded = JSON.parse(JSON.stringify(first.resume!.base)) as Contract.GameState;
      expect(stateHash(loaded)).toBe(stateHash(saved.reduce((s, e) => flow.apply(s, e), flow.newGame(game.input, game.deps))));
      const rest = flow.advance(loaded, game.input, game.deps);
      expect(rest.state.phase).toBe('final');
      expect(stateHash([...saved, ...rest.events])).toBe(stateHash(full.events));
      expect(stateHash(rest.state)).toBe(stateHash(full.final));
    }
  });

  it('a deadline that passes in a stepped game is logged and the default applies', () => {
    const game = fakeGame({
      seed: 51,
      deciders: (env, input) => [chartDecider(0, env, input), { side: 1, decide: (view) => deadlinePassed(view.request) }],
    });
    const flow = createGameFlow(game.deps);
    const step = flow.advance(flow.newGame(game.input, game.deps), game.input, game.deps);
    expect(step.state.phase).toBe('final');
    expect(step.resume).toBeNull();
    const missed = new Set(eventsOfType(step.events, 'deadline_missed').map((e) => e.requestId));
    const bySide1 = eventsOfType(step.events, 'decision_requested').filter((e) => e.request.side === 1);
    expect(bySide1.length).toBeGreaterThan(100);
    expect(bySide1.every((e) => missed.has(e.request.requestId))).toBe(true);
    expect(stateInvariantProblems(game.deps, step.state)).toEqual([]);
  });

  it('advance refuses a state inside a play when it is given no resume value', () => {
    const game = fakeGame({ seed: 61 });
    const flow = createGameFlow(game.deps);
    const run = flow.simulateGame(game.input, game.deps);
    let s = flow.newGame(game.input, game.deps);
    for (const e of run.events) {
      s = flow.apply(s, e);
      if (s.phase === 'play') break;
    }
    expect(s.phase).toBe('play');
    expect(() => flow.advance(s, game.input, game.deps)).toThrow(/inside a play/);
  });
});
