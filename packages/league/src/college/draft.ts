// Leaving for the draft (T8.5.1) and bowl opt-outs (T8.5.2). Declaring is refused after the deadline
// (the league does not accept it) and for a player with too few years since high school; a declaration
// ends college eligibility. What a draft slot is worth comes from the caller (G-34 rookie scale, T11).
import type { PersonOrigin } from '@gm/schema';
import { dayNumber } from '../calendar/date.ts';
import type { EligibilityRecord } from './eligibility.ts';
import type { CollegeRules } from './keys.ts';
import { clamp01, param } from './params.ts';
import { mayCarryPersonalEvent, type Day } from './types.ts';

/** Years since high school graduation at the draft (T8.5.1 rule 1). */
export function yearsFromHighSchool(highSchoolGradYear: number, draftYear: number): number {
  return draftYear - highSchoolGradYear;
}

export function draftEligibleByYears(highSchoolGradYear: number, draftYear: number, rules: CollegeRules): boolean {
  const d = rules.draft;
  return d !== null && yearsFromHighSchool(highSchoolGradYear, draftYear) >= d.minYearsFromHighSchool;
}

/** The early-entry deadline for a draft year; players in the title game get the later day (T8.5.1 rule 2). */
export function declarationDeadline(draftYear: number, inTitleGame: boolean, rules: CollegeRules): Day | null {
  const d = rules.draft;
  if (!d) return null;
  return dayNumber({ y: draftYear, m: d.deadlineMonth, d: inTitleGame ? d.titleGameDeadlineDay : d.deadlineDay });
}

export type DeclareVerdict =
  | { readonly ok: true; readonly record: EligibilityRecord }
  | { readonly ok: false; readonly reason: 'too_early_from_high_school' | 'after_deadline' | 'no_draft_rules' | 'already_declared' };

/** Files a declaration. On success college eligibility ends (T8.5.1 rule 5). */
export function declare(rec: EligibilityRecord, highSchoolGradYear: number, draftYear: number, day: Day, inTitleGame: boolean, rules: CollegeRules): DeclareVerdict {
  const deadline = declarationDeadline(draftYear, inTitleGame, rules);
  if (deadline === null) return { ok: false, reason: 'no_draft_rules' };
  if (rec.declared && !rec.returnedUndrafted) return { ok: false, reason: 'already_declared' };
  if (!draftEligibleByYears(highSchoolGradYear, draftYear, rules)) return { ok: false, reason: 'too_early_from_high_school' };
  if (day > deadline) return { ok: false, reason: 'after_deadline' };
  return { ok: true, record: { ...rec, declared: true, returnedUndrafted: false } };
}

/** After the draft: an undrafted early entrant may return only if the rule set allows it (starting value no). */
export function afterDraft(rec: EligibilityRecord, drafted: boolean, rules: CollegeRules): EligibilityRecord {
  if (drafted || !rec.declared || !rules.draft?.undraftedMayReturn) return rec;
  return { ...rec, returnedUndrafted: true };
}

export type CoachAdvice = 'honest_read' | 'push_to_stay' | 'none';

export interface StayOrGoInput {
  /** Expected value of his projected draft slot over the rookie deal (USD), from G-34 and the T11 grade. */
  readonly expectedDraftValue: number;
  /** One more year of roster money offered (T7), plus his outside deals. */
  readonly stayMoney: number;
  /** Value he puts on one more year of development and the degree, in USD (from T11 and D7). */
  readonly stayDevelopmentValue: number;
  /** Chance of a serious injury next season, 0 to 1 (D11). */
  readonly injuryRisk: number;
  readonly advice: CoachAdvice;
  /** L1 tie with the head coach, 0 to 1. */
  readonly coachTie: number;
}

/**
 * T8.5.1 rule 3: the chance he declares, from the ratio of draft value to the value of staying, nudged
 * by injury risk and by a coach who pushes him to stay. Because players can be paid in college, more
 * mid-round players stay: stay money sits in the denominator.
 */
export function declareChance(i: StayOrGoInput): number {
  const stay = Math.max(1, i.stayMoney + i.stayDevelopmentValue);
  const ratio = i.expectedDraftValue / stay;
  const lo = param('declareRatioLow'), hi = param('declareRatioHigh');
  let p = clamp01((ratio - lo) / (hi - lo)) + param('declareInjuryRisk') * clamp01(i.injuryRisk);
  if (i.advice === 'push_to_stay') p -= param('declareCoachPull') * clamp01(i.coachTie);
  return clamp01(p);
}

/** T8.5.2: chance he skips a bowl. Near zero in playoff games; imported people play as the depth chart says. */
export function optOutChance(projectedRound: number | null, playoffGame: boolean, origin: PersonOrigin): number {
  if (!mayCarryPersonalEvent(origin)) return 0;
  if (playoffGame) return param('optOutPlayoff');
  if (projectedRound !== null && projectedRound <= param('topRounds')) return param('optOutTopTwoRounds');
  return projectedRound === null ? 0 : param('optOutLaterRounds');
}
