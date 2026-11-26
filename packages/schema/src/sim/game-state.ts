// Simulation contract, part 10: the game state, decisions, the game event log, and the records a
// game leaves (J11.1.1, J11.2.1, J11.6.1, J11.9.1, P3.3.1). State changes only by
// `next = apply(state, event)`; the ordered event list is the save's source of truth (P5).
import { z } from 'zod';
import { pub, own, truth } from '../field.ts';
import { zSide, zTenths, AttackDir, type Side } from './primitives.ts';
import { ClockStatus, PlayKind, GameSituation, PlayCalls, SnappingCall, OpposingCall } from './situation.ts';
import { GameDayState } from './player.ts';
import { Environment } from './environment.ts';
import { PlayTruth, PlayerDelta } from './truth.ts';
import { CalledPlay, PlayOutcome, SeriesState, ClockResult, OvertimeState, OfficialsCrew, ReviewRequest, ScoreEvent } from './officiating.ts';

/** Phases of the game state machine (J11.2.1). The legal (phase, event) pairs are a data table owned by WP-06. */
export const GameFlowPhase = z.enum([
  'pre_game', 'kickoff_setup', 'call_window', 'pre_snap', 'play', 'ruling', 'penalty_decision',
  'challenge_window', 'review', 'dead_ball', 'try_decision', 'timeout', 'period_end', 'overtime_toss', 'final',
]);
export type GameFlowPhase = z.infer<typeof GameFlowPhase>;

/** Decision types a coach is prompted for (J11.6.1). The fourth-down decision is not one: it is the unit called. */
export const DecisionType = z.enum([
  'toss_call', 'toss_choice', 'snapping_call', 'opposing_call', 'timeout', 'challenge', 'penalty_choice',
  'try_choice', 'runoff_choice', 'overtime_choice',
]);
export type DecisionType = z.infer<typeof DecisionType>;

/** A prompt (J11.6.1). Every request has a deadline and a default, so a game completes with no answers. */
export const DecisionRequest = z.object({
  requestId: pub(z.number().int().positive(), 'id'),
  type: pub(DecisionType),
  side: zSide(),
  /** Option ids the rule set allows here. Empty for call requests, whose answer is a call object. */
  options: pub(z.array(z.object({ optionId: pub(z.string()), labelKey: pub(z.string()) }))),
  /** Play-clock value (tenths) at which the default applies, or null for a fixed window. */
  deadlinePlayClockTenths: pub(z.number().int().min(0), 'tenths_s').nullable(),
  /** Fixed window in tenths of real time, measured by the shell, never by the core (J13.3.2). */
  windowTenths: pub(z.number().int().min(0), 'tenths_s').nullable(),
  defaultOptionId: pub(z.string()).nullable(),
}).strict();
export type DecisionRequest = z.infer<typeof DecisionRequest>;

/** An answer (J11.6.1). It carries the play-clock value at which it was accepted, so replay never reads a wall clock. */
export const Decision = z.object({
  requestId: pub(z.number().int().positive(), 'id'),
  type: pub(DecisionType),
  side: zSide(),
  optionId: pub(z.string()).nullable(),
  snappingCall: own(SnappingCall).nullable(),
  opposingCall: own(OpposingCall).nullable(),
  acceptedAtPlayClockTenths: pub(z.number().int().min(0), 'tenths_s').nullable(),
  /** Who decided: the user, an AI person, a delegated staff member, or the default at the deadline. */
  actor: pub(z.object({
    kind: pub(z.enum(['user', 'ai', 'staff', 'default'])),
    personId: pub(z.number().int().positive(), 'id').nullable(),
  })),
}).strict();
export type Decision = z.infer<typeof Decision>;

export const DriveResult = z.enum([
  'touchdown', 'field_goal', 'punt', 'turnover', 'downs', 'end_of_half', 'missed_field_goal', 'safety',
  'opponent_touchdown', 'in_progress',
]);

