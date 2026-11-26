// Test fixtures for G-49: a seeded draw and the 2026 schedule as the CBA states it (Exhibit A 2026 column,
// Art. 42 Sec. 1(b)(vi) to (ix), Art. 7 Sec. 7(h), Art. 4 Sec. 9(a), Art. 8 Sec. 1(b)). These values are test
// inputs only; the game reads them from the league rule set once G-10 adds the keys with fact rows.
import { scheduleFrom, type Draw } from '../../src/agents/index.ts';

export function seeded(seed: number): Draw {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const PRO_2026 = {
  'discipline.camp_absence_fine_usd.veteran': 60000,
  'discipline.camp_absence_fine_usd.ufa_signee': 60000,
  'discipline.camp_absence_fine_usd.rookie': 45000,
  'discipline.camp_absence_fine_usd.option_year': 45000,
  'discipline.camp_absence_fine_waivable.veteran': false,
  'discipline.camp_absence_fine_waivable.ufa_signee': false,
  'discipline.camp_absence_fine_waivable.rookie': true,
  'discipline.camp_absence_fine_waivable.option_year': true,
  'discipline.camp_absence_week_salary_per_preseason_game.veteran': false,
  'discipline.camp_absence_week_salary_per_preseason_game.ufa_signee': true,
  'discipline.camp_absence_week_salary_per_preseason_game.rookie': false,
  'discipline.camp_absence_week_salary_per_preseason_game.option_year': true,
  'discipline.minicamp_absence_fine_max_usd.day1': 17986,
  'discipline.minicamp_absence_fine_max_usd.day2': 35973,
  'discipline.minicamp_absence_fine_max_usd.day3': 53952,
  'forfeit.camp_free_days': 5,
  'forfeit.camp_initial_share': 0.15,
  'forfeit.camp_daily_share': 0.01,
  'forfeit.camp_max_share': 0.25,
  'forfeit.first_game_share': 0.25,
  'forfeit.weekly_after_weeks': 4,
  'forfeit.weekly_divisor': 17,
  'service.no_accrued_if_not_reported': true,
} as const;

export const PRO = scheduleFrom(PRO_2026);
export const COLLEGE_2026 = scheduleFrom({ 'college.player_representation': true });
export const COLLEGE_2020 = scheduleFrom({ 'college.player_representation': false });
