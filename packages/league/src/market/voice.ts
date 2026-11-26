// The head coach's voice in free agency and trades (M5 mechanics): how much each insist, must-keep mark
// and core name weighs with the general manager (M3.6.2 applies the weight). No budget of marks: weight
// falls with use, with no hard cap (M5.1.1 acceptance).
import { P } from './params.ts';

/** M5.1.1 rule 2: the k-th insist in a period (1-based) weighs in full up to the full count, then halves each time. */
export function insistWeight(k: number): number {
  const extra = Math.max(0, k - P.insistFullWeightCount);
  let w = 1;
  for (let i = 0; i < extra; i++) w *= P.extraNameWeightFactor;
  return w;
}

/** Each name on a list of `n` weighs in full up to `full` names, then the list shares that weight (M5.3.1 rule 1, M5.4.1). */
export function perNameWeight(n: number, full: number): number {
  return n <= full ? 1 : full / n;
}

/** M5.3.1 rule 1: weight of each must-keep mark when the coach marks `n` players must keep. */
export const mustKeepWeight = (n: number): number => perNameWeight(n, P.mustKeepFullWeightCount);
/** M5.4.1: weight of each name on a core list of `n` players. */
export const coreNameWeight = (n: number): number => perNameWeight(n, P.coreListFullWeightCount);

/** M5.4.1 rule 1: a trade request that offers nothing is a mention only. */
export function requestKind(offersSomething: boolean): 'request' | 'mention' {
  return offersSomething ? 'request' : 'mention';
}

/** M5.4.1 rule 2: the general manager's three answers to a request without final say. */
export type RequestAnswer = 'pursuing' | 'no' | 'not_at_that_price';
