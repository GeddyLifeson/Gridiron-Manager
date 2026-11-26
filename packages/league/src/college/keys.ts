// Rule keys of the college module (G-37; T5, T6, T7, T8.3 to T8.5). Every rule value is read here by
// key and nowhere else. G-10 owns the league rules files and their fact rows. Keys marked NEW are
// requested from G-10 and the integrator (PR body), each with the bible leaf that states its value.
// Keys already in collegeleague_2026 (G-10): league.roster_limit, league.aid_limit,
// pay.revenue_share_cap_2025_26, pay.revenue_share_cap_2026_27, pay.revenue_share_growth_pct,
// pay.nil_report_threshold_usd, eligibility.window_years, eligibility.age_trigger, eligibility.model.
//
// A feature is on when its keys are in the rule set, never by testing the level (P1.3.3).
import type { RuleKeyManifest, RuleSet } from '@gm/schema';
import units from './units.json' with { type: 'json' };

const READ_BY = ['league.college'];

const k = (key: string, type: 'number' | 'boolean' | 'option', unit: string | undefined, meaning: string, ownerLeaf: string, options?: string[]) =>
  ({ key, type, ...(unit ? { unit } : {}), ...(options ? { options } : {}), meaning, ownerLeaf, readBy: READ_BY });

export const ELIGIBILITY_MODELS = ['seasons', 'age_based_five_year'] as const;
export type EligibilityModelOption = (typeof ELIGIBILITY_MODELS)[number];

