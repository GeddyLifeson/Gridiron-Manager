// Pro scouts at a college program (T11.2.1). The college coach answers scouts about his players: full honesty,
// talk him up, or decline. Each answer is logged (X2). An honest answer narrows the pro team's band on what film
// cannot show; talking a player up helps him now, and scouts discount that coach's future reports once his
// record shows it. The accuracy record is computed from logged statements against later outcomes, never set.
import type { WorldDate } from '@gm/schema';
import type { Contributor, EvidenceItem } from '../scouting/index.ts';
import { p } from './params.ts';

export const REPORT_CHOICES = ['honest', 'talk_up', 'decline'] as const;
export type ReportChoice = (typeof REPORT_CHOICES)[number];

/** One logged answer to one scout about one attribute or item (T11.2.1 "each answer is logged"). */
export interface CoachStatement {
  readonly coachId: number;
  readonly scoutTeamId: number;
  readonly playerId: number;
  readonly attribute: string;
  readonly date: WorldDate;
  readonly choice: ReportChoice;
  /** What the coach said, in ISS, or null when he declined. */
  readonly stated: number | null;
}

/**
 * What the coach says (T11.2.1 decision). `coachBelief` is the coach's own estimate mean of the player (D6 with
 * his own error), never the true value: an honest coach can still be wrong.
 */
export function makeStatement(input: Omit<CoachStatement, 'stated'> & { readonly coachBelief: number }): CoachStatement {
  const { coachBelief, ...rest } = input;
  const stated = input.choice === 'decline' ? null : input.choice === 'talk_up' ? coachBelief + p('report.talkUpIss') : coachBelief;
  return { ...rest, stated };
}

/** A coach's accuracy record (T11.2.1 rule 2), from statements with a resolved outcome. */
export interface AccuracyRecord {
  readonly count: number;
  readonly meanAbsError: number;
  /** Times an injury he hid later surfaced to a scout who had asked (edge case). */
  readonly hiddenInjuriesSurfaced: number;
}

/**
 * Builds the record from logged statements. `outcomeOf` returns the scouting organisation's settled estimate of
 * the player's attribute once pro evidence has accumulated (or null while unresolved). It is an estimate held by
 * scouts, never the true value, so a coach is judged the way real scouts judge him.
 */
export function accuracyRecord(
  statements: readonly CoachStatement[],
  outcomeOf: (playerId: number, attribute: string) => number | null,
  hiddenInjuriesSurfaced = 0,
): AccuracyRecord {
  let n = 0;
  let sum = 0;
  for (const s of statements) {
    if (s.stated === null) continue;
    const o = outcomeOf(s.playerId, s.attribute);
    if (o === null) continue;
    const e = s.stated - o;
    sum += e < 0 ? -e : e;
    n += 1;
  }
  return { count: n, meanAbsError: n === 0 ? p('report.priorErrorIss') : sum / n, hiddenInjuriesSurfaced };
}

/**
 * Variance scouts put on one statement by this coach (T11.2.1 rule 2, AI use): his record's mean absolute error,
 * shrunk toward a neutral prior while the record is short, read as a normal error sd; times the hidden-injury
 * penalty for each surfaced case. An honest coach who knows his players earns a tight variance; a coach who talks
 * players up earns a wide one, so his words stop moving grades.
 */
export function statementVariance(record: AccuracyRecord): number {
  const k = p('report.recordPriorCount');
  const err = (k * p('report.priorErrorIss') + record.count * record.meanAbsError) / (k + record.count);
  const sd = err * p('report.maeToSd');
  let v = sd * sd;
  for (let i = 0; i < record.hiddenInjuriesSurfaced; i += 1) v *= p('report.hiddenInjuryPenalty');
  return v;
}

/** Statement variance relative to a coach with no record (1 = neutral), for scout AI weighting and display. */
export function trustMultiplier(record: AccuracyRecord): number {
  return statementVariance(record) / statementVariance({ count: 0, meanAbsError: p('report.priorErrorIss'), hiddenInjuriesSurfaced: 0 });
}

/**
 * Practice and film access (T11.2.1 rule 3): an open program gives scouts better information. Multiplies the
 * variance of evidence gathered on a visit.
 */
export function accessVarianceMultiplier(openAccess: boolean): number {
  return openAccess ? 1 - p('report.openAccessGain') : 1;
}

/**
 * A statement as evidence for the scouting organisation (T11.2.1 rule 1), with the variance his record earns.
 * A declined answer gives no evidence. The scouts cannot tell an honest answer from a talked-up one: only the
 * record separates them. On items film cannot show (character, work habits, medical) this is most of what the
 * pro team learns.
 */
export function statementEvidence(s: CoachStatement, record: AccuracyRecord, coach: Contributor): EvidenceItem | null {
  if (s.stated === null) return null;
  return { attribute: s.attribute, value: s.stated, variance: statementVariance(record), units: 1, date: s.date, evaluator: coach };
}

/** Time cost of a scout visit for the coach (T11.2.1 rule 4, E7). */
export function visitHours(role: 'head_coach' | 'position_coach'): number {
  return role === 'head_coach' ? p('report.visitHoursHeadCoach') : p('report.visitHoursPositionCoach');
}
