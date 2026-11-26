// Simulation contract, part 8: the play truth record (J1.6.2) and the one Resolver interface
// (J1.6.1, J1.6.3). The truth record says what physically happened, in order. It holds no ruling: a
// touchdown, a catch or a first down is ruled by officiating from these events (B11.2.1). Every
// resolver, the reference resolver and the tick engine alike, emits the same event types, so they are
// interchangeable behind `Resolver`.
// Visibility: the whole record is class truth (P3.3.1). Film and read models get the called result
// and the trajectory, never this record raw (B11.2.1 rule 5).
import { z } from 'zod';
import { pub, truth } from '../field.ts';
import { Side, AttackDir, type Tenths } from './primitives.ts';
import { KickKind, type GameSituation, type PlayCalls } from './situation.ts';
import type { SimTeam } from './player.ts';
import type { Environment } from './environment.ts';
import type { FieldGeometry } from './frames.ts';
import type { StreamSource, DeterministicMath } from './random.ts';
import type { NumberSources } from './params.ts';

const tPlayer = () => truth(z.number().int().positive(), 'id');
const tSide = () => truth(Side, 'index');
/** A spot in the field frame, written to 0.01 yd (J1.2.2). */
export const Spot = z.object({ x: truth(z.number(), 'yd'), y: truth(z.number(), 'yd') }).strict();
export type Spot = z.infer<typeof Spot>;
const tSpot = () => truth(Spot);

/** How well an official could see the act (B11.2.1 `visibility`). */
export const SightLine = z.enum(['open', 'crowded', 'pile']);

/**
 * How close the truth was to the decision boundary (B11.2.1 `margin`), in distance or in time,
 * whichever the act is measured in. Officiating's error model reads it (B11.3.2); replay reads it
 * (B9.2.1). Null when the act is not a close call of that kind.
 */
const judged = {
  marginYd: truth(z.number().min(0), 'yd').nullable(),
  marginS: truth(z.number().min(0), 's').nullable(),
  visibility: truth(SightLine),
};

/** Every event carries sim time since the snap (negative before it), written to 0.01 s (J1.3.1). */
const at = { t: truth(z.number(), 's') };

/** Dead-ball reasons. Letters are the B3.2.1 list; the last four are engine and level additions. */
export const DeadBallReason = z.enum([
  'down_by_contact',            // (a)
  'forward_progress_stopped',   // (b)
  'kneel',                      // (c)
  'gave_himself_up',            // (d) slide, dive, or no effort to advance
  'runner_out_of_bounds',       // (e)
  'touched_on_ground',          // (f)
  'incomplete_pass',            // (g)
  'kick_hit_goal',              // (h)
  'loose_ball_at_rest',         // (i)
  'kick_recovered_by_kickers',  // (j)
  'kick_short_of_landing_zone', // (k)
  'onside_untouched_beyond_zone', // (l)
  'ball_across_goal_line_in_possession', // physical fact behind (m): officiating rules the score
  'ball_dead_in_end_zone',      // physical fact behind (m): touchback or safety by impetus (B7.7.1)
  'kick_through_uprights',      // physical fact behind (m): field goal or try good
  'kick_failed',                // place kick wide, short or under the bar, dead by rule (B6.5.2)
  'fair_catch',                 // (n)
  'fumble_recovery_restricted', // (p)
  'ball_out_of_bounds',         // (q)
  'struck_object',              // (r)
  'helmet_off',                 // (s)
  'runner_down_without_contact', // true only where key `deadball.down_without_contact` is on (B13.4.1)
  'pre_snap_foul',              // play never became live (J1.6.1 edge case)
  'period_ended_before_snap',
  'engine_fault',               // 600-tick limit (J1.3.1)
]);
export type DeadBallReason = z.infer<typeof DeadBallReason>;

/** B8.1.1 `timing` and `phase` of a foul. */
export const FoulTiming = z.enum(['before_snap', 'live', 'dead_ball', 'between_downs']);
export const FoulPhase = z.enum(['pass_play', 'running_play', 'backward_pass_or_fumble', 'free_kick', 'scrimmage_kick', 'after_change_of_possession', 'try']);

const SnapEvent = z.object({ type: truth(z.literal('snap')), ...at,
  snapperId: tPlayer().nullable(), toPlayerId: tPlayer().nullable(),
  quality: truth(z.enum(['clean', 'off_target', 'loose'])) }).strict();

