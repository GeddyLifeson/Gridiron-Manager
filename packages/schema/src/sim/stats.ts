// Simulation contract, part 11: statistics events and the play-by-play row (D14.1.1, D14.2.1,
// J11.9.1, P3.1.1). Derived data is never a source of truth: a box score is a query over credit rows,
// and credit rows are a pure function of play records. Statistics follow called values, because real
// statistics do (B11.2.1 rule 3). Plays nullified by penalty carry no credits (J11.9.1).
import { z } from 'zod';
import { pub } from '../field.ts';
import { zSide, zTenths, type Side } from './primitives.ts';
import { PlayKind, OffensePlayKind, CoverageFamily, KickKind } from './situation.ts';
import { PlayResultType } from './officiating.ts';
import { DriveRecord, type PlayRecord } from './game-state.ts';

/**
 * Box-score statistic ids (D14.2.1 starting catalogue). The catalogue itself is a data file owned by
 * the statistics module (D14.1.1: "a statistic is defined in data as a rule over play-record events");
 * these ids are the shared names. Scoring conventions are Unverified in D14.1.1 until the scoring
 * guide is read, so each catalogue row carries its own status.
 */
export const STAT_IDS = [
  // Passing
  'pass_completions', 'pass_attempts', 'pass_yards', 'pass_touchdowns', 'pass_interceptions', 'sacks_taken',
  'sack_yards_lost', 'sack_fumbles', 'sack_fumbles_lost', 'pass_air_yards', 'pass_yards_after_catch',
  'pass_first_downs', 'pass_two_point_conversions',
  // Rushing
  'rush_carries', 'rush_yards', 'rush_touchdowns', 'rush_fumbles', 'rush_fumbles_lost', 'rush_first_downs',
  'rush_two_point_conversions',
  // Receiving
  'targets', 'receptions', 'receiving_yards', 'receiving_touchdowns', 'receiving_fumbles', 'receiving_fumbles_lost',
  'receiving_air_yards', 'receiving_yards_after_catch', 'receiving_first_downs', 'receiving_two_point_conversions',
  // Defense
  'tackles_solo', 'tackles_assisted', 'tackles_for_loss', 'sacks', 'sack_yards', 'quarterback_hits',
  'interceptions', 'interception_return_yards', 'passes_defended', 'forced_fumbles', 'fumble_recoveries',
  'safeties', 'defensive_touchdowns',
  // Kicking (distance bands of D14.2.1 are a split of made and attempted by `splitKey`)
  'field_goals_made', 'field_goals_attempted', 'field_goal_longest', 'field_goals_blocked',
  'extra_points_made', 'extra_points_attempted', 'kickoffs', 'kickoff_touchbacks',
  // Punting
  'punts', 'punt_gross_yards', 'punt_net_yards', 'punts_inside_20', 'punt_touchbacks', 'punts_blocked',
  'punt_longest', 'punt_hang_time',
  // Returns
  'punt_returns', 'punt_return_yards', 'punt_return_touchdowns', 'kickoff_returns', 'kickoff_return_yards',
  'kickoff_return_touchdowns', 'fair_catches', 'muffs',
  // Participation
  'snaps_offense', 'snaps_defense', 'snaps_special_teams',
  // Penalties (foul type is the `splitKey`)
  'penalties', 'penalty_yards',
] as const;
export type StatId = (typeof STAT_IDS)[number];

/** Per-play credit row (D14.1.1): (player, statistic id, value, play id). A team credit has a null player. */
export const StatCredit = z.object({
  gameId: pub(z.number().int().positive(), 'id'),
  playIndex: pub(z.number().int().positive(), 'index'),
  side: zSide(),
  playerId: pub(z.number().int().positive(), 'id').nullable(),
  statId: pub(z.string()),
  /** Whole numbers except shared sacks (half each, D14.1.1) and hang time (seconds). */
  value: pub(z.number(), 'ratio'),
  /** Optional split: a field goal distance band, a foul id. */
  splitKey: pub(z.string()).nullable(),
}).strict();
export type StatCredit = z.infer<typeof StatCredit>;

/**
 * Play-by-play row (J11.9.1). Its fields mirror the public play-by-play columns the calibration
 * scripts read, so one script runs on real or simulated data. The export step that renames these to
 * the real-data column names is owned by WP-07 and takes the names from `research/nflverse_baselines.py`.
 * Everything here is from called values and from what a scout could chart from film (P3.3.1 `features`).
 */