/** Drive record (J11.9.1). Result names are the J15.3.1 drive-result rows. */
export const DriveRecord = z.object({
  driveNumber: pub(z.number().int().min(1), 'index'),
  side: zSide(),
  startPeriod: pub(z.number().int().min(1), 'index'),
  startClockTenths: zTenths(),
  startX: pub(z.number(), 'yd'),
  plays: pub(z.number().int().min(0), 'count'),
  yards: pub(z.number(), 'yd'),
  clockUsedTenths: zTenths(),
  result: pub(DriveResult),
}).strict();
export type DriveRecord = z.infer<typeof DriveRecord>;

const pair = <T extends z.ZodType>(s: T) => z.tuple([s, s]);

/** The game state object (J11.1.1). Tuples of two are indexed by Side. */
export const GameState = z.object({
  gameId: pub(z.number().int().positive(), 'id'),
  ruleSetId: pub(z.string()),
  gameType: pub(z.enum(['regular', 'postseason', 'preseason', 'exhibition'])),
  teamIds: pub(pair(z.number().int().positive()), 'id'),
  /** Game seed as 16 hex digits (J13.4.1). */
  seedHex: pub(z.string().regex(/^[0-9a-f]{16}$/)),
  crew: pub(OfficialsCrew),
  environment: pub(Environment),

  phase: pub(GameFlowPhase),
  period: pub(z.number().int().min(1), 'index'),
  overtime: pub(OvertimeState).nullable(),
  /** Game clock: integer tenths, never a float (J11.1.1). */
  clockTenths: zTenths(),
  clockStatus: pub(ClockStatus),
  playClockTenths: zTenths(),
  playClockRunning: pub(z.boolean()),
  /** Simulated time since kickoff in tenths: live time, dead time, timeouts, breaks. Never the wall clock. */
  elapsedTenths: zTenths(),

  score: pub(pair(z.number().int().min(0)), 'points'),
  scoreByPeriod: pub(z.array(pair(z.number().int().min(0))), 'points'),
  possession: zSide(),
  /** Direction each team attacks this period. */
  attackDir: pub(pair(AttackDir), 'index'),
  nextPlayKind: pub(PlayKind),
  ballX: pub(z.number(), 'yd'),
  ballY: pub(z.number(), 'yd'),
  down: pub(z.number().int().min(1), 'index').nullable(),
  lineToGainX: pub(z.number(), 'yd').nullable(),
  seriesStartX: pub(z.number(), 'yd').nullable(),

  timeoutsLeft: pub(pair(z.number().int().min(0)), 'count'),
  challengesUsed: pub(pair(z.number().int().min(0)), 'count'),
  challengesWon: pub(pair(z.number().int().min(0)), 'count'),
  insideTwoMinute: pub(z.boolean()),
  untimedDownOwed: pub(z.boolean()),
  pendingRunoff: pub(z.object({ against: zSide(), tenths: zTenths() })).nullable(),
  /** Opening toss: who kicks off each half (B1.1.2). Null before the toss. */
  toss: pub(z.object({ winner: zSide(), firstHalfKicker: zSide(), secondHalfKicker: zSide() })).nullable(),
  /** Penalty carried to the try or the next kickoff (B8.5.7). */
  carriedPenalty: pub(z.object({ against: zSide(), yards: pub(z.number().min(0), 'yd'), to: pub(z.enum(['try', 'kickoff'])) })).nullable(),

  pendingDecisions: pub(z.array(DecisionRequest)),
  nextRequestId: pub(z.number().int().positive(), 'id'),
  playCounter: pub(z.number().int().min(0), 'index'),
  drive: pub(DriveRecord).nullable(),
  driveCounter: pub(z.number().int().min(0), 'index'),

  /** Per-team bench state by player id as a string key (J11.1.1): fatigue, injury, snaps, ejections, required absences. */
  gameDay: truth(pair(z.record(z.string(), GameDayState))),
}).strict();
export type GameState = z.infer<typeof GameState>;

/** The situation of the next snap, read off the state. Deciders and resolvers take this, never the state. */
export type SituationOf = (state: GameState) => GameSituation;

