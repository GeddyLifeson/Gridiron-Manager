// Phase 0 dummy game (R1.2.1 gate). Game, play row and state shapes for a seeded game that exercises
// rule keys, streams, the play clock and state hashing. It is not football simulation: the real game
// state machine arrives in phase 1 (J11).
import { z } from 'zod';
import { pub, truth } from './field.ts';

export const GamePhase = z.enum(['preGame', 'callWindow', 'try', 'kickoff', 'periodEnd', 'final']);

export const TeamGameState = z.object({
  teamId: pub(z.number().int().positive(), 'id'),
  score: pub(z.number().int().min(0), 'points'),
  timeoutsLeft: pub(z.number().int().min(0), 'count'),
  /** Hidden strength of the dummy team; truth, never shown (P1.1.4). */
  strength: truth(z.number(), 'ratio'),
});

export const DummyGameState = z.object({
  gameId: pub(z.number().int().positive(), 'id'),
  ruleSetId: pub(z.string()),
  phase: pub(GamePhase),
  period: pub(z.number().int().min(1), 'index'),
  clockS: pub(z.number().min(0), 's'),
  playClockS: pub(z.number().min(0), 's'),
  clockRunning: pub(z.boolean()),
  /** Team (0 or 1) that kicked off to start the game, so the second half reverses it. */
  openingKicker: pub(z.number().int().min(0).max(1), 'index'),
  playNumber: pub(z.number().int().min(0), 'index'),
  possession: pub(z.number().int().min(0).max(1), 'index'),
  down: pub(z.number().int().min(1), 'index'),
  yardsToGain: pub(z.number().min(0), 'yd'),
  /** Ball spot as yards from the possessing team's own goal line. */
  ballOn: pub(z.number().min(0), 'yd'),
  teams: pub(z.tuple([TeamGameState, TeamGameState])),
});
export type DummyGameState = z.infer<typeof DummyGameState>;

export const PlayRow = z.object({
  gameId: pub(z.number().int(), 'id'),
  playNumber: pub(z.number().int(), 'index'),
  period: pub(z.number().int(), 'index'),
  clockBeforeS: pub(z.number(), 's'),
  offense: pub(z.number().int(), 'index'),
  down: pub(z.number().int(), 'index'),
  yardsToGain: pub(z.number(), 'yd'),
  ballOn: pub(z.number(), 'yd'),
  call: pub(z.enum(['run', 'pass', 'punt', 'field_goal', 'kneel', 'try_kick', 'try_two', 'kickoff'])),
  gain: pub(z.number(), 'yd'),
  elapsedS: pub(z.number(), 's'),
  result: pub(z.string()),
  stateHash: pub(z.string()),
});
export type PlayRow = z.infer<typeof PlayRow>;
