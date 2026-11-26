// The map from our play-by-play to the public play-by-play column names (contract decision D-17,
// J11.9.1), so the project's calibration scripts can read a simulated season as they read real data.
// The column names are the ones `research/nflverse_baselines.py` and `research/nflverse_gaps.py` in
// the project files load. The table below is the map: each column says where its value comes from.
//
// Verification status. The names are copied from the two scripts. The value conventions (which plays
// count as `play_type` "pass", the result strings, the coverage labels) were written from general
// knowledge of the public data and are Unverified here: they have not been checked against the
// public data dictionary. A column marked `unverified` says which convention is in doubt.
//
// This export reads the truth record for a few charting columns (time to throw, drops). It is for
// calibration runs. It is not a read model and must not be shown in a career (P1.1.4).
import { Contract } from '@gm/engine-core';
import { readPlay, enforcedPenalties, type PlayFacts, type StatsDeps } from './facts.ts';
import { playByPlayFromFacts } from './play-by-play.ts';

type PlayRecord = Contract.PlayRecord;
type PlayByPlayRow = Contract.PlayByPlayRow;
type DriveRecord = Contract.DriveRecord;

export type PublicValue = string | number | boolean | null;
export type PublicRow = Record<string, PublicValue>;

/** Things the play record does not hold. All optional: a missing value exports as empty. */
export interface PublicExportContext {
  readonly rules: Contract.RuleSet;
  readonly gameLabel?: string;
  /** Team labels indexed by side: home, visitor. */
  readonly teamLabels?: readonly [string, string];
  readonly season?: number;
  readonly seasonType?: string;
  readonly week?: number;
  readonly finalScore?: readonly [number, number];
  readonly drives?: readonly DriveRecord[];
}

interface Source {
  readonly record: PlayRecord;
  readonly row: PlayByPlayRow;
  readonly facts: PlayFacts;
  readonly ctx: PublicExportContext;
  readonly deps: StatsDeps;
}

export type ColumnOrigin = 'row' | 'record' | 'context' | 'unavailable';

export interface PublicColumn {
  readonly name: string;
  readonly origin: ColumnOrigin;
  /** Which field or rule the value comes from, or why it is not available. */
  readonly note: string;
  readonly unverified?: string;
  readonly get: (s: Source) => PublicValue;
}

const flag = (b: boolean): number => (b ? 1 : 0);
const none = (): PublicValue => null;
const teams = (s: Source): readonly [string, string] => s.ctx.teamLabels ?? ['HOME', 'AWAY'];
const driveOf = (s: Source): DriveRecord | null => s.ctx.drives?.find((d) => d.driveNumber === s.row.driveNumber) ?? null;
const scrimmageBase = (f: PlayFacts) => f.base !== 'none' && !f.isTry;

function playType(s: Source): string {
  const { facts: f, row } = s;
  if (row.noPlay) return 'no_play';
  if (f.punt) return 'punt';
  if (f.placeKick) return f.placeKick.kind === 'try_kick' ? 'extra_point' : 'field_goal';
  if (f.kick) return 'kickoff';
  if (f.base === 'kneel') return 'qb_kneel';
  if (f.base === 'spike') return 'qb_spike';
  if (f.base === 'run') return 'run';
  if (f.base === 'none') return 'no_play';
  return 'pass';
}

function secondsRemaining(s: Source, scope: 'game' | 'half'): number | null {
  const periods = s.ctx.rules.num('clock.periods');
  const length = s.ctx.rules.num('clock.period_length_s');
  const period = s.row.period;
  const inPeriod = s.row.clockTenths / 10;
  if (period > periods) return inPeriod;
  const half = periods / 2;
  const lastOfScope = scope === 'game' ? periods : period <= half ? half : periods;
  return (lastOfScope - period) * length + inPeriod;
}

function personnelString(s: Source): string | null {
  const code = s.row.personnelCode;
  if (code === null) return null;
  const backs = Number(code[0]), tightEnds = Number(code[1]);
  const receivers = s.deps.params.num('stats.personnel.eligibleCount') - backs - tightEnds;
  return `${backs} RB, ${tightEnds} TE, ${receivers} WR`;
}

function coverageLabel(family: PlayByPlayRow['coverageFamily']): string | null {
  if (family === null) return null;
  const labels: Record<NonNullable<PlayByPlayRow['coverageFamily']>, string> = {
    cover0: 'COVER_0', cover1: 'COVER_1', cover2: 'COVER_2', cover3: 'COVER_3', cover4: 'COVER_4', cover6: 'COVER_6', two_man: '2_MAN', other: 'OTHER',
  };
  return labels[family];
}

