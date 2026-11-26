// The common contest forms of J6.1: effective z, the engagement step, the event probability and the
// softmax. Pure functions; every draw is passed in or taken from the contest's own stream by the caller.
import { TICK_S } from '@gm/schema';
import type { ContestMath, DeterministicMath, EffectiveZTerms, EngagementParams, EventContestParams } from '@gm/schema';
import { ISS_MEAN, ISS_SD, P_CEIL, P_FLOOR } from './params.ts';

// Square root is correctly rounded by IEEE 754, so the platform function is deterministic (see dmath.ts).
const SQRT_TICK = Math.sqrt(TICK_S);

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** J6.1.1: internal skill scale to z. */
export function issToZ(iss: number): number {
  return (iss - ISS_MEAN) / ISS_SD;
}

/** J6.1.3 edge case: nothing is ever certain or impossible. */
export function clampProbability(p: number): number {
  return clamp(p, P_FLOOR, P_CEIL);
}

/**
 * J6.1.2 `g(A)`: the share of his free speed a defender keeps along the contest's axis. Piecewise
 * linear through g(-1), g(0), g(+1), so it is monotone whenever the three values are.
 */
export function speedFactor(advantage: number, gLosing: number, gEven: number, gWinning: number): number {
  const a = clamp(advantage, -1, 1);
  return a <= 0 ? lerp(gEven, gLosing, -a) : lerp(gEven, gWinning, a);
}

/** The engagement result at the bounds (J6.1.2): +1 the offensive player wins, -1 the defender wins. */
export function engagementResult(advantage: number): 'offenseWin' | 'defenseWin' | null {
  return advantage >= 1 ? 'offenseWin' : advantage <= -1 ? 'defenseWin' : null;
}

/** Weighted attribute mix for `zAttr` (J6.1.1). Weights must sum to 1; the values are ISS. */
export function zAttrMix(issValues: readonly number[], weights: readonly number[]): number {
  if (issValues.length !== weights.length) throw new Error('zAttrMix: one weight per attribute');
  let sum = 0;
  let w = 0;
  for (let i = 0; i < weights.length; i++) {
    sum += (weights[i] as number) * issToZ(issValues[i] as number);
    w += weights[i] as number;
  }
  if (w < 1 - 1e-9 || w > 1 + 1e-9) throw new Error('zAttrMix: weights must sum to 1');
  return sum;
}

export const CONTEST_MATH: ContestMath = {
  effectiveZ(t: EffectiveZTerms): number {
    return t.zAttr - t.dFatigue - t.dInjury - t.dKnowledge + t.mTechnique + t.mLeverage;
  },

  stepEngagement(advantage: number, dz: number, p: EngagementParams, eps: number): number {
    const next = advantage + p.kappa * dz * TICK_S - p.lambda * advantage * TICK_S + p.sigma * SQRT_TICK * eps;
    return clamp(next, -1, 1);
  },

  eventProbability(dz: number, context: Readonly<Record<string, number>>, p: EventContestParams, math: DeterministicMath): number {
    let x = p.beta0 + p.beta1 * dz;
    // The sum runs over the parameter row's keys, so its order never depends on how the caller built `context`.
    for (const k in p.gamma) {
      const xi = context[k];
      if (xi !== undefined) x += (p.gamma[k] as number) * xi;
    }
    for (const k in context) {
      if (!(k in p.gamma)) throw new Error(`event contest has no weight for context input "${k}"`);
    }
    return clampProbability(math.logistic(x));
  },

  outcomeProbabilities(scores: readonly number[], math: DeterministicMath): number[] {
    if (scores.length === 0) throw new Error('softmax needs at least one outcome');
    let top = scores[0] as number;
    for (let i = 1; i < scores.length; i++) if ((scores[i] as number) > top) top = scores[i] as number;
    const out: number[] = [];
    let total = 0;
    for (let i = 0; i < scores.length; i++) {
      const e = math.exp((scores[i] as number) - top);
      out.push(e);
      total += e;
    }
    // Clamp each share (J6.1.3), then renormalise so the shares still sum to 1.
    let clamped = 0;
    for (let i = 0; i < out.length; i++) {
      const p = out.length === 1 ? 1 : clampProbability((out[i] as number) / total);
      out[i] = p;
      clamped += p;
    }
    for (let i = 0; i < out.length; i++) out[i] = (out[i] as number) / clamped;
    return out;
  },
};

/** Index of the outcome a uniform draw selects from probabilities that sum to 1. */
export function pickOutcome(probabilities: readonly number[], u: number): number {
  let acc = 0;
  for (let i = 0; i < probabilities.length - 1; i++) {
    acc += probabilities[i] as number;
    if (u < acc) return i;
  }
  return probabilities.length - 1;
}

/** Reads `contest.<name>` from the table. Each contest group reads its numbers once, when it is created. */
export type ContestNum = (name: string) => number;
