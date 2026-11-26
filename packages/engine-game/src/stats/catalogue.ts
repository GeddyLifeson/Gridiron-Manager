// The statistic catalogue as data (D14.1.1, D14.2.1). One row per shared statistic id. Each row says
// who is credited, how the value adds up, the rule in words, the public season-table column it lines
// up with, and the status of the scoring convention behind it.
//
// Status of every convention here: D14.1.1 lists the official scoring conventions as Unverified until
// the statisticians' guide is read. No row below claims more than that. A row marked `assumption` is
// this module's choice where the bible gives no convention at all.
import { Contract } from '@gm/engine-core';

type StatId = Contract.StatId;

export type StatGroup = 'passing' | 'rushing' | 'receiving' | 'defense' | 'kicking' | 'punting' | 'returns' | 'participation' | 'penalties';
/** `sum`: totals add over plays and players. `max`: the total is the largest single value (a longest kick). */
export type StatAggregate = 'sum' | 'max';
export type ConventionStatus = 'unverified' | 'assumption';

export interface StatCatalogueRow {
  readonly id: StatId;
  readonly group: StatGroup;
  readonly unit: 'count' | 'yd' | 's';
  readonly aggregate: StatAggregate;
  /** The rule over play-record events, in words (D14.1.1). The code in credits.ts implements it. */
  readonly rule: string;
  /** Column of the pack's player season table (`nfl_player_seasons_1999_2025.csv`), or null when it has none. */
  readonly seasonColumn: string | null;
  readonly convention: ConventionStatus;
  readonly leaf: string;
}

const row = (id: StatId, group: StatGroup, unit: StatCatalogueRow['unit'], seasonColumn: string | null, rule: string, convention: ConventionStatus = 'unverified', aggregate: StatAggregate = 'sum'): StatCatalogueRow =>
  ({ id, group, unit, aggregate, rule, seasonColumn, convention, leaf: 'D14.2.1' });

