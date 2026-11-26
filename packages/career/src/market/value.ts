// Market value (E2.4.1) and what time out of football does to it (E2.7.2, S7.3.1). Below the dominant
// rungs nearly every job comes through someone who knows the coach; at the top it is results, reputation
// and an agent. Inputs are public results, audience regard (career/reputation) and network ties
// (career/staff network): no hidden skill value.
import { clamp, param } from './params.ts';

export interface ValueInputs {
  /** Rung of the job being valued against. */
  readonly rung: number;
  /** Strongest tie path to the hiring coach, 0 to 100 (see `pathStrength`). */
  readonly path: number;
  /** Results of his unit or team as the public measures them, 0 to 1. */
  readonly results: number;
  /** His boss's running rating of his work (E2.6.1), 0 to 1. */
  readonly workRating: number;
  /** Regard with owners and media (career/reputation effective value), 0 to 1. */
  readonly reputation: number;
  /** Agent reach, 0 (none) to 1. */
  readonly agentReach: number;
  /** His AI boss takes credit publicly (K2 behaviour): his results count less. */
  readonly bossTakesCredit: boolean;
}

/**
 * E2.4.1 path rule: the strongest path from hiring coach to candidate through at most two steps (a friend
 * of a mentor). `tie(a,b)` is 0..100 (career/staff tieBetween). Two steps multiply.
 */
export function pathStrength(hirer: number, candidate: number, people: readonly number[], tie: (a: number, b: number) => number): number {
  let best = clamp(tie(hirer, candidate), 0, 100);
  for (const m of people) {
    if (m === hirer || m === candidate) continue;
    best = Math.max(best, (clamp(tie(hirer, m), 0, 100) * clamp(tie(m, candidate), 0, 100)) / 100);
  }
  return best;
}

/** E2.4.1: market value 0 to 100 for jobs at `rung`. */
export function marketValue(v: ValueInputs): number {
  const results = clamp(v.results, 0, 1) * (v.bossTakesCredit ? param('mv.creditTakenShare') : 1);
  if (v.rung <= param('mv.lowRungMax')) {
    return 100 * (param('mv.low.path') * clamp(v.path, 0, 100) / 100 + param('mv.low.results') * results + param('mv.low.grades') * clamp(v.workRating, 0, 1));
  }
  return 100 * (param('mv.high.results') * results + param('mv.high.reputation') * clamp(v.reputation, 0, 1)
    + param('mv.high.agent') * clamp(v.agentReach, 0, 1) + param('mv.high.path') * clamp(v.path, 0, 100) / 100);
}

/**
 * E2.7.2: value for head jobs decays 15% a year out, unless his old unit or team collapsed after he left,
 * which restores part of the loss. `yearsOut` may be fractional.
 */
export function valueAfterTimeOut(value: number, yearsOut: number, oldTeamCollapsed: boolean): number {
  // Whole years compound; a part year decays linearly within that year (no platform power function).
  const y = Math.max(0, yearsOut);
  const keepYear = 1 - param('out.decayPerYear');
  let kept = 1;
  for (let i = 0; i < Math.floor(y); i++) kept *= keepYear;
  kept *= 1 - (1 - keepYear) * (y - Math.floor(y));
  const lost = value * (1 - kept);
  return value - lost * (oldTeamCollapsed ? 1 - param('out.collapseRestore') : 1);
}

/** S7.3.1: after two full years out the market treats him as a comeback one rung lower than his last. */
export function comebackRung(lastRung: number, fullYearsOut: number): number {
  return fullYearsOut >= param('out.comebackAfterYears') ? Math.max(0, lastRung - 1) : lastRung;
}

/** S7.3.1: each month out lowers standing with coaches elsewhere slightly, unless offset by visits or public work. */
export function monthOutPeerChange(visitedOrPublicWork: boolean): number {
  return visitedOrPublicWork ? 0 : -param('out.monthlyPeerLoss');
}
