// Simulation contract, part 15: the game state machine's surface (J11, J14.1.1). `simulateGame` is the
// headless game of J14.1.1: it loops the state machine and answers every decision request through the
// two deciders. A watched game and a headless game with the same inputs produce identical event logs.
import type { Side } from './primitives.ts';
import type { SimTeam } from './player.ts';
import type { Environment } from './environment.ts';
import type { FieldGeometry } from './frames.ts';
import type { StreamSource, DeterministicMath } from './random.ts';
import type { NumberSources } from './params.ts';
import type { Resolver } from './truth.ts';
import type { Officiating, OfficialsCrew } from './officiating.ts';
import type { GameState, GameEvent, PlayRecord, DriveRecord, Decider } from './game-state.ts';

/** Self-contained input snapshot of one game (J14.2.1): nothing in it depends on another game of the same week. */
export interface GameInput {
  readonly gameId: number;
  readonly ruleSetId: string;
  readonly gameType: GameState['gameType'];
  /** Indexed by Side: 0 home, 1 visitor. */
  readonly teams: readonly [SimTeam, SimTeam];
  readonly crew: OfficialsCrew;
  readonly environment: Environment;
  /** Game seed, 16 hex digits, derived from the schedule (J13.4.1), never from execution order. */
  readonly seedHex: string;
  readonly fidelityTier: PlayRecord['fidelityTier'];
}

/** What the state machine is given besides the input. It holds interfaces only, so every part can be faked in tests. */
export interface GameDeps extends NumberSources {
  readonly geometry: FieldGeometry;
  readonly streams: StreamSource;
  readonly math: DeterministicMath;
  /** The reference resolver in phases 1 and 2, the tick engine from phase 4 (J1.6.3). */
  readonly resolver: Resolver;
  readonly officiating: Officiating;
  readonly deciders: readonly [Decider, Decider];
}

export interface GameResult {
  readonly final: GameState;
  /** The ordered event list: the source of truth (J11.1.1). Replaying it from `newGame` reproduces `final` bit for bit. */
  readonly events: readonly GameEvent[];
  readonly records: readonly PlayRecord[];
  readonly drives: readonly DriveRecord[];
}

/** The surface of the game state machine in @gm/engine-game (WP-06). */
export interface GameFlow {
  newGame(input: GameInput, deps: GameDeps): GameState;
  /** Pure: `next = apply(state, event)` (J11.1.1). Throws on a (phase, event) pair that is not in the transition table. */
  apply(state: GameState, event: GameEvent): GameState;
  /**
   * Advances until a decision is pending that no decider answered or the game is final, and returns
   * the events produced. Saves are taken only between plays (J13.5.2).
   */
  advance(state: GameState, input: GameInput, deps: GameDeps): { state: GameState; events: GameEvent[] };
  simulateGame(input: GameInput, deps: GameDeps): GameResult;
}

/** Which side has the ball next, for callers that only hold a state. */
export type PossessionOf = (state: GameState) => Side;
