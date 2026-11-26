// League-rules keys the agents module reads (L7.2.2, L7.3.3). None is in the dictionary yet: the values and
// their fact rows are requested from the league-values research thread (G-10) with the CBA locators in
// README.md. A key absent from a league's rule set means the rule does not exist there (a college league has
// no camp fines; an era before July 2021 has no college representation), so no code tests a level (P1.1.2).
import type { RuleKeyManifest, RuleSet } from '@gm/schema';

const READ_BY = ['career.agents'];
const num = (key: string, unit: string, meaning: string, ownerLeaf = 'L7.2.2') => ({ key, type: 'number' as const, unit, meaning, ownerLeaf, readBy: READ_BY });
const bool = (key: string, meaning: string, ownerLeaf = 'L7.2.2') => ({ key, type: 'boolean' as const, meaning, ownerLeaf, readBy: READ_BY });

/** Contract classes the CBA fines differently (Art. 42 Sec. 1(b)(vi) to (ix), Art. 7 Sec. 7(h)). */
export const CONTRACT_CLASSES = ['veteran', 'ufa_signee', 'rookie', 'option_year'] as const;
export type FinedClass = (typeof CONTRACT_CLASSES)[number];
/** `unsigned` is a drafted rookie or a tendered player who has not signed: not under contract, no fines. */
export type ContractClass = FinedClass | 'unsigned';

export const MINICAMP_DAYS = ['day1', 'day2', 'day3'] as const;

export const RULE_KEYS: RuleKeyManifest = [
  ...CONTRACT_CLASSES.map((c) => num(`discipline.camp_absence_fine_usd.${c}`, 'usd', `Fine per day of unexcused training-camp absence, ${c} class (NEW: L7.2.2, 2026 CBA Exhibit A).`)),
  ...CONTRACT_CLASSES.map((c) => bool(`discipline.camp_absence_fine_waivable.${c}`, `Whether the club may reduce or waive the ${c} camp fine (NEW: L7.2.2; false for veteran and ufa_signee per Art. 42 Sec. 1(b)(vi), (vii)).`)),
  ...CONTRACT_CLASSES.map((c) => bool(`discipline.camp_absence_week_salary_per_preseason_game.${c}`, `Whether one week of regular-season salary is added for each preseason game missed, ${c} class (NEW: L7.2.2; true for ufa_signee and option_year).`)),
  ...MINICAMP_DAYS.map((d, i) => num(`discipline.minicamp_absence_fine_max_usd.${d}`, 'usd', `Maximum fine for unexcused mandatory minicamp absence, day ${i + 1}${i === 2 ? ' and each day after' : ''} (NEW: L7.2.2, Exhibit A, a maximum not a mandatory fine).`)),
  num('discipline.schedule_scale', 'ratio', 'Scale on every discipline dollar value for a generated league (NEW: L3.1.2 discipline_schedule_scale; 1 for the real league).', 'L3.1.2'),
  num('forfeit.camp_free_days', 'days', 'Camp days a player may miss with no forfeiture (NEW: Art. 4 Sec. 9(a)(i), five).'),
  num('forfeit.camp_initial_share', 'ratio', 'Share of forfeitable allocations at the first forfeitable camp day (NEW: Art. 4 Sec. 9(a)(i), 0.15).'),
  num('forfeit.camp_daily_share', 'ratio', 'Further share per camp day after that (NEW: Art. 4 Sec. 9(a)(i), 0.01).'),
  num('forfeit.camp_max_share', 'ratio', 'Cap on the camp forfeiture share (NEW: Art. 4 Sec. 9(a)(i), 0.25).'),
  num('forfeit.first_game_share', 'ratio', 'Share of the remaining allocations forfeited on missing the first regular-season game (NEW: Art. 4 Sec. 9(a)(ii), (iii), 0.25).'),
  num('forfeit.weekly_after_weeks', 'weeks', 'Missed regular-season weeks before weekly forfeiture starts (NEW: Art. 4 Sec. 9(a)(ii), (iii), four).'),
  num('forfeit.weekly_divisor', 'count', 'Weekly forfeiture is the allocation divided by this per missed week (NEW: Art. 4 Sec. 9(a)(ii), (iii), seventeen).'),
  bool('service.no_accrued_if_not_reported', 'A player under contract who fails to report on his mandatory reporting date earns no accrued season, absent extreme hardship (NEW: Art. 8 Sec. 1(b)).'),
  bool('college.player_representation', 'College players may have a representative for payment deals (NEW: L7.3.3, year-stamped; on from 2021-07-01, 2 of 3).', 'L7.3.3'),
];