export const STAT_CATALOGUE: readonly StatCatalogueRow[] = [
  // Passing
  row('pass_attempts', 'passing', 'count', 'attempts', 'Passer of a forward pass ruled complete, incomplete or intercepted. A spike counts. A sack does not.'),
  row('pass_completions', 'passing', 'count', 'completions', 'Passer of a forward pass ruled complete.'),
  row('pass_yards', 'passing', 'yd', 'passing_yards', 'Whole yards gained on a completed pass. When the receiver fumbles and the ball is lost, yards to the spot of the fumble.'),
  row('pass_touchdowns', 'passing', 'count', 'passing_tds', 'Completed pass on which the receiver scores a touchdown.'),
  row('pass_interceptions', 'passing', 'count', 'passing_interceptions', 'Passer of a pass ruled intercepted.'),
  row('sacks_taken', 'passing', 'count', 'sacks_suffered', 'Passer on a play ruled a sack.'),
  row('sack_yards_lost', 'passing', 'yd', 'sack_yards_lost', 'Whole yards lost on a sack, as a positive number.'),
  row('sack_fumbles', 'passing', 'count', 'sack_fumbles', 'Fumble by the passer on a sack.'),
  row('sack_fumbles_lost', 'passing', 'count', 'sack_fumbles_lost', 'Sack fumble recovered by the defense.'),
  row('pass_air_yards', 'passing', 'yd', 'passing_air_yards', 'Depth of the arrival point past the line of scrimmage on every attempt with a target, whole yards.'),
  row('pass_yards_after_catch', 'passing', 'yd', 'passing_yards_after_catch', 'Passing yards minus air yards on a completion.'),
  row('pass_first_downs', 'passing', 'count', 'passing_first_downs', 'Completion that gains the line to gain or scores a touchdown.'),
  row('pass_two_point_conversions', 'passing', 'count', 'passing_2pt_conversions', 'Passer on a successful two-point try by pass.'),
  // Rushing
  row('rush_carries', 'rushing', 'count', 'carries', 'Ball carrier on a play ruled a run or a kneel. A scramble is a carry.'),
  row('rush_yards', 'rushing', 'yd', 'rushing_yards', 'Whole yards gained on a carry. All of the team gain goes to the carrier, also after his own recovered fumble.', 'assumption'),
  row('rush_touchdowns', 'rushing', 'count', 'rushing_tds', 'Carry on which the carrier scores a touchdown.'),
  row('rush_fumbles', 'rushing', 'count', 'rushing_fumbles', 'Fumble by a ball carrier who is neither a sacked passer nor a pass receiver.'),
  row('rush_fumbles_lost', 'rushing', 'count', 'rushing_fumbles_lost', 'Rushing fumble recovered by the defense.'),
  row('rush_first_downs', 'rushing', 'count', 'rushing_first_downs', 'Carry that gains the line to gain or scores a touchdown.'),
  row('rush_two_point_conversions', 'rushing', 'count', 'rushing_2pt_conversions', 'Carrier on a successful two-point try by run.'),
  // Receiving
  row('targets', 'receiving', 'count', 'targets', 'Intended receiver of a forward pass attempt. A throwaway and a spike have no target.'),
  row('receptions', 'receiving', 'count', 'receptions', 'Receiver of a forward pass ruled complete.'),
  row('receiving_yards', 'receiving', 'yd', 'receiving_yards', 'Same yards as the passer receives on the completion.'),
  row('receiving_touchdowns', 'receiving', 'count', 'receiving_tds', 'Reception on which the receiver scores a touchdown.'),
  row('receiving_fumbles', 'receiving', 'count', 'receiving_fumbles', 'Fumble by the receiver after a completed pass.'),
  row('receiving_fumbles_lost', 'receiving', 'count', 'receiving_fumbles_lost', 'Receiving fumble recovered by the defense.'),
  row('receiving_air_yards', 'receiving', 'yd', 'receiving_air_yards', 'Air yards of every pass on which the player is the target.'),
  row('receiving_yards_after_catch', 'receiving', 'yd', 'receiving_yards_after_catch', 'Receiving yards minus air yards on a reception.'),
  row('receiving_first_downs', 'receiving', 'count', 'receiving_first_downs', 'Reception that gains the line to gain or scores a touchdown.'),
  row('receiving_two_point_conversions', 'receiving', 'count', 'receiving_2pt_conversions', 'Receiver on a successful two-point try by pass.'),
  // Defense
  row('tackles_solo', 'defense', 'count', 'def_tackles_solo', 'The only tackler named on a made tackle. Not counted on a try.'),
  row('tackles_assisted', 'defense', 'count', 'def_tackle_assists', 'Each of the first two tacklers named when more than one is named on a made tackle.'),
  row('tackles_for_loss', 'defense', 'count', 'def_tackles_for_loss', 'First tackler named on a run or completed pass that loses yardage. A sack is not added here.', 'assumption'),
  row('sacks', 'defense', 'count', 'def_sacks', 'Rushers named on the sack: one alone gets a whole sack, two share it at half each.'),
  row('sack_yards', 'defense', 'yd', 'def_sack_yards', 'Yards lost on the sack, shared the way the sack is shared.'),
  row('quarterback_hits', 'defense', 'count', 'def_qb_hits', 'Rusher on a hit or a sack of the passer, once per play.'),
  row('interceptions', 'defense', 'count', 'def_interceptions', 'Defender who catches a pass ruled intercepted.'),
  row('interception_return_yards', 'defense', 'yd', 'def_interception_yards', 'Whole yards from the spot of the interception to where the return ended.'),
  row('passes_defended', 'defense', 'count', 'def_pass_defended', 'First defender named on a pass breakup, and the interceptor on an interception.'),
  row('forced_fumbles', 'defense', 'count', 'def_fumbles_forced', 'Player named as forcing a fumble that stood as a fumble.'),
  row('fumble_recoveries', 'defense', 'count', 'fumble_recovery_opp', 'Player who recovers a fumble or muff by the other team.'),
  row('safeties', 'defense', 'count', 'def_safeties', 'First tackler named on a play ruled a safety. A team credit when no tackle was made.'),
  row('defensive_touchdowns', 'defense', 'count', 'def_tds', 'Touchdown by the team that did not snap the ball, on a scrimmage play without a kick.'),
  // Kicking
  row('field_goals_made', 'kicking', 'count', 'fg_made', 'Kicker of a field goal ruled good. The split is the distance band.'),
  row('field_goals_attempted', 'kicking', 'count', 'fg_att', 'Kicker of a field goal attempt that was kicked. The split is the distance band.'),
  row('field_goal_longest', 'kicking', 'yd', 'fg_long', 'Labelled distance of a made field goal: line of scrimmage plus 17 (J9.4.1).', 'unverified', 'max'),
  row('field_goals_blocked', 'kicking', 'count', 'fg_blocked', 'Kicker whose field goal attempt was blocked.'),
  row('extra_points_made', 'kicking', 'count', 'pat_made', 'Kicker of a try kick ruled good.'),
  row('extra_points_attempted', 'kicking', 'count', 'pat_att', 'Kicker of a try kick that was kicked.'),
  row('kickoffs', 'kicking', 'count', null, 'Kicker of a kickoff or an onside kick. A safety kick is not counted.', 'assumption'),
  row('kickoff_touchbacks', 'kicking', 'count', null, 'Kickoff ruled a touchback.'),
  // Punting
  row('punts', 'punting', 'count', 'pt_att', 'Punter of a punt that was kicked, blocked or not.'),
  row('punt_gross_yards', 'punting', 'yd', 'pt_yards', 'Whole yards from the line of scrimmage to where the punt was caught, went dead, went out of bounds, or crossed the goal line. Zero when blocked behind the line.'),
  row('punt_net_yards', 'punting', 'yd', 'pt_net_yards', 'Gross yards minus return yards. On a touchback, yards from the line of scrimmage to the touchback spot.'),
  row('punts_inside_20', 'punting', 'count', 'pt_inside_20', 'Punt that leaves the receiving team inside its own 20, with no touchback.'),
  row('punt_touchbacks', 'punting', 'count', 'pt_touchback', 'Punt ruled a touchback.'),
  row('punts_blocked', 'punting', 'count', 'pt_blocked', 'Punter whose punt was blocked.'),
  row('punt_longest', 'punting', 'yd', 'pt_long', 'Largest gross yards of one punt.', 'unverified', 'max'),
  row('punt_hang_time', 'punting', 's', null, 'Hang time of each punt in seconds. The average is this total over punts.'),
  // Returns
  row('punt_returns', 'returns', 'count', 'punt_returns', 'Returner who takes possession of a punt and is not ruled a fair catch or a touchback.'),
  row('punt_return_yards', 'returns', 'yd', 'punt_return_yards', 'Whole yards from where the returner took possession to where the return ended.'),
  row('punt_return_touchdowns', 'returns', 'count', null, 'Punt return on which the receiving team scores a touchdown.'),
  row('kickoff_returns', 'returns', 'count', 'kickoff_returns', 'Returner who takes possession of a free kick and is not ruled a fair catch or a touchback.'),
  row('kickoff_return_yards', 'returns', 'yd', 'kickoff_return_yards', 'Whole yards from where the returner took possession to where the return ended.'),
  row('kickoff_return_touchdowns', 'returns', 'count', null, 'Kickoff return on which the receiving team scores a touchdown.'),
  row('fair_catches', 'returns', 'count', null, 'Returner on a kick that became dead by fair catch.'),
  row('muffs', 'returns', 'count', null, 'Player charged with a muff of a kick.'),
  // Participation
  row('snaps_offense', 'participation', 'count', null, 'Each player the snapping team fielded on a live play called with the offense. A play wiped out by a live-ball penalty still counts (D14.1.1).'),
  row('snaps_defense', 'participation', 'count', null, 'Each player the other team fielded on the same plays.'),
  row('snaps_special_teams', 'participation', 'count', null, 'Each player either team fielded on a live play called with a kicking or return unit.'),
  // Penalties
  row('penalties', 'penalties', 'count', 'penalties', 'Enforced penalty. The split is the foul id. A team credit when the foul names no player.'),
  row('penalty_yards', 'penalties', 'yd', 'penalty_yards', 'Yards walked off for the enforced penalty.'),
];

