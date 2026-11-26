// K5.5.2: challenges. The coach sees the play as his booth saw it: an estimated chance of reversal with
// error, never the true reviewable facts (B9, B11). Only aspects the request offers can be challenged, so
// a non-reviewable or automatically reviewed play is never challenged (rule 4).
import { errorHappens } from './errors.ts';
import { param, type ErrorId } from './params.ts';
import { timeoutValuePts } from './timeouts.ts';
import type { CoachInputs, Env, Situation } from './types.ts';

export interface ChallengeAspect {
  /** Option id from the request. */
  readonly optionId: string;
  /** Booth coach's estimated chance of reversal, or null when his look has not arrived (rule 3). */
  readonly boothReversal: number | null;
  /** The head coach's own sideline view, with larger error. */
  readonly sidelineReversal: number;
  /** Staff's estimate of what the reversal is worth, in win-probability points. */
  readonly valuePts: number;
}

export interface ChallengeInput {
  readonly situation: Situation;
  readonly coach: CoachInputs;
  /** Aspects the rule set lets him challenge on this play. Empty when the play is reviewed automatically. */
  readonly aspects: readonly ChallengeAspect[];
  readonly challengesUsed: number;
}

export interface ChallengeResult { readonly optionId: string | null; readonly errorId: ErrorId | null; readonly floor: boolean; readonly edgePts: number }

/** Rule 1: cost is the timeout at risk plus the value of a remaining challenge, scaled by 1 / eagerness. */
export function challengeCostPts(env: Env, i: ChallengeInput): number {
  const risksTimeout = env.rules.num('challenge.requires_timeout') > 0;
  const left = env.rules.num('challenge.count') - i.challengesUsed;
  const cost = (risksTimeout ? timeoutValuePts(env, i.situation) : 0) + (left > 1 ? param('challenge.optionValuePts') : 0);
  return cost / env.math.exp(param('challenge.eagernessPerZ') * i.coach.tendencies.challengeEagerness);
}

export function challengeDecision(env: Env, i: ChallengeInput): ChallengeResult {
  const c = i.coach, d = env.draws;
  const uFloor = d.uniform();
  const erred = errorHappens('low_value_challenge', { clockManagementZ: c.behavior.clockManagement, advisor: c.advisor, analyticsTrust: c.tendencies.analyticsTrust, enabled: env.errors, draws: d, math: env.math });
  const none: ChallengeResult = { optionId: null, errorId: null, floor: false, edgePts: 0 };
  if (i.aspects.length === 0) return none;
  if (env.rules.num('challenge.count') - i.challengesUsed <= 0) return none;
  if (env.rules.num('challenge.needs_available_timeout') > 0 && i.situation.timeoutsOwn <= 0) return none;
  const aspects = [...i.aspects].sort((a, b) => (a.optionId < b.optionId ? -1 : a.optionId > b.optionId ? 1 : 0));
  const cost = challengeCostPts(env, i);
  let best: ChallengeAspect | null = null, bestEdge = -Infinity, low: ChallengeAspect | null = null;
  for (const a of aspects) {
    const p = a.boothReversal ?? a.sidelineReversal;
    const edge = p * a.valuePts - cost;
    if (edge > bestEdge) { bestEdge = edge; best = a; }
    if (low === null && (p < param('error.lowValueReversal') || a.valuePts < param('error.lowValuePts'))) low = a;
  }
  let out: ChallengeResult = bestEdge > 0 && best ? { optionId: best.optionId, errorId: null, floor: false, edgePts: bestEdge } : none;
  if (out.optionId === null && erred && low) out = { optionId: low.optionId, errorId: 'low_value_challenge', floor: false, edgePts: bestEdge };
  // A3 ruling 22: every legal challenge keeps the floor chance, and so does keeping the flag in his pocket.
  const floorP = param('prob.floor');
  if (uFloor < floorP * aspects.length) {
    const pick = aspects[Math.floor(uFloor / floorP)]!;
    return out.optionId === null ? { optionId: pick.optionId, errorId: null, floor: true, edgePts: bestEdge } : { optionId: null, errorId: null, floor: true, edgePts: bestEdge };
  }
  return out;
}
