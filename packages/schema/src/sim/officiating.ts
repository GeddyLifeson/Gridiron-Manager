// Simulation contract, part 9: officiating inputs and outputs (B1, B3, B6 to B11, J11.3, J11.4).
// The pipeline for one play, in order (J11.2.1 phase `ruling`):
//
//   truth ──BasicRuling.rule──▶ true PlayOutcome            (the rule as written, perfect sight: B11.2.1 rule 6)
//   truth ──FoulRules.candidates──▶ FoulRecord[]            (catalogue fields filled, `called` false)
//   truth + candidates ──CrewModel.perceive──▶ seen truth, rulings, fouls with `called` set   (B11.3)
//   seen  ──BasicRuling.rule──▶ called PlayOutcome
//   called outcome + called fouls ──FoulRules.options──▶ EnforcementOption[]   (B8.5.1 to B8.5.8)
//   coach picks an option (J11.6.1) ──▶ final PlayOutcome
//   final outcome ──SeriesRules.next──▶ SeriesState, ──ClockRules.afterPlay──▶ ClockResult
//   replay (B9) may replace `seen` with a corrected copy; the steps after it run again.
//
// Each interface below is implemented by one work package in its own folder of @gm/officiating.
// The game state machine reads only the `Officiating` facade, so it can be built and tested against
// fakes before any of them exists. One rule engine serves both levels: every value is a rule key.
import { z } from 'zod';
import { pub, truth } from '../field.ts';
import { Side, zSide, zTenths, type Tenths } from './primitives.ts';
import { ClockStatus, PlayKind, type GameSituation } from './situation.ts';
import { FoulTiming, FoulPhase, SightLine, type PlayTruth } from './truth.ts';

/** A spot as the officials placed it: a called value, so it is public, unlike the truth record's `Spot`. */
export const CalledSpot = z.object({ x: pub(z.number(), 'yd'), y: pub(z.number(), 'yd') }).strict();
export type CalledSpot = z.infer<typeof CalledSpot>;
import { FoulClass, FoulDq, type FoulCatalogueRow, type FoulId, type NumberSources } from './params.ts';
import type { FieldGeometry } from './frames.ts';
import type { StreamSource, DeterministicMath } from './random.ts';
import type { GameState } from './game-state.ts';

/** The seven crew positions of B11.1.1. Crew size is rule data (`officials.*`), so a crew may hold fewer. */
export const OfficialPosition = z.enum(['referee', 'umpire', 'down_judge', 'line_judge', 'field_judge', 'side_judge', 'back_judge']);
export type OfficialPosition = z.infer<typeof OfficialPosition>;

/** Foul families that carry a crew multiplier (B11.4.1). */
export const FoulFamily = z.enum(['offensive_holding', 'defensive_coverage', 'pre_snap', 'roughing_and_safety', 'special_teams_blocks', 'conduct']);

/** A crew for one game (B11.4.1). Tendencies are hidden; the user sees only called counts. */
export const OfficialsCrew = z.object({
  crewId: pub(z.number().int().positive(), 'id'),
  positions: pub(z.array(OfficialPosition)),
  /** Multiplier by foul family, centred on 1 (B11.4.1 rule 2). */
  crewFactor: truth(z.record(z.string(), z.number().positive()), 'ratio'),
  /** Scales the error chances of B11.3.2 (B11.4.1 rule 3). */
  accuracy: truth(z.number().positive(), 'ratio'),
  /** Crew pace for the spotting delay (J11.4.2). */
  pace: truth(z.number().positive(), 'ratio'),
}).strict();
export type OfficialsCrew = z.infer<typeof OfficialsCrew>;

/** Aspects an official rules on (B11.2.1 rule 1). */
export const RulingAspect = z.enum([
  'catch', 'down_by_contact', 'spot', 'forward_or_backward_pass', 'in_bounds', 'score', 'possession',
  'fumble_before_down', 'kick_good', 'touching', 'foul',
]);
export type RulingAspect = z.infer<typeof RulingAspect>;

/** One ruling with its truth and its called value (B11.2.1). The game advances on called values. */
export const Ruling = z.object({
  aspect: pub(RulingAspect),
  /** Index of the truth event the ruling is about, in `PlayTruth.events`. */
  eventIndex: truth(z.number().int().min(0), 'index'),
  trueValue: truth(z.string()),
  calledValue: pub(z.string()),
  marginYd: truth(z.number().min(0), 'yd').nullable(),
  marginS: truth(z.number().min(0), 's').nullable(),
  visibility: truth(SightLine),
  official: pub(OfficialPosition),
  reviewable: pub(z.boolean()),
}).strict();
export type Ruling = z.infer<typeof Ruling>;

