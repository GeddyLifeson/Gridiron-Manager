// Rule keys of the recruiting module (G-36; T4.2.1, T4.2.2, T4.5.1, T4.5.2, T4.5.3, T4.1.2, T4.4.2,
// T4.8.1). Every rule value is read here by key and nowhere else. Values are year-stamped data in the
// college rule set of the date (T4.2.2 switch on 2027-01-01 is a change of rule set, not of code).
//
// None of these keys is in the rules-data dictionary yet: they are requested from G-10 and the research
// thread with the bible leaf and status of each starting value (PR body, "Rule values owed"). Until a key
// is in the rule set the limit it names is not applied, and the module says so through `missingKeys`.
import type { RuleKeyManifest, RuleSet } from '@gm/schema';

const READ_BY = ['league.recruiting'];
const k = (key: string, type: 'number' | 'boolean' | 'option', unit: string | undefined, meaning: string, ownerLeaf: string, options?: string[]) =>
  ({ key, type, ...(unit ? { unit } : {}), ...(options ? { options } : {}), meaning, ownerLeaf, readBy: READ_BY });

export const KEY = {
  model: 'recruiting.model',
  evalDaysFall: 'recruiting.eval_days_fall',
  personDaysSpring: 'recruiting.person_days_spring',
  offcampusMax: 'recruiting.offcampus_max',
  hcCountsAgainstDays: 'recruiting.hc_counts_against_days',
  hcSpringOffcampusAllowed: 'recruiting.hc_spring_offcampus_allowed',
  oppsSpring: 'recruiting.opps_per_prospect_spring',
  oppsFall: 'recruiting.opps_per_prospect_fall',
  oppsPerWeek: 'recruiting.opps_per_week',
  contactsPerWeek: 'recruiting.contacts_per_week',
  contactsTotal: 'recruiting.contacts_total',
  callsPerWeek: 'recruiting.calls_per_week',
  contactStartMonth: 'recruiting.contact_start_month',
  contactStartDay: 'recruiting.contact_start_day',
  contactStartYearsBefore: 'recruiting.contact_start_years_before_class',
  messageStartMonth: 'recruiting.message_start_month',
  messageStartDay: 'recruiting.message_start_day',
  messageStartYearsBefore: 'recruiting.message_start_years_before_class',
  callStartMonth: 'recruiting.call_start_month',
  callStartDay: 'recruiting.call_start_day',
  callStartYearsBefore: 'recruiting.call_start_years_before_class',
  signeeCap: 'recruiting.signee_cap',
  officialPerSchool: 'visits.official_per_school',
  secondAfterHcChange: 'visits.second_after_hc_change',
  visitMaxHours: 'visits.max_hours',
  paidCompanions: 'visits.paid_companions',
  schoolCap: 'visits.school_cap',
  iawpWindowYears: 'iawp.window_years',
  coreCourses: 'college.initial_eligibility.core_courses',
  coreGpa: 'college.initial_eligibility.core_gpa',
  coreBeforeFinal: 'college.initial_eligibility.core_before_final_year',
  coreBeforeFinalEms: 'college.initial_eligibility.core_before_final_year_ems',
  jucoNqTerms: 'juco.nonqualifier_full_time_terms',
  jucoNqHours: 'juco.nonqualifier_hours',
  jucoNqGraduate: 'juco.nonqualifier_must_graduate',
  jucoQTerms: 'juco.qualifier_full_time_terms',
  jucoQHoursPerTerm: 'juco.qualifier_hours_per_term',
  jucoGpa: 'juco.transfer_gpa',
  jucoSeasonsCount: 'eligibility.juco_seasons_count',
  windowYears: 'eligibility.window_years',
  rosterLimit: 'league.roster_limit',
} as const;