const DRIVE_RESULT_LABELS: Record<DriveRecord['result'], string | null> = {
  touchdown: 'Touchdown', field_goal: 'Field goal', punt: 'Punt', turnover: 'Turnover', downs: 'Turnover on downs',
  end_of_half: 'End of half', missed_field_goal: 'Missed field goal', safety: 'Safety', opponent_touchdown: 'Opp touchdown', in_progress: null,
};

function clockText(tenths: number): string {
  const total = Math.floor(tenths / 10);
  const seconds = total % 60;
  return `${Math.floor(total / 60)}:${seconds < 10 ? '0' : ''}${seconds}`;
}

/** The last down of a series is `series.downs`; the "third down" of the public columns is the one before it. */
function conversion(s: Source, fromLast: number, converted: boolean): number {
  const f = s.facts;
  const down = s.ctx.rules.num('series.downs') - fromLast;
  if (s.row.noPlay || s.row.down !== down || !scrimmageBase(f) || f.base === 'kneel' || f.base === 'spike') return 0;
  return flag(s.row.firstDown === converted);
}

const col = (name: string, origin: ColumnOrigin, note: string, get: (s: Source) => PublicValue, unverified?: string): PublicColumn =>
  (unverified === undefined ? { name, origin, note, get } : { name, origin, note, get, unverified });

