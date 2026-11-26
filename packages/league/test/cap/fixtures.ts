// Rule values for the cap tests. Values that G-10 (PR 22) already entered carry its fact row id and must
// equal that row (checked in citations.test.ts once facts/cap.json and facts/league.json are on main).
// Values with factId null are keys G-16 asks G-10 to add: each carries the CBA locator it was read from.
import type { RuleSet } from '@gm/schema';

type Value = number;
export interface FixtureValue { readonly key: string; readonly value: Value; readonly factId: string | null; readonly source: string }

const minRows: FixtureValue[] = [];
const MIN_TABLE: Record<string, readonly number[]> = {
  // 2026..2030, CBA Art. 26 s.1(a) table as entered by G-10 (F-cap-0012 to F-cap-0041) and bible C6.4.1 rule 4.
  cs0: [885000, 930000, 975000, 1020000, 1065000],
  cs1: [1005000, 1050000, 1095000, 1140000, 1185000],
  cs2: [1075000, 1120000, 1165000, 1210000, 1255000],
  cs3: [1145000, 1190000, 1235000, 1280000, 1325000],
  cs4_6: [1215000, 1260000, 1305000, 1350000, 1395000],
  cs7_plus: [1300000, 1345000, 1390000, 1435000, 1480000],
};
let factNo = 12;
for (const band of Object.keys(MIN_TABLE)) {
  MIN_TABLE[band]!.forEach((v, i) => {
    minRows.push({ key: `cap.min_salary_y${2026 + i}_${band}`, value: v, factId: `F-cap-${String(factNo).padStart(4, '0')}`, source: 'CBA Art. 26 s.1(a)' });
    factNo++;
  });
}

