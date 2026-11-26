// College discipline (L3.5.1) and the college locker room (L2.6.1). Under the school code model there is
// no fine schedule, no ladder, no predicate and no grievance; the coach's tools are the consequence menu,
// the school decides serious cases, and consistency carries the whole cost of uneven treatment.
// Mandatory minimums are school data (T9 school profile, key `mandatory_minimums[]`); the starting rows copy
// one published code (1 of 3 for the values, PARTIAL for existence) and may be generated only for generated
// people (L9.1.2 real-person guard).
import type { PersonOrigin } from '@gm/schema';
import { COLLEGE_CONSEQUENCES, type CollegeConsequence } from './rules.ts';
import { clamp, lp } from './params.ts';

export type DisciplineAuthority = 'coach_led' | 'director_led' | 'committee';
export type CaseClass = 'team_rule' | 'serious' | 'student_code';
export type Decider = 'head_coach' | 'athletic_director' | 'conduct_committee' | 'university_conduct_office';

/** Who decides a case (L3.5.1 decision layer). Every case shows its deciding authority. */
export function decider(caseClass: CaseClass, authority: DisciplineAuthority): Decider {
  if (caseClass === 'student_code') return 'university_conduct_office';
  if (caseClass === 'team_rule') return authority === 'director_led' ? 'athletic_director' : 'head_coach';
  return authority === 'coach_led' ? 'head_coach' : authority === 'director_led' ? 'athletic_director' : 'conduct_committee';
}

export interface MandatoryMinimum {
  readonly offenceKey: string;
  /** `suspend_all` = immediate suspension from all athletic activity; `withhold_share` = withheld from a share of the season. */
  readonly kind: 'suspend_all' | 'withhold_share';
  /** For `withhold_share`: share of the competition season, from school data. */
  readonly share?: number;
  readonly status: string;
}

/**
 * Starting school rows (L3.5.1 rules, one published code). School data, not rule keys: a school profile may
 * replace them. The share is the school's value, kept here only as the starting row the bible copies.
 */
export const STARTING_MINIMUMS: readonly MandatoryMinimum[] = [
  { offenceKey: 'felony_charge', kind: 'suspend_all', status: '1 of 3 (one school code, L3.5.1)' },
  { offenceKey: 'gambling', kind: 'suspend_all', status: '1 of 3 (one school code, L3.5.1)' },
  { offenceKey: 'weapon_possession', kind: 'suspend_all', status: '1 of 3 (one school code, L3.5.1)' },
  { offenceKey: 'criminal_sexual_conduct', kind: 'suspend_all', status: '1 of 3 (one school code, L3.5.1)' },
  { offenceKey: 'dui_charge', kind: 'withhold_share', share: 0.1, status: '1 of 3 (one school code, L3.5.1)' },
];

/** Mandatory-list offences can be generated for generated or designed people only (L3.5.1 acceptance, L9.1.2). */
export function mayGenerateMandatoryOffence(origin: PersonOrigin): boolean {
  return origin === 'generated' || origin === 'designed';
}

/** Games the minimum withholds, from the season's game count (rounded up so "at least" holds). */
export function minimumGames(m: MandatoryMinimum, seasonGames: number, remainingGames: number): number {
  if (m.kind === 'suspend_all') return remainingGames;
  return Math.min(remainingGames, Math.ceil(clamp(m.share ?? 0, 0, 1) * seasonGames));
}

/**
 * Whether a closing decision gives less than the school's minimum (L3.5.1): playing him anyway or not
 * reporting. That is the breakable act `school_mandatory_minimum_undercut` (acts.ts): warned, allowed, logged.
 */
export function undercutsMinimum(m: MandatoryMinimum, gamesWithheld: number, seasonGames: number, remainingGames: number, reportedToSchool: boolean): boolean {
  return !reportedToSchool || gamesWithheld < minimumGames(m, seasonGames, remainingGames);
}

/** Heavier of two consequences on the menu. */
export function heavier(a: CollegeConsequence, b: CollegeConsequence): CollegeConsequence {
  return COLLEGE_CONSEQUENCES.indexOf(a) >= COLLEGE_CONSEQUENCES.indexOf(b) ? a : b;
}

/** Aid reduction or non-renewal memory (L3.5.1): -30, half-life 104 weeks, witnessed by the whole room; a transfer trigger. */
export function aidReductionMemory(): { readonly strength: number; readonly halfLifeWeeks: number; readonly witnesses: 'room'; readonly transferTrigger: true } {
  return { strength: lp('college.scholarshipMemory'), halfLifeWeeks: lp('college.scholarshipHalfLifeWeeks'), witnesses: 'room', transferTrigger: true };
}

// ---- L2.6.1 the college room ----

/** Tie penalty a mid-year transfer carries with holdovers ("hired gun"), fading linearly over 10 weeks. */
export function hiredGunTie(weeksSinceArrival: number): number {
  const n = lp('college.hiredGunWeeks');
  if (weeksSinceArrival >= n) return 0;
  return lp('college.hiredGunTie') * (1 - clamp(weeksSinceArrival, 0, n) / n);
}

/** Tie penalty between a highly paid newcomer and unpaid veterans in the same room when the gap is known (-10, halved if he performs). */
export function payGapTie(gapKnown: boolean, sameRoom: boolean, newcomerPerforms: boolean): number {
  if (!gapKnown || !sameRoom) return 0;
  return lp('college.payGapTie') * (newcomerPerforms ? lp('college.payGapPerformKeep') : 1);
}
