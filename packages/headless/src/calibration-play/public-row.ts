// Real play-by-play as `PlayByPlayRow` (WP-26; J11.9.1: "one script runs on real or simulated data").
// The input is one row of the public nflverse play-by-play file, read by column name. The conventions
// below were read off the 2022 to 2024 regular-season files themselves (see data/README.md for the
// counts), not written from memory:
//   play_type   pass (attempts and sacks), run (scrambles included), qb_kneel, qb_spike, no_play
//               (accepted penalty or a timeout), punt, field_goal, extra_point, kickoff; empty on
//               game and quarter markers. Two-point tries are pass or run rows with an empty down.
//   first_down  counts first downs by penalty too, as the simulated row's `firstDown` does.
// Fields no public file charts are listed in UNCHARTED_FIELDS; the participation and FTN files chart the
// CHART_FIELDS, applied by charting.ts. Both are filled with a neutral value when absent because the row
// type has no "unknown", and no real-data cell may read them.
import type { PlayByPlayRow } from '@gm/schema';
import type { CsvRecord } from './csv.ts';

/** Columns the adapter reads. */
export const PUBLIC_COLUMNS_READ: readonly string[] = [
  'game_id', 'play_id', 'season', 'season_type', 'home_team', 'posteam', 'play_type', 'qtr', 'quarter_seconds_remaining',
  'drive', 'down', 'ydstogo', 'yardline_100', 'goal_to_go', 'posteam_score', 'defteam_score', 'yards_gained', 'air_yards',
  'yards_after_catch', 'pass_location', 'run_location', 'shotgun', 'no_huddle', 'qb_dropback', 'qb_scramble', 'qb_kneel',
  'qb_spike', 'sack', 'interception', 'fumble_lost', 'complete_pass', 'touchdown', 'first_down', 'penalty', 'penalty_team',
  'penalty_type', 'penalty_yards', 'field_goal_result', 'kick_distance', 'extra_point_attempt', 'extra_point_result',
  'two_point_attempt', 'two_point_conv_result', 'kickoff_attempt', 'timeout',
];

/** Row fields with no source in the base public file. A measure that reads one cannot run on real rows. */
export const UNCHARTED_FIELDS: readonly (keyof PlayByPlayRow)[] = ['offenseKind', 'snapToSnapTenths', 'epBefore', 'epAfter'];

/** Row fields the participation and FTN files chart (see charting.ts). Neutral on a row built without a chart. */
export const CHART_FIELDS: readonly (keyof PlayByPlayRow)[] = ['playAction', 'motion', 'personnelCode', 'rushers', 'boxCount', 'coverageFamily', 'pressure'];