export const PUBLIC_COLUMNS: readonly PublicColumn[] = [
  // Identity and context
  col('game_id', 'context', 'gameLabel, else the game id', (s) => s.ctx.gameLabel ?? String(s.row.gameId)),
  col('play_id', 'row', 'playIndex', (s) => s.row.playIndex),
  col('season', 'context', 'season', (s) => s.ctx.season ?? null),
  col('season_type', 'context', 'seasonType', (s) => s.ctx.seasonType ?? null),
  col('week', 'context', 'week', (s) => s.ctx.week ?? null),
  col('home_team', 'context', 'teamLabels[0]', (s) => teams(s)[0]),
  col('away_team', 'context', 'teamLabels[1]', (s) => teams(s)[1]),
  col('posteam', 'row', 'offense as a team label', (s) => teams(s)[s.row.offense]),
  col('defteam', 'row', 'the other side as a team label', (s) => teams(s)[Contract.otherSide(s.row.offense)]),
  // Situation
  col('qtr', 'row', 'period', (s) => s.row.period),
  col('down', 'row', 'down', (s) => s.row.down),
  col('ydstogo', 'row', 'distanceYd rounded up to a whole yard, 0 on kicks and tries', (s) => (s.row.distanceYd === null ? 0 : Math.max(1, Math.ceil(s.row.distanceYd))), 'rounding of a distance between yard lines'),
  col('yardline_100', 'row', 'yardsToGoalYd to the nearest yard', (s) => Math.round(s.row.yardsToGoalYd) + 0),
  col('game_seconds_remaining', 'row', 'period and clockTenths with rule keys clock.periods and clock.period_length_s', (s) => secondsRemaining(s, 'game')),
  col('half_seconds_remaining', 'row', 'as above, to the end of the half', (s) => secondsRemaining(s, 'half')),
  col('score_differential', 'row', 'scoreOffense minus scoreDefense', (s) => s.row.scoreOffense - s.row.scoreDefense),
  col('posteam_score_post', 'record', 'scoreAfter of the offense', (s) => s.record.scoreAfter[s.row.offense]),
  col('total_home_score', 'record', 'scoreAfter[0]', (s) => s.record.scoreAfter[0]),
  col('total_away_score', 'record', 'scoreAfter[1]', (s) => s.record.scoreAfter[1]),
  col('clock_running', 'record', 'situation.clockStatus is running', (s) => flag(s.record.situation.clockStatus === 'running')),
  col('play_clock', 'record', 'situation.playClockAtSnapTenths in seconds', (s) => s.record.situation.playClockAtSnapTenths / 10),
  // Play
  col('play_type', 'row', 'resultType and the base play', playType, 'a sack is "pass", a scramble is "run"'),
  col('yards_gained', 'row', 'yardsGained', (s) => s.row.yardsGained),
  col('pass_attempt', 'row', 'pass plays including sacks', (s) => flag(!s.row.noPlay && playType(s) === 'pass'), 'whether the public flag includes sacks'),
  col('rush_attempt', 'row', 'runs, scrambles included', (s) => flag(!s.row.noPlay && s.facts.base === 'run'), 'whether a kneel is a rush attempt in the public flag'),
  col('complete_pass', 'row', 'base play is a completion', (s) => flag(s.facts.base === 'completion' && !s.facts.isTry)),
  col('sack', 'row', 'sack', (s) => flag(s.row.sack)),
  col('interception', 'row', 'interception', (s) => flag(s.row.interception)),
  col('fumble_lost', 'row', 'fumbleLost', (s) => flag(s.row.fumbleLost)),
  col('fumble', 'record', 'any fumble that stood', (s) => flag(!s.row.noPlay && s.facts.fumbles.some((x) => x.credited))),
  col('touchdown', 'row', 'touchdown', (s) => flag(s.row.touchdown)),
  col('pass_touchdown', 'record', 'touchdown by the receiver of a completion', (s) => flag(s.facts.base === 'completion' && s.facts.offenseTouchdown)),
  col('rush_touchdown', 'record', 'touchdown by the carrier of a run', (s) => flag(s.facts.base === 'run' && s.facts.offenseTouchdown)),
  col('first_down', 'row', 'firstDown', (s) => flag(s.row.firstDown)),
  col('third_down_converted', 'row', 'the down before the last of the series (key series.downs), scrimmage play, first down gained', (s) => conversion(s, 1, true)),
  col('third_down_failed', 'row', 'as above, no first down', (s) => conversion(s, 1, false)),
  col('fourth_down_converted', 'row', 'the last down of the series, scrimmage play, first down gained', (s) => conversion(s, 0, true)),
  col('fourth_down_failed', 'row', 'as above, no first down', (s) => conversion(s, 0, false)),
  col('air_yards', 'row', 'airYd', (s) => s.row.airYd),
  col('yards_after_catch', 'row', 'yardsAfterCatch', (s) => s.row.yardsAfterCatch),
  col('qb_scramble', 'row', 'scramble', (s) => flag(s.row.scramble)),
  col('qb_kneel', 'row', 'resultType is kneel', (s) => flag(s.facts.base === 'kneel')),
  col('qb_spike', 'row', 'resultType is spike', (s) => flag(s.facts.base === 'spike')),
  col('shotgun', 'row', 'shotgun', (s) => flag(s.row.shotgun)),
  col('no_huddle', 'row', 'noHuddle', (s) => flag(s.row.noHuddle)),
  col('pass_location', 'row', 'passLocation', (s) => s.row.passLocation),
  col('run_location', 'row', 'runLocation', (s) => s.row.runLocation),
  col('run_gap', 'unavailable', 'the offensive call holds a direction, not a gap', none),
  col('penalty', 'row', 'at least one enforced penalty', (s) => flag(s.row.penalties.length > 0), 'whether the public flag counts declined and offsetting fouls'),
  col('penalty_type', 'row', 'foul id of the first enforced penalty', (s) => s.row.penalties[0]?.foulId ?? null, 'the public column holds the foul name in words'),
  col('penalty_yards', 'row', 'yards of the enforced penalties', (s) => (s.row.penalties.length ? enforcedPenalties(s.record).reduce((a, p) => a + p.yards, 0) : null)),
  // Kicks
  col('field_goal_result', 'record', 'made, missed or blocked', (s) => (s.facts.placeKick && s.facts.placeKick.kind === 'field_goal' ? (s.facts.placeKick.good ? 'made' : s.facts.placeKick.blocked ? 'blocked' : 'missed') : null)),
  col('extra_point_result', 'record', 'good, failed or blocked', (s) => (s.facts.placeKick && s.facts.placeKick.kind === 'try_kick' ? (s.facts.placeKick.good ? 'good' : s.facts.placeKick.blocked ? 'blocked' : 'failed') : null)),
  col('kick_distance', 'row', 'kickDistanceYd', (s) => s.row.kickDistanceYd),
  col('two_point_attempt', 'record', 'a try with no kick', (s) => flag(!s.row.noPlay && s.facts.isTry && s.facts.kick === null)),
  col('two_point_conv_result', 'record', 'success or failure', (s) => (!s.row.noPlay && s.facts.isTry && s.facts.kick === null ? (s.facts.twoPointGood ? 'success' : 'failure') : null)),
  col('punt_blocked', 'record', 'the punt was blocked', (s) => flag(s.facts.punt !== null && s.facts.punt.blocked)),
  col('touchback', 'record', 'final.touchback', (s) => flag(!s.row.noPlay && s.record.final.touchback)),
  col('return_yards', 'record', 'kick return or interception return yards', (s) => (s.facts.kickReturn ? s.facts.kickReturn.yards : s.facts.interceptionReturnYards)),
  col('kickoff_attempt', 'record', 'kickoff or onside kick', (s) => flag(s.facts.kickoff !== null), 'whether a safety kick is a kickoff attempt in the public flag'),
  col('timeout', 'unavailable', 'timeouts are game events, not play records', none),
  // Participation
  col('pass_defense_1_player_id', 'record', 'defender on the breakup, or the interceptor', (s) => s.facts.breakupById ?? s.facts.interceptorId),
  col('number_of_pass_rushers', 'row', 'rushers', (s) => s.row.rushers),
  col('defenders_in_box', 'row', 'boxCount', (s) => s.row.boxCount),
  col('offense_formation', 'record', 'formation id of the offensive call', (s) => (s.record.calls.snapping.unit === 'offense' ? s.record.calls.snapping.formationId : null), 'the public column holds a charted family such as shotgun, not a formation id'),
  col('offense_personnel', 'row', 'personnelCode written out; receivers are the remainder of five (G1.1.1)', personnelString),
  col('defense_personnel', 'record', 'package id of the defensive call', (s) => (s.record.calls.opposing.unit === 'defense' ? s.record.calls.opposing.packageId : null), 'the public column holds counts by position group'),
  col('n_offense', 'record', 'players the snapping team fielded', (s) => s.record.calls.snapping.players.length),
  col('was_pressure', 'row', 'pressure', (s) => s.row.pressure),
  col('time_to_throw', 'record', 'time of the forward pass release, seconds from the snap (truth)', (s) => (s.facts.release ? s.facts.release.t : null)),
  col('defense_coverage_type', 'row', 'coverageFamily', (s) => coverageLabel(s.row.coverageFamily), 'the label strings'),
  col('defense_man_zone_type', 'unavailable', 'the defensive call names a coverage family only', none),
  col('route', 'unavailable', 'routes are content, not part of the play record yet', none),
  // Charting flags
  col('is_play_action', 'row', 'playAction', (s) => s.row.playAction),
  col('is_screen_pass', 'row', 'offenseKind is screen', (s) => s.row.offenseKind === 'screen'),
  col('is_rpo', 'row', 'offenseKind is rpo', (s) => s.row.offenseKind === 'rpo'),
  col('is_motion', 'row', 'motion', (s) => s.row.motion),
  col('is_no_huddle', 'row', 'noHuddle', (s) => s.row.noHuddle),
  col('is_qb_out_of_pocket', 'record', 'the passer was outside the pocket at the release (truth)', (s) => (s.facts.release ? s.facts.release.passerOutsidePocket : false)),
  col('is_throw_away', 'record', 'the release was a throwaway (truth)', (s) => (s.facts.release ? s.facts.release.throwaway : false)),
  col('is_drop', 'record', 'a catch point ended in a drop (truth)', (s) => s.record.truth.events.some((e) => e.type === 'catch_point' && e.outcome === 'drop')),
  col('is_contested_ball', 'record', 'a catch point was contested (truth)', (s) => s.record.truth.events.some((e) => e.type === 'catch_point' && e.contested)),
  col('is_interception_worthy', 'unavailable', 'no such judgement exists in the play record', none),
  // Drives
  col('drive', 'row', 'driveNumber', (s) => s.row.driveNumber),
  col('fixed_drive', 'row', 'driveNumber', (s) => s.row.driveNumber),
  col('fixed_drive_result', 'context', 'result of the drive record', (s) => { const d = driveOf(s); return d ? DRIVE_RESULT_LABELS[d.result] : null; }, 'the result strings other than Touchdown and Field goal'),
  col('drive_play_count', 'context', 'plays of the drive record', (s) => driveOf(s)?.plays ?? null),
  col('drive_time_of_possession', 'context', 'clockUsedTenths of the drive record as m:ss', (s) => { const d = driveOf(s); return d ? clockText(d.clockUsedTenths) : null; }),
  col('drive_start_yard_line', 'context', 'startX of the drive record as yards from the own goal line', (s) => { const d = driveOf(s); return d ? Math.round(Contract.yardsFromOwnGoal(s.deps.geometry, d.startX, s.record.situation.attackDir)) + 0 : null; }, 'the public column is text with a team label'),
  col('drive_first_downs', 'unavailable', 'the drive record does not count first downs', none),
  // Game level
  col('result', 'context', 'finalScore home minus visitor', (s) => (s.ctx.finalScore ? s.ctx.finalScore[0] - s.ctx.finalScore[1] : null)),
  col('total', 'context', 'finalScore sum', (s) => (s.ctx.finalScore ? s.ctx.finalScore[0] + s.ctx.finalScore[1] : null)),
  col('spread_line', 'unavailable', 'betting lines are not simulated', none),
  col('roof', 'unavailable', 'venue is not part of the play record', none),
  col('temp', 'unavailable', 'weather is not part of the play record', none),
  col('wind', 'unavailable', 'weather is not part of the play record', none),
  // Models
  col('epa', 'unavailable', 'expected points come from the models package (N2)', none),
  col('wp', 'unavailable', 'win probability comes from the models package (N2)', none),
  col('home_wp_post', 'unavailable', 'win probability comes from the models package (N2)', none),
];