export const RULE_KEYS: RuleKeyManifest = [
  // Roster and aid (T5.1).
  k('league.roster_limit', 'number', 'count', 'Roster limit at the declaration date (T5.1.1).', 'T5.1.1'),
  k('league.aid_limit', 'number', 'count', 'Most players on aid; a conference may set fewer (T5.1.1).', 'T5.1.1'),
  // The eligibility clock (T5.2.1).
  k('eligibility.model', 'option', undefined, 'Eligibility model of the rule set: seasons only, or the age model with better-of-both for earlier enrollees (T5.2.1).', 'T5.2.1', [...ELIGIBILITY_MODELS]),
  k('eligibility.window_years', 'number', 'years', 'Age model: years of eligibility from the clock start (T5.2.1).', 'T5.2.1'),
  k('eligibility.age_trigger', 'number', 'age', 'Age model: the clock starts the academic year after this birthday at the latest (T5.2.1).', 'T5.2.1'),
  k('eligibility.age_cutoff_month', 'number', 'month', 'Age model: a birthday before this month and day counts for that academic year (NEW: T5.2.1 clock start detail, September 1, Verified).', 'T5.2.1'),
  k('eligibility.age_cutoff_day', 'number', 'day', 'Age model: day of the cut-off month (NEW: T5.2.1, 1).', 'T5.2.1'),
  k('eligibility.age_model_first_entry_year', 'number', 'season_year', 'First enrollment year judged by the age model alone; earlier enrollees get the better of both (NEW: T5.2.1, fall 2027, Verified).', 'T5.2.1'),
  k('eligibility.transition_first_season', 'number', 'season_year', 'First season the better-of-both evaluation applies; players exhausted before it get nothing more (NEW: T5.2.1, 2026, Verified).', 'T5.2.1'),
  k('eligibility.seasons_of_competition', 'number', 'seasons', 'Seasons model: seasons of competition (NEW: T5.2.1, 4, Verified).', 'T5.2.1'),
  k('eligibility.seasons_clock_years', 'number', 'years', 'Seasons model: the seasons are used within this many years of first enrollment (NEW: T5.2.1, 5, Verified).', 'T5.2.1'),
  k('eligibility.redshirt_max_games', 'number', 'games', 'Seasons model: a player who appears in at most this many regular-season games does not use the season (NEW: T5.2.1, 4, Verified).', 'T5.2.1'),
  k('eligibility.postseason_counts', 'boolean', undefined, 'Whether postseason games count toward the redshirt line (NEW: T5.2.1, false, Verified).', 'T5.2.1'),
  k('eligibility.juco_seasons_count', 'boolean', undefined, 'Whether two-year college seasons count against the clock (NEW: T6.3.2 rule 1, true, Conflict).', 'T6.3.2'),
  // Academic standing (T5.3.1).
  k('academic.full_time_hours', 'number', 'credit_hours', 'Full-time load per term (NEW: T5.3.1 rule 1, 12, Verified).', 'T5.3.1'),
  k('academic.term_min_hours', 'number', 'credit_hours', 'Hours passed in the previous term to play in the next (NEW: T5.3.1 rule 2, 6, Verified).', 'T5.3.1'),
  k('academic.year_min_hours', 'number', 'credit_hours', 'Hours passed since the previous fall, summer excluded (NEW: T5.3.1 rule 3, 18, Verified).', 'T5.3.1'),
  k('academic.first_year_min_hours', 'number', 'credit_hours', 'Hours passed before the second year (NEW: T5.3.1 rule 3, 24, Verified).', 'T5.3.1'),
  k('academic.fall_min_hours', 'number', 'credit_hours', 'Football fall rule: hours passed in the fall (NEW: T5.3.1 rule 4, 9, Verified).', 'T5.3.1'),
  k('academic.fall_rule_games', 'number', 'games', 'Football fall rule: games missed at the start of the next season (NEW: T5.3.1 rule 4, 4, 2 of 3).', 'T5.3.1'),
  k('academic.progress_pct_year3', 'number', 'percent', 'Degree progress before year 3 (NEW: T5.3.1 rule 5, 40, Verified).', 'T5.3.1'),
  k('academic.progress_pct_year4', 'number', 'percent', 'Degree progress before year 4 (NEW: T5.3.1 rule 5, 60, Verified).', 'T5.3.1'),
  k('academic.progress_pct_year5', 'number', 'percent', 'Degree progress before year 5 (NEW: T5.3.1 rule 5, 80, Verified).', 'T5.3.1'),
  k('academic.gpa_year2', 'number', 'gpa', 'Grade point average by year 2 (NEW: T5.3.1 rule 6, 1.8, Verified).', 'T5.3.1'),
  k('academic.gpa_year3', 'number', 'gpa', 'Grade point average by year 3 (NEW: T5.3.1 rule 6, 1.9, Verified).', 'T5.3.1'),
  k('academic.gpa_year4', 'number', 'gpa', 'Grade point average by year 4 and after (NEW: T5.3.1 rule 6, 2.0, Verified).', 'T5.3.1'),
  k('academic.team_rate_max', 'number', 'count', 'Team academic rate maximum (NEW: T5.3.1 rule 7, 1000, 1 of 3).', 'T5.3.1'),
  k('academic.team_rate_postseason_min', 'number', 'count', 'Multi-year team academic rate below which the team may not enter the postseason (NEW: T5.3.1 rule 7, 930, 1 of 3).', 'T5.3.1'),
  // Transfers (T6.1.1).
  k('transfer.postseason_extra_days', 'number', 'days', 'Days after a postseason team\'s last game in which its players may still enter (NEW: T6.1.1, 5, 2 of 3).', 'T6.1.1'),
  k('transfer.coach_change_delay_days', 'number', 'days', 'The coaching-change window opens this many days after the new head coach is hired (NEW: T6.1.1, 5, 2 of 3).', 'T6.1.1'),
  k('transfer.coach_change_window_days', 'number', 'days', 'Length of the coaching-change window (NEW: T6.1.1, 15, 2 of 3).', 'T6.1.1'),
  k('transfer.max_free', 'number', 'count', 'Transfers allowed while eligibility remains; 0 means no limit (NEW: T6.1.1, unlimited, 2 of 3).', 'T6.1.1'),
  k('transfer.aid_ends_on_entry', 'boolean', undefined, 'Whether entering the database ends aid at the end of the term (NEW: T6.2.1 data switch, false, 1 of 3).', 'T6.2.1'),
  // Pay (T7).
  k('pay.revenue_share_cap_2025_26', 'number', 'USD', 'Revenue-sharing cap per school, 2025-26 (T7.1.1).', 'T7.1.1'),
  k('pay.revenue_share_cap_2026_27', 'number', 'USD', 'Revenue-sharing cap per school, 2026-27 (T7.1.1).', 'T7.1.1'),
  k('pay.revenue_share_growth_pct', 'number', 'percent', 'Yearly cap growth used to project years with no published cap (T7.1.1).', 'T7.1.1'),
  k('pay.scholarship_credit_2025_26', 'number', 'USD', 'Added scholarship cost counted toward the cap, 2025-26 (NEW: T7.1.1, 2,500,000, 1 of 3).', 'T7.1.1'),
  k('pay.scholarship_credit_2026_27', 'number', 'USD', 'Added scholarship cost counted toward the cap, 2026-27 (NEW: T7.1.1, 2,500,000 per CSC primary, Rulebook only, open conflict).', 'T7.1.1'),
  k('pay.nil_report_threshold_usd', 'number', 'USD', 'Outside deals at or above this amount must be reported (T7.2.1).', 'T7.2.1'),
  k('pay.agreement_max_years', 'number', 'years', 'Longest player agreement (NEW: T7.3.2 rule 1, 3, 2 of 3).', 'T7.3.2'),
  k('pay.multi_year', 'boolean', undefined, 'Multi-year agreements allowed (NEW: T7.3.2 rule 1, true).', 'T7.3.2'),
  k('pay.agent_fee_cap', 'boolean', undefined, 'Agent fee cap in force (NEW: T7.3.2 rule 4a, false until law).', 'T7.3.2'),
  k('pay.agent_fee_cap_pct', 'number', 'percent', 'Agent fee cap as a share of an endorsement contract (NEW: T7.3.2 rule 4a, 5, Verified on the bill text).', 'T7.3.2'),
  k('pay.employment_status', 'option', undefined, 'Whether players are employees (NEW: T7.3.2 rule 7, not_employee, 2 of 3).', 'T7.3.2', ['not_employee', 'employee']),
  // Leaving for the draft (T8.5.1).
  k('draft.min_years_from_high_school', 'number', 'years', 'Years since high school before a player may enter the draft (NEW: T8.5.1 rule 1, 3, 2 of 3).', 'T8.5.1'),
  k('draft.underclass_deadline_month', 'number', 'month', 'Month of the early-entry deadline (NEW: T8.5.1 rule 2, January, 2 of 3).', 'T8.5.1'),
  k('draft.underclass_deadline_day', 'number', 'day', 'Day of the early-entry deadline (NEW: T8.5.1 rule 2, 14 in 2026, 2 of 3).', 'T8.5.1'),
  k('draft.underclass_deadline_title_game_day', 'number', 'day', 'Early-entry deadline day for players in the title game (NEW: T8.5.1 rule 2, 23 in 2026, 2 of 3).', 'T8.5.1'),
  k('draft.undrafted_may_return', 'boolean', undefined, 'An undrafted early entrant may return to college (NEW: T8.5.1 rule 5, false, Unverified).', 'T8.5.1'),
];

