// Rule keys of the locker room module (G-45). Every league or labour-agreement value L3 uses is read here
// by key and nowhere else. The values and their fact rows belong to G-10 (`packages/rules-data/data/league/**`,
// `facts/league.json`); every key below is NEW and requested from G-10 and the integrator in the PR body,
// with the bible leaf and the status the bible records for it (L3.1.2 table, L3.2.2, L3.2.4, L3.2.5).
//
// One engine serves both levels: a feature is on when the level's file says so (`club_discipline.model`),
// never by testing the level (P1.3.3). The option values are `labour_agreement` (L3.1 to L3.4 with the CBA
// limits) and `school_code` (L3.5.1).
import type { RuleKeyManifest, RuleSet } from '@gm/schema';

const READ_BY = ['career.locker_room'];

const k = (key: string, type: 'number' | 'boolean' | 'option', unit: string | undefined, meaning: string, ownerLeaf: string, options?: string[]) =>
  ({ key, type, ...(unit ? { unit } : {}), ...(options ? { options } : {}), meaning, ownerLeaf, readBy: READ_BY });

/** Fine schedule groups of L3.1.2 (one maximum per group per league year). */
export const SCHEDULE_GROUPS = [
  'overweight_per_lb_day', 'late', 'missed', 'ejection',
  'minicamp_day1', 'minicamp_day2', 'minicamp_day3',
  'camp_veteran_day', 'camp_ufa_day', 'camp_rookie_day', 'camp_option_day',
] as const;
export type ScheduleGroup = (typeof SCHEDULE_GROUPS)[number];

/** Camp groups that carry the extra one-week-salary-per-preseason-game term (Art. 42 Sec. 1(b)(vii), Art. 7 Sec. 7(h)). */
export const CAMP_WEEK_PAY_GROUPS: readonly ScheduleGroup[] = ['camp_ufa_day', 'camp_option_day'];

export const RULE_KEYS: RuleKeyManifest = [
  k('club_discipline.model', 'option', undefined, 'Which club discipline model applies: the labour agreement (L3.1 to L3.4) or the school code (L3.5.1). Pro labour_agreement, college school_code.', 'L3.5.1', ['labour_agreement', 'school_code']),
  // L3.1.2 fine schedule maxima (CBA Exhibit A, 2026 row; Primary per the bible table).
  ...SCHEDULE_GROUPS.map((g) => k(`club_discipline.max_usd.${g}`, 'number', 'USD', `Largest club fine for schedule group ${g} this league year (L3.1.2 table, CBA Exhibit A).`, 'L3.1.2')),
  ...(['camp_veteran_day', 'camp_ufa_day', 'camp_rookie_day', 'camp_option_day', 'minicamp_day1', 'minicamp_day2', 'minicamp_day3'] as const).map((g) =>
    k(`club_discipline.waivable.${g}`, 'boolean', undefined, `Whether the club may reduce or waive the ${g} fine (false: "mandatory, and shall not be reduced in amount or waived", L3.1.2).`, 'L3.1.2')),
  k('club_discipline.daily_cap_usd.camp', 'number', 'USD', 'Cumulative daily fine cap in training camp (L3.1.2).', 'L3.1.2'),
  k('club_discipline.daily_cap_usd.season', 'number', 'USD', 'Cumulative daily fine cap in the regular season and postseason (L3.1.2).', 'L3.1.2'),
  k('club_discipline.overweight_weekly_max', 'number', 'count', 'Overweight fines at most this many times a week (L3.1.2, research file).', 'L3.1.2'),
  k('club_discipline.overweight_min_days_apart', 'number', 'days', 'Overweight fines at least this many days apart (L3.1.2).', 'L3.1.2'),
  k('club_discipline.schedule_scale', 'number', 'ratio', 'Generated league scale on every schedule amount (L3.1.2 edge case, discipline_schedule_scale; 1 for the real schedule).', 'L3.1.2'),
  // L3.2.2 ladder and deductions (Art. 42 Sec. 1(a), Sec. 5).
  k('club_discipline.ladder_share.first', 'number', 'ratio', 'Step maximum for a first offence as a share of the schedule maximum (40 percent, Art. 42 Sec. 1(a)).', 'L3.2.2'),
  k('club_discipline.ladder_share.second', 'number', 'ratio', 'Step maximum for a second offence (70 percent).', 'L3.2.2'),
  k('club_discipline.ladder_share.third', 'number', 'ratio', 'Step maximum for a third and later offence (100 percent).', 'L3.2.2'),
  k('club_discipline.deduction_per_pay_period_usd', 'number', 'USD', 'Largest fine deduction per pay period (5,000 in 2026 to 2030, Art. 42 Sec. 5).', 'L3.2.2'),
  k('club_discipline.youth_share_min', 'number', 'ratio', 'Least share of fines collected that goes to youth football (Art. 42 Sec. 5(c)).', 'L3.2.2'),
  // L3.2.4 conduct detrimental (Art. 42 Sec. 1(b)(xvii), Sec. 3(a)).
  k('club_discipline.conduct_predicate_violation', 'number', 'count', 'Conduct-detrimental discipline for repeated offences is available from this violation in the league year (fourth, Art. 42 Sec. 3(a)).', 'L3.2.4'),
  k('club_discipline.conduct_fine_max_weeks_salary', 'number', 'weeks', 'Largest conduct-detrimental fine in weeks of salary (one).', 'L3.2.4'),
  k('club_discipline.conduct_suspension_max_weeks', 'number', 'weeks', 'Longest club suspension without pay (four).', 'L3.2.4'),
  k('club_discipline.club_suspension_roster_status', 'option', undefined, 'Roster treatment of a club-suspended player (Unverified; starting counts_inactive).', 'L3.2.4', ['counts_inactive', 'reserve_suspended']),
  // L3.2.5 grievance clocks (Art. 43).
  k('grievance.file_within_days', 'number', 'days', 'A grievance must be started within this many days (50, Art. 43).', 'L3.2.5'),
  k('grievance.answer_days', 'number', 'days', 'Written answer due within this many days (10).', 'L3.2.5'),
  k('grievance.suspension_hearing_days', 'number', 'days', 'Hearing on a club suspension within this many days of filing (7).', 'L3.2.5'),
  k('grievance.expedited_decision_days', 'number', 'days', 'Decision within this many days of an expedited hearing (5).', 'L3.2.5'),
  k('grievance.expedited_per_side_year', 'number', 'count', 'Other expedited grievances each side may call a calendar year (4).', 'L3.2.5'),
  k('grievance.ordinary_decision_days', 'number', 'days', 'Ordinary case decision within this many days of briefs (30).', 'L3.2.5'),
  k('grievance.record_close_days', 'number', 'days', 'Ordinary case record closes this many days after the hearing (60).', 'L3.2.5'),
];

