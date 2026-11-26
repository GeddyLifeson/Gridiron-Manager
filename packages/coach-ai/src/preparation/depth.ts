// How deep a staff prepares (K3 ruling: depth comes from each coach's hidden `preparation`, `evaluation`
// and his staff, never from a setting). One place turns the z-scores into the counts K3 names, so every
// step reads the same numbers and a test can hand in an exact depth.
import { param } from './params.ts';

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** Position of a z-score between the two ends of the mapping, 0 to 1. */
export function zShare(z: number): number {
  const lo = param('z.low');
  const hi = param('z.high');
  return clamp((z - lo) / (hi - lo), 0, 1);
}

/** A value on the range `[atLow, atHigh]` for a z-score (linear, held at the ends). */
export function byZ(z: number, atLow: number, atHigh: number): number {
  return atLow + (atHigh - atLow) * zShare(z);
}

/** The splits a staff reads, in the order K3.1.1 rule 2 adds them. Ids are tendency-table cuts (G8.1.1). */
export const SPLIT_ORDER = ['downDistance', 'fieldZone', 'personnel', 'formation', 'hash', 'motion'] as const;
export type SplitId = (typeof SPLIT_ORDER)[number];

/** How the fidelity tier of a team changes the procedure (K3.6.1 rule 4; X13 decides the tier-3 method). */
export type PrepMethod = 'full' | 'noPlanningReps' | 'skip';

export interface PrepDepth {
  /** K3.1.1 rule 1: games of the opponent the staff wants to chart. Staff hours may finish fewer. */
  readonly gamesWanted: number;
  /** K3.1.1 rule 2. Always starts with down and distance. */
  readonly splits: readonly SplitId[];
  /** K3.1.1 rule 4: chance to find each tell that exists on the charted film. */
  readonly tellFindChance: number;
  /** K3.3.1 rule 3: planning reps per short-list cell before the weekly cap. */
  readonly repsPerCell: number;
  /** K3.3.1 rule 5. */
  readonly repsWeeklyCap: number;
  /** K3.3.1 rule 4: SD of the estimate noise, expected points. */
  readonly noiseSd: number;
  /** K3.4.1 rule 3. */
  readonly newCalls: number;
  readonly wrinkles: number;
  /** K3.4.1 rule 4. */
  readonly themes: number;
  /** K3.4.1 rule 6. */
  readonly fullContingencies: boolean;
  /** K3.4.2 rule 2: share of catalogue situations that get their own box. */
  readonly catalogueCoverage: number;
  /** K3.4.2 rule 3 (K4.5.1, K4.3.4). */
  readonly scriptLength: number;
  readonly sequencePackages: number;
}

export interface DepthInput {
  /** K2.1.4 `preparation` of the coach who owns the plan (coordinator, or the head coach who calls). */
  readonly preparationZ: number;
  /** K2.1.4 `evaluation` of the same coach. */
  readonly evaluationZ: number;
  /** Staff hours given to looking for tells this week (K3.1.1 rule 4). */
  readonly tellHours: number;
  readonly method?: PrepMethod;
}

export function prepDepth(inp: DepthInput): PrepDepth {
  const z = inp.preparationZ;
  const splitCount = 1 + clamp(Math.floor((z - param('scout.splitBaseZ')) / param('scout.splitStepZ')), 0, SPLIT_ORDER.length - 1);
  const hoursShare = clamp(inp.tellHours / param('scout.tellFullHours'), 0, 1);
  const tellSpan = param('scout.tellFindMax') - param('scout.tellFindMin');
  const wz = param('plan.wrinkleZ');
  const noReps = inp.method === 'noPlanningReps';
  return {
    gamesWanted: Math.round(byZ(z, param('scout.gamesMin'), param('scout.gamesMax'))),
    splits: SPLIT_ORDER.slice(0, splitCount),
    tellFindChance: param('scout.tellFindMin') + tellSpan * zShare(inp.evaluationZ) * hoursShare,
    repsPerCell: noReps ? 0 : Math.round(byZ(z, param('payoff.repsMinPerCell'), param('payoff.repsMaxPerCell'))),
    repsWeeklyCap: noReps ? 0 : param('payoff.repsWeeklyCap'),
    noiseSd: byZ(z, param('payoff.noiseSdMax'), param('payoff.noiseSdMin')),
    newCalls: Math.round(byZ(z, param('plan.newCallsMin'), param('plan.newCallsMax'))),
    wrinkles: clamp(z > wz ? 1 + Math.floor(z - wz) : 0, 0, param('plan.wrinklesMax')),
    themes: Math.round(byZ(z, param('plan.themesMin'), param('plan.themesMax'))),
    fullContingencies: z > param('plan.contingencyZ'),
    catalogueCoverage: byZ(z, param('sheet.coverageMin'), param('sheet.coverageMax')),
    scriptLength: Math.round(byZ(z, param('sheet.scriptMin'), param('sheet.scriptMax'))),
    sequencePackages: Math.round(byZ(z, param('sheet.sequencesMin'), param('sheet.sequencesMax'))),
  };
}