/**
 * Columns the two calibration scripts load, copied from them so the coverage test needs no file
 * outside the repo. Baselines: the `cols` list. Gaps: the `pc` list, the participation list and the
 * charting flags it reads.
 */
export const CALIBRATION_SCRIPT_COLUMNS: readonly string[] = [
  'season', 'season_type', 'week', 'game_id', 'play_type', 'down', 'ydstogo', 'yardline_100', 'yards_gained', 'pass_attempt', 'rush_attempt',
  'sack', 'interception', 'fumble_lost', 'fumble', 'complete_pass', 'touchdown', 'pass_touchdown', 'rush_touchdown', 'penalty', 'penalty_type',
  'penalty_yards', 'air_yards', 'yards_after_catch', 'qb_scramble', 'qb_kneel', 'qb_spike', 'first_down', 'epa', 'wp', 'score_differential',
  'game_seconds_remaining', 'half_seconds_remaining', 'qtr', 'posteam', 'shotgun', 'no_huddle', 'pass_location', 'run_location', 'run_gap',
  'fourth_down_converted', 'fourth_down_failed', 'third_down_converted', 'third_down_failed', 'field_goal_result', 'kick_distance',
  'extra_point_result', 'two_point_attempt', 'two_point_conv_result', 'punt_blocked', 'touchback', 'return_yards', 'kickoff_attempt', 'timeout',
  'clock_running', 'play_clock', 'pass_defense_1_player_id', 'number_of_pass_rushers', 'defenders_in_box', 'offense_formation', 'n_offense',
  'defense_personnel', 'offense_personnel',
  'play_id', 'home_team', 'away_team', 'defteam', 'drive', 'fixed_drive', 'fixed_drive_result', 'drive_play_count', 'drive_start_yard_line',
  'drive_time_of_possession', 'drive_first_downs', 'posteam_score_post', 'total_home_score', 'total_away_score', 'result', 'total', 'spread_line',
  'roof', 'temp', 'wind', 'home_wp_post',
  'time_to_throw', 'was_pressure', 'defense_man_zone_type', 'defense_coverage_type', 'route',
  'is_play_action', 'is_screen_pass', 'is_rpo', 'is_motion', 'is_no_huddle', 'is_qb_out_of_pocket', 'is_drop', 'is_throw_away',
  'is_interception_worthy', 'is_contested_ball',
];

