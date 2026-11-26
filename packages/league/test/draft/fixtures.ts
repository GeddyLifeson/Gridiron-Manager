// Rule values for the draft tests. Values already in the league rule file (packages/rules-data/data/league/
// proleague_2026.json) are copied in FILE_VALUES with their fact rows; a test checks the copy against the file. Keys this module requests (marked "requested" in
// params.ts) are FIXTURES here, each quoting the CBA 2020 line it was read from in
// /mnt/project-files/nfl-rules/cba_2020.txt or the bible leaf; the real values and fact rows are owed by the
// league rule research thread. Nothing in REQUESTED is triple-verified yet.
import type { RuleSet } from '@gm/schema';

/** Copied from proleague_2026.json (G-10). citations test compares every row with the file. */
export const FILE_VALUES: readonly { key: string; value: number; factId: string }[] = [
  { key: "league_rules.draft.rounds", value: 7, factId: "F-league-0045" },
  { key: "league_rules.draft.clock.r1_min", value: 8, factId: "F-league-0046" },
  { key: "league_rules.draft.clock.r2_min", value: 7, factId: "F-league-0047" },
  { key: "league_rules.draft.clock.r3_6_min", value: 5, factId: "F-league-0048" },
  { key: "league_rules.draft.clock.r7_min", value: 4, factId: "F-league-0049" },
  { key: "league_rules.draft.comp_max_per_club", value: 4, factId: "F-league-0050" },
  { key: "league_rules.draft.comp_max_formula", value: 32, factId: "F-league-0051" },
  { key: "league_rules.draft.eligibility_seasons", value: 3, factId: "F-league-0059" },
  { key: "league_rules.draft.day2_first_round", value: 2, factId: "F-league-0115" },
  { key: "league_rules.draft.day3_first_round", value: 4, factId: "F-league-0116" },
  { key: "league_rules.draft.comp_first_round", value: 3, factId: "F-league-0117" },
  { key: "league_rules.draft.revoke_window_hours", value: 72, factId: "F-league-0195" },
  { key: "league_rules.draft.comp_cfa_top_pct", value: 35, factId: "F-league-0118" },
  { key: "league_rules.draft.comp_bracket_top_pct_r3", value: 5, factId: "F-league-0119" },
  { key: "league_rules.draft.comp_bracket_top_pct_r4", value: 10, factId: "F-league-0120" },
  { key: "league_rules.draft.comp_bracket_top_pct_r5", value: 15, factId: "F-league-0121" },
  { key: "league_rules.draft.comp_bracket_top_pct_r6", value: 25, factId: "F-league-0122" },
  { key: "league_rules.draft.comp_bracket_top_pct_r7", value: 35, factId: "F-league-0123" },
  { key: "league_rules.draft.comp_points_all_league", value: 20, factId: "F-league-0124" },
  { key: "league_rules.draft.comp_points_all_conference", value: 5, factId: "F-league-0125" },
  { key: "league_rules.draft.comp_snap_min_pct", value: 25, factId: "F-league-0126" },
  { key: "league_rules.draft.comp_points_per_punt", value: 1, factId: "F-league-0127" },
  { key: "league_rules.draft.comp_points_per_punt_inside20", value: 1, factId: "F-league-0128" },
  { key: "league_rules.draft.comp_points_per_fga", value: 2, factId: "F-league-0129" },
  { key: "league_rules.draft.comp_points_per_fgm", value: 1, factId: "F-league-0130" },
  { key: "league_rules.draft.comp_veteran_accrued_seasons", value: 10, factId: "F-league-0131" },
  { key: "league_rules.draft.comp_veteran_earliest_round", value: 5, factId: "F-league-0132" },
  { key: "league_rules.draft.comp_equal_count_margin_points", value: 300, factId: "F-league-0133" },
  { key: "rookie.length_round_1", value: 4, factId: "F-cap-0006" },
  { key: "rookie.length_later_rounds", value: 4, factId: "F-cap-0007" },
  { key: "rookie.length_undrafted", value: 3, factId: "F-cap-0008" },
  { key: "rookie.max_annual_increase_pct", value: 25, factId: "F-cap-0009" },
  { key: "rookie.undrafted_pool_2021_usd", value: 160000, factId: "F-cap-0010" },
  { key: "rookie.option_deadline_before_may_day", value: 3, factId: "F-cap-0011" },
  { key: "cap.min_salary_y2026_cs0", value: 885000, factId: "F-cap-0012" },
  { key: "cap.min_salary_y2027_cs0", value: 930000, factId: "F-cap-0013" },
  { key: "cap.min_salary_y2028_cs0", value: 975000, factId: "F-cap-0014" },
  { key: "cap.min_salary_y2029_cs0", value: 1020000, factId: "F-cap-0015" },
  { key: "cap.min_salary_y2030_cs0", value: 1065000, factId: "F-cap-0016" },
  { key: "cap.min_salary_y2026_cs1", value: 1005000, factId: "F-cap-0017" },
  { key: "cap.min_salary_y2027_cs1", value: 1050000, factId: "F-cap-0018" },
  { key: "cap.min_salary_y2028_cs1", value: 1095000, factId: "F-cap-0019" },
  { key: "cap.min_salary_y2029_cs1", value: 1140000, factId: "F-cap-0020" },
  { key: "cap.min_salary_y2030_cs1", value: 1185000, factId: "F-cap-0021" },
  { key: "cap.min_salary_y2026_cs2", value: 1075000, factId: "F-cap-0022" },
  { key: "cap.min_salary_y2027_cs2", value: 1120000, factId: "F-cap-0023" },
  { key: "cap.min_salary_y2028_cs2", value: 1165000, factId: "F-cap-0024" },
  { key: "cap.min_salary_y2029_cs2", value: 1210000, factId: "F-cap-0025" },
  { key: "cap.min_salary_y2030_cs2", value: 1255000, factId: "F-cap-0026" },
  { key: "cap.min_salary_y2026_cs3", value: 1145000, factId: "F-cap-0027" },
  { key: "cap.min_salary_y2027_cs3", value: 1190000, factId: "F-cap-0028" },
  { key: "cap.min_salary_y2028_cs3", value: 1235000, factId: "F-cap-0029" },
  { key: "cap.min_salary_y2029_cs3", value: 1280000, factId: "F-cap-0030" },
  { key: "cap.min_salary_y2030_cs3", value: 1325000, factId: "F-cap-0031" },
  { key: "cap.min_salary_y2026_cs4_6", value: 1215000, factId: "F-cap-0032" },
  { key: "cap.min_salary_y2027_cs4_6", value: 1260000, factId: "F-cap-0033" },
  { key: "cap.min_salary_y2028_cs4_6", value: 1305000, factId: "F-cap-0034" },
  { key: "cap.min_salary_y2029_cs4_6", value: 1350000, factId: "F-cap-0035" },
  { key: "cap.min_salary_y2030_cs4_6", value: 1395000, factId: "F-cap-0036" },
  { key: "cap.min_salary_y2026_cs7_plus", value: 1300000, factId: "F-cap-0037" },
  { key: "cap.min_salary_y2027_cs7_plus", value: 1345000, factId: "F-cap-0038" },
  { key: "cap.min_salary_y2028_cs7_plus", value: 1390000, factId: "F-cap-0039" },
  { key: "cap.min_salary_y2029_cs7_plus", value: 1435000, factId: "F-cap-0040" },
  { key: "cap.min_salary_y2030_cs7_plus", value: 1480000, factId: "F-cap-0041" },
  { key: "rookie.undrafted_pool_2024_usd", value: 183103, factId: "F-cap-0049" },
  { key: "rookie.undrafted_pool_2025_usd", value: 206144, factId: "F-cap-0067" },
  { key: "rookie.undrafted_pool_2026_usd", value: 229224, factId: "F-cap-0068" },
  { key: "rookie.option_tiers", value: 4, factId: "F-cap-0050" },
  { key: "rookie.option_basic_rank_from", value: 3, factId: "F-cap-0054" },
  { key: "rookie.option_basic_rank_to", value: 25, factId: "F-cap-0055" },
  { key: "rookie.option_playtime_rank_to", value: 20, factId: "F-cap-0056" },
  { key: "rookie.option_playtime_two_of_three_pct", value: 75, factId: "F-cap-0057" },
  { key: "rookie.option_playtime_average_pct", value: 75, factId: "F-cap-0058" },
  { key: "rookie.option_playtime_each_pct", value: 50, factId: "F-cap-0059" },
  { key: "rookie.option_franchise_pro_bowls", value: 2, factId: "F-cap-0060" },
  { key: "rookie.escalator_l1_pct_round_2", value: 60, factId: "F-cap-0061" },
  { key: "rookie.escalator_l1_pct_later_rounds", value: 35, factId: "F-cap-0062" },
  { key: "rookie.escalator_l2_pct_each", value: 55, factId: "F-cap-0063" },
  { key: "rookie.escalator_l2_extra_usd", value: 250000, factId: "F-cap-0064" },
];

export interface RequestedValue { readonly key: string; readonly value: number; readonly source: string }

export const REQUESTED: readonly RequestedValue[] = [
];

type Val = number | boolean | string;

export function draftRules(overrides: Record<string, Val> = {}): RuleSet {
  const values = new Map<string, Val>();
  for (const v of FILE_VALUES) values.set(v.key, v.value);
  for (const r of REQUESTED) values.set(r.key, r.value);
  for (const [k, v] of Object.entries(overrides)) values.set(k, v);
  const get = (k: string) => { if (!values.has(k)) throw new Error(`no rule ${k}`); return values.get(k)!; };
  return {
    id: 'draft_fixture', level: 'pro', seasonYear: 2026,
    num: (k) => get(k) as number, bool: (k) => get(k) as boolean, opt: (k) => get(k) as string, keys: () => [...values.keys()],
  };
}


/** A deterministic uniform draw for tests (an LCG; the game passes an engine-core stream). */
export function testDraw(seed: number): { unit(label: string): number } {
  let s = seed >>> 0;
  return { unit: () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; } };
}
