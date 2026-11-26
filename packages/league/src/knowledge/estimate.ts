// G5.4.1 the staff's estimate of true knowledge (D9.1.1 "the organisation's estimate"). Error sd starts at 20
// for a player unseen in this scheme, falls 2 per observed practice rep of that part to a floor of 6, falls
// to 4 after a written test or teach-back, and is x1.5 for a low-skill position coach and x0.7 for a
// high-skill one (K6). No bias by default; an optimistic coach (described from his logged estimates, never
// chosen) carries +5 to +10. Only estimates reach read models and the readiness report (K9).
import type { RandomStream } from '@gm/schema';
import { clampK, num, type KnowledgeNumbers } from './params.ts';

export const COACH_SKILL = ['low', 'average', 'high'] as const;
export type CoachSkill = (typeof COACH_SKILL)[number];

export interface Observation {
  /** Practice reps of this part the staff has watched. */
  readonly observedReps: number;
  /** A written test or teach-back has been given. */
  readonly tested: boolean;
}

export function estimateSd(n: KnowledgeNumbers, o: Observation, coach: CoachSkill): number {
  const fromReps = Math.max(num(n, 'estimate.sdFloor'), num(n, 'estimate.sdStart') - num(n, 'estimate.sdPerRep') * o.observedReps);
  const sd = o.tested ? Math.min(fromReps, num(n, 'estimate.sdTested')) : fromReps;
  const m = coach === 'low' ? num(n, 'estimate.coachLow') : coach === 'high' ? num(n, 'estimate.coachHigh') : 1;
  return sd * m;
}

/** A coach's bias inside the leaf's band, from a 0 to 1 position (his logged optimism); 0 means none. */
export function optimistBias(n: KnowledgeNumbers, optimism: number): number {
  if (optimism <= 0) return 0;
  const lo = num(n, 'estimate.optimistBiasMin');
  return lo + Math.min(1, optimism) * (num(n, 'estimate.optimistBiasMax') - lo);
}

/** One estimate draw. */
export function estimateKnowledge(n: KnowledgeNumbers, truth: number, o: Observation, coach: CoachSkill, bias: number, rng: RandomStream): number {
  return clampK(n, truth + bias + estimateSd(n, o, coach) * rng.normal());
}
