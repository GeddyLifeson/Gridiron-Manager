// Postseason module numbers: league-rule keys (values from the league-rules file per season) and named
// tuning parameters (params.json; the league lint bans numeric literals in .ts files).
import type { ParamFile, RuleKeyDef, RuleKeyManifest } from '@gm/schema';
import paramsJson from './params.json' with { type: 'json' };

export const POSTSEASON_MODULE = 'league.postseason';

export const KEY = {
  grouping: 'playoff.grouping',
  fieldSize: 'playoff.field_size',
  byes: 'playoff.byes',
  reseed: 'playoff.reseed',
  campusRounds: 'playoff.campus_rounds',
  powerChampionsAuto: 'cfp.power_champions_auto',
  otherAutoBids: 'cfp.other_auto_bids',
  independentAutoRank: 'cfp.independent_auto_rank',
  atLargePoolRank: 'cfp.at_large_pool_rank',
  championAutoBids: 'cfp.champion_auto_bids',
  byesChampionsOnly: 'cfp.byes_champions_only',
  lowerDivisionWinsCredited: 'ranking.lower_division_wins_credited',
  scheduleStandardGames: 'ranking.schedule_standard_games',
  bowlEligibilityWins: 'bowl.eligibility_wins',
  bowlLowerDivisionWinsCounted: 'bowl.lower_division_wins_counted',
  bowlFillMinWins: 'bowl.fill_min_wins',
  ceremonyHomeDates: 'ceremony.home_dates',
  commonGamesMin: 'tiebreak.common_games_min',
} as const;

export const GROUP_CONFERENCE = 'conference';
export const GROUP_NATIONAL = 'national';

function def(key: string, type: RuleKeyDef['type'], meaning: string, ownerLeaf: string, extra: Partial<RuleKeyDef> = {}): RuleKeyDef {
  return { key, type, meaning, ownerLeaf, readBy: [POSTSEASON_MODULE], ...extra };
}

export const RULE_KEYS: RuleKeyManifest = [
  def(KEY.grouping, 'option', 'conference: one bracket per conference and a final between the champions at a neutral site (C3.4.1). national: one bracket for the whole competition (T3.5.1)', 'C3.4.1', { options: [GROUP_CONFERENCE, GROUP_NATIONAL] }),
  def(KEY.fieldSize, 'number', 'Teams per bracket group', 'C3.3.1', { unit: 'count' }),
  def(KEY.byes, 'number', 'Top seeds per group that skip the first round', 'C3.4.1', { unit: 'count' }),
  def(KEY.reseed, 'boolean', 'true: after each round the highest remaining seed meets the lowest (C3.4.1). false: a fixed bracket (T3.5.1)', 'C3.4.1'),
  def(KEY.campusRounds, 'number', 'Rounds hosted by the higher seed; later rounds are at neutral sites', 'T3.5.1', { unit: 'count' }),
  def(KEY.powerChampionsAuto, 'boolean', 'Champions of the conferences flagged power get automatic places', 'T3.5.1'),
  def(KEY.otherAutoBids, 'number', 'Automatic places for the best-ranked teams of the other conferences, champion or not', 'T3.5.1', { unit: 'count' }),
  def(KEY.independentAutoRank, 'number', 'A power-level independent ranked this high or better gets in; 0 switches the rule off', 'T3.5.1', { unit: 'rank' }),
  def(KEY.atLargePoolRank, 'number', 'At-large teams come from the committee top this many; 0 means any ranked position', 'T3.5.1', { unit: 'rank' }),
  def(KEY.championAutoBids, 'number', 'Automatic places for the highest-ranked conference champions of any conference (2024 and 2025 format); 0 switches it off', 'T3.5.1', { unit: 'count' }),
  def(KEY.byesChampionsOnly, 'boolean', 'The bye seeds go only to the highest-ranked conference champions; the rest are seeded by ranking (2024 format)', 'T3.5.1'),
  def(KEY.lowerDivisionWinsCredited, 'number', 'Wins over lower-subdivision teams that count in the ranking resume; 0 means all count', 'T3.4.1', { unit: 'count' }),
  def(KEY.scheduleStandardGames, 'number', 'Games against the top subdivision below which the resume is penalised; 0 switches it off', 'T3.4.1', { unit: 'count' }),
  def(KEY.bowlEligibilityWins, 'number', 'Wins that make a team bowl eligible', 'T3.6.1', { unit: 'count' }),
  def(KEY.bowlLowerDivisionWinsCounted, 'number', 'Wins over lower-subdivision teams that count toward bowl eligibility', 'T3.6.1', { unit: 'count' }),
  def(KEY.bowlFillMinWins, 'number', 'Fewest wins of a team taken to fill bowls when eligible teams run short (ordered by academic measure)', 'T3.6.1', { unit: 'count' }),
  def(KEY.ceremonyHomeDates, 'boolean', 'Schedules mark homecoming and senior day (T3.8.1); false where the level has no equivalent', 'T3.8.1'),
  def(KEY.commonGamesMin, 'number', 'Fewest common games for the interconference draft-order step (C3.5.1)', 'C3.5.1', { unit: 'count' }),
];

export const PARAMS: ParamFile = paramsJson as ParamFile;

export function param(name: string): number {
  const p = PARAMS.params.find((x) => x.name === name);
  if (!p) throw new Error(`${PARAMS.module}: no parameter ${name}`);
  return p.value;
}