const ExchangeEvent = z.object({ type: truth(z.literal('exchange')), ...at,
  kind: truth(z.enum(['handoff', 'pitch', 'fake'])), fromId: tPlayer(), toId: tPlayer().nullable(), spot: tSpot() }).strict();

/** Possession changes are events with a time, a player and a spot (J1.4.2). */
const PossessionEvent = z.object({ type: truth(z.literal('possession')), ...at,
  side: tSide(), playerId: tPlayer(), spot: tSpot(),
  how: truth(z.enum(['snap', 'exchange', 'catch', 'interception', 'fumble_recovery', 'kick_catch', 'kick_recovery', 'backward_pass'])) }).strict();

const PassReleaseEvent = z.object({ type: truth(z.literal('pass_release')), ...at, ...judged,
  passerId: tPlayer(), targetId: tPlayer().nullable(),
  /** Forward or backward is decided at release from the play frame (J1.4.2, B5.1.1). */
  forward: truth(z.boolean()),
  releaseSpot: tSpot(), aimSpot: tSpot(), landingSpot: tSpot(),
  /** Play-frame depth of the arrival point past the line of scrimmage: the "air yards" of J15.4.1. */
  airYd: truth(z.number(), 'yd'),
  throwaway: truth(z.boolean()), spike: truth(z.boolean()),
  underPressure: truth(z.boolean()), passerOutsidePocket: truth(z.boolean()),
  /** The ball was beyond the line of scrimmage when released (B5.1.2). */
  ballBeyondLine: truth(z.boolean()) }).strict();

const CatchPointEvent = z.object({ type: truth(z.literal('catch_point')), ...at, ...judged,
  outcome: truth(z.enum(['catch', 'drop', 'breakup', 'tip', 'interception', 'uncatchable', 'grounded'])),
  spot: tSpot(), intendedId: tPlayer().nullable(), catcherId: tPlayer().nullable(),
  defenderIds: truth(z.array(z.number().int().positive()), 'id'),
  /** Feet (or other body part counted by rule) down in bounds with control, 0 to 2 (key `catch.feet_required`). */
  feetInBounds: truth(z.number().int().min(0).max(2), 'count'),
  contested: truth(z.boolean()) }).strict();

const TackleEvent = z.object({ type: truth(z.literal('tackle_attempt')), ...at,
  outcome: truth(z.enum(['made', 'broken', 'missed'])), carrierId: tPlayer(),
  tacklerIds: truth(z.array(z.number().int().positive()), 'id'), spot: tSpot() }).strict();

/** Which player beat which, and when (J1.6.2). Hidden from scouting (J6.1.1). */
const ContestEvent = z.object({ type: truth(z.literal('contest')), ...at,
  contest: truth(z.string()), winnerId: tPlayer(), loserId: tPlayer(), spot: tSpot() }).strict();

/** J6.2.5 events on the quarterback. */
const PressureEvent = z.object({ type: truth(z.literal('pressure')), ...at,
  kind: truth(z.enum(['pressure', 'hit', 'sack', 'escape'])), rusherId: tPlayer(), passerId: tPlayer(), spot: tSpot() }).strict();

const FumbleEvent = z.object({ type: truth(z.literal('fumble')), ...at, ...judged,
  kind: truth(z.enum(['fumble', 'muff', 'bad_snap', 'backward_pass_loose'])),
  playerId: tPlayer(), side: tSide(), forcedById: tPlayer().nullable(), spot: tSpot() }).strict();

/** A player or the ball meeting a line or plane (J1.5.2), with interpolated time so B can order them. */
const BoundaryEvent = z.object({ type: truth(z.literal('boundary')), ...at, ...judged,
  kind: truth(z.enum(['player_out_of_bounds', 'ball_out_of_bounds', 'ball_crosses_goal_line', 'ball_reaches_line_to_gain', 'ball_touches_pylon'])),
  playerId: tPlayer().nullable(), spot: tSpot() }).strict();

const KickEvent = z.object({ type: truth(z.literal('kick')), ...at,
  kickKind: truth(KickKind), kickerId: tPlayer(), kickSpot: tSpot(), landingSpot: tSpot(),
  hangTimeS: truth(z.number().min(0), 's'),
  /** The kick crossed the line of scrimmage (B6.3.2). Always true on free kicks. */
  crossedLine: truth(z.boolean()),
  blockedById: tPlayer().nullable() }).strict();

/** Things that happen to a kicked ball (B6): touching, landing zones, signals. */
const KickTouchEvent = z.object({ type: truth(z.literal('kick_touch')), ...at, ...judged,
  kind: truth(z.enum(['landed', 'touched_by_kickers', 'touched_by_receivers', 'fair_catch_signal', 'invalid_signal'])),
  playerId: tPlayer().nullable(), side: tSide().nullable(), spot: tSpot() }).strict();

