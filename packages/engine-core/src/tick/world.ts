// Builders for the per-play world (contract `TickWorld`, `SimArrays`). Arrays are allocated here,
// once, and may be reused across plays with `resetWorld` (P1.1.1, P6.3.1).
import {
  SLOT_COUNT, SLOTS_PER_TEAM,
  type AttackDir, type BallState, type DeterministicMath, type Environment, type FieldGeometry, type GameSituation,
  type Intent, type OfficialState, type ParamTable, type PlayFrame, type RuleSet, type SimArrays, type SlotInfo,
  type StreamSource, type TickWorld, type TruthEvent,
} from '@gm/schema';

export function createSimArrays(): SimArrays {
  const f = () => new Float64Array(SLOT_COUNT), u = () => new Uint8Array(SLOT_COUNT);
  return {
    posX: f(), posY: f(), velX: f(), velY: f(), headingRad: f(), gazeRad: f(),
    moveMode: u(), behavior: u(), behaviorState: u(),
    engagement: new Int16Array(SLOT_COUNT).fill(-1),
    hasBall: u(), eligible: u(), wentOob: u(),
    onGroundUntilTick: new Int32Array(SLOT_COUNT).fill(-2147483648),
    fatigueNow: f(), dFatigueZ: f(), dInjuryZ: f(), dKnowledgeZ: f(),
    attackDir: new Int8Array(SLOT_COUNT),
  };
}

/** One intent per slot, each with its own target and face-target objects so the Decide stage can write without allocating. */
export function createIntents(): Intent[] {
  const out: Intent[] = [];
  for (let s = 0; s < SLOT_COUNT; s++) {
    out.push({ target: null, targetVelPx: 0, targetVelPy: 0, faceTarget: null, effort: 1, moveMode: 'stance', arrival: 'through' });
  }
  return out;
}

export function createBallState(x: number, y: number): BallState {
  return {
    kind: 'deadPreSnap', x, y, heightYd: 0, velX: 0, velY: 0, velHeight: 0,
    carrierSlot: -1, lastPossessorSlot: -1, passForward: null, kickKind: null, flightIndex: 0,
  };
}

export interface WorldInput {
  readonly situation: GameSituation;
  readonly geometry: FieldGeometry;
  readonly frame: PlayFrame;
  readonly environment: Environment;
  readonly streams: StreamSource;
  readonly math: DeterministicMath;
  readonly rules: RuleSet;
  readonly params: ParamTable;
  /** Slots 0 to 10 are the snapping or kicking team, 11 to 21 the other (J1.2.2). */
  readonly slots: readonly SlotInfo[];
  readonly officials?: OfficialState[];
  /** First tick: 0 at the snap, negative when the pre-snap phase is simulated (J1.3.2). */
  readonly firstTick?: number;
}

export function createTickWorld(input: WorldInput): TickWorld {
  if (input.slots.length !== SLOT_COUNT) throw new Error(`a play world needs ${SLOT_COUNT} slots, got ${input.slots.length}`);
  const players = createSimArrays();
  const snappingAttackDir: AttackDir = input.situation.attackDir;
  for (let s = 0; s < SLOT_COUNT; s++) {
    players.attackDir[s] = s < SLOTS_PER_TEAM ? snappingAttackDir : -snappingAttackDir;
    players.fatigueNow[s] = 1 - input.slots[s]!.player.gameDay.freshness;
  }
  const events: TruthEvent[] = [];
  return {
    rules: input.rules, params: input.params,
    situation: input.situation, geometry: input.geometry, frame: input.frame, environment: input.environment,
    streams: input.streams, math: input.math, slots: input.slots, players,
    intents: createIntents(), ball: createBallState(input.situation.ballX, input.situation.ballY),
    officials: input.officials ?? [], contests: [],
    tick: input.firstTick ?? 0, snappingAttackDir, events,
    emit(event: TruthEvent): void { events.push(event); },
    deadAtTick: null,
  };
}