const one = (v: string | undefined): boolean => v === '1' || v === '1.0';
const numOrNull = (v: string | undefined): number | null => {
  if (v === undefined || v === '' || v === 'NA') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const lateral = (v: string | undefined): 'left' | 'middle' | 'right' | null => (v === 'left' || v === 'middle' || v === 'right' ? v : null);

export interface PublicIds {
  /** Positive whole number for the game (the public id is text). */
  readonly gameId: number;
  /** Order of the row inside its game, from 1. */
  readonly playIndex: number;
}

/**
 * One public row as a `PlayByPlayRow`, or null for rows that are not plays: markers with no play type,
 * and `no_play` rows with no accepted penalty (timeouts). Side 0 is the home team.
 */
export function rowFromPublic(c: CsvRecord, ids: PublicIds): PlayByPlayRow | null {
  const type = c['play_type'] ?? '';
  if (type === '' || type === 'NA') return null;
  const penalty = one(c['penalty']);
  if (type === 'no_play' && !penalty) return null;
  const offense: 0 | 1 = c['posteam'] === c['home_team'] ? 0 : 1;
  const twoPoint = one(c['two_point_attempt']);
  const kickedTry = type === 'extra_point' || one(c['extra_point_attempt']);
  const kickoff = type === 'kickoff';
  const playKind: PlayByPlayRow['playKind'] = twoPoint || kickedTry ? 'try' : kickoff ? 'kickoff' : 'scrimmage';
  const kickKind: PlayByPlayRow['kickKind'] = kickedTry ? 'try_kick' : kickoff ? 'kickoff' : type === 'punt' ? 'punt' : type === 'field_goal' ? 'field_goal' : null;
  const sack = one(c['sack']), interception = one(c['interception']), fumbleLost = one(c['fumble_lost']), complete = one(c['complete_pass']);
  const kneel = type === 'qb_kneel' || one(c['qb_kneel']), spike = type === 'qb_spike' || one(c['qb_spike']);
  let resultType: PlayByPlayRow['resultType'];
  if (type === 'no_play') resultType = 'no_play';
  else if (kickedTry) resultType = c['extra_point_result'] === 'good' ? 'try_good' : 'try_failed';
  else if (twoPoint) resultType = c['two_point_conv_result'] === 'success' ? 'try_good' : 'try_failed';
  else if (kickoff) resultType = 'kickoff';
  else if (type === 'punt') resultType = 'punt';
  else if (type === 'field_goal') resultType = c['field_goal_result'] === 'made' ? 'field_goal_good' : 'field_goal_missed';
  else if (kneel) resultType = 'kneel';
  else if (spike) resultType = 'spike';
  else if (sack) resultType = 'sack';
  else if (interception) resultType = 'interception';
  else if (fumbleLost) resultType = 'fumble_lost';
  else if (type === 'pass') resultType = complete ? 'pass_complete' : 'pass_incomplete';
  else resultType = 'run';
  const yardline = numOrNull(c['yardline_100']) ?? 0;
  const down = playKind === 'scrimmage' ? numOrNull(c['down']) : null;
  const penaltyYards = numOrNull(c['penalty_yards']);
  const yac = numOrNull(c['yards_after_catch']);
  return {
    gameId: ids.gameId, playIndex: ids.playIndex, driveNumber: Math.max(0, Math.trunc(numOrNull(c['drive']) ?? 0)),
    period: Math.max(1, Math.trunc(numOrNull(c['qtr']) ?? 1)), clockTenths: Math.max(0, Math.round((numOrNull(c['quarter_seconds_remaining']) ?? 0) * 10)),
    offense, playKind, down: down !== null && down >= 1 ? down : null,
    distanceYd: playKind === 'scrimmage' ? numOrNull(c['ydstogo']) : null,
    ballOnYd: 100 - yardline, yardsToGoalYd: yardline, goalToGo: one(c['goal_to_go']),
    scoreOffense: Math.max(0, numOrNull(c['posteam_score']) ?? 0), scoreDefense: Math.max(0, numOrNull(c['defteam_score']) ?? 0),
    resultType, noPlay: type === 'no_play', offenseKind: null, kickKind,
    dropback: (one(c['qb_dropback']) || type === 'pass') && !spike, scramble: one(c['qb_scramble']),
    shotgun: one(c['shotgun']), noHuddle: one(c['no_huddle']), playAction: false, motion: false, personnelCode: null,
    yardsGained: numOrNull(c['yards_gained']) ?? 0, airYd: type === 'pass' ? numOrNull(c['air_yards']) : null,
    yardsAfterCatch: complete ? yac : null, passLocation: lateral(c['pass_location']), runLocation: lateral(c['run_location']),
    rushers: null, boxCount: null, coverageFamily: null, pressure: false, sack, interception, fumbleLost,
    touchdown: one(c['touchdown']), firstDown: one(c['first_down']),
    kickDistanceYd: type === 'field_goal' ? numOrNull(c['kick_distance']) : null,
    penalties: penalty && c['penalty_type'] && c['penalty_type'] !== 'NA' && penaltyYards !== null
      ? [{ foulId: c['penalty_type'], side: c['penalty_team'] === c['posteam'] ? offense : ((1 - offense) as 0 | 1), yards: Math.abs(penaltyYards) }] : [],
    snapToSnapTenths: null, epBefore: null, epAfter: null, textKey: 'public', textParams: {},
  };
}
