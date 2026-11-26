import { describe, expect, it } from 'vitest';
import { Contract, stateHash } from '@gm/engine-core';
import { FlowTransitionError, REQUEST_PHASES, TRANSITION_TABLE, UNIT_START_PHASES, transitionRow } from '../../src/flow/index.ts';
import { fakeGame } from './fakes.ts';
import { deepFreeze, runChecked } from './harness.ts';

const PHASES = Contract.GameFlowPhase.options as readonly Contract.GameFlowPhase[];

/** One whole game, with the state before every event kept. */
function trace(seed: number) {
  const game = fakeGame({ seed, base: 'pro_2026', format: 'timed_period', gameType: 'regular', rulesOver: { 'clock.period_length_s': 60 } });
  const run = runChecked(game);
  const steps: { before: Contract.GameState; event: Contract.GameEvent; after: Contract.GameState }[] = [];
  let s = deepFreeze(run.flow.newGame(game.input, game.deps));
  for (const event of run.result.events) {
    const after = deepFreeze(run.flow.apply(s, event));
    steps.push({ before: s, event, after });
    s = after;
  }
  return { game, run, steps };
}

describe('the transition table (J11.2.1)', () => {
  it('is well formed: one row per pair, known phases, and somewhere to go', () => {
    const keys = TRANSITION_TABLE.map((r) => `${r.phase}|${r.event}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const r of TRANSITION_TABLE) {
      expect(PHASES).toContain(r.phase);
      expect(r.to.length).toBeGreaterThan(0);
      for (const p of r.to) expect(PHASES).toContain(p);
      expect(r.note.length).toBeGreaterThan(0);
      expect(transitionRow(r.phase, r.event)).toBe(r);
    }
    expect(TRANSITION_TABLE.filter((r) => r.phase === 'final')).toEqual([]);
    for (const p of UNIT_START_PHASES) expect(PHASES).toContain(p);
    for (const phases of Object.values(REQUEST_PHASES)) {
      for (const p of phases) expect(transitionRow(p, 'decision_requested'), p).toBeDefined();
    }
  });

  it('every transition of a whole game follows its row, and apply changes nothing in place', () => {
    const { steps } = trace(11);
    expect(steps.length).toBeGreaterThan(200);
    for (const { before, event, after } of steps) {
      const row = transitionRow(before.phase, event.type);
      expect(row, `${before.phase}|${event.type}`).toBeDefined();
      expect(row!.to).toContain(after.phase);
    }
  });

  it('every pair outside the table is refused with a FlowTransitionError, and the state is left as it was', () => {
    const { run, steps } = trace(12);
    const stateOf = new Map<Contract.GameFlowPhase, Contract.GameState>();
    const eventOf = new Map<Contract.GameEvent['type'], Contract.GameEvent>();
    for (const st of steps) {
      if (!stateOf.has(st.before.phase)) stateOf.set(st.before.phase, st.before);
      if (!eventOf.has(st.event.type)) eventOf.set(st.event.type, st.event);
    }
    stateOf.set('final', steps[steps.length - 1]!.after);
    let refused = 0;
    for (const [phase, state] of stateOf) {
      const hash = stateHash(state);
      for (const [type, event] of eventOf) {
        if (transitionRow(phase, type) !== undefined) continue;
        expect(() => run.flow.apply(state, event), `${phase}|${type}`).toThrow(FlowTransitionError);
        refused++;
      }
      expect(stateHash(state)).toBe(hash);
    }
    expect(stateOf.size).toBeGreaterThanOrEqual(8);
    expect(refused).toBeGreaterThan(50);
  });

  it('an event that belongs to another moment of the game is refused even when its pair has a row', () => {
    const { run, steps } = trace(13);
    const first = steps[0]!;
    expect(first.event.type).toBe('game_started');
    expect(() => run.flow.apply(first.after, first.event)).toThrow();
    const made = steps.find((s) => s.event.type === 'decision_made')!;
    const madeEvent = made.event as Extract<Contract.GameEvent, { type: 'decision_made' }>;
    const stray: Contract.GameEvent = { ...madeEvent, decision: { ...madeEvent.decision, requestId: 999_999 } };
    expect(() => run.flow.apply(made.before, stray)).toThrow();
    const play = steps.find((s) => s.event.type === 'play_resolved')!;
    const record = (play.event as Extract<Contract.GameEvent, { type: 'play_resolved' }>).record;
    const wrong = { ...play.event, record: { ...record, index: record.index + 5 } } as Contract.GameEvent;
    expect(() => run.flow.apply(play.before, wrong)).toThrow();
  });
});