/** One public row for one play record. */
export function publicRow(record: PlayRecord, next: PlayRecord | null, ctx: PublicExportContext, deps: StatsDeps): PublicRow {
  const facts = readPlay(record, deps);
  const row = playByPlayFromFacts(facts, next, deps);
  const source: Source = { record, row, facts, ctx, deps };
  const out: PublicRow = {};
  for (const c of PUBLIC_COLUMNS) out[c.name] = c.get(source);
  return out;
}

export function publicRows(records: readonly PlayRecord[], ctx: PublicExportContext, deps: StatsDeps): PublicRow[] {
  return records.map((r, i) => publicRow(r, records[i + 1] ?? null, ctx, deps));
}

function csvCell(v: PublicValue): string {
  if (v === null) return '';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  const text = String(v);
  return /[",\n]/.test(text) ? `"${text.split('"').join('""')}"` : text;
}

/** Comma-separated text with a header line. Empty is "not available", as in the public files; booleans print as True and False. */
export function publicCsv(rows: readonly PublicRow[]): string {
  const names = PUBLIC_COLUMNS.map((c) => c.name);
  const lines = [names.join(',')];
  for (const r of rows) lines.push(names.map((n) => csvCell(r[n] ?? null)).join(','));
  return lines.join('\n') + '\n';
}
