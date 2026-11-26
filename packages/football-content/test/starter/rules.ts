// FIXTURE rule sets for the legality checks (not rule data; WP-01 owns the real values and the real-value
// cases of Q1.1.1 run at integration). Two fixtures so both branches of each key are exercised.
import type { RuleSet } from '@gm/schema';

type Values = Record<string, number | boolean | string>;
function rs(id: string, values: Values): RuleSet {
  const get = (k: string) => { const v = values[k]; if (v === undefined) throw new Error(`fixture ${id}: missing ${k}`); return v; };
  return { id, level: 'pro', seasonYear: 2026, num: (k) => get(k) as number, bool: (k) => get(k) as boolean, opt: (k) => get(k) as string, keys: () => Object.keys(values) };
}
const BANDS: Values = {
  'substitution.max_players': 11, 'formation.line_min': 7, 'formation.backfield_max': 0, 'formation.numbered_linemen_min': 0,
  'formation.neither_behind_snapper_max': 1, 'formation.t_quarterback_depth_yd': 1, 'formation.motion_rule': 'one_back_not_forward', 'formation.shift_set_seconds': 1,
  'numbering.eligible_low_max': 49, 'numbering.eligible_high_min': 80, 'numbering.eligible_high_max': 89, 'numbering.scheme': 'position_bands',
  'numbering.report_eligible_allowed': true, 'numbering.qb_under_center_eligible': false,
};
export function fixtureRules(): RuleSet[] {
  return [rs('fixture_bands', BANDS), rs('fixture_free', { ...BANDS, 'formation.line_min': 0, 'formation.backfield_max': 4, 'formation.numbered_linemen_min': 5, 'numbering.eligible_high_max': 99, 'numbering.scheme': 'free_0_99_five_50_79', 'numbering.report_eligible_allowed': false, 'numbering.qb_under_center_eligible': true })];
}
