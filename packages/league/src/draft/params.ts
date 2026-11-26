// Draft module numbers (G-34, bible C7). League-rule keys (values from the league-rules file per season) and
// named tuning parameters (params.json). The league lint bans numeric literals in .ts files (P1.1.2), so
// unit conversions live in units.json.
import { ParamFile, type RuleKeyDef, type RuleKeyManifest, type RuleSet } from '@gm/schema';
import paramsJson from './params.json' with { type: 'json' };
import units from './units.json' with { type: 'json' };

export const DRAFT_MODULE = 'league.draft';

export const KEY = {
  rounds: 'league_rules.draft.rounds',
  clockR1: 'league_rules.draft.clock.r1_min',
  clockR2: 'league_rules.draft.clock.r2_min',
  clockMiddle: 'league_rules.draft.clock.r3_6_min',
  clockLast: 'league_rules.draft.clock.r7_min',
  day2FirstRound: 'league_rules.draft.day2_first_round',
  day3FirstRound: 'league_rules.draft.day3_first_round',
  eligibilitySeasons: 'league_rules.draft.eligibility_seasons',
  revokeWindowHours: 'league_rules.draft.revoke_window_hours',
  compMaxPerClub: 'league_rules.draft.comp_max_per_club',
  compMaxTotal: 'league_rules.draft.comp_max_formula',
  compFirstRound: 'league_rules.draft.comp_first_round',
  compCfaTopPct: 'league_rules.draft.comp_cfa_top_pct',
  compBracketPrefix: 'league_rules.draft.comp_bracket_top_pct_r',
  compPointsAllLeague: 'league_rules.draft.comp_points_all_league',
  compPointsAllConference: 'league_rules.draft.comp_points_all_conference',
  compSnapMinPct: 'league_rules.draft.comp_snap_min_pct',
  compPointsPerPunt: 'league_rules.draft.comp_points_per_punt',
  compPointsPerPuntInside20: 'league_rules.draft.comp_points_per_punt_inside20',
  compPointsPerFga: 'league_rules.draft.comp_points_per_fga',
  compPointsPerFgm: 'league_rules.draft.comp_points_per_fgm',
  compVeteranAccruedSeasons: 'league_rules.draft.comp_veteran_accrued_seasons',
  compVeteranEarliestRound: 'league_rules.draft.comp_veteran_earliest_round',
  compEqualCountMarginPoints: 'league_rules.draft.comp_equal_count_margin_points',
  undraftedPoolPrefix: 'rookie.undrafted_pool_',
} as const;

const READ_BY = [DRAFT_MODULE];
const n = (key: string, unit: string, meaning: string, ownerLeaf: string): RuleKeyDef =>
  ({ key, type: 'number', unit, meaning, ownerLeaf, readBy: READ_BY });

/**
 * Keys this module reads. Keys marked "requested" are not yet in the league rule file; the values and fact rows
 * are owed by the league rule research thread (CBA Appendix V and Article 6 lines are cited in each meaning).
 * Keys read with a suffix are listed once with the pattern in the meaning.
 */