/** College rules for one season, read once from its rule set. Null groups are features the rule set leaves out. */
export interface CollegeRules {
  readonly seasonYear: number;
  readonly rosterLimit: number;
  readonly aidLimit: number;
  readonly eligibility: {
    readonly model: EligibilityModelOption;
    readonly ageWindowYears: number;
    readonly ageTrigger: number;
    readonly cutoffMonth: number;
    readonly cutoffDay: number;
    readonly ageModelFirstEntryYear: number;
    readonly transitionFirstSeason: number;
    readonly seasonsOfCompetition: number;
    readonly seasonsClockYears: number;
    readonly redshirtMaxGames: number;
    readonly postseasonCounts: boolean;
    readonly jucoSeasonsCount: boolean;
  };
  readonly academic: {
    readonly fullTimeHours: number; readonly termMinHours: number; readonly yearMinHours: number; readonly firstYearMinHours: number;
    readonly fallMinHours: number; readonly fallRuleGames: number;
    /** Degree progress required before years 3, 4 and 5, in percent. */
    readonly progressPct: readonly [number, number, number];
    /** Grade point required by years 2, 3, and 4 and after. */
    readonly gpa: readonly [number, number, number];
    readonly teamRateMax: number; readonly teamRatePostseasonMin: number;
  } | null;
  readonly transfer: {
    readonly postseasonExtraDays: number; readonly coachChangeDelayDays: number; readonly coachChangeWindowDays: number;
    /** 0 = no limit. */
    readonly maxFree: number;
    readonly aidEndsOnEntry: boolean;
  } | null;
  readonly pay: {
    /** Cap for this rule set's season, read from its year key or projected with the growth key. */
    readonly revenueShareCap: number;
    readonly scholarshipCredit: number;
    readonly nilReportThreshold: number;
    readonly agreementMaxYears: number;
    readonly multiYear: boolean;
    readonly agentFeeCapPct: number | null;
    readonly employee: boolean;
  } | null;
  readonly draft: {
    readonly minYearsFromHighSchool: number;
    readonly deadlineMonth: number; readonly deadlineDay: number; readonly titleGameDeadlineDay: number;
    readonly undraftedMayReturn: boolean;
  } | null;
  /** Every key read to build this object. */
  readonly keysRead: readonly string[];
}

