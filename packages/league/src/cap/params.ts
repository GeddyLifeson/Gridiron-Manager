// Rule keys and tuning constants of the cap module (G-16, bible C6). Key names follow the G-10 league rule
// set (packages/rules-data/data/league/proleague_2026.json, PR 22), which holds every key listed here.
// Source in this package holds no number other than 0 and 1 (P1.1.2): money from rules is whole US
// dollars, converted to integer cents here; percentages are whole percents.
import { ParamFile, type ParamTable, type RuleKeyManifest, type RuleSet } from '@gm/schema';
import file from './params.json' with { type: 'json' };
import units from './units.json' with { type: 'json' };

export const PARAMS: ParamFile = ParamFile.parse(file);

const READ_BY = ['league.cap'];
const k = (key: string, unit: string, meaning: string, ownerLeaf: string) =>
  ({ key, type: 'number' as const, unit, meaning, ownerLeaf, readBy: READ_BY });

/** Keys read with a league-year suffix (`cap.amount_2026`) are listed once with `<year>` in the meaning. */
export const RULE_KEYS: RuleKeyManifest = [
  k('cap.amount_2026', 'USD', 'Salary cap per club for the league year; read as cap.amount_<year> (C6.2.1).', 'C6.2.1'),
  k('cap.top_n_contracts', 'count', 'Contracts counted in full from the league year start to the first regular season game (CBA Art. 13 s.6(a)(i)).', 'C6.2.1'),
  k('cap.top51_excess_multiple', 'count', 'Outside the top contracts only Paragraph 5 salary above this multiple of the applicable minimum counts (CBA Art. 13 s.6(a)(i)(2), "twice").', 'C6.2.1'),
  k('cap.proration_max_years', 'years', 'Most years a signing bonus is prorated over (CBA Art. 13 s.6(b)(i)).', 'C6.2.2'),
  k('cap.june1_designations', 'count', 'Releases per league year a club may treat as made on June 2 (CBA Art. 13 s.6(b)(ii)(1)).', 'C6.3.2'),
  k('cap.conform_days', 'days', 'Days to get under the cap after an acceleration (CBA Art. 13 s.6(b)(ii)(1)).', 'C6.3.2'),
  k('cap.min_salary_y2026_cs0', 'USD', 'Active/inactive list minimum salary; read as cap.min_salary_y<year>_cs<band>, bands 0, 1, 2, 3, 4_6, 7_plus (CBA Art. 26 s.1(a)).', 'C6.4.1'),
  k('cap.veteran_benefit_2026', 'USD', 'Veteran salary benefit additional compensation; read as cap.veteran_benefit_<year> (CBA Art. 27 s.2(b)).', 'C6.4.1'),
  k('cap.veteran_benefit_min_seasons', 'seasons', 'Credited seasons a player needs for a qualifying contract (CBA Art. 27 s.1, "four or more").', 'C6.4.1'),
  k('cap.veteran_benefit_count_seasons', 'seasons', 'A qualifying contract counts at the minimum for this many credited seasons (CBA Art. 27 s.5, "two").', 'C6.4.1'),
  k('cap.min_cash_spend_pct', 'percent', 'Minimum team cash spending as a percent of the summed caps of the period (CBA Art. 12 s.9).', 'C6.2.3'),
  k('rookie.length_round_1', 'years', 'Rookie contract length, first round (CBA Art. 7 s.3(a)(i)).', 'C6.4.2'),
  k('rookie.length_later_rounds', 'years', 'Rookie contract length, rounds two to seven (CBA Art. 7 s.3(a)(ii)).', 'C6.4.2'),
  k('rookie.length_undrafted', 'years', 'Rookie contract length, undrafted (CBA Art. 7 s.3(a)(iii)).', 'C6.4.2'),
  k('rookie.max_annual_increase_pct', 'percent', 'Most a rookie salary may rise in a year, as a percent of year-one rookie salary (CBA Art. 7 s.3(e)).', 'C6.4.2'),
  k('rookie.option_basic_rank_from', 'rank', 'Fifth-year option basic and playing-time tiers average salaries from this rank (CBA Art. 7 s.7(g)(i), "third").', 'C6.4.2'),
  k('rookie.option_basic_rank_to', 'rank', 'Basic tier averages to this rank (CBA Art. 7 s.7(g)(i), "twenty-fifth").', 'C6.4.2'),
  k('rookie.option_playtime_rank_to', 'rank', 'Playing-time tier averages to this rank (CBA Art. 7 s.7(g)(ii), "twentieth").', 'C6.4.2'),
  k('rookie.option_playtime_two_of_three_pct', 'percent', 'Playing-time tier: this share of plays in any two of the first three seasons (CBA Art. 7 s.7(g)(i)(1), 75%).', 'C6.4.2'),
  k('rookie.option_playtime_average_pct', 'percent', 'Playing-time tier: this cumulative average over three seasons (CBA Art. 7 s.7(g)(i)(2), 75%).', 'C6.4.2'),
  k('rookie.option_playtime_each_pct', 'percent', 'Playing-time tier: this share in each of the first three seasons (CBA Art. 7 s.7(g)(i)(3), 50%).', 'C6.4.2'),
  k('rookie.option_franchise_pro_bowls', 'count', 'Original-ballot Pro Bowls that set the option at the franchise tender (CBA Art. 7 s.7(g)(iv), "two or more").', 'C6.4.2'),
  k('rookie.escalator_l1_pct_round_2', 'percent', 'Level One escalator share of plays, second round (CBA Art. 7 s.4(d)(i), 60%).', 'C6.4.2'),
  k('rookie.escalator_l1_pct_later_rounds', 'percent', 'Level One escalator share of plays, rounds three to seven (CBA Art. 7 s.4(d)(ii), 35%).', 'C6.4.2'),
  k('rookie.escalator_l2_pct_each', 'percent', 'Level Two escalator share in each of the first three seasons (CBA Art. 7 s.4(d)(iii), 55%).', 'C6.4.2'),
  k('rookie.escalator_l2_extra_usd', 'USD', 'Level Two adds this to the original-round tender (CBA Art. 7 s.4(e)(iii), $250,000).', 'C6.4.2'),
  k('fa.rfa_tender_2026_original_round', 'USD', 'Restricted free agent tender, original round; read as fa.rfa_tender_<year>_original_round (escalator Levels One and Two).', 'C8.1.1'),
  k('fa.rfa_tender_2026_second_round', 'USD', 'Restricted free agent tender, second round; read as fa.rfa_tender_<year>_second_round (escalator Level Three).', 'C8.1.1'),
  k('tag.franchise_top_n', 'count', 'Franchise tag: average of this many largest salaries at the position (CBA Art. 10 s.2(a)).', 'C6.4.3'),
  k('tag.transition_top_n', 'count', 'Transition tag: average of this many largest salaries (CBA Art. 10 s.4(a)).', 'C6.4.3'),
  k('tag.cap_average_years', 'years', 'Years the cap percentage average looks back (CBA Art. 10 s.2(a)(i), "five preceding League Years").', 'C6.4.3'),
  k('tag.prior_salary_pct', 'percent', 'Tender floor as a percent of prior-year salary (CBA Art. 10 s.2(a)(i)(B)).', 'C6.4.3'),
  k('tag.third_position_avg_pct', 'percent', 'Third designation: this percent of the top-five average at his position (CBA Art. 10 s.2(b)(B), 120%).', 'C6.4.3'),
  k('tag.third_prior_salary_pct', 'percent', 'Third designation: this percent of his prior-year salary (CBA Art. 10 s.2(b)(C)).', 'C6.4.3'),
  k('tag.window_opens_days_before', 'days', 'Tag window opens this many days before the league year (CBA Art. 10 s.1).', 'C6.4.3'),
  k('tag.window_closes_days_before', 'days', 'Tag window closes this many days before the league year (CBA Art. 10 s.1).', 'C6.4.3'),
];

export function paramTable(f: ParamFile = PARAMS): ParamTable {
  const byName = new Map(f.params.map((p) => [p.name, p.value]));
  return {
    version: f.version,
    has: (n) => byName.has(n),
    num: (n) => { const v = byName.get(n); if (v === undefined) throw new Error(`league.cap: unknown parameter ${n}`); return v; },
  };
}

export const CENTS_PER_USD: number = units.centsPerUsd;
export const PERCENT: number = units.percent;

/** A dollar rule value in integer cents. */
export const usdKey = (rules: RuleSet, key: string): number => Math.round(rules.num(key) * CENTS_PER_USD);
/** `amount * pct / 100`, rounded to the cent. */
export const pctOf = (amountCents: number, pct: number): number => Math.round((amountCents * pct) / PERCENT);
export const hasKey = (rules: RuleSet, key: string): boolean => rules.keys().includes(key);