const CATALOGUE_BY_ID = new Map<string, StatCatalogueRow>(STAT_CATALOGUE.map((r) => [r.id, r]));

export function catalogueRow(statId: string): StatCatalogueRow {
  const r = CATALOGUE_BY_ID.get(statId);
  if (!r) throw new Error(`statistic ${statId} is not in the catalogue`);
  return r;
}

/**
 * Columns of the pack's player season table that no catalogue row carries, each with the reason
 * (D14.2.1 acceptance: every column maps to a statistic or is listed as deliberately skipped).
 */
export const SEASON_COLUMNS_SKIPPED: Readonly<Record<string, string>> = {
  player_id: 'identity', season: 'identity', player_display_name: 'identity', position: 'identity', team: 'identity',
  games: 'participation total kept by the league package, not a per-play credit',
  air_yards_share: 'share derived from receiving_air_yards', target_share: 'share derived from targets',
  wopr: 'derived index', pacr: 'derived ratio', racr: 'derived ratio', fg_pct: 'derived ratio', pat_pct: 'derived ratio',
  fantasy_points: 'not a football statistic', fantasy_points_ppr: 'not a football statistic',
  passing_epa: 'model output (N2)', rushing_epa: 'model output (N2)', receiving_epa: 'model output (N2)', passing_cpoe: 'model output (N2)',
  passing_10: 'count of credit rows by yards, a query', passing_16: 'count of credit rows by yards, a query',
  passing_20: 'count of credit rows by yards, a query', passing_40: 'count of credit rows by yards, a query',
  rushing_10: 'count of credit rows by yards, a query', rushing_12: 'count of credit rows by yards, a query',
  rushing_20: 'count of credit rows by yards, a query', rushing_40: 'count of credit rows by yards, a query',
  receiving_10: 'count of credit rows by yards, a query', receiving_16: 'count of credit rows by yards, a query',
  receiving_20: 'count of credit rows by yards, a query', receiving_40: 'count of credit rows by yards, a query',
  fg_made_0_19: 'split of field_goals_made by distance band', fg_made_20_29: 'split of field_goals_made by distance band',
  fg_made_30_39: 'split of field_goals_made by distance band', fg_made_40_49: 'split of field_goals_made by distance band',
  fg_made_50_59: 'split of field_goals_made by distance band', fg_made_60_: 'split of field_goals_made by distance band',
  fg_missed: 'attempted minus made', fg_missed_0_19: 'attempted minus made, by band', fg_missed_20_29: 'attempted minus made, by band',
  fg_missed_30_39: 'attempted minus made, by band', fg_missed_40_49: 'attempted minus made, by band',
  fg_missed_50_59: 'attempted minus made, by band', fg_missed_60_: 'attempted minus made, by band',
  fg_made_distance: 'sum of the labelled distances, a query', fg_missed_distance: 'sum of the labelled distances, a query',
  fg_blocked_distance: 'sum of the labelled distances, a query', fg_blocked_list: 'list form of a query',
  gwfg_att: 'game-winning kicks are a game-state query', gwfg_blocked: 'game-winning kicks are a game-state query',
  gwfg_distance: 'game-winning kicks are a game-state query', gwfg_made: 'game-winning kicks are a game-state query',
  gwfg_missed: 'game-winning kicks are a game-state query',
  pat_missed: 'attempted minus made', pat_blocked: 'no shared statistic id yet',
  def_2pt_atts: 'no shared statistic id yet', def_2pt_made: 'no shared statistic id yet',
  def_fg_blocks: 'no shared statistic id yet', def_pat_blocks: 'no shared statistic id yet', def_punt_blocks: 'no shared statistic id yet',
  def_fumbles: 'no shared statistic id yet', def_tackles_for_loss_yards: 'no shared statistic id yet',
  def_tackles_with_assist: 'no shared statistic id yet',
  fumble_recovery_own: 'no shared statistic id yet', fumble_recovery_tds: 'no shared statistic id yet',
  fumble_recovery_yards_opp: 'no shared statistic id yet', fumble_recovery_yards_own: 'no shared statistic id yet',
  fumbles_forced_by_opp: 'no shared statistic id yet', fumbles_lost_total: 'sum of the three lost-fumble statistics',
  fumbles_not_forced: 'no shared statistic id yet', fumbles_out_of_bounds: 'no shared statistic id yet',
  fumbles_total: 'sum of the three fumble statistics',
  misc_yards: 'no shared statistic id yet', special_teams_tds: 'sum of the two return touchdown statistics',
  pt_downed: 'no shared statistic id yet', pt_fair_caught: 'no shared statistic id yet', pt_out_of_bounds: 'no shared statistic id yet',
  pt_returned: 'no shared statistic id yet', pt_return_yards: 'no shared statistic id yet', pt_return_tds: 'no shared statistic id yet',
};

