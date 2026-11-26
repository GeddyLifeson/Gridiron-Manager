// Academic standing (T5.3.1), class load (T8.3.1), and the academic shortcuts (T5.3.2). The checks read
// the year-stamped `academic.*` rule values; how a term goes is a tuned model (params.json).
import { possible, type PersonOrigin } from '@gm/schema';
import type { CollegeRules } from './keys.ts';
import { clamp01, param, U } from './params.ts';
import { mayCarryPersonalEvent, type Stream } from './types.ts';

export type Term = 'fall' | 'spring';
export type Standing = 'good' | 'watch' | 'at_risk' | 'ineligible';
export type AcademicFailure = 'term_hours' | 'fall_rule' | 'year_hours' | 'first_year_hours' | 'degree_progress' | 'gpa';

export interface TermCheckInput {
  readonly term: Term;
  readonly hoursPassedThisTerm: number;
  /** Spring checks: hours passed since the start of the previous fall, summer excluded. */
  readonly hoursSincePreviousFall: number;
  /** Spring checks: total hours passed before the year about to start (the 24-hour rule before year 2). */
  readonly totalHours: number;
  /** The academic year about to start (1 = first year). */
  readonly yearAboutToStart: number;
  readonly degreeProgressPct: number;
  readonly gpa: number;
}

export interface TermCheckResult {
  /** May play next term. */
  readonly eligibleNextTerm: boolean;
  /** Games missed at the start of the next season (football fall rule). A suspension, not a lost season. */
  readonly gamesSuspendedNextSeason: number;
  readonly failures: readonly AcademicFailure[];
}

/** The checks after a term (T5.3.1 rules 2 to 6). Rule sets without academic keys never fail a player. */
export function termCheck(i: TermCheckInput, rules: CollegeRules): TermCheckResult {
  const a = rules.academic;
  if (!a) return { eligibleNextTerm: true, gamesSuspendedNextSeason: 0, failures: [] };
  const fail: AcademicFailure[] = [];
  let games = 0;
  if (i.hoursPassedThisTerm < a.termMinHours) fail.push('term_hours');
  if (i.term === 'fall' && i.hoursPassedThisTerm < a.fallMinHours) { fail.push('fall_rule'); games = a.fallRuleGames; }
  if (i.term === 'spring') {
    if (i.hoursSincePreviousFall < a.yearMinHours) fail.push('year_hours');
    if (i.yearAboutToStart === U.secondYear && i.totalHours < a.firstYearMinHours) fail.push('first_year_hours');
    if (i.yearAboutToStart >= U.firstProgressYear) {
      const idx = Math.min(i.yearAboutToStart - U.firstProgressYear, a.progressPct.length - 1);
      if (i.degreeProgressPct < a.progressPct[idx]!) fail.push('degree_progress');
    }
    if (i.yearAboutToStart >= U.firstGpaYear) {
      const idx = Math.min(i.yearAboutToStart - U.firstGpaYear, a.gpa.length - 1);
      if (i.gpa < a.gpa[idx]!) fail.push('gpa');
    }
  }
  // The fall rule alone is a suspension; every other failure removes him for the next term.
  const blocking = fail.filter((f) => f !== 'fall_rule');
  return { eligibleNextTerm: blocking.length === 0, gamesSuspendedNextSeason: games, failures: fail };
}

export interface TermInput {
  /** D4 academic aptitude, 0 to 1. */
  readonly aptitude: number;
  /** D5 diligence, 0 to 1. */
  readonly diligence: number;
  /** Assigned study hours a week (study hall). */
  readonly studyHoursWeek: number;
  /** Tutoring and academic staff quality, 0 to 1 (T9 budget). */
  readonly support: number;
  /** Weekly load above the player's limit, in hours (T8.3.1 rule 3); 0 if none. */
  readonly overloadHoursWeek: number;
  /** Share of an overload that falls on grades rather than football learning, 0 to 1 (his own priority). */
  readonly gradesPriorityShare: number;
}

/** Expected share of attempted hours passed in a term (T5.3.1 "standing moves by aptitude, diligence, study hours and support"). */
export function expectedPassShare(i: TermInput): number {
  const study = Math.min(i.studyHoursWeek, param('termStudyHoursCap'));
  const overload = i.overloadHoursWeek > 0 ? param('termOverloadPenalty') * i.gradesPriorityShare * Math.min(1, i.overloadHoursWeek / param('loadLimitHoursWeek')) : 0;
  return possible(param('termPassBase') + param('termPassAptitude') * i.aptitude + param('termPassDiligence') * i.diligence
    + param('termPassPerStudyHour') * study + param('termPassSupport') * i.support - overload);
}

/** The standing shown on the card from the expected share (the T5.3.1 four labels; ineligible comes from `termCheck`). */
export function standingFor(passShare: number, eligible = true): Standing {
  if (!eligible) return 'ineligible';
  if (passShare >= param('standingGoodAbove')) return 'good';
  if (passShare >= param('standingWatchAbove')) return 'watch';
  return 'at_risk';
}

/** A term's hours passed: full-time load times the expected share plus spread. Imported people always pass a full load. */
export function playTerm(i: TermInput, origin: PersonOrigin, rules: CollegeRules, rng: Stream): number {
  const full = rules.academic?.fullTimeHours ?? 0;
  if (!mayCarryPersonalEvent(origin)) return full;
  const noise = (rng.uniform() + rng.uniform() - 1) * param('termPassNoise');
  return Math.round(full * clamp01(expectedPassShare(i) + noise));
}

/** T5.3.1 rule 7: one row per player-term. */
export interface TeamRateRow { readonly stayedEligible: boolean; readonly stayedOrGraduated: boolean }

/** Team academic rate on the rule set's scale (each player-term earns one for eligibility and one for retention). */
export function teamAcademicRate(rows: readonly TeamRateRow[], rules: CollegeRules): number | null {
  const a = rules.academic;
  if (!a || rows.length === 0) return null;
  const earned = rows.reduce((n, r) => n + Number(r.stayedEligible) + Number(r.stayedOrGraduated), 0);
  return Math.round((earned / (rows.length * U.termCreditsPerPlayer)) * a.teamRateMax);
}

/** A multi-year rate below the line makes the team ineligible for the postseason (blocked by the governing body). */
export function postseasonAllowedByRate(multiYearRate: number | null, rules: CollegeRules): boolean {
  const a = rules.academic;
  return !a || multiYearRate === null || multiYearRate >= a.teamRatePostseasonMin;
}

export interface WeeklyLoad {
  readonly classStudyHours: number;
  readonly footballHours: number;
  readonly total: number;
  readonly overloadHours: number;
}

/** T8.3.1: class and study hours plus required football hours against the player's limit. */
export function weeklyLoad(footballHours: number, selectiveSchool: boolean): WeeklyLoad {
  const cls = param('classStudyHoursWeek') + (selectiveSchool ? param('selectiveExtraHoursWeek') : 0);
  const total = cls + footballHours;
  return { classStudyHours: cls, footballHours, total, overloadHours: Math.max(0, total - param('loadLimitHoursWeek')) };
}