export const PlayByPlayRow = z.object({
  gameId: pub(z.number().int().positive(), 'id'),
  playIndex: pub(z.number().int().positive(), 'index'),
  driveNumber: pub(z.number().int().min(0), 'index'),
  period: pub(z.number().int().min(1), 'index'),
  clockTenths: zTenths(),
  offense: zSide(),
  playKind: pub(PlayKind),
  down: pub(z.number().int().min(1), 'index').nullable(),
  distanceYd: pub(z.number().min(0), 'yd').nullable(),
  /** Yards from the offense's own goal line at the snap. */
  ballOnYd: pub(z.number(), 'yd'),
  /** Yards to the goal the offense attacks ("yardline 100" in public data). */
  yardsToGoalYd: pub(z.number(), 'yd'),
  goalToGo: pub(z.boolean()),
  scoreOffense: pub(z.number().int().min(0), 'points'),
  scoreDefense: pub(z.number().int().min(0), 'points'),
  resultType: pub(PlayResultType),
  noPlay: pub(z.boolean()),
  offenseKind: pub(OffensePlayKind).nullable(),
  kickKind: pub(KickKind).nullable(),
  /** A called pass or a scramble (J15.3.2 "dropback share"). */
  dropback: pub(z.boolean()),
  scramble: pub(z.boolean()),
  shotgun: pub(z.boolean()),
  noHuddle: pub(z.boolean()),
  playAction: pub(z.boolean()),
  motion: pub(z.boolean()),
  personnelCode: pub(z.string()).nullable(),
  yardsGained: pub(z.number(), 'yd'),
  airYd: pub(z.number(), 'yd').nullable(),
  yardsAfterCatch: pub(z.number(), 'yd').nullable(),
  passLocation: pub(z.enum(['left', 'middle', 'right'])).nullable(),
  runLocation: pub(z.enum(['left', 'middle', 'right'])).nullable(),
  rushers: pub(z.number().int().min(0), 'count').nullable(),
  boxCount: pub(z.number().int().min(0), 'count').nullable(),
  coverageFamily: pub(CoverageFamily).nullable(),
  /** Simulated definition of J6.2.5, held fixed (J15.4.2 edge case). */
  pressure: pub(z.boolean()),
  sack: pub(z.boolean()),
  interception: pub(z.boolean()),
  fumbleLost: pub(z.boolean()),
  touchdown: pub(z.boolean()),
  firstDown: pub(z.boolean()),
  /** Field goal distance by the play-by-play convention: line of scrimmage plus 17 (J9.4.1). */
  kickDistanceYd: pub(z.number(), 'yd').nullable(),
  /** Accepted penalties on the play: foul id, side, yards. */
  penalties: pub(z.array(z.object({ foulId: pub(z.string()), side: zSide(), yards: pub(z.number(), 'yd') }))),
  /** Game-clock tenths from this snap to the next snap of the same drive and period; null otherwise (J11.4.1). */
  snapToSnapTenths: pub(z.number().int().min(0), 'tenths_s').nullable(),
  /** Expected points before and after (N2). Null until the models package supplies them. */
  epBefore: pub(z.number(), 'points').nullable(),
  epAfter: pub(z.number(), 'points').nullable(),
  /** Text template key and parameters for the play-by-play line (P4.6.1). */
  textKey: pub(z.string()),
  textParams: pub(z.record(z.string(), z.union([z.string(), z.number()])), 'ratio'),
}).strict();
export type PlayByPlayRow = z.infer<typeof PlayByPlayRow>;

/** Team totals of one game, the unit of every J15 game-level row (J15.2.1). */
export const TeamGameLine = z.object({
  side: zSide(),
  points: pub(z.number().int().min(0), 'points'),
  scrimmagePlays: pub(z.number().int().min(0), 'count'),
  turnovers: pub(z.number().int().min(0), 'count'),
  sacksMade: pub(z.number().int().min(0), 'count'),
  penaltiesAccepted: pub(z.number().int().min(0), 'count'),
  penaltyYards: pub(z.number().min(0), 'yd'),
  timeoutsUsed: pub(z.number().int().min(0), 'count'),
  drives: pub(z.number().int().min(0), 'count'),
}).strict();

/** Everything the calibration harness reads from one finished game (J14.6.1 league mode). */
export const GameSummary = z.object({
  gameId: pub(z.number().int().positive(), 'id'),
  ruleSetId: pub(z.string()),
  resolverId: pub(z.enum(['reference', 'tick'])),
  seedHex: pub(z.string()),
  finalScore: pub(z.tuple([z.number().int().min(0), z.number().int().min(0)]), 'points'),
  overtime: pub(z.boolean()),
  tie: pub(z.boolean()),
  teams: pub(z.tuple([TeamGameLine, TeamGameLine])),
  drives: pub(z.array(DriveRecord)),
  finalStateHash: pub(z.string()),
}).strict();
export type GameSummary = z.infer<typeof GameSummary>;

/** Names for display, kept out of the engine: the engine never needs a name (P4.6.1 text is built on the interface side). */
export interface RosterNames {
  playerName(playerId: number): string;
  teamName(side: Side): string;
}

/**
 * The statistics module's surface (WP-07). All three are pure functions of play records, so a box
 * score cannot disagree with the play-by-play (P3.1.1).
 */
/** What a caller knows about the game beyond its play records, for `StatsModule.summary`. */
export interface SummaryFinalInput {
  score: readonly [number, number];
  tie: boolean;
  stateHash: string;
  ruleSetId: string;
  seedHex: string;
  /**
   * Team timeouts charged to each side. They are game events (`timeout_charged`, kind `team`), not play
   * records, so the caller counts them from the event log. Left out, the summary reports 0 for both.
   */
  timeoutsUsed?: readonly [number, number];
}

export interface StatsModule {
  credits(record: PlayRecord): StatCredit[];
  playByPlay(record: PlayRecord, next: PlayRecord | null): PlayByPlayRow;
  summary(records: readonly PlayRecord[], drives: readonly z.infer<typeof DriveRecord>[], final: SummaryFinalInput): GameSummary;
}