export const RULE_KEYS: RuleKeyManifest = [
  k(KEY.model, 'option', undefined, 'Recruiting budget model in force: day pools (2025-26 to 2026-12-31) or opportunities (recommended from 2027-01-01).', 'T4.2.2', ['days_2025', 'opps_2027']),
  k(KEY.evalDaysFall, 'number', 'days', 'Fall evaluation days per school (33; 50 under the 2027 model).', 'T4.2.1'),
  k(KEY.personDaysSpring, 'number', 'days', 'Spring recruiting person days per school (140 April to May; 300 January to May under the 2027 model).', 'T4.2.2'),
  k(KEY.offcampusMax, 'number', 'count', 'Staff who may recruit off campus, head coach included (11; 17 under the fall 2026 waiver and the 2027 model).', 'T4.6.1'),
  k(KEY.hcCountsAgainstDays, 'boolean', undefined, 'The head coach\'s off-campus days count against the pools (true in 2025-26; false in the 2027 model).', 'T4.2.2'),
  k(KEY.hcSpringOffcampusAllowed, 'boolean', undefined, 'The head coach may recruit off campus in the spring period (false).', 'T4.6.1'),
  k(KEY.oppsSpring, 'number', 'count', 'Recruiting opportunities per prospect January to May (2027 model, 4).', 'T4.2.2'),
  k(KEY.oppsFall, 'number', 'count', 'Fall evaluation opportunities per prospect (2027 model, 1).', 'T4.2.2'),
  k(KEY.oppsPerWeek, 'number', 'count', 'Opportunities per prospect per Monday-to-Sunday week (2027 model, 1).', 'T4.2.2'),
  k(KEY.contactsPerWeek, 'number', 'count', 'In-person off-campus contacts per prospect per week in a contact period (1).', 'T4.2.1'),
  k(KEY.contactsTotal, 'number', 'count', 'Off-campus contacts per prospect in all (6).', 'T4.2.1'),
  k(KEY.callsPerWeek, 'number', 'count', 'Phone calls per prospect per week outside a contact period (1; unlimited in a contact period).', 'T4.2.1'),
  k(KEY.contactStartMonth, 'number', 'month', 'Off-campus contact may start: month (July).', 'T4.2.1'),
  k(KEY.contactStartDay, 'number', 'day', 'Off-campus contact may start: day of month (1).', 'T4.2.1'),
  k(KEY.contactStartYearsBefore, 'number', 'years', 'Off-campus contact may start: years before the class year (1, the summer before the senior year).', 'T4.2.1'),
  k(KEY.messageStartMonth, 'number', 'month', 'Private electronic messages may start: month (June).', 'T4.2.1'),
  k(KEY.messageStartDay, 'number', 'day', 'Private electronic messages may start: day of month (15).', 'T4.2.1'),
  k(KEY.messageStartYearsBefore, 'number', 'years', 'Private electronic messages may start: years before the class year (2, before the junior year).', 'T4.2.1'),
  k(KEY.callStartMonth, 'number', 'month', 'Phone calls may start: month (September).', 'T4.2.1'),
  k(KEY.callStartDay, 'number', 'day', 'Phone calls may start: day of month (1).', 'T4.2.1'),
  k(KEY.callStartYearsBefore, 'number', 'years', 'Phone calls may start: years before the class year (1, the senior year).', 'T4.2.1'),
  k(KEY.signeeCap, 'number', 'count', 'Yearly limit on signees, where a rule year has one (25 from 2017-18 until its removal; none from 2025-26).', 'T4.8.1'),
  k(KEY.officialPerSchool, 'number', 'count', 'Official visits a prospect may take to one school (1).', 'T4.5.1'),
  k(KEY.secondAfterHcChange, 'boolean', undefined, 'A second official visit to the same school is allowed after a head coach change (true).', 'T4.5.1'),
  k(KEY.visitMaxHours, 'number', 'hours', 'Longest official visit (48).', 'T4.5.1'),
  k(KEY.paidCompanions, 'number', 'count', 'Family members or companions the school may pay for on an official visit (2; 4 if the October 2026 proposal is adopted).', 'T4.5.1'),
  k(KEY.schoolCap, 'number', 'count', 'Official visits a school may host per recruiting year (70 in the 2022-23 and 2023-24 rule years of the top college subdivision; none from April 2024).', 'T4.5.1'),
  k(KEY.iawpWindowYears, 'number', 'years', 'A person associated with a prospect may not be hired from this many years before to this many after he enrols (2).', 'T4.4.2'),
  k(KEY.coreCourses, 'number', 'count', 'Core courses needed to qualify (16).', 'T4.5.3'),
  k(KEY.coreGpa, 'number', 'gpa', 'Lowest core grade average to qualify (2.3).', 'T4.5.3'),
  k(KEY.coreBeforeFinal, 'number', 'count', 'Core courses finished before the last year of high school (10).', 'T4.5.3'),
  k(KEY.coreBeforeFinalEms, 'number', 'count', 'Of those, courses in English, mathematics or science (7).', 'T4.5.3'),
  k(KEY.jucoNqTerms, 'number', 'count', 'Two-year transfer who was not a qualifier: full-time semesters at the two-year college (3).', 'T4.1.2'),
  k(KEY.jucoNqHours, 'number', 'hours', 'Two-year transfer who was not a qualifier: transferable semester hours (48).', 'T4.1.2'),
  k(KEY.jucoNqGraduate, 'boolean', undefined, 'Two-year transfer who was not a qualifier must graduate from the two-year college (true).', 'T4.1.2'),
  k(KEY.jucoQTerms, 'number', 'count', 'Two-year transfer who was a qualifier: full-time semesters (1).', 'T4.1.2'),
  k(KEY.jucoQHoursPerTerm, 'number', 'hours', 'Two-year transfer who was a qualifier: average transferable hours per term (12).', 'T4.1.2'),
  k(KEY.jucoGpa, 'number', 'gpa', 'Two-year transfer grade point minimum (2.5 before the June 2026 change, 2.0 after).', 'T4.1.2'),
  k(KEY.jucoSeasonsCount, 'boolean', undefined, 'Seasons at a two-year college count against the eligibility clock (owner T6.3.2, starting true).', 'T6.3.2'),
  k(KEY.windowYears, 'number', 'years', 'Years in the eligibility window (existing key, T5.2.1).', 'T5.2.1'),
  k(KEY.rosterLimit, 'number', 'count', 'Roster limit (existing key, T5.1.1).', 'T5.1.1'),
];

/** A rule value, or undefined when the rule set does not define it (the limit is then not applied). */
export function num(rules: RuleSet, key: string): number | undefined {
  return rules.keys().includes(key) ? rules.num(key) : undefined;
}
export function bool(rules: RuleSet, key: string, fallback: boolean): boolean {
  return rules.keys().includes(key) ? rules.bool(key) : fallback;
}
export function opt(rules: RuleSet, key: string): string | undefined {
  return rules.keys().includes(key) ? rules.opt(key) : undefined;
}

/** Keys this module reads that the rule set does not define. Shown on the budget panel as "rule value missing". */
export function missingKeys(rules: RuleSet): string[] {
  const have = new Set(rules.keys());
  return RULE_KEYS.map((r) => r.key).filter((key) => !have.has(key));
}