/** `pay.revenue_share_cap_2026_27` style suffix for the academic year that starts in the fall of `year`. */
export function academicYearSuffix(year: number): string {
  const next = (year + 1) % units.centuryModulo;
  return `${year}_${next < units.twoDigitFloor ? '0' : ''}${next}`;
}

/**
 * The cap for the academic year starting in the fall of `year`: the year's own key when present, else the
 * latest published year grown by `pay.revenue_share_growth_pct` a year (T7.1.1 starting projection).
 * Earlier than the first published year there is no school pool (rule sets before 2025, T7.1.1 edge case).
 */
export function revenueShareCapFor(rs: RuleSet, year: number, read: string[] = []): number {
  const present = new Set(rs.keys());
  const prefix = 'pay.revenue_share_cap_';
  const years = [...present].filter((x) => x.startsWith(prefix)).map((x) => Number(x.slice(prefix.length).split('_')[0])).sort((a, b) => a - b);
  if (years.length === 0) return 0;
  const own = `${prefix}${academicYearSuffix(year)}`;
  if (present.has(own)) { read.push(own); return rs.num(own); }
  const latest = years.filter((y) => y <= year).pop();
  if (latest === undefined) return 0;
  const latestKey = `${prefix}${academicYearSuffix(latest)}`;
  read.push(latestKey, 'pay.revenue_share_growth_pct');
  const growth = 1 + rs.num('pay.revenue_share_growth_pct') / units.percent;
  let cap = rs.num(latestKey);
  for (let y = latest; y < year; y++) cap *= growth;
  return Math.round(cap);
}

