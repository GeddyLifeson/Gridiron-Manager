// Tick resolver assembly, part 1: the integration points (J1.6.1, J1.6.3, J1.3.1; build plan WP-23).
// The tick resolver is the one place where every play stage is registered with the tick loop. This
// file fixes how a stage module plugs in, so the quarterback (WP-20), ball carrier (WP-21) and
// fouls-and-injuries (WP-22) modules can be wired the day they merge, and so the resolver can say
// honestly which of them it is still missing.
//
// Types only. Nothing here draws a number, reads a rule or holds a football value.
import type { Assignment, PlayInput, TickWorld } from '@gm/schema';
import type { BallStages } from '../ball/index.ts';
import type { Contests } from '../contest/index.ts';
import type { Movement } from '../kinematics/index.ts';
import type { Perception, PerceptionConfig } from '../perception/index.ts';
import type { PlayContext, PlayerAi, PlayerMind, SlotPlay } from '../player-ai/index.ts';
import type { CarrierPlay } from '../carrier/stage.ts';
import type { PresnapInput, PresnapPlan, SnapResult } from '../presnap/index.ts';
import type { QbPlay } from '../qb/play.ts';
import type { PlayStage } from '../tick/index.ts';

/** The stage modules the build plan gives to other work packages. The assembly owns everything else. */
export const PLUG_IDS = ['qb', 'carrier', 'foulsInjuries'] as const;
export type PlugId = (typeof PLUG_IDS)[number];

/**
 * Registration order of the modules (J13.3.2). The tick loop runs stages of the same name in the
 * order they were registered, so this list IS the order inside each of Perceive, Decide, Move,
 * Interact and Detect. It never depends on which modules are present, on a map's iteration order or
 * on anything read at run time. Changing it changes results and so changes the golden hashes.
 */
export const MODULE_ORDER = [
  'presnap', 'perception', 'playerAi', 'movement', 'heldBall', 'ball', 'boundary', 'interact', 'kickOp', 'catchPoint',
  'qb', 'carrier', 'foulsInjuries', 'finish',
] as const;
export type ModuleId = (typeof MODULE_ORDER)[number];

/**
 * The shared instances of one resolver. Every stage module of a play gets the same objects, so a
 * quarterback's throw and a defender's view of it go through one perception module, one ball and one
 * movement module. A stage module keeps the reference; it never builds its own copy.
 */
export interface PlayServices {
  readonly perception: Perception;
  readonly movement: Movement;
  readonly playerAi: PlayerAi;
  readonly ball: BallStages;
  /** Built once per play from the play's parameter table. */
  contests(): Contests;
  /** The pre-snap plan of the play being run (J5), null on a free kick, and the snap once it has happened. */
  plan(): PresnapPlan | null;
  snap(): SnapResult | null;
  /** What the content port supplied for the play. */
  setup(): PlaySetup;
  /** The input of the play being run: situation, calls, teams, environment. */
  input(): PlayInput;
  /** The kicking look the play is snapped from (`PlaySetup.kickLook`), or null. */
  kickLook(): KickLook | null;
  /**
   * The slot of a passer whose arrival contests the quarterback module is resolving this tick (J6.2.5:
   * pressure, hit, sack, escape), or -1. A carrier module must not tackle that man: he is the
   * quarterback module's until he throws, hands off or becomes a runner.
   */
  protectedPasser(): number;
  /** The quarterback module registers how to answer `protectedPasser`. Called once, in `create`. */
  claimPasser(slotNow: () => number): void;
  /**
   * The slot the kick operation still owns: the punter until he punts, the holder until the place kick
   * is struck or the operation fails (a bobble, a lost ball). -1 otherwise, and always -1 on a play from
   * a kicking look (`kickLook`): nobody kicks, so the man with the ball is a runner or a passer. A
   * carrier module leaves the owned man alone, exactly like `protectedPasser`.
   */
  kickOwner(): number;
  /**
   * What the ball carrier module offers the others, or null while it is a stand-in. Read at run time
   * or in `setPlay`, never in `create`: the carrier module is created after the quarterback module.
   */
  runner(): RunnerHooks | null;
  /** The ball carrier module registers its hooks. Called once, in `create`. */
  claimRunner(hooks: RunnerHooks): void;
}

/** The ball carrier module's two services to the quarterback module (J7.5, J8). */
export interface RunnerHooks {
  /** From here the carrier module steers this man and he can be tackled like any runner. True when it took him. */
  onRun(world: TickWorld, slot: number, why: string): boolean;
  /** Best running lane beyond the line for this man, 0 to 1. Draws nothing. */
  laneQuality(world: TickWorld, slot: number): number;
}

/**
 * One stage module as the assembly sees it. `create` runs once per resolver; the stages are reused
 * for every play and reset their own state in `begin` (P6.3.1: nothing is built per play).
 *
 * Rules a module must keep:
 *   - Draws come only from `world.streams`, on the module's own stream names, scoped
 *     [gameId, playNumber, ...] (J13.2.1). A module never draws from another module's stream.
 *   - It loops slots 0 to 21 in order and reads no other module's same-tick decision.
 *   - It emits truth events through `world.emit` with the interpolated time of the act; the assembly
 *     puts the play's events in J1.3.1 order once, after the loop.
 *   - It ends a play only by setting `world.deadAtTick` and emitting the one `dead_ball` event.
 *   - After the whistle (`world.deadAtTick !== null`) it may add only fouls, injuries and detail.
 *   - Every chance it uses stays inside the open interval the contest floor and ceiling give
 *     (J6.1.3): a possible act is never given a chance of exactly 0 or 1 (A3 ruling 22).
 */
