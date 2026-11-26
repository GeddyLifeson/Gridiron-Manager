// Simulation contract, part 13: tick-engine entity state (J1.3, J1.4, J2.1.1, J3.1.1, J6.1, P6.3.1).
// Types only: these never cross to the interface, and during a play they live in typed arrays, so
// they carry no validators. Everything here is truth and stays inside the engine (J1.6.2).
// The tick stages run in this order, each for all 22 slots before the next (J1.3.1, J13.3.2):
// Perceive (J3), Decide (J4, K1), Move (J2, in SUBSTEPS sub-steps, players then ball), Interact (J6),
// then event detection in interpolated-time order with slot-index tie-breaks.
import type { PlayerId, Slot, Side, AttackDir, SimSeconds } from './primitives.ts';
import type { FieldGeometry, PlayFrame, PlayPoint } from './frames.ts';
import type { Environment } from './environment.ts';
import type { RandomStream, StreamSource, DeterministicMath } from './random.ts';
import type { NumberSources } from './params.ts';
import type { SimPlayer } from './player.ts';
import type { GameSituation, KickKind } from './situation.ts';
import type { TruthEvent } from './truth.ts';

/** J1.4.1 `moveMode`. The index in this list is the code stored in `SimArrays.moveMode`. */
export const MOVE_MODES = ['stance', 'sprint', 'run', 'backpedal', 'shuffle', 'engaged', 'down'] as const;
export type MoveMode = (typeof MOVE_MODES)[number];

/** J4.2.1 behavior catalogue. The index is the code stored in `SimArrays.behavior`. */
export const BEHAVIORS = [
  'none', 'route', 'passSet', 'runBlock', 'pull', 'ballCarrier', 'quarterback', 'passRush', 'runFit',
  'zoneDrop', 'manCover', 'deepZone', 'blitz', 'spy', 'pursue', 'returnBlock',
  'kickCoverage', 'kickReturnBlock', 'returner', 'kicker', 'holder', 'snapper', 'gunner', 'jammer', 'rushKick', 'protectKick',
] as const;
export type Behavior = (typeof BEHAVIORS)[number];

/** J1.4.2 ball states. The ball is always in exactly one. */
export const BALL_STATES = ['deadPreSnap', 'snapInFlight', 'held', 'exchange', 'passInFlight', 'kickInFlight', 'loose', 'dead'] as const;
export type BallStateKind = (typeof BALL_STATES)[number];

/**
 * Per-player movement parameters fitted from true drill values (J2.2.1, J2.2.2), computed once at the
 * snap and stored on the game-day snapshot. Units: yd/s, s, yd/s^2, yd.
 */
export interface MovementParams {
  readonly vMaxYps: number;
  readonly tauS: number;
  readonly aLatYps2: number;
  readonly aBrakeYps2: number;
  /** Body circle radius from weight (J1.4.1). */
  readonly bodyRadiusYd: number;
}

/**
 * Struct-of-arrays player state, one element per slot 0 to 21 (P6.3.1: no object is allocated inside
 * the tick loop). Positions and velocities are in the FIELD frame (J1.1.2: kinematics run in the field
 * frame; assignment rules read the play frame through `PerceivedView`). Every array has length
 * SLOT_COUNT. Fields are J1.4.1's, with unit suffixes (J1.2.1).
 */
export interface SimArrays {
  readonly posX: Float64Array;
  readonly posY: Float64Array;
  readonly velX: Float64Array;
  readonly velY: Float64Array;
  /** Hips, radians, field frame. */
  readonly headingRad: Float64Array;
  /** Eyes, radians, field frame (J3.4). */
  readonly gazeRad: Float64Array;
  /** Code into MOVE_MODES. */
  readonly moveMode: Uint8Array;
  /** Code into BEHAVIORS, and the behavior's own state code (J4.2.1). */
  readonly behavior: Uint8Array;
  readonly behaviorState: Uint8Array;
  /** Index of the player's contest in `TickWorld.contests`, or -1 (J1.4.1 `engagement`). */
  readonly engagement: Int16Array;
  /** 1 when the player has the ball. Exactly one slot is 1 while the ball is `held` (J1.4.2). */
  readonly hasBall: Uint8Array;
  readonly eligible: Uint8Array;
  readonly wentOob: Uint8Array;
  /** Tick at which he can act again after being knocked down (J1.4.1). */
  readonly onGroundUntilTick: Int32Array;
  /** In-play fatigue 0 to 1 (J2.4.1). */
  readonly fatigueNow: Float64Array;
  /** Per-play z penalties set at the snap and updated as fatigue moves (J1.4.1 `effMods`, J6.1.1). */
  readonly dFatigueZ: Float64Array;
  readonly dInjuryZ: Float64Array;
  readonly dKnowledgeZ: Float64Array;
  /** +1 or -1: the field-frame goal the player now attacks (J1.1.2 edge case after a change of possession). */
  readonly attackDir: Int8Array;
}