/** Play record (P3.3.1). One per snap or kick. `credit` is added by the statistics module (stats.ts). */
export const PlayRecord = z.object({
  gameId: pub(z.number().int().positive(), 'id'),
  index: pub(z.number().int().positive(), 'index'),
  fidelityTier: pub(z.enum(['A', 'B', 'Bench'])),
  situation: pub(GameSituation),
  calls: pub(PlayCalls),
  /** Class truth: what happened (J1.6.2). */
  truth: truth(PlayTruth),
  deltas: truth(z.array(PlayerDelta)),
  /** What officiating ruled, including the coach's penalty choice (J11.2.1). */
  called: pub(CalledPlay),
  chosenOptionId: pub(z.string()),
  final: pub(PlayOutcome),
  seriesAfter: pub(SeriesState),
  clockAfter: pub(ClockResult),
  scoreAfter: pub(pair(z.number().int().min(0)), 'points'),
  /** Decisions taken around this play (N3 feed): requests and answers. */
  decisions: pub(z.array(Decision)),
  /** State hash after the play (P1.1.5). */
  stateHash: pub(z.string()),
}).strict();
export type PlayRecord = z.infer<typeof PlayRecord>;

/**
 * The game event log (J11.1.1). `apply(state, event)` is pure and total over the legal
 * (phase, event) table. Statistics and play-by-play are computed from `play_resolved` events only.
 */
export const GameEvent = z.discriminatedUnion('type', [
  z.object({ type: pub(z.literal('game_started')) }).strict(),
  z.object({ type: pub(z.literal('toss')), tossIndex: pub(z.number().int().min(0), 'index'), winner: zSide(), choiceId: pub(z.string()), loserChoiceId: pub(z.string()).nullable() }).strict(),
  z.object({ type: pub(z.literal('decision_requested')), request: pub(DecisionRequest) }).strict(),
  z.object({ type: pub(z.literal('decision_made')), decision: pub(Decision) }).strict(),
  z.object({ type: pub(z.literal('deadline_missed')), requestId: pub(z.number().int().positive(), 'id') }).strict(),
  z.object({ type: pub(z.literal('clock_advanced')), tenths: zTenths(), reason: pub(z.enum(['between_plays', 'pre_snap', 'intermission', 'spotting'])) }).strict(),
  z.object({ type: pub(z.literal('timeout_charged')), side: zSide().nullable(), kind: pub(z.enum(['team', 'injury', 'official', 'two_minute'])) }).strict(),
  z.object({ type: pub(z.literal('play_resolved')), record: pub(PlayRecord) }).strict(),
  z.object({ type: pub(z.literal('review_resolved')), request: pub(ReviewRequest), reversed: pub(z.boolean()), record: pub(PlayRecord) }).strict(),
  z.object({ type: pub(z.literal('score_changed')), score: pub(ScoreEvent), scoreAfter: pub(pair(z.number().int().min(0)), 'points') }).strict(),
  z.object({ type: pub(z.literal('substitution')), side: zSide(), inId: pub(z.number().int().positive(), 'id'), outId: pub(z.number().int().positive(), 'id'), reason: pub(z.enum(['rotation', 'fatigue', 'injury', 'ejection', 'package'])) }).strict(),
  z.object({ type: pub(z.literal('drive_ended')), drive: pub(DriveRecord) }).strict(),
  z.object({ type: pub(z.literal('period_ended')), period: pub(z.number().int().min(1), 'index'), next: pub(z.enum(['next_period', 'halftime', 'overtime', 'final'])) }).strict(),
  z.object({ type: pub(z.literal('environment_updated')), environment: pub(Environment) }).strict(),
  z.object({ type: pub(z.literal('game_final')), score: pub(pair(z.number().int().min(0)), 'points'), tie: pub(z.boolean()) }).strict(),
]);
export type GameEvent = z.infer<typeof GameEvent>;

/** What a decider may see: the public situation and the last play as called. No truth (Q1.4.1). */
export interface DecisionView {
  readonly situation: GameSituation;
  readonly lastCalled: CalledPlay | null;
  readonly request: DecisionRequest;
}

/**
 * Answers decision requests for one team. The user (through commands), coach AI (K4, K5, phase 5),
 * staff AI (K6) and the scripted chart caller of the calibration harness all implement it. Returning
 * null means "no answer": the default applies at the deadline (J11.6.1).
 */
export interface Decider {
  readonly side: Side;
  decide(view: DecisionView): Decision | null;
}