/** The camp-absence and forfeiture schedule as one league holds it; null when the league has no such rule. */
export interface DisciplineSchedule {
  readonly campFineUsd: Readonly<Partial<Record<FinedClass, number>>>;
  readonly waivable: Readonly<Partial<Record<FinedClass, boolean>>>;
  readonly weekSalaryPerPreseasonGame: Readonly<Partial<Record<FinedClass, boolean>>>;
  /** Day 1, day 2, day 3 and after. Empty when the league has no minicamp fine. */
  readonly minicampMaxUsd: readonly number[];
  readonly scale: number;
  readonly forfeit: ForfeitSchedule | null;
  readonly noAccruedIfNotReported: boolean;
  readonly playerRepresentation: boolean;
}

export interface ForfeitSchedule {
  readonly campFreeDays: number;
  readonly campInitialShare: number;
  readonly campDailyShare: number;
  readonly campMaxShare: number;
  readonly firstGameShare: number;
  readonly weeklyAfterWeeks: number;
  readonly weeklyDivisor: number;
}

type Reader = Pick<RuleSet, 'keys' | 'num' | 'bool'>;

/** Read the schedule from a rule set. Missing keys mean no rule, never a zero fine read as a rule. */
export function disciplineSchedule(rules: Reader): DisciplineSchedule {
  const present = new Set(rules.keys());
  const has = (k: string) => present.has(k);
  const campFineUsd: Partial<Record<FinedClass, number>> = {};
  const waivable: Partial<Record<FinedClass, boolean>> = {};
  const weekSalary: Partial<Record<FinedClass, boolean>> = {};
  for (const c of CONTRACT_CLASSES) {
    if (has(`discipline.camp_absence_fine_usd.${c}`)) campFineUsd[c] = rules.num(`discipline.camp_absence_fine_usd.${c}`);
    if (has(`discipline.camp_absence_fine_waivable.${c}`)) waivable[c] = rules.bool(`discipline.camp_absence_fine_waivable.${c}`);
    if (has(`discipline.camp_absence_week_salary_per_preseason_game.${c}`)) weekSalary[c] = rules.bool(`discipline.camp_absence_week_salary_per_preseason_game.${c}`);
  }
  const minicampMaxUsd = MINICAMP_DAYS.filter((d) => has(`discipline.minicamp_absence_fine_max_usd.${d}`)).map((d) => rules.num(`discipline.minicamp_absence_fine_max_usd.${d}`));
  const fk = ['forfeit.camp_free_days', 'forfeit.camp_initial_share', 'forfeit.camp_daily_share', 'forfeit.camp_max_share', 'forfeit.first_game_share', 'forfeit.weekly_after_weeks', 'forfeit.weekly_divisor'];
  const forfeit: ForfeitSchedule | null = fk.every(has)
    ? {
      campFreeDays: rules.num(fk[0]!), campInitialShare: rules.num(fk[1]!), campDailyShare: rules.num(fk[2]!), campMaxShare: rules.num(fk[3]!),
      firstGameShare: rules.num(fk[4]!), weeklyAfterWeeks: rules.num(fk[5]!), weeklyDivisor: rules.num(fk[6]!),
    }
    : null;
  return {
    campFineUsd, waivable, weekSalaryPerPreseasonGame: weekSalary, minicampMaxUsd,
    scale: has('discipline.schedule_scale') ? rules.num('discipline.schedule_scale') : 1,
    forfeit,
    noAccruedIfNotReported: has('service.no_accrued_if_not_reported') && rules.bool('service.no_accrued_if_not_reported'),
    playerRepresentation: has('college.player_representation') && rules.bool('college.player_representation'),
  };
}

/** A schedule from a plain map (tests, tools, a world preset before the rule files carry the keys). */
export function scheduleFrom(values: Readonly<Record<string, number | boolean>>): DisciplineSchedule {
  return disciplineSchedule({
    keys: () => Object.keys(values),
    num: (k) => { const v = values[k]; if (typeof v !== 'number') throw new Error(`not a number key: ${k}`); return v; },
    bool: (k) => { const v = values[k]; if (typeof v !== 'boolean') throw new Error(`not a boolean key: ${k}`); return v; },
  });
}
