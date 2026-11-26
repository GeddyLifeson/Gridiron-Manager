// K2.8.2: the one procedure by which any AI person decides to break a rule, and K6.6.1: a staff member
// asked by his boss. The user never passes through here: he chooses, and his act enters `commitAct`
// exactly as an AI act does (K2.8.2 rule 6). `ruleRespect` is read through the people module's one
// accessor (K2.8.1) by the caller and passed in as a z value; league may not import people (P1.2.1).
import type { PersonOrigin, WorldDate } from '@gm/schema';
import { violationClass } from './catalogue.ts';
import { P } from './params.ts';
import { weeksBetween } from './dates.ts';
import type { ComplianceState, StreamFor } from './types.ts';

/** An opportunity raised by the owning leaf (K2.8.2 inputs). */
export interface Opportunity {
  readonly classId: string;
  /** Estimated gain on the common 0 to 1 desirability scale, converted by the leaf. */
  readonly gain: number;
  /** The person's belief about the detection chance, 0 to 1. */
  readonly pDetectPerceived: number;
  /** The person's belief about the penalty, on the same desirability scale. */
  readonly penaltyPerceived: number;
}

/** What K2.8.2 reads about the person. Hidden truth: never shown. */
export interface Disposition {
  readonly personId: number;
  readonly origin: PersonOrigin;
  /** z of K2.8.1 `ruleRespect`. */
  readonly ruleRespectZ: number;
  /** X1 `risk_tolerance`, 0 to 100. */
  readonly riskTolerance: number;
  /** X1 `candor`, 0 to 100. */
  readonly candor: number;
  /** E4 job security and X5 need state, 0 to 1. */
  readonly pressure: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** K2.8.2 rule 1: score = gain (1 + pressure) - pDetect penalty (1 + w riskAversion) - (t0 + t1 z). */
export function violationScore(opp: Opportunity, d: Disposition, extraPressure = 0): number {
  const c = violationClass(opp.classId);
  const gain = clamp(opp.gain, 0, P('gain_cap'));
  const pressure = clamp(d.pressure + extraPressure, 0, P('pressure_cap'));
  const riskAversion = 1 - clamp(d.riskTolerance, 0, P('facet_max')) / P('facet_max');
  const threshold = c.threshold.t0 + c.threshold.t1 * d.ruleRespectZ;
  return gain * (1 + pressure) - clamp(opp.pDetectPerceived, 0, 1) * Math.max(0, opp.penaltyPerceived) * (1 + P('risk_aversion_weight') * riskAversion) - threshold;
}

export type DecisionReason = 'commit' | 'protected_person' | 'score' | 'cooldown' | 'rate_limit';

/**
 * K2.8.2 rules 1 to 3. Commits when the score is positive, the person has not committed this type within
 * the cooldown, and a draw from stream `conduct` passes the per-type rate limiter.
 */
export function decideViolation(
  state: ComplianceState, opp: Opportunity, d: Disposition, date: WorldDate, conduct: StreamFor, extraPressure = 0,
): { readonly commit: boolean; readonly score: number; readonly reason: DecisionReason } {
  if (d.origin === 'imported') return { commit: false, score: 0, reason: 'protected_person' };
  const score = violationScore(opp, d, extraPressure);
  if (score <= 0) return { commit: false, score, reason: 'score' };
  const recent = state.log.some((r) => r.actor.personId === d.personId && r.classId === opp.classId
    && weeksBetween(r.date, date) >= 0 && weeksBetween(r.date, date) < P('cooldown_weeks'));
  if (recent) return { commit: false, score, reason: 'cooldown' };
  const pass = conduct([date.seasonYear, date.dayIndex, d.personId, opp.classId]).chance(P('conduct_draw_pass'));
  return { commit: pass, score, reason: pass ? 'commit' : 'rate_limit' };
}

export type RequestOutcome = 'complied' | 'refused' | 'reported';

/**
 * K6.6.1 rule 2 (and K2.8.2 edge case): a boss asks a staff member for the act. The request is added
 * pressure; he may still refuse, and one with high `ruleRespect` and high `candor` may report it.
 * A refusal is a permanent memory row for X6 (the caller writes it).
 */
export function staffRequest(
  state: ComplianceState, opp: Opportunity, staff: Disposition, date: WorldDate, conduct: StreamFor,
): { readonly outcome: RequestOutcome; readonly score: number } {
  const d = decideViolation(state, opp, staff, date, conduct, P('staff_request_pressure'));
  // Asked directly, the rate limiter does not apply: only character, gain and risk decide.
  if (d.commit || d.reason === 'rate_limit' || d.reason === 'cooldown') return { outcome: 'complied', score: d.score };
  const mayReport = staff.origin !== 'imported' && staff.candor >= P('report_candor_min') && staff.ruleRespectZ >= P('report_rule_respect_z_min');
  const reports = mayReport && conduct(['report', date.seasonYear, date.dayIndex, staff.personId, opp.classId]).chance(P('report_chance'));
  return { outcome: reports ? 'reported' : 'refused', score: d.score };
}