/** Header of `data/people/nfl_player_seasons_1999_2025.csv` in the project files, copied here so the mapping test needs no file outside the repo. */
export const SEASON_TABLE_COLUMNS: readonly string[] = (
  'player_id season air_yards_share attempts carries completions def_2pt_atts def_2pt_made def_fg_blocks def_fumbles def_fumbles_forced ' +
  'def_interception_yards def_interceptions def_pass_defended def_pat_blocks def_punt_blocks def_qb_hits def_sack_yards def_sacks def_safeties ' +
  'def_tackle_assists def_tackles_for_loss def_tackles_for_loss_yards def_tackles_solo def_tackles_with_assist def_tds fantasy_points ' +
  'fantasy_points_ppr fg_att fg_blocked fg_blocked_distance fg_blocked_list fg_long fg_made fg_made_0_19 fg_made_20_29 fg_made_30_39 ' +
  'fg_made_40_49 fg_made_50_59 fg_made_60_ fg_made_distance fg_missed fg_missed_0_19 fg_missed_20_29 fg_missed_30_39 fg_missed_40_49 ' +
  'fg_missed_50_59 fg_missed_60_ fg_missed_distance fg_pct fumble_recovery_opp fumble_recovery_own fumble_recovery_tds ' +
  'fumble_recovery_yards_opp fumble_recovery_yards_own fumbles_forced_by_opp fumbles_lost_total fumbles_not_forced fumbles_out_of_bounds ' +
  'fumbles_total gwfg_att gwfg_blocked gwfg_distance gwfg_made gwfg_missed kickoff_return_yards kickoff_returns misc_yards pacr passing_10 ' +
  'passing_16 passing_20 passing_2pt_conversions passing_40 passing_air_yards passing_cpoe passing_epa passing_first_downs ' +
  'passing_interceptions passing_tds passing_yards passing_yards_after_catch pat_att pat_blocked pat_made pat_missed pat_pct penalties ' +
  'penalty_yards pt_att pt_blocked pt_downed pt_fair_caught pt_inside_20 pt_long pt_net_yards pt_out_of_bounds pt_return_tds pt_return_yards ' +
  'pt_returned pt_touchback pt_yards punt_return_yards punt_returns racr receiving_10 receiving_16 receiving_20 receiving_2pt_conversions ' +
  'receiving_40 receiving_air_yards receiving_epa receiving_first_downs receiving_fumbles receiving_fumbles_lost receiving_tds ' +
  'receiving_yards receiving_yards_after_catch receptions rushing_10 rushing_12 rushing_20 rushing_2pt_conversions rushing_40 rushing_epa ' +
  'rushing_first_downs rushing_fumbles rushing_fumbles_lost rushing_tds rushing_yards sack_fumbles sack_fumbles_lost sack_yards_lost ' +
  'sacks_suffered special_teams_tds target_share targets wopr player_display_name position team games'
).split(' ');