export const RULE_KEYS: RuleKeyManifest = [
  n(KEY.rounds, 'rounds', 'Rounds in the draft (C7.2.1 rule 1; CBA Art. 6 s.2(a)).', 'C7.2.1'),
  n(KEY.clockR1, 'min', 'Time per pick, round 1 (C7.3.1 rule 1).', 'C7.3.1'),
  n(KEY.clockR2, 'min', 'Time per pick, round 2 (C7.3.1 rule 1).', 'C7.3.1'),
  n(KEY.clockMiddle, 'min', 'Time per pick, every round between round 2 and the last, regular and compensatory picks (C7.3.1 rule 1).', 'C7.3.1'),
  n(KEY.clockLast, 'min', 'Time per pick, the last round (C7.3.1 rule 1).', 'C7.3.1'),
  n(KEY.day2FirstRound, 'round', 'Requested. First round held on the draft\'s second day (C7.3.1 rule 3: rounds 2 and 3 on day two).', 'C7.3.1'),
  n(KEY.day3FirstRound, 'round', 'Requested. First round held on the draft\'s third day (C7.3.1 rule 3: rounds 4 to 7 on day three).', 'C7.3.1'),
  n(KEY.eligibilitySeasons, 'seasons', 'Pro regular seasons that must begin and end after high school graduation (C7.1.1 rule 1; CBA Art. 6 s.2(b)).', 'C7.1.1'),
  n(KEY.revokeWindowHours, 'hours', 'Requested. Hours after the deadline he used in which an underclassman may revoke his declaration (C7.1.1 rule 4).', 'C7.1.1'),
  n(KEY.compMaxPerClub, 'count', 'Most compensatory picks one club receives in a year (CBA App. V para 3(a), "four (4)").', 'C7.2.2'),
  n(KEY.compMaxTotal, 'count', 'Compensatory plus supplemental selections per draft, equal to the number of clubs (CBA Art. 6 s.2(a)).', 'C7.2.2'),
  n(KEY.compFirstRound, 'round', 'Requested. Earliest round a compensatory pick follows (CBA App. V para 3(b)(1), "third round").', 'C7.2.2'),
  n(KEY.compCfaTopPct, 'percent', 'Requested. A compensatory free agent ranks within this top percent of league players (CBA App. V para 1(ii), "top 35%").', 'C7.2.2'),
  n(`${KEY.compBracketPrefix}3`, 'percent', 'Requested. A lost compensatory free agent within this top percent yields a pick after round <r>; read as comp_bracket_top_pct_r<round> for each round from comp_first_round to the last (CBA App. V para 3(b)(1) to (5): 5, 10, 15, 25, 35).', 'C7.2.2'),
  n(KEY.compPointsAllLeague, 'points', 'Requested. Points for first-team all-league (CBA App. V para 2(b)(1), "20 points").', 'C7.2.2'),
  n(KEY.compPointsAllConference, 'points', 'Requested. Points for all-conference when not all-league (CBA App. V para 2(b)(2), "5 points").', 'C7.2.2'),
  n(KEY.compSnapMinPct, 'percent', 'Requested. Least share of offensive or defensive plays that earns one point per percent (CBA App. V para 2(b)(3), "minimum of 25%").', 'C7.2.2'),
  n(KEY.compPointsPerPunt, 'points', 'Requested. Punter points per punt attempted (CBA App. V para 2(b)(3) exception, "1 point").', 'C7.2.2'),
  n(KEY.compPointsPerPuntInside20, 'points', 'Requested. Punter points per punt inside the 20 (CBA App. V para 2(b)(3) exception, "1 point").', 'C7.2.2'),
  n(KEY.compPointsPerFga, 'points', 'Requested. Place-kicker points per field goal attempted (CBA App. V para 2(b)(3) exception, "2 points").', 'C7.2.2'),
  n(KEY.compPointsPerFgm, 'points', 'Requested. Place-kicker points per field goal made (CBA App. V para 2(b)(3) exception, "1 point").', 'C7.2.2'),
  n(KEY.compVeteranAccruedSeasons, 'seasons', 'Requested. A non-quarterback with this many accrued seasons or more yields no pick before the end of comp_veteran_earliest_round (CBA App. V para 4, "ten or more").', 'C7.2.2'),
  n(KEY.compVeteranEarliestRound, 'round', 'Requested. Earliest round for such a veteran (CBA App. V para 4, "end of the fifth round").', 'C7.2.2'),
  n(KEY.compEqualCountMarginPoints, 'points', 'Requested. Equal losses and gains still earn one pick when lost values exceed gained values by more than this (CBA App. V para 5, "300 points").', 'C7.2.2'),
  n(`${KEY.undraftedPoolPrefix}2024_usd`, 'USD', 'Per-club cap on undrafted rookie signing bonuses; read as rookie.undrafted_pool_<year>_usd, latest year at or before the draft (C7.4.1 rule 3; CBA Art. 7 s.1(i)).', 'C7.4.1'),
];

export const PARAMS: ParamFile = ParamFile.parse(paramsJson);

export function param(name: string): number {
  const p = PARAMS.params.find((x) => x.name === name);
  if (!p) throw new Error(`${DRAFT_MODULE}: no parameter ${name}`);
  return p.value;
}

export const PERCENT: number = units.percent;
export const SECONDS_PER_MINUTE: number = units.secondsPerMinute;
export const SECONDS_PER_HOUR: number = units.secondsPerHour;

export const FIRST_ROUND = 1;
export const hasKey = (rules: RuleSet, key: string): boolean => rules.keys().includes(key);
