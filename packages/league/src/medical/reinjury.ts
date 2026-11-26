// Coming back (D11.6.1): the re-injury multiplier and its decay, the physical penalty after clearance,
// and the long recovery curve of major injuries. The engine (WP-22) multiplies its injury checks by
// `reinjuryMultiplier` for the same region.
import { P } from './params.ts';
import type { MedicalCase } from './types.ts';

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));

/**
 * Same-region multiplier `daysSinceCleared` days after clearance: 3.0 on day one, 1.3 after 6 weeks, then
 * the permanent value (1.15 soft tissue). Returning before the true recovery point multiplies by 1.5.
 */
export function reinjuryMultiplier(daysSinceCleared: number, softTissue: boolean, earlyReturn: boolean): number {
  const permanent = softTissue ? P('reinjuryPermanentSoftTissue') : P('reinjuryPermanentOther');
  const d1 = P('reinjuryDecayDays');
  const m = daysSinceCleared <= d1
    ? lerp(P('reinjuryDayOne'), P('reinjuryAfterDecay'), daysSinceCleared / d1)
    : lerp(P('reinjuryAfterDecay'), permanent, (daysSinceCleared - d1) / P('reinjurySecondDecayDays'));
  return earlyReturn ? m * P('earlyReturnMultiplier') : m;
}

/** Multiplier for a case on a day; 1 while the player is not cleared (he is not exposed). */
export function caseMultiplier(c: MedicalCase, day: number): number {
  if (c.clearedDay === null) return 1;
  return reinjuryMultiplier(day - c.clearedDay, c.softTissue, c.earlyReturn);
}

/** Soft-tissue speed and acceleration penalty after clearance: 3 percent, gone after 3 weeks of full practice. */
export function returnSpeedPenalty(softTissue: boolean, fullPracticeDays: number): number {
  if (!softTissue) return 0;
  return lerp(P('returnSpeedPenalty'), 0, fullPracticeDays / P('returnPenaltyDays'));
}

/** Major injuries: 70 percent of the new level at return, 100 percent after `fullAfterDays` (D8.3.2 row months). */
export function majorRecoveryLevel(daysSinceReturn: number, fullAfterDays: number): number {
  return fullAfterDays > 0 ? lerp(P('majorReturnLevel'), 1, daysSinceReturn / fullAfterDays) : 1;
}