/** Builds the college rules from a rule set. Each group is read only when its first key is present. */
export function collegeRules(rs: RuleSet): CollegeRules {
  const present = new Set(rs.keys());
  const read: string[] = [];
  const has = (key: string) => present.has(key);
  const num = (key: string) => { read.push(key); return rs.num(key); };
  const bool = (key: string) => { read.push(key); return rs.bool(key); };
  const opt = (key: string) => { read.push(key); return rs.opt(key); };

  const model = opt('eligibility.model');
  if (!(ELIGIBILITY_MODELS as readonly string[]).includes(model)) throw new Error(`league.college: unknown eligibility.model ${model}`);
  const year = rs.seasonYear;
  const scholarshipKey = `pay.scholarship_credit_${academicYearSuffix(year)}`;
  const rules: Omit<CollegeRules, 'keysRead'> = {
    seasonYear: year,
    rosterLimit: num('league.roster_limit'),
    aidLimit: has('league.aid_limit') ? num('league.aid_limit') : num('league.roster_limit'),
    eligibility: {
      model: model as EligibilityModelOption,
      ageWindowYears: num('eligibility.window_years'),
      ageTrigger: num('eligibility.age_trigger'),
      cutoffMonth: num('eligibility.age_cutoff_month'),
      cutoffDay: num('eligibility.age_cutoff_day'),
      ageModelFirstEntryYear: num('eligibility.age_model_first_entry_year'),
      transitionFirstSeason: num('eligibility.transition_first_season'),
      seasonsOfCompetition: num('eligibility.seasons_of_competition'),
      seasonsClockYears: num('eligibility.seasons_clock_years'),
      redshirtMaxGames: num('eligibility.redshirt_max_games'),
      postseasonCounts: bool('eligibility.postseason_counts'),
      jucoSeasonsCount: bool('eligibility.juco_seasons_count'),
    },
    academic: has('academic.term_min_hours') ? {
      fullTimeHours: num('academic.full_time_hours'),
      termMinHours: num('academic.term_min_hours'),
      yearMinHours: num('academic.year_min_hours'),
      firstYearMinHours: num('academic.first_year_min_hours'),
      fallMinHours: num('academic.fall_min_hours'),
      fallRuleGames: num('academic.fall_rule_games'),
      progressPct: [num('academic.progress_pct_year3'), num('academic.progress_pct_year4'), num('academic.progress_pct_year5')],
      gpa: [num('academic.gpa_year2'), num('academic.gpa_year3'), num('academic.gpa_year4')],
      teamRateMax: num('academic.team_rate_max'),
      teamRatePostseasonMin: num('academic.team_rate_postseason_min'),
    } : null,
    transfer: has('transfer.coach_change_window_days') ? {
      postseasonExtraDays: num('transfer.postseason_extra_days'),
      coachChangeDelayDays: num('transfer.coach_change_delay_days'),
      coachChangeWindowDays: num('transfer.coach_change_window_days'),
      maxFree: num('transfer.max_free'),
      aidEndsOnEntry: bool('transfer.aid_ends_on_entry'),
    } : null,
    pay: has('pay.nil_report_threshold_usd') ? {
      revenueShareCap: revenueShareCapFor(rs, year, read),
      scholarshipCredit: has(scholarshipKey) ? num(scholarshipKey) : 0,
      nilReportThreshold: num('pay.nil_report_threshold_usd'),
      // Missing key means no maximum (the value is unsourced so far).
      agreementMaxYears: has('pay.agreement_max_years') ? num('pay.agreement_max_years') : Number.POSITIVE_INFINITY,
      multiYear: bool('pay.multi_year'),
      agentFeeCapPct: bool('pay.agent_fee_cap') ? num('pay.agent_fee_cap_pct') : null,
      employee: opt('pay.employment_status') === 'employee',
    } : null,
    draft: has('draft.min_years_from_high_school') ? {
      minYearsFromHighSchool: num('draft.min_years_from_high_school'),
      deadlineMonth: num('draft.underclass_deadline_month'),
      deadlineDay: num('draft.underclass_deadline_day'),
      titleGameDeadlineDay: num('draft.underclass_deadline_title_game_day'),
      undraftedMayReturn: bool('draft.undrafted_may_return'),
    } : null,
  };
  return Object.freeze({ ...rules, keysRead: Object.freeze([...new Set(read)].sort()) });
}
