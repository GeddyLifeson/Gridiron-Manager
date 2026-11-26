// S3.3.4 the graduate assistant seat: hiring window, enrolment each term, term limit and the third year.
// Bylaw values are rule keys (keys.ts); a level whose rule set holds none (the pro coaching assistant) has no
// classes and no term limit. Hiring outside the window is allowed and logged as a violation (INDEX rule 4,
// L8.2.5), never blocked.
import type { GaRules } from './keys.ts';
import { param } from './params.ts';

export interface GaHireCheck {
  readonly allowed: true;
  /** True when the hire breaks the degree window: the act is logged for L8.2.5 detection. */
  readonly violation: boolean;
  readonly yearsSinceDegree: number;
}

/** S3.3.4 rule 1: the window runs from the later of the degree and the end of football eligibility. */
export function checkGaHire(rules: GaRules, degreeYear: number, eligibilityEndYear: number | null, hireYear: number): GaHireCheck {
  const start = Math.max(degreeYear, eligibilityEndYear ?? degreeYear);
  const years = hireYear - start;
  return { allowed: true, violation: rules.degreeWindowYears !== null && years > rules.degreeWindowYears, yearsSinceDegree: years };
}

/** Credit hours a graduate assistant must carry each term (S3.3.4 rule 2); null when the level has no rule. */
export function requiredCredits(rules: GaRules, schoolFullTimeLoad: number = param('enrol.fullTimeGradLoad')): number | null {
  return rules.minLoadShare === null ? null : rules.minLoadShare * schoolFullTimeLoad;
}

export interface GaSeatState {
  readonly termsServed: number;
  readonly creditsCompleted: number;
  /** Years the seat runs before the next renewal check, starting at the term years. */
  readonly yearsGranted: number | null;
  readonly status: 'active' | 'lost_enrolment' | 'term_ended';
}

export const newGaSeat = (rules: GaRules): GaSeatState =>
  ({ termsServed: 0, creditsCompleted: 0, yearsGranted: rules.termYears, status: 'active' });

/** Credits he completes in a term: he must put in the weekly class and study hours in proportion to the load he takes. */
export function creditsCompleted(creditsTaken: number, courseworkHoursPerWeek: number, rules: GaRules, schoolFullTimeLoad?: number): number {
  const req = requiredCredits(rules, schoolFullTimeLoad);
  if (req === null || req <= 0) return creditsTaken;
  const hoursNeeded = (param('enrol.courseworkHoursPerWeek') * creditsTaken) / req;
  if (hoursNeeded <= 0) return creditsTaken;
  return courseworkHoursPerWeek >= hoursNeeded ? creditsTaken : Math.floor(creditsTaken * (courseworkHoursPerWeek / hoursNeeded));
}

export type TermOutcome = 'kept' | 'lost_enrolment' | 'term_ended' | 'extended';

/**
 * End one term. Short of the load: the seat is lost at term's end. At the end of the granted years: a third year
 * if the extension hours are done and the maximum allows, otherwise the seat ends (S3.3.4 rule 3).
 */
export function endTerm(state: GaSeatState, rules: GaRules, creditsDone: number, schoolFullTimeLoad?: number): { state: GaSeatState; outcome: TermOutcome } {
  if (state.status !== 'active') return { state, outcome: state.status };
  const req = requiredCredits(rules, schoolFullTimeLoad);
  const termsServed = state.termsServed + 1;
  const credits = state.creditsCompleted + creditsDone;
  if (req !== null && creditsDone < req) return { state: { ...state, termsServed, creditsCompleted: credits, status: 'lost_enrolment' }, outcome: 'lost_enrolment' };
  const next = { ...state, termsServed, creditsCompleted: credits };
  if (state.yearsGranted === null) return { state: next, outcome: 'kept' };
  const perYear = param('enrol.termsPerYear');
  if (termsServed < state.yearsGranted * perYear) return { state: next, outcome: 'kept' };
  const canExtend = rules.extensionSemesterHours !== null && rules.maxYears !== null
    && credits >= rules.extensionSemesterHours && state.yearsGranted < rules.maxYears;
  if (canExtend) return { state: { ...next, yearsGranted: state.yearsGranted + 1 }, outcome: 'extended' };
  return { state: { ...next, status: 'term_ended' }, outcome: 'term_ended' };
}
