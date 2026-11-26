import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { Contract, stateHash } from '@gm/engine-core';
import { TRANSITION_TABLE } from '../../src/flow/index.ts';
import { build, gameArb } from './arbitraries.ts';
import { eventsOfType, replayHashes, runChecked } from './harness.ts';

const RUNS = { numRuns: 150, seed: 20261126 };

describe('game flow properties over arbitrary play results and arbitrary coaches (J11.2.1 acceptance, Q1.2.2)', () => {
  it('every game ends, no (phase, event) pair is undefined, and every state invariant holds after every transition', () => {
    const seenRows = new Set<string>();
    let games = 0, transitions = 0, overtimeGames = 0;
    fc.assert(fc.property(gameArb, (c) => {
      const game = build(c);
      const run = runChecked(game);
      expect(run.problems).toEqual([]);
      const { final, events } = run.result;
      expect(final.phase).toBe('final');
      expect(final.pendingDecisions).toEqual([]);
      expect(eventsOfType(events, 'decision_made').length).toBe(eventsOfType(events, 'decision_requested').length);
      // Illegal calls still ran: the record holds the call as the coach made it, every time.
      for (const r of run.result.records) expect(Contract.playTruthProblems(r.truth)).toEqual([]);
      let s = run.flow.newGame(game.input, game.deps);
      for (const e of events) { seenRows.add(`${s.phase}|${e.type}`); s = run.flow.apply(s, e); }
      games++; transitions += events.length;
      if (final.period > game.rules.num('clock.periods')) overtimeGames++;
    }), RUNS);
    expect(games).toBeGreaterThanOrEqual(RUNS.numRuns);
    expect(transitions).toBeGreaterThan(20_000);
    expect(overtimeGames).toBeGreaterThan(5);
    // Every row is reached except the ones kept for modules that are not built yet (substitution,
    // environment), the timeout before a free kick (the driver opens no window there yet), and the
    // unanswered runoff choice, which is too rare to demand of every run.
    const mayBeUnreached = new Set([
      'call_window|environment_updated', 'call_window|substitution', 'dead_ball|substitution', 'kickoff_setup|environment_updated',
      'kickoff_setup|substitution', 'kickoff_setup|timeout_charged', 'pre_game|environment_updated', 'pre_game|substitution',
      'pre_snap|substitution', 'timeout|substitution', 'dead_ball|deadline_missed',
    ]);
    const unreached = TRANSITION_TABLE.map((r) => `${r.phase}|${r.event}`).filter((k) => !seenRows.has(k) && !mayBeUnreached.has(k));
    expect(unreached).toEqual([]);
  });

  it('replaying the log reproduces the final state and every play hash; the same inputs give the same log (J11.1.1, J13)', () => {
    fc.assert(fc.property(gameArb, (c) => {
      const game = build(c);
      const run = runChecked(game);
      const log = JSON.parse(JSON.stringify(run.result.events)) as Contract.GameEvent[];
      const replay = replayHashes(game, run.flow, log);
      expect(replay.final).toBe(stateHash(run.result.final));
      expect(replay.perPlay).toEqual(run.result.records.map((r) => r.stateHash));
      const again = runChecked(build(c));
      expect(stateHash(again.result.events)).toBe(stateHash(run.result.events));
    }), { ...RUNS, numRuns: 60 });
  });

  it('the log is made of valid contract events and leaves a valid contract state', () => {
    fc.assert(fc.property(gameArb, (c) => {
      const run = runChecked(build(c));
      for (const e of run.result.events) expect(Contract.GameEvent.safeParse(e).success, e.type).toBe(true);
      expect(Contract.GameState.safeParse(run.result.final).success).toBe(true);
    }), { ...RUNS, numRuns: 25 });
  });
});