/** Mental error (J4.5.3): who, why, and what he did instead. Hidden from opponents' scouting (J1.6.2). */
const MentalErrorEvent = z.object({ type: truth(z.literal('mental_error')), ...at,
  playerId: tPlayer(), cause: truth(z.enum(['knowledge', 'discipline', 'communication'])), form: truth(z.string()) }).strict();

/**
 * A foul that was committed (J10.1.1 `FoulCommitted`), or a borderline legal act that an official might
 * flag by mistake (B11.3.2 rule 1: `borderline` true means no foul in truth). Illegal plays still run:
 * the resolver records the act and plays on; only officiating decides whether a flag falls.
 */
const FoulCommittedEvent = z.object({ type: truth(z.literal('foul_committed')), ...at,
  foulId: truth(z.string()), side: tSide(), playerId: tPlayer().nullable(), spot: tSpot(),
  timing: truth(FoulTiming), phase: truth(FoulPhase),
  /** 0 to 1: how blatant (J10.1.1). */
  severity: truth(z.number().min(0).max(1), 'ratio'),
  visibility: truth(SightLine),
  atPointOfAttack: truth(z.boolean()), flagrant: truth(z.boolean()), borderline: truth(z.boolean()),
  /** True when a coach ordered the act (rule-breaking goes through L8.2.5; J10.7.1 edge case). */
  ordered: truth(z.boolean()) }).strict();

/** J10.6.1 `InjuryEvent`. D11 maps the seed to a diagnosis; this record holds no medical timeline. */
const InjuryEvent = z.object({ type: truth(z.literal('injury')), ...at,
  playerId: tPlayer(), mechanism: truth(z.string()), region: truth(z.string()),
  severitySeed: truth(z.number().min(0).max(1), 'ratio'), finishesPlay: truth(z.boolean()),
  headImpact: truth(z.boolean()) }).strict();

const DeadBallEvent = z.object({ type: truth(z.literal('dead_ball')), ...at, ...judged,
  reason: truth(DeadBallReason),
  /** Location of the ball when it became dead: the forward point of the ball, not the body (J1.5.2). */
  spot: tSpot(),
  /** Team in possession when the ball became dead; null for a loose or incomplete ball. */
  side: tSide().nullable(), carrierId: tPlayer().nullable() }).strict();

/**
 * Anything else worth film, features or statistics that no rule turns on: read keys, route
 * conversions, a scramble, a pump fake. `code` is a name from the emitting module's own list. Adding
 * a code needs no contract change; officiating must never depend on one.
 */
const DetailEvent = z.object({ type: truth(z.literal('detail')), ...at,
  code: truth(z.string()), playerIds: truth(z.array(z.number().int().positive()), 'id'),
  spot: tSpot().nullable(), value: truth(z.number(), 'ratio').nullable() }).strict();

export const TruthEvent = z.discriminatedUnion('type', [
  SnapEvent, ExchangeEvent, PossessionEvent, PassReleaseEvent, CatchPointEvent, TackleEvent, ContestEvent,
  PressureEvent, FumbleEvent, BoundaryEvent, KickEvent, KickTouchEvent, MentalErrorEvent,
  FoulCommittedEvent, InjuryEvent, DeadBallEvent, DetailEvent,
]);
export type TruthEvent = z.infer<typeof TruthEvent>;
export type TruthEventOf<T extends TruthEvent['type']> = Extract<TruthEvent, { type: T }>;

/** The truth record of one play (J1.6.2). Append-only and versioned with the engine. */
export const PlayTruth = z.object({
  resolverId: pub(z.enum(['reference', 'tick'])),
  resolverVersion: pub(z.string()),
  gameId: pub(z.number().int().positive(), 'id'),
  playNumber: pub(z.number().int().positive(), 'index'),
  /** The play frame's origin and direction (J1.1.2), stored with the record. */
  originX: pub(z.number(), 'yd'), originY: pub(z.number(), 'yd'), attackDir: pub(AttackDir, 'index'),
  /** Live duration in integer tenths: snap or kick to dead ball. 0 when the play never became live. */
  liveDurationTenths: pub(z.number().int().min(0), 'tenths_s'),
  /**
   * Team whose impetus put the ball in or behind a goal line where it became dead, when it did
   * (B7.7.1). Officiating needs it to tell a safety from a touchback. Null otherwise.
   */
  endZoneImpetus: tSide().nullable(),
  /** Ordered by `t`, then by the J1.3.1 tie-break. Exactly one `dead_ball` event, and it is last except for dead-ball fouls and injuries. */
  events: truth(z.array(TruthEvent)),
}).strict();
export type PlayTruth = z.infer<typeof PlayTruth>;