/** What the tick loop knows about each slot that does not change during the play. */
export interface SlotInfo {
  readonly slot: Slot;
  readonly playerId: PlayerId;
  readonly side: Side;
  readonly role: string;
  readonly player: SimPlayer;
  readonly movement: MovementParams;
}

/** J1.4.2: position, height, velocity, last possessor, pass direction, kick type. Field frame, yards. */
export interface BallState {
  kind: BallStateKind;
  x: number; y: number;
  /** Height above the ground in yards: the only third dimension in the engine (J1.1.1). */
  heightYd: number;
  velX: number; velY: number; velHeight: number;
  carrierSlot: Slot | -1;
  lastPossessorSlot: Slot | -1;
  /** Decided at release from the play frame (B5.1.1). Null when no pass is in the air. */
  passForward: boolean | null;
  kickKind: KickKind | null;
  /** Counts each airborne or loose period in event order, 0 for the snap: scope field of stream `ball` (J13.2.1). */
  flightIndex: number;
}

/** J1.4.3: officials are points with a movement rule. Not obstacles, in no contest in v1. */
export interface OfficialState {
  readonly position: string;
  x: number; y: number; gazeRad: number;
}

/** Movement intent from the Decide stage to the Move stage (J2.1.1 inputs, J2.3.4 flags). Play frame. */
export interface Intent {
  /** Seek this point, or (when null) hold `targetVel`. */
  target: PlayPoint | null;
  targetVelPx: number; targetVelPy: number;
  /** Point to face, or null to face the velocity. */
  faceTarget: PlayPoint | null;
  /** 0 to 1. */
  effort: number;
  moveMode: MoveMode;
  arrival: 'arrive' | 'breakdown' | 'through';
}

/** One tracked entity as a player perceives it: delayed and filtered (J3.1.1). Play frame. */
export interface PerceivedEntity {
  /** Slot of the player, or -1 for the ball. */
  readonly slot: Slot | -1;
  readonly px: number; readonly py: number;
  readonly velPx: number; readonly velPy: number;
  /** Ticks since this entity was last in the attention set. A stale entity older than 1.5 s is dropped (J3.1.1). */
  readonly staleTicks: number;
}

export type PlayRead = 'unknown' | 'run' | 'pass' | 'screen' | 'draw';

/**
 * The only world a player's rules may read (J3.1.1: "Rules in J4 may read only `perceived`").
 * Implemented by the perception module (WP-11) over the ring buffer; consumed by the rule evaluator
 * in @gm/football-lang (WP-10) and by player AI (K1.6.1). It exposes no true state of any other
 * player. Coordinates are play frame.
 */
export interface PerceivedView {
  readonly selfSlot: Slot;
  readonly tSinceSnapS: SimSeconds;
  /** The player's own state is known to him exactly. */
  readonly self: { readonly px: number; readonly py: number; readonly velPx: number; readonly velPy: number; readonly headingRad: number };
  entity(slot: Slot): PerceivedEntity | null;
  ball(): PerceivedEntity | null;
  ballKind(): BallStateKind | 'unknown';
  playRead(): { readonly read: PlayRead; readonly side: 'left' | 'right' | 'none'; readonly confidence: number };
  believedCarrierSlot(): Slot | -1;
  /** Calls heard so far this play (J3.6.1), by call name. */
  heard(call: string): boolean;
  /** Receiver number (1, 2, 3 from the sideline in) of a slot on its side at the snap, or 0 (J4.1.2). */
  receiverNumber(slot: Slot): number;
}

/** Contest types (J6.2 to J6.7) plus the types J13.2.1 lists for stream `contest`. The string is the stream scope field. */
export const CONTEST_TYPES = [
  'passBlock', 'stuntExchange', 'runBlock', 'blockInSpace', 'release', 'separation', 'zoneBreak',
  'catchPoint', 'tackle', 'pile', 'fumble', 'recovery', 'pick', 'snap', 'move', 'kickBlock',
] as const;
export type ContestType = (typeof CONTEST_TYPES)[number];

