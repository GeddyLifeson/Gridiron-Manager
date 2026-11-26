// Test harness for the game flow: runs a fake game with the invariant checker on every transition.
import { Contract, stateHash } from '@gm/engine-core';
import {
  createGameFlow, stateInvariantProblems, transitionProblems, replayEvents, type FlowSink, type FlowApi,
} from '../../src/flow/index.ts';
import type { FakeGame } from './fakes.ts';

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

export interface CheckedRun {
  readonly flow: FlowApi;
  readonly result: Contract.GameResult;
  /** Invariant and transition failures, each with the event that caused it (Q1.2.2 outputs). */
  readonly problems: string[];
  readonly transitions: number;
  readonly statsRecords: Contract.PlayRecord[];
}

/** A sink that checks Q1.2.2 after every event and freezes every state, so an in-place change throws (J11.1.1). */
export function checkingSink(game: FakeGame, problems: string[], count: { n: number }, records: Contract.PlayRecord[] = []): FlowSink {
  return {
    onEvent(event, before, after) {
      count.n++;
      deepFreeze(after);
      for (const p of [...transitionProblems(before, event, after), ...stateInvariantProblems(game.deps, after)]) {
        problems.push(`${p} after ${event.type} (state hash before: ${stateHash(before)})`);
      }
    },
    onPlay(record) { records.push(record); },
  };
}

export function runChecked(game: FakeGame): CheckedRun {
  const problems: string[] = [];
  const count = { n: 0 };
  const statsRecords: Contract.PlayRecord[] = [];
  const flow = createGameFlow(game.deps, { sink: checkingSink(game, problems, count, statsRecords) });
  const result = flow.simulateGame(game.input, game.deps);
  return { flow, result, problems, transitions: count.n, statsRecords };
}

/** Replays the event list from a new game and returns the final state hash and the hash after each play. */
export function replayHashes(game: FakeGame, flow: FlowApi, events: readonly Contract.GameEvent[]): { final: string; perPlay: string[] } {
  let s = flow.newGame(game.input, game.deps);
  const perPlay: string[] = [];
  for (const e of events) {
    s = flow.apply(s, e);
    if (e.type === 'play_resolved') perPlay.push(stateHash(s));
  }
  return { final: stateHash(s), perPlay };
}

export function eventsOfType<T extends Contract.GameEvent['type']>(events: readonly Contract.GameEvent[], type: T): Extract<Contract.GameEvent, { type: T }>[] {
  return events.filter((e): e is Extract<Contract.GameEvent, { type: T }> => e.type === type);
}

export { replayEvents };