/** The foul record of B8.1.1. Uncalled fouls are kept in the truth record only (`called` false). */
export const FoulRecord = z.object({
  foulId: pub(z.string()),
  side: zSide(),
  playerId: pub(z.number().int().positive(), 'id').nullable(),
  spot: pub(CalledSpot),
  t: pub(z.number(), 's'),
  timing: pub(FoulTiming),
  phase: pub(FoulPhase),
  /** Catalogue fields copied at the time of the foul (B8.1.1), so a later rule change does not rewrite history. */
  yards: pub(z.number().min(0), 'yd'),
  afd: pub(z.boolean()), lod: pub(z.boolean()), spotFoul: pub(z.boolean()), runoffEligible: pub(z.boolean()),
  foulClass: pub(FoulClass), dq: pub(FoulDq),
  beforeChangeOfPossession: pub(z.boolean()),
  /** Index of the `foul_committed` truth event, or null for a phantom call (B11.3.2). */
  eventIndex: truth(z.number().int().min(0), 'index').nullable(),
  /** Index of another record of the same act (B8.1.1 `same_act`), or null. */
  sameAct: pub(z.number().int().min(0), 'index').nullable(),
  called: pub(z.boolean()),
  /** True when the call (or the no-call) matches the truth. */
  correct: truth(z.boolean()),
  flagrant: pub(z.boolean()),
}).strict();
export type FoulRecord = z.infer<typeof FoulRecord>;

export const ScoreType = z.enum(['touchdown', 'field_goal', 'safety', 'try_kick', 'try_two', 'defensive_try', 'try_safety']);
export type ScoreType = z.infer<typeof ScoreType>;

export const ScoreEvent = z.object({
  type: pub(ScoreType),
  side: zSide(),
  /** From the rule set (`score.*`, `try.*`), never a literal. */
  points: pub(z.number().int().min(0), 'points'),
  scorerId: pub(z.number().int().positive(), 'id').nullable(),
}).strict();
export type ScoreEvent = z.infer<typeof ScoreEvent>;

/** Result type of a play: the row of the rule set's clock table (J11.4.1 rule 2) and the play-by-play type. */
export const PlayResultType = z.enum([
  'run', 'pass_complete', 'pass_incomplete', 'sack', 'interception', 'fumble_lost', 'kneel', 'spike',
  'punt', 'field_goal_good', 'field_goal_missed', 'try_good', 'try_failed', 'kickoff', 'safety_kick',
  'fair_catch_kick', 'no_play',
]);
export type PlayResultType = z.infer<typeof PlayResultType>;

/** What was enforced on the play (B8.5.1 outputs). */
export const EnforcementSummary = z.object({
  /** Indexes into the play's FoulRecord list. */
  enforced: pub(z.array(z.number().int().min(0)), 'index'),
  declined: pub(z.array(z.number().int().min(0)), 'index'),
  offsetting: pub(z.boolean()),
  /** Signed yards walked off along the attack direction of the team that had the ball at the snap. */
  yardsWalked: pub(z.number(), 'yd'),
  fromSpot: pub(CalledSpot).nullable(),
  halfDistanceApplied: pub(z.boolean()),
  automaticFirstDown: pub(z.boolean()),
  lossOfDown: pub(z.boolean()),
  replayDown: pub(z.boolean()),
  /** Penalty carried to the try or the next kickoff by the offended team's choice (B8.5.7). */
  carriedTo: pub(z.enum(['try', 'kickoff'])).nullable(),
  runoffTaken: pub(z.boolean()),
  disqualified: pub(z.array(z.number().int().positive()), 'id'),
}).strict();
export type EnforcementSummary = z.infer<typeof EnforcementSummary>;

/**
 * The outcome of a play as ruled: dead-ball spot, possession, score, and the facts the clock and the
 * series need. Produced three times per play in the pipeline above (true, called, final). It is the
 * common currency of every officiating module.
 */