/** L3 values resolved from one rule set. Labour-agreement fields are null under the school code model. */
export interface DisciplineRules {
  readonly model: 'labour_agreement' | 'school_code';
  readonly maxUsd: Readonly<Record<ScheduleGroup, number>> | null;
  readonly waivable: Readonly<Partial<Record<ScheduleGroup, boolean>>>;
  readonly dailyCapCampUsd: number | null;
  readonly dailyCapSeasonUsd: number | null;
  readonly overweightWeeklyMax: number | null;
  readonly overweightMinDaysApart: number | null;
  readonly ladder: readonly [number, number, number] | null;
  readonly deductionPerPayPeriodUsd: number | null;
  readonly youthShareMin: number | null;
  readonly conductPredicateViolation: number | null;
  readonly conductFineMaxWeeks: number | null;
  readonly conductSuspensionMaxWeeks: number | null;
  readonly grievance: {
    readonly fileWithinDays: number; readonly answerDays: number; readonly suspensionHearingDays: number;
    readonly expeditedDecisionDays: number; readonly expeditedPerSideYear: number;
    readonly ordinaryDecisionDays: number; readonly recordCloseDays: number;
  } | null;
}

/** Read every L3 key once (the loader fails loudly on a missing labour-agreement key, L3.1.2 acceptance). */
export function disciplineRules(rules: RuleSet): DisciplineRules {
  const model = rules.opt('club_discipline.model');
  if (model !== 'labour_agreement' && model !== 'school_code') throw new Error(`career.locker_room: unknown club_discipline.model ${model}`);
  if (model === 'school_code') {
    return { model, maxUsd: null, waivable: {}, dailyCapCampUsd: null, dailyCapSeasonUsd: null, overweightWeeklyMax: null, overweightMinDaysApart: null, ladder: null, deductionPerPayPeriodUsd: null, youthShareMin: null, conductPredicateViolation: null, conductFineMaxWeeks: null, conductSuspensionMaxWeeks: null, grievance: null };
  }
  const has = new Set(rules.keys());
  const num = (key: string): number => {
    if (!has.has(key)) throw new Error(`career.locker_room: rule set ${rules.id} lacks ${key} (L3.1.2)`);
    const v = rules.num(key);
    if (!Number.isFinite(v) || v < 0) throw new Error(`career.locker_room: malformed ${key} = ${v} in ${rules.id} (L3.1.2)`);
    return v;
  };
  const scale = has.has('club_discipline.schedule_scale') ? num('club_discipline.schedule_scale') : 1;
  const maxUsd = Object.fromEntries(SCHEDULE_GROUPS.map((g) => [g, num(`club_discipline.max_usd.${g}`) * scale])) as Record<ScheduleGroup, number>;
  const waivable: Partial<Record<ScheduleGroup, boolean>> = {};
  for (const g of SCHEDULE_GROUPS) {
    const key = `club_discipline.waivable.${g}`;
    if (has.has(key)) waivable[g] = rules.bool(key);
  }
  return {
    model, maxUsd, waivable,
    dailyCapCampUsd: num('club_discipline.daily_cap_usd.camp') * scale,
    dailyCapSeasonUsd: num('club_discipline.daily_cap_usd.season') * scale,
    overweightWeeklyMax: num('club_discipline.overweight_weekly_max'),
    overweightMinDaysApart: num('club_discipline.overweight_min_days_apart'),
    ladder: [num('club_discipline.ladder_share.first'), num('club_discipline.ladder_share.second'), num('club_discipline.ladder_share.third')],
    deductionPerPayPeriodUsd: num('club_discipline.deduction_per_pay_period_usd'),
    youthShareMin: num('club_discipline.youth_share_min'),
    conductPredicateViolation: num('club_discipline.conduct_predicate_violation'),
    conductFineMaxWeeks: num('club_discipline.conduct_fine_max_weeks_salary'),
    conductSuspensionMaxWeeks: num('club_discipline.conduct_suspension_max_weeks'),
    grievance: {
      fileWithinDays: num('grievance.file_within_days'), answerDays: num('grievance.answer_days'),
      suspensionHearingDays: num('grievance.suspension_hearing_days'), expeditedDecisionDays: num('grievance.expedited_decision_days'),
      expeditedPerSideYear: num('grievance.expedited_per_side_year'), ordinaryDecisionDays: num('grievance.ordinary_decision_days'),
      recordCloseDays: num('grievance.record_close_days'),
    },
  };
}
