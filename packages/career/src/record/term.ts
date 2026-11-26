// What a formula uses when the coach is the user (E9.1.3). Many formulas carry a "coach term". For an AI
// coach it is his hidden K2 parameter. For the user it is his actual work, never a skill value. The
// signature takes no history, labels, reputation, age or seasons (rule 4), so a first-year and a
// twentieth-year career given the same task inputs get the same term (acceptance 2).
import { param } from './params.ts';

/** The scale the AI parameter uses in the calling formula (its own units). */
export interface TermScale { readonly min: number; readonly max: number }

export type TermInput =
  /** An AI coach: his K2 parameter on the scale (E9.1.3 AI use). */
  | { readonly by: 'ai'; readonly parameter: number }
  /** The user delegated the task: the delegate's parameter applies (E9.1.3 edge case, E7.3.1). */
  | { readonly by: 'delegate'; readonly parameter: number }
  /** Case 1: the user performed the task by hand; the result is what he produced, passed through. */
  | { readonly by: 'user'; readonly case: 1; readonly produced: number }
  /**
   * Case 2: part of the task cannot be done by hand. Each entry is one of his choices checked against
   * something true in the save (method matched to learning style, drill aimed at the right weakness, ...).
   */
  | { readonly by: 'user'; readonly case: 2; readonly checks: readonly boolean[] }
  /** Case 3: nothing in the task can be checked. */
  | { readonly by: 'user'; readonly case: 3 };

function clampTo(s: TermScale, v: number): number { return Math.min(s.max, Math.max(s.min, v)); }

/** E9.1.3 rule 3: one constant for every user and every career, the middle of the AI scale. */
export function userTermConstant(s: TermScale): number { return s.min + param('userTermPosition') * (s.max - s.min); }

/** Share of case 2 checks satisfied; null when there were none (the task falls to case 3). */
export function checkShare(checks: readonly boolean[]): number | null {
  if (checks.length === 0) return null;
  return checks.filter(Boolean).length / checks.length;
}

/** The coach term for a calling formula. Case 1 is returned as produced (it is not on the scale). */
export function coachTerm(input: TermInput, s: TermScale): number {
  switch (input.by) {
    case 'ai':
    case 'delegate':
      return clampTo(s, input.parameter);
    case 'user':
      switch (input.case) {
        case 1: return input.produced;
        case 2: {
          const share = checkShare(input.checks);
          return share === null ? userTermConstant(s) : s.min + share * (s.max - s.min);
        }
        case 3: return userTermConstant(s);
      }
  }
}

/** Calling leaves must name a case (E9.1.3 acceptance 3). A registry row says which case a leaf uses. */
export interface TermCaseRow { readonly leaf: string; readonly term: string; readonly userCase: 1 | 2 | 3 }

/** E9.6.1 rule 3 leaves and the case each names, as the bible states them. */
export const TERM_CASES: readonly TermCaseRow[] = [
  { leaf: 'H2.6.3', term: 'film tagging accuracy', userCase: 1 },
  { leaf: 'H6.6.2', term: 'evaluation grade', userCase: 1 },
  { leaf: 'I10.4.1', term: 'press answer', userCase: 1 },
  { leaf: 'B13.11.1', term: 'rules knowledge at a new level', userCase: 1 },
  { leaf: 'S6.4.1', term: 'interview answers', userCase: 1 },
  { leaf: 'H3.5.1', term: 'drill aimed at the weakness', userCase: 2 },
  { leaf: 'H4.4.1', term: 'meeting teaching method', userCase: 2 },
  { leaf: 'S3.5.1', term: 'position coach teaching', userCase: 2 },
  { leaf: 'S5.2.2', term: 'game-day duty below head coach', userCase: 2 },
  { leaf: 'S10.1.1', term: 'a duty never played', userCase: 3 },
];