export const PlayOutcome = z.object({
  resultType: pub(PlayResultType),
  /** The play does not count: the down is replayed or the kick is re-kicked. Statistics exclude it (J11.9.1). */
  noPlay: pub(z.boolean()),
  /** Team that put the ball in play. */
  snappingSide: zSide(),
  /** Team entitled to the ball next, before the series rule looks at the down (a failed fourth down is decided by SeriesRules). */
  possessionAfter: zSide(),
  changeOfPossession: pub(z.boolean()),
  /** Succeeding spot in the field frame, before hash placement. Forward progress to 0.01 yd (J11.3.2). */
  spotX: pub(z.number(), 'yd'),
  spotY: pub(z.number(), 'yd'),
  /** Spot of the snap or kick. */
  previousSpotX: pub(z.number(), 'yd'),
  score: pub(ScoreEvent).nullable(),
  touchback: pub(z.boolean()),
  /** Facts for the clock table (B1.2.2). */
  endedOutOfBounds: pub(z.boolean()),
  incomplete: pub(z.boolean()),
  runnerDownInBounds: pub(z.boolean()),
  /**
   * A fumble or backward pass went out of bounds, as opposed to a runner (B1.2.3 exception 5; CR-02-2).
   * Set by the officiating facade from the same truth record the ruling used; absent means false.
   */
  looseBallOutOfBounds: pub(z.boolean()).optional(),
  /** Net yards for the team that snapped, along its attack direction, before any penalty. */
  yardsGained: pub(z.number(), 'yd'),
  /** A live-ball injury that stops the clock by rule (B1.5): player ids. */
  injuryStoppage: pub(z.array(z.number().int().positive()), 'id'),
  enforcement: pub(EnforcementSummary).nullable(),
}).strict();
export type PlayOutcome = z.infer<typeof PlayOutcome>;

/** One choice offered to a coach after a play (B8.5.8, B6.1.4, B1.6.1). Declining everything is always the first option. */
export const EnforcementOption = z.object({
  optionId: pub(z.string()),
  /** Team that chooses. */
  side: zSide(),
  /** Template key for the text of the option (P4.6.1). */
  labelKey: pub(z.string()),
  outcome: pub(PlayOutcome),
}).strict();
export type EnforcementOption = z.infer<typeof EnforcementOption>;

/** Everything officiating says about one play: P3.3.1 `truth` and `called` blocks. */
export const CalledPlay = z.object({
  rulings: pub(z.array(Ruling)),
  /** Every candidate foul, called or not. Read models show only `called` ones (B11.2.1 rule 5). */
  fouls: pub(z.array(FoulRecord)),
  trueOutcome: truth(PlayOutcome),
  /** Outcome on called values before any penalty choice. */
  calledOutcome: pub(PlayOutcome),
  /** At least one. A single entry means there is nothing to choose. */
  options: pub(z.array(EnforcementOption).min(1)),
  defaultOptionId: pub(z.string()),
}).strict();
export type CalledPlay = z.infer<typeof CalledPlay>;

/** Down, distance and spot for the next snap (J11.3.2 outputs). */
export const SeriesState = z.object({
  playKind: pub(PlayKind),
  possession: zSide(),
  down: pub(z.number().int().min(1), 'index').nullable(),
  distanceYd: pub(z.number().min(0), 'yd').nullable(),
  goalToGo: pub(z.boolean()),
  /** After hash placement (B3.3.3, key `field.hash_from_sideline_ft`). */
  ballX: pub(z.number(), 'yd'),
  ballY: pub(z.number(), 'yd'),
  lineToGainX: pub(z.number(), 'yd').nullable(),
  seriesStartX: pub(z.number(), 'yd').nullable(),
  firstDownAwarded: pub(z.boolean()),
  turnoverOnDowns: pub(z.boolean()),
}).strict();
export type SeriesState = z.infer<typeof SeriesState>;

/** Clock after a play (B1.2, B1.3, B1.6, B1.7; J11.4.1). */
export const ClockResult = z.object({
  clockTenths: zTenths(),
  status: pub(ClockStatus),
  /** Value the play clock starts from (`clock.play_clock_s` or `clock.play_clock_after_stoppage_s`), in tenths. */
  playClockTenths: zTenths(),
  periodExpired: pub(z.boolean()),
  /** The period is extended by an untimed down (B1.7.2). */
  untimedDown: pub(z.boolean()),
  /** The two-minute warning or the college two-minute timeout stopped the clock (B1.4.4, B13.3.2). */
  twoMinuteStop: pub(z.boolean()),
  /** A runoff the opponent may take (B1.6.1); null when none applies. The offender may spend a timeout instead. */
  runoff: pub(z.object({ against: zSide(), tenths: zTenths() })).nullable(),
}).strict();
export type ClockResult = z.infer<typeof ClockResult>;

/** What a period change does (J11.8.1, B1.1.3, B10). */
export const PeriodTransition = z.object({
  next: pub(z.enum(['next_period', 'halftime', 'overtime', 'final'])),
  swapEnds: pub(z.boolean()),
  resetTimeouts: pub(z.boolean()),
  /** Intermission length in tenths (`clock.halftime_min` and the period-break keys). */
  intermissionTenths: zTenths(),
  /** Possession, down and spot carry over mirrored (quarter change) or a kickoff follows (half). */
  carryOverSeries: pub(z.boolean()),
}).strict();
export type PeriodTransition = z.infer<typeof PeriodTransition>;