/** J6.1.1 terms. `zEff = zAttr - dFatigue - dInjury - dKnowledge + mTechnique + mLeverage`. */
export interface EffectiveZTerms {
  zAttr: number; dFatigue: number; dInjury: number; dKnowledge: number; mTechnique: number; mLeverage: number;
}

/** J6.1.2 engagement contest parameters and state. `advantage` is A in -1 to +1; positive means the offensive player is winning. */
export interface EngagementParams { readonly kappa: number; readonly lambda: number; readonly sigma: number }
export interface ContestInstance {
  type: ContestType;
  offenseSlot: Slot;
  defenseSlot: Slot;
  advantage: number;
  startedTick: number;
  /** Extra players helping one side (J6.1.2 edge case: they add to zEff, they do not start a second contest). */
  helperSlots: Slot[];
  /** Stream `contest` keyed [game, play, lowerPlayerId, higherPlayerId, type] (J13.2.1). */
  stream: RandomStream;
}

/** J6.1.3 event contest: P = logistic(beta0 + beta1 * dz + sum(gamma_i * x_i)), clamped to 0.0005 to 0.9995. */
export interface EventContestParams { readonly beta0: number; readonly beta1: number; readonly gamma: Readonly<Record<string, number>> }

/** The contest library's surface (WP-12), pure functions used by the Interact stage and by later modules (J7, J8, J9, J10). */
export interface ContestMath {
  effectiveZ(terms: EffectiveZTerms): number;
  /** One tick of J6.1.2. Returns the new advantage, clamped to -1 and +1. `eps` is one standard normal draw. */
  stepEngagement(advantage: number, dz: number, p: EngagementParams, eps: number): number;
  /** J6.1.3 probability of the outcome. */
  eventProbability(dz: number, context: Readonly<Record<string, number>>, p: EventContestParams, math: DeterministicMath): number;
  /** Softmax over one score per outcome (J6.1.3), returning probabilities in the order given. */
  outcomeProbabilities(scores: readonly number[], math: DeterministicMath): number[];
}

/** Everything live during a play. One instance per play; arrays may be reused across plays (P1.1.1). */
export interface TickWorld extends NumberSources {
  readonly situation: GameSituation;
  readonly geometry: FieldGeometry;
  readonly frame: PlayFrame;
  readonly environment: Environment;
  readonly streams: StreamSource;
  readonly math: DeterministicMath;
  readonly slots: readonly SlotInfo[];
  readonly players: SimArrays;
  readonly intents: Intent[];
  readonly ball: BallState;
  readonly officials: OfficialState[];
  readonly contests: ContestInstance[];
  /** Tick 0 is the snap or the kick. Negative ticks are the pre-snap phase (J1.3.2). */
  tick: number;
  /** Team attacking direction at the snap; the play frame does not flip on a change of possession. */
  readonly snappingAttackDir: AttackDir;
  /** Truth events of the play so far, appended by `emit` in detection order. */
  readonly events: TruthEvent[];
  emit(event: TruthEvent): void;
  /** Set by dead-ball detection (J11.3.1). The loop then runs AFTER_WHISTLE_TICKS more when recording. */
  deadAtTick: number | null;
}

/**
 * One stage of the tick (J1.3.1). The tick loop (WP-09) owns the order and calls each registered
 * stage for the whole world; a stage loops slots 0 to 21 itself, in order (J13.3.2). Later work
 * packages add behavior by supplying stages, never by editing the loop.
 */
export interface TickStage {
  readonly name: 'perceive' | 'decide' | 'move' | 'interact' | 'detect';
  /** `dtS` is TICK_S, or TICK_S / SUBSTEPS for the move stage, which the loop calls once per sub-step. */
  run(world: TickWorld, dtS: number): void;
}

/** Trajectory record (J1.6.2): per tick, each player's position, heading, gaze, move mode and engagement advantage, plus ball and officials. */
export interface TrajectoryRecord {
  readonly formatVersion: number;
  readonly firstTick: number;
  readonly tickCount: number;
  /** Delta-encoded at 0.01 yd (J1.6.2). The layout belongs to WP-09 and is versioned by `formatVersion`. */
  readonly buffer: Uint8Array;
}
