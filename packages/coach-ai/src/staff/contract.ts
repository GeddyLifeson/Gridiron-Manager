// The simulation contract types this module needs. `coach-ai` may import `engine-game`, `models` and
// `league` only (P1.2.1), not `schema`, so the types are read off the game flow's own signatures.
// They are the contract's types, not copies: a contract change shows here as a type error.
import type { flow } from '@gm/engine-game';

export type GameDeps = Parameters<typeof flow.simulateGame>[1];
/** J11.6.1: answers decision requests for one team. Staff AI implements it (K6). */
export type Decider = GameDeps['deciders'][number];
export type DecisionView = Parameters<Decider['decide']>[0];
export type Decision = NonNullable<ReturnType<Decider['decide']>>;
export type DecisionRequest = DecisionView['request'];
export type DecisionType = DecisionRequest['type'];
export type GameSituation = DecisionView['situation'];
export type Side = Decider['side'];
export type SnappingCall = NonNullable<Decision['snappingCall']>;
export type OpposingCall = NonNullable<Decision['opposingCall']>;
export type AnyCall = SnappingCall | OpposingCall;
export type FieldGeometry = GameDeps['geometry'];