/** Checks the structural promises above. Both resolvers run it in tests; officiating may assume it holds. */
export function playTruthProblems(tr: PlayTruth): string[] {
  const out: string[] = [];
  const dead = tr.events.filter((e) => e.type === 'dead_ball');
  if (dead.length !== 1) out.push(`expected exactly one dead_ball event, found ${dead.length}`);
  for (let i = 1; i < tr.events.length; i++) {
    if (tr.events[i]!.t < tr.events[i - 1]!.t) out.push(`event ${i} (${tr.events[i]!.type}) is earlier than the event before it`);
  }
  const d = dead[0];
  if (d) {
    for (const e of tr.events) {
      if (e.t > d.t && e.type !== 'foul_committed' && e.type !== 'injury' && e.type !== 'detail') out.push(`${e.type} event after the dead ball`);
    }
    if (d.reason === 'pre_snap_foul' && tr.liveDurationTenths !== 0) out.push('pre-snap foul with a live duration');
  }
  return out;
}

export function eventsOf<T extends TruthEvent['type']>(tr: PlayTruth, type: T): TruthEventOf<T>[] {
  return tr.events.filter((e): e is TruthEventOf<T> => e.type === type);
}

export function deadBallOf(tr: PlayTruth): TruthEventOf<'dead_ball'> {
  const d = eventsOf(tr, 'dead_ball')[0];
  if (!d) throw new Error('play truth has no dead_ball event');
  return d;
}

/** Per-player cost of one play, returned to J11.5 (J1.6.1 "player state deltas"). */
export const PlayerDelta = z.object({
  playerId: tPlayer(),
  /** Freshness spent on the play, 0 to 1 (J2.4.1 to D10.1.1). */
  energyCost: truth(z.number().min(0).max(1), 'ratio'),
  /** Hit energy taken and delivered, in J2.6.1 units (J10.6.2 wear). */
  hitLoad: truth(z.number().min(0), 'ratio'),
  onField: pub(z.boolean()),
}).strict();
export type PlayerDelta = z.infer<typeof PlayerDelta>;

/** Record detail (J1.6.1 `options`). 'summary' drops the trajectory and the explain record. */
export type RecordDetail = 'full' | 'summary';

/** Everything a resolver may read (J1.6.1 inputs). A resolver reads nothing else: no clock, no storage. */
export interface PlayInput extends NumberSources {
  readonly situation: GameSituation;
  readonly calls: PlayCalls;
  /** Indexed by Side. Players on the field are named by `calls.*.players`; the rest are the bench (J5 substitution). */
  readonly teams: readonly [SimTeam, SimTeam];
  readonly environment: Environment;
  readonly geometry: FieldGeometry;
  /** Bound to the world seed. Scope every stream with [situation.gameId, situation.playNumber, ...] (J13.2.1). */
  readonly streams: StreamSource;
  readonly math: DeterministicMath;
  readonly options: { readonly detail: RecordDetail; readonly stopAtTick?: number };
}

/** Opaque here; the tick engine defines the layout (tick.ts `TrajectoryRecord`). Null from the reference resolver. */
export interface PlayResult {
  readonly truth: PlayTruth;
  readonly deltas: readonly PlayerDelta[];
  readonly liveDurationTenths: Tenths;
  /** Present when detail is 'full' and the resolver simulates movement. */
  readonly trajectory: unknown | null;
  /** J4.6.2 explain record, present only when detail is 'full'. */
  readonly explain: unknown | null;
}

/**
 * The one play-simulation interface (J1.6.1). `simulatePlay` is pure: the same input and version give
 * the same output on every machine. It never calls officiating, the clock or the interface.
 * Implemented by @gm/resolver-reference (J1.6.3, stream `resolver` only) and by the tick engine
 * (phase 3 and 4). The game state machine holds a `Resolver` and nothing more specific.
 */
export interface Resolver {
  readonly id: 'reference' | 'tick';
  readonly version: string;
  /** False for the reference resolver: its results may never be saved into a career (J14.1.2). */
  readonly mayProduceSavedResults: boolean;
  simulatePlay(input: PlayInput): PlayResult;
}
