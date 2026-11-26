// Test fixtures for G-45. The 2026 schedule values are copied from the bible L3.1.2 table only so the
// L3.1.2 acceptance test ("a unit test checks the 2026 row against the values above") can run before G-10
// loads the real rule file. They are fixtures, not facts: the game reads these keys from rules-data.
import type { RuleSet } from '@gm/schema';

export const PRO_2026: Record<string, number | string | boolean> = {
  'club_discipline.model': 'labour_agreement',
  'club_discipline.max_usd.overweight_per_lb_day': 847,
  'club_discipline.max_usd.late': 3182,
  'club_discipline.max_usd.missed': 16984,
  'club_discipline.max_usd.ejection': 44962,
  'club_discipline.max_usd.minicamp_day1': 17986,
  'club_discipline.max_usd.minicamp_day2': 35973,
  'club_discipline.max_usd.minicamp_day3': 53952,
  'club_discipline.max_usd.camp_veteran_day': 60000,
  'club_discipline.max_usd.camp_ufa_day': 60000,
  'club_discipline.max_usd.camp_rookie_day': 45000,
  'club_discipline.max_usd.camp_option_day': 45000,
  'club_discipline.waivable.camp_veteran_day': false,
  'club_discipline.waivable.camp_ufa_day': false,
  'club_discipline.waivable.camp_rookie_day': true,
  'club_discipline.waivable.camp_option_day': true,
  'club_discipline.waivable.minicamp_day1': true,
  'club_discipline.waivable.minicamp_day2': true,
  'club_discipline.waivable.minicamp_day3': true,
  'club_discipline.daily_cap_usd.camp': 35967,
  'club_discipline.daily_cap_usd.season': 48556,
  'club_discipline.overweight_weekly_max': 2,
  'club_discipline.overweight_min_days_apart': 3,
  'club_discipline.ladder_share.first': 0.4,
  'club_discipline.ladder_share.second': 0.7,
  'club_discipline.ladder_share.third': 1,
  'club_discipline.deduction_per_pay_period_usd': 5000,
  'club_discipline.youth_share_min': 0.5,
  'club_discipline.conduct_predicate_violation': 4,
  'club_discipline.conduct_fine_max_weeks_salary': 1,
  'club_discipline.conduct_suspension_max_weeks': 4,
  'grievance.file_within_days': 50,
  'grievance.answer_days': 10,
  'grievance.suspension_hearing_days': 7,
  'grievance.expedited_decision_days': 5,
  'grievance.expedited_per_side_year': 4,
  'grievance.ordinary_decision_days': 30,
  'grievance.record_close_days': 60,
};

export const COLLEGE_2026: Record<string, number | string | boolean> = { 'club_discipline.model': 'school_code' };

export function ruleSet(values: Record<string, number | string | boolean>, id = 'fixture_2026'): RuleSet {
  return {
    id, level: 'pro', seasonYear: 2026,
    num: (k) => { const v = values[k]; if (typeof v !== 'number') throw new Error(`no number ${k}`); return v; },
    bool: (k) => { const v = values[k]; if (typeof v !== 'boolean') throw new Error(`no bool ${k}`); return v; },
    opt: (k) => { const v = values[k]; if (typeof v !== 'string') throw new Error(`no option ${k}`); return v; },
    keys: () => Object.keys(values),
  };
}

/** Deterministic test stream (mulberry32). Tests only; the game passes engine-core streams. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A map-backed tie lookup with a default of 25 (L2.1.1). */
export function ties(pairs: [number, number, number][] = [], dflt = 25): { get(x: number, y: number): number } {
  const m = new Map<string, number>();
  for (const [a, b, v] of pairs) m.set(a < b ? `${a}:${b}` : `${b}:${a}`, v);
  return { get: (x, y) => m.get(x < y ? `${x}:${y}` : `${y}:${x}`) ?? dflt };
}