export const FIXTURE_VALUES: readonly FixtureValue[] = [
  { key: 'cap.amount_2026', value: 301200000, factId: 'F-cap-0042', source: 'league announcement' },
  { key: 'cap.amount_2021', value: 182500000, factId: 'F-cap-0043', source: 'league announcement' },
  { key: 'cap.amount_2022', value: 208200000, factId: 'F-cap-0044', source: 'league announcement' },
  { key: 'cap.amount_2023', value: 224800000, factId: 'F-cap-0045', source: 'league announcement' },
  { key: 'cap.amount_2024', value: 255400000, factId: 'F-cap-0046', source: 'league announcement' },
  { key: 'cap.top_n_contracts', value: 51, factId: 'F-cap-0002', source: 'CBA Art. 13 s.6(a)(i)' },
  { key: 'cap.top51_excess_multiple', value: 2, factId: null, source: 'CBA Art. 13 s.6(a)(i)(2): "Any amount that exceeds twice the applicable Minimum Active/Inactive List Salary for all other players."' },
  { key: 'cap.proration_max_years', value: 5, factId: 'F-cap-0003', source: 'CBA Art. 13 s.6(b)(i)' },
  { key: 'cap.june1_designations', value: 2, factId: 'F-cap-0004', source: 'CBA Art. 13 s.6(b)(ii)(1)' },
  { key: 'cap.conform_days', value: 7, factId: 'F-cap-0005', source: 'CBA Art. 13 s.6(b)(ii)(1)' },
  ...minRows,
  { key: 'cap.veteran_benefit_2026', value: 187500, factId: 'F-cap-0047', source: 'CBA Art. 27 s.2(b)' },
  { key: 'cap.veteran_benefit_min_seasons', value: 4, factId: null, source: 'CBA Art. 27 s.1: "a player with four or more Credited Seasons"' },
  { key: 'cap.veteran_benefit_count_seasons', value: 2, factId: null, source: 'CBA Art. 27 s.5: "the same as the minimum salary for a player with two Credited Seasons"' },
  { key: 'cap.min_cash_spend_pct', value: 90, factId: 'F-cap-0001', source: 'CBA Art. 12 s.9' },
  { key: 'rookie.length_round_1', value: 4, factId: 'F-cap-0006', source: 'CBA Art. 7 s.3(a)(i)' },
  { key: 'rookie.length_later_rounds', value: 4, factId: 'F-cap-0007', source: 'CBA Art. 7 s.3(a)(ii)' },
  { key: 'rookie.length_undrafted', value: 3, factId: 'F-cap-0008', source: 'CBA Art. 7 s.3(a)(iii)' },
  { key: 'rookie.max_annual_increase_pct', value: 25, factId: 'F-cap-0009', source: 'CBA Art. 7 s.3(e)' },
  { key: 'rookie.option_basic_rank_from', value: 3, factId: null, source: 'CBA Art. 7 s.7(g)(i): "using the applicable third through twenty-fifth highest Salaries"' },
  { key: 'rookie.option_basic_rank_to', value: 25, factId: null, source: 'CBA Art. 7 s.7(g)(i): "third through twenty-fifth"' },
  { key: 'rookie.option_playtime_rank_to', value: 20, factId: null, source: 'CBA Art. 7 s.7(g)(ii): "third through twentieth highest Salaries"' },
  { key: 'rookie.option_playtime_two_of_three_pct', value: 75, factId: null, source: 'CBA Art. 7 s.7(g)(i)(1): "a minimum of 75% of his Club\'s offensive or defensive plays in any two of his first three regular seasons"' },
  { key: 'rookie.option_playtime_average_pct', value: 75, factId: null, source: 'CBA Art. 7 s.7(g)(i)(2): "a “cumulative average” of at least 75%"' },
  { key: 'rookie.option_playtime_each_pct', value: 50, factId: null, source: 'CBA Art. 7 s.7(g)(i)(3): "a minimum of 50% of his Club\'s offensive or defensive plays in each of his first three regular seasons"' },
  { key: 'rookie.option_franchise_pro_bowls', value: 2, factId: null, source: 'CBA Art. 7 s.7(g)(iv): "selected to two or more Pro Bowls on the original ballot"' },
  { key: 'rookie.escalator_l1_pct_round_2', value: 60, factId: null, source: 'CBA Art. 7 s.4(d)(i): "a minimum of 60% of his Club\'s offensive or defensive plays in any two of his first three regular seasons"' },
  { key: 'rookie.escalator_l1_pct_later_rounds', value: 35, factId: null, source: 'CBA Art. 7 s.4(d)(ii): "a minimum of 35%"' },
  { key: 'rookie.escalator_l2_pct_each', value: 55, factId: null, source: 'CBA Art. 7 s.4(d)(iii): "a minimum of 55% ... in each of his first three regular seasons"' },
  { key: 'rookie.escalator_l2_extra_usd', value: 250000, factId: null, source: 'CBA Art. 7 s.4(e)(iii): "plus $250,000"' },
  { key: 'fa.rfa_tender_2026_original_round', value: 3674000, factId: 'F-league-0054', source: 'league tender table 2026' },
  { key: 'fa.rfa_tender_2026_second_round', value: 5767000, factId: 'F-league-0055', source: 'league tender table 2026' },
  { key: 'tag.franchise_top_n', value: 5, factId: 'F-league-0013', source: 'CBA Art. 10 s.2(a)(i)' },
  { key: 'tag.transition_top_n', value: 10, factId: 'F-league-0017', source: 'CBA Art. 10 s.4(a)' },
  { key: 'tag.cap_average_years', value: 5, factId: null, source: 'CBA Art. 10 s.2(a)(i)(A): "summing the amounts of the Franchise Tags for players at that position for the five preceding League Years"' },
  { key: 'tag.prior_salary_pct', value: 120, factId: 'F-league-0014', source: 'CBA Art. 10 s.2(a)(i)(B)' },
  { key: 'tag.third_position_avg_pct', value: 120, factId: null, source: 'CBA Art. 10 s.2(b)(B): "120% of the average of the five largest Prior Year Salaries"' },
  { key: 'tag.third_prior_salary_pct', value: 144, factId: 'F-league-0016', source: 'CBA Art. 10 s.2(b)(C)' },
  { key: 'tag.window_opens_days_before', value: 22, factId: 'F-league-0011', source: 'CBA Art. 10 s.1' },
  { key: 'tag.window_closes_days_before', value: 8, factId: 'F-league-0012', source: 'CBA Art. 10 s.1' },
];

/** A rule set from the fixture values, with optional overrides (the CBA's own hypothetical examples). */
export function capRules(overrides: Record<string, Value> = {}): RuleSet {
  const values: Record<string, Value> = Object.fromEntries(FIXTURE_VALUES.map((v) => [v.key, v.value]));
  Object.assign(values, overrides);
  const get = (k: string): Value => {
    const v = values[k];
    if (v === undefined) throw new Error(`cap fixture: missing key ${k}`);
    return v;
  };
  return {
    id: 'cap_fixture', level: 'pro', seasonYear: 2026,
    num: get,
    bool: (k) => { throw new Error(`${k} is not a switch`); },
    opt: (k) => { throw new Error(`${k} is not an option`); },
    keys: () => Object.keys(values),
  };
}

/** Whole dollars to cents, for readable test figures. */
export const $ = (usd: number): number => Math.round(usd * 100);
export const M = (millions: number): number => Math.round(millions * 100_000_000);