/** Where and how play restarts (J11.7.1, B6.1.1, B7.8.1). */
export const RestartSetup = z.object({
  playKind: pub(PlayKind),
  /** Team that snaps or kicks. */
  side: zSide(),
  ballX: pub(z.number(), 'yd'),
  ballY: pub(z.number(), 'yd'),
  playClockTenths: zTenths(),
}).strict();
export type RestartSetup = z.infer<typeof RestartSetup>;

/** Overtime bookkeeping (J11.8.2, B10, B13.7.1). The format is data: key `overtime.format`. */
export const OvertimeState = z.object({
  /** Overtime period from 1. */
  otPeriod: pub(z.number().int().min(1), 'index'),
  /** Possessions so far in this overtime period, in order, with points scored on each. */
  possessions: pub(z.array(z.object({ side: zSide(), points: pub(z.number().int().min(0), 'points'), ended: pub(z.boolean()) }))),
  tossWinner: zSide(),
  firstPossession: zSide(),
}).strict();
export type OvertimeState = z.infer<typeof OvertimeState>;

export const OvertimeStep = z.object({
  next: pub(z.enum(['toss', 'kickoff', 'series', 'try_only', 'next_ot_period', 'final_win', 'final_tie'])),
  /** Present when `next` puts the ball in play. */
  restart: pub(RestartSetup).nullable(),
  state: pub(OvertimeState).nullable(),
}).strict();
export type OvertimeStep = z.infer<typeof OvertimeStep>;

/** A coach's challenge or a booth review (B9.1). */
export const ReviewRequest = z.object({
  source: pub(z.enum(['coach_challenge', 'booth', 'replay_assist'])),
  side: zSide().nullable(),
  aspects: pub(z.array(RulingAspect)),
}).strict();
export type ReviewRequest = z.infer<typeof ReviewRequest>;

export const ReviewResult = z.object({
  allowed: pub(z.boolean()),
  /** Template key naming why a request was refused (not reviewable, no timeout left, ...). */
  refusedKey: pub(z.string()).nullable(),
  /** Indexes of rulings that were changed. Empty means the ruling stands. */
  reversed: pub(z.array(z.number().int().min(0)), 'index'),
  /** The play after the review: same shape as before it, recomputed from the corrected rulings. */
  called: pub(CalledPlay),
  timeoutCharged: pub(z.boolean()),
  challengeLost: pub(z.boolean()),
}).strict();
export type ReviewResult = z.infer<typeof ReviewResult>;

// ---------------------------------------------------------------------------------------------
// Interfaces. Pure functions of their arguments; no module keeps state between calls.
// ---------------------------------------------------------------------------------------------

/** What every officiating call may read. `before` is the game state at the snap. */
export interface RulingContext extends NumberSources {
  readonly geometry: FieldGeometry;
  readonly before: GameState;
  readonly situation: GameSituation;
  readonly crew: OfficialsCrew;
  /** Officiating draws only from stream `officials`, scope [game, play, official index] (J13.2.1). */
  readonly streams: StreamSource;
  readonly math: DeterministicMath;
}

/**
 * The rules as written, applied to a truth record with perfect sight (B3, B5, B6, B7).
 * Two implementations: scrimmage plays without a kick (WP-02) and plays with a `kick` event (WP-03).
 * `ruleTruth` is called once on the real truth and once on what the crew saw.
 */
export interface BasicRuling {
  handles(truth: PlayTruth): boolean;
  rule(truth: PlayTruth, ctx: RulingContext): PlayOutcome;
}

/** Down, distance, line to gain, hash placement (B3.1, B3.3.3, B3.4, J11.3.2). WP-02. */
export interface SeriesRules {
  next(outcome: PlayOutcome, ctx: RulingContext): SeriesState;
  /** A fresh series for `side` at a spot (after a kick, a turnover, or the start of a college overtime series). */
  newSeries(side: Side, ballX: number, ballY: number, ctx: RulingContext): SeriesState;
}

export type PlayClockReason = 'normal' | 'administrative';

/** Game clock, play clock, timeouts, period ends (B1, B13.3, J11.4, J11.8.1). WP-02. */
export interface ClockRules {
  /** Clock status the instant the ball is snapped or legally touched on a free kick (B1.2.1 rules 4 and 5). */
  atSnap(clockTenths: Tenths, status: ClockStatus, ctx: RulingContext): ClockStatus;
  afterPlay(outcome: PlayOutcome, liveDurationTenths: Tenths, ctx: RulingContext): ClockResult;
  playClockTenths(reason: PlayClockReason, src: NumberSources): Tenths;
  /** May `side` be charged a timeout now (B1.4.1, B1.4.2)? Returns a template key when refused. */
  timeoutAllowed(state: GameState, side: Side, src: NumberSources): { allowed: boolean; refusedKey: string | null };
  /** Called at a dead ball with the clock at zero and no untimed down owed. */
  endOfPeriod(state: GameState, src: NumberSources): PeriodTransition;
}