export interface StagePlug {
  readonly id: PlugId;
  readonly version: string;
  create(services: PlayServices): PlugStages;
}

export interface PlugStages {
  /** Any mix of stage names; the loop sorts them by name and keeps this order inside a name. */
  readonly stages: readonly PlayStage[];
  /** Called after the pre-snap plan exists and before the loop's `begin`, like `PlayerAi.setPlay`. */
  setPlay?(world: TickWorld): void;
  /** J10.6.2 hit energy the slot took and gave this play, for `PlayerDelta.hitLoad`. The fouls-and-injuries module's ledger is used alone when it has one; otherwise the modules' are summed. */
  hitLoad?(slot: number): number;
  /** True when the module needs the after-whistle ticks even with no film kept (a dead-ball foul hazard is live). */
  wantsAfterWhistle?(world: TickWorld): boolean;
  /** Rows for the J4.6.2 explain record, kept only at `detail: 'full'`. */
  explain?(): readonly unknown[];
}

/**
 * Everything about one play that the two calls name by content id. `@gm/engine-core` may not import
 * `@gm/football-content` (P1.2.1), so the caller hands the resolver a port that looks the content up.
 * All of it is authored content or team-level state; no outcome number can arrive this way (G1.1.1).
 */
export interface PlaySetup {
  /** J5 input. Its `offense.assignments` and `defense.assignments` are team-slot order 0 to 10. */
  readonly presnap: PresnapInput;
  /**
   * Per world slot 0 to 21: the K1 inputs that are not the compiled assignment (the resolver compiles
   * `presnap.*.assignments` itself with `@gm/football-lang` and fills `compiled`). Null for a slot the
   * coach left empty: fewer than eleven still runs and draws its flag.
   */
  readonly slots: readonly (Omit<SlotPlay, 'compiled' | 'mind'> | null)[];
  readonly context: PlayContext;
  /** Per world slot: the J3 settings the call fixes (keys, preparation, aggression). */
  readonly perception: readonly PerceptionConfig[];
  /** The assignment a slot falls back to for J4.5.3 "ran the old call", by world slot. */
  readonly alternates?: readonly (Assignment | null)[];
  /**
   * What the quarterback is handed before the snap (J7 inputs): his drop, progression, hot rule, mesh
   * read and the coach's instructions. Null or absent: the play has no quarterback procedure (a kick,
   * a direct snap to a runner). Read by the quarterback module only.
   */
  readonly qb?: QbPlay | null;
  /**
   * What the ball carrier module is handed before the snap (J8 inputs): a designed run's back rules
   * (aiming point, read key) and the return call. Null or absent: every carrier runs on the look-ahead.
   */
  readonly carrier?: CarrierPlay | null;
  /**
   * Set when an offensive call is snapped from a kicking formation (a fake, or a play from the kick look
   * on a try). Null or absent: an ordinary snap. Never with a kick call: a kick call is the kick.
   */
  readonly kickLook?: KickLook | null;
}

/**
 * A scrimmage play snapped from a kicking formation (F12.7.1, I4.6.1): a fake punt, a fake field goal,
 * or a play from the kick look on a try. The call is an offensive call; the eleven men are the kicking
 * unit the coach sent out, lined up by the play's own assignments, and they play with their own grades
 * (a punter throws like a punter). The engine does three things for it: the long snapper snaps to the
 * man named here, the ball takes a long snap's time to reach him, and nobody kicks.
 */
export interface KickLook {
  /** The kick the formation shows. It changes nothing in the play; it is recorded so film, statistics and scouting can find the fake. */
  readonly kind: 'punt' | 'field_goal' | 'try_kick';
  /** Team slot (0 to 10) the ball is snapped to: the punter, the protector, the holder, the kicker. */
  readonly snapTo: number;
}

export interface PlayContentPort {
  /**
   * The setup for the two calls of `input`. Must be a pure function of `input`: the same calls and
   * content hashes give the same setup on every machine. Returns null when a content id is unknown;
   * the resolver then throws, because a saved game can never hold a call its content set lacks.
   */
  setup(input: PlayInput): PlaySetup | null;
}

/** Personality per player (K1; requested on `SimPlayer` as a contract change by WP-19). */
export interface MindPort { mind(playerId: number): PlayerMind }

export interface TickResolverOptions {
  readonly content: PlayContentPort;
  /** Defaults to the neutral mind for everyone until the contract carries personality. */
  readonly minds?: MindPort | null;
  /** The plugged modules. A missing one is replaced by its stand-in and named in `standIns`. */
  readonly plugs?: readonly StagePlug[];
}

/**
 * What `createTickResolver` returns besides the contract `Resolver`: the modules it is running on
 * stand-ins. While this list is not empty `mayProduceSavedResults` is false, exactly as for the
 * reference resolver (J14.1.2): a stand-in cannot simulate a play on its merits, so nothing it
 * produces may be saved into a career.
 */
export interface TickResolverReport {
  readonly standIns: readonly PlugId[];
  readonly moduleVersions: Readonly<Record<string, string>>;
}
