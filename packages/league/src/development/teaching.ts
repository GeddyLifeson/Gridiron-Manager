// The teaching multiplier (D7.3.1) and coaching points (D7.3.2).
import { num, type DevNumbers } from './params.ts';

export interface TeachingInput {
  /** Teaching term 0 to 100: the AI coach's K2 parameter, or `userTeachingTerm` for the user. */
  readonly term: number;
  /** The coach's technique speciality covers this attribute (always true for the user, D7.3.1). */
  readonly specialityCovers: boolean;
  /** Players per coach in the drill (a graduate assistant lowers it). */
  readonly playersPerCoach: number;
  /** 0 to 1: how far the player trusts this coach (L1). 1 adds the full relationship bonus. */
  readonly trust: number;
}

/** D7.3.1: 1 + 0.15 x ((term - 50) / 50) x fit x attention, plus up to 0.02 for trust, kept to 0.85..1.15. */
export function teachingMultiplier(n: DevNumbers, t: TeachingInput): number {
  const swing = num(n, 'teaching.swing');
  const fit = t.specialityCovers ? 1 : num(n, 'teaching.offSpecialityFit');
  const fullAt = num(n, 'teaching.attentionFullAt');
  const floorAt = num(n, 'teaching.attentionFloorAt');
  const floor = num(n, 'teaching.attentionFloor');
  const over = Math.min(1, Math.max(0, (t.playersPerCoach - fullAt) / (floorAt - fullAt)));
  const attention = 1 - (1 - floor) * over;
  const raw = 1 + swing * ((t.term - num(n, 'teaching.termMid')) / num(n, 'teaching.termHalfRange')) * fit * attention
    + num(n, 'teaching.relationshipBonus') * Math.min(1, Math.max(0, t.trust));
  return Math.min(1 + swing, Math.max(1 - swing, raw));
}

/** A room with no position coach (D7.3.1 edge case). */
export function vacancyMultiplier(n: DevNumbers): number {
  return 1 - num(n, 'teaching.swing');
}

/**
 * The user's teaching term (D7.3.1, E9.1.3): 25 + 50 x the share of checks his choices passed, judged
 * against hidden truth. `null` when nothing in the room could be checked gives the constant 50. The
 * top of the scale stays out of reach (ceiling 75).
 */
export function userTeachingTerm(n: DevNumbers, shareOfChecksPassed: number | null): number {
  if (shareOfChecksPassed === null) return num(n, 'teaching.userConstant');
  const lo = num(n, 'teaching.userFloor');
  const hi = num(n, 'teaching.userCeiling');
  return lo + (hi - lo) * Math.min(1, Math.max(0, shareOfChecksPassed));
}

/** D5.3.1 linear trait effect: 1 + swing x (facet - 50) / 50, so x(1 - swing) to x(1 + swing). */
export function traitMultiplier(n: DevNumbers, facet: number | undefined, swing: number): number {
  const v = facet ?? num(n, 'trait.facetMid');
  const z = Math.min(1, Math.max(-1, (v - num(n, 'trait.facetMid')) / num(n, 'trait.facetHalfRange')));
  return 1 + swing * z;
}

/**
 * Effective reps toward an attribute with a coaching point (D7.3.2): reps x (1 + (2 - 1) x coachability
 * multiplier x share), up to the weekly cap. With more than 3 active points the total bonus stays that
 * of 3, split evenly (share = 3 / points).
 */
export function pointReps(n: DevNumbers, reps: number, coachability: number, activePoints: number): number {
  const limit = num(n, 'point.normalLimit');
  const share = activePoints <= limit ? 1 : limit / activePoints;
  const mult = num(n, 'point.repMultiplier');
  return Math.min(Math.max(reps, num(n, 'point.repCap')), reps * (1 + (mult - 1) * coachability * share));
}

/** Processing load factor from points beyond the normal limit (D7.3.2 edge case, read by D4.1.2). */
export function pointProcessingLoad(n: DevNumbers, activePoints: number): number {
  return 1 + num(n, 'point.extraProcessingLoad') * Math.max(0, activePoints - num(n, 'point.normalLimit'));
}

/** One week of a coaching point on a tendency (D7.3.2): toward the target by up to 2 x coachability, at most 15 from natural. */
export function tendencyStep(n: DevNumbers, current: number, natural: number, target: number, coachability: number): number {
  const step = num(n, 'point.tendencyPerWeek') * coachability;
  const lim = num(n, 'point.tendencyLimit');
  const moved = current + Math.max(-step, Math.min(step, target - current));
  return Math.min(natural + lim, Math.max(natural - lim, moved));
}