/** Free kicks, tries, what follows each score, coin toss options (B1.1.2, B6.1, B7.3.1, B7.8.1). WP-03. */
export interface RestartRules {
  /** Options the toss winner (then the loser) may choose from, as option ids from the rule set. */
  tossOptions(kind: 'opening' | 'overtime', src: NumberSources): readonly string[];
  afterScore(score: ScoreEvent, state: GameState, ctx: RulingContext): RestartSetup;
  /** Try spot for the scoring team's choice (`try.kick_snap_yardline`, `try.two_point_snap_yardline`). */
  trySetup(side: Side, choice: 'kick' | 'two_point', ctx: RulingContext): RestartSetup;
  kickoffSetup(kicking: Side, kind: 'kickoff' | 'safety_kick', ctx: RulingContext): RestartSetup;
}

/** Overtime drivers selected by `overtime.format` (J11.8.2, B10, B13.7.1). WP-03. */
export interface OvertimeRules {
  start(state: GameState, src: NumberSources): OvertimeStep;
  afterPossession(state: GameState, outcome: PlayOutcome, ctx: RulingContext): OvertimeStep;
  timeoutsPerTeam(state: GameState, src: NumberSources): number;
}

/** Foul catalogue and enforcement (B8, B4 pre-snap fouls, B13.5, B13.8, B13.12). WP-04. */
export interface FoulRules {
  catalogue(id: FoulId, src: NumberSources): FoulCatalogueRow;
  /** Every `foul_committed` event of the truth as a FoulRecord with catalogue fields, `called` false. */
  candidates(truth: PlayTruth, ctx: RulingContext): FoulRecord[];
  /**
   * B8.5.1 steps 1 to 8 on the called fouls. Returns every legal choice with its resulting outcome;
   * declining is first. With no called foul it returns one option holding `calledOutcome` unchanged.
   */
  options(calledOutcome: PlayOutcome, fouls: readonly FoulRecord[], ctx: RulingContext): EnforcementOption[];
}

/** What the crew saw and called (B11.2, B11.3, B11.4). WP-05. */
export interface CrewModel {
  /**
   * Returns `seen`: a copy of the truth with the events altered to what the crew ruled (a catch seen
   * as incomplete, a spot moved by the spotting error), the rulings, and the fouls with `called` set
   * (detection, B11.3.1) plus any phantom calls from `borderline` events (B11.3.2).
   */
  perceive(truth: PlayTruth, candidates: readonly FoulRecord[], ctx: RulingContext): { seen: PlayTruth; rulings: Ruling[]; fouls: FoulRecord[] };
}

/** Replay and challenges (B9, B13.9). WP-05. */
export interface ReplayRules {
  /** Aspects of this play a coach may challenge now; empty when challenges are not allowed (overtime, booth-only periods). */
  challengeable(called: CalledPlay, side: Side, ctx: RulingContext): RulingAspect[];
  /** Booth-initiated review, if the rule set calls for one on this play (B9.1.2). */
  boothReview(called: CalledPlay, ctx: RulingContext): ReviewRequest | null;
  /**
   * Resolves a review with the evidence model (B9.2.1). Returns the corrected `seen` truth; the
   * facade re-runs ruling and enforcement on it.
   */
  review(seen: PlayTruth, truth: PlayTruth, rulings: readonly Ruling[], request: ReviewRequest, ctx: RulingContext): { allowed: boolean; refusedKey: string | null; reversed: number[]; seen: PlayTruth };
}

/**
 * The facade the game state machine holds (J11.2.1). Assembled by the integrator from the modules
 * above in `packages/officiating/src/index.ts`. Work packages do not write it; WP-06 codes against it.
 */
export interface Officiating {
  /** Runs the pipeline at the top of this file up to the coach's choice. */
  rulePlay(truth: PlayTruth, ctx: RulingContext): CalledPlay;
  review(called: CalledPlay, truth: PlayTruth, request: ReviewRequest, ctx: RulingContext): ReviewResult;
  readonly series: SeriesRules;
  readonly clock: ClockRules;
  readonly restarts: RestartRules;
  readonly overtime: OvertimeRules;
  readonly replay: ReplayRules;
}
