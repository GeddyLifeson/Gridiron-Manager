// M2.1.2 sides, hashes and travel rules: the rule per position pair and its install cost. The per-snap
// resolution (hash, strength, motion cut-off) is J5's and reads the hash positions from the rule set.
import { P } from './params.ts';

export type AlignmentRule = 'sides' | 'field_boundary' | 'strength' | 'shadow';
export type PositionPair = 'corners' | 'tackles_ends' | 'outside_receivers' | 'safeties';

export interface PairAlignment {
  readonly pair: PositionPair;
  readonly rule: AlignmentRule;
  /** Shadow only: the opponent receiver's person id, set weekly in G6. */
  readonly shadowTarget?: number;
}

const COST: Readonly<Record<AlignmentRule, string>> = { sides: 'align.installCost.sides', field_boundary: 'align.installCost.fieldBoundary', strength: 'align.installCost.strength', shadow: 'align.installCost.shadow' };

/** Extra install time share for the pair's position group (rule 4). */
export function installCost(rule: AlignmentRule): number {
  return P(COST[rule]);
}

/** Shadow is for corners only (user sees and does). */
export function alignmentAllowed(a: PairAlignment): boolean {
  return a.rule !== 'shadow' || (a.pair === 'corners' && a.shadowTarget !== undefined);
}

/**
 * Staff default by the rule set (rule 5, a tuning knob): sides for every pair unless the level's hash
 * marks leave a wide side, in which case corners and safeties start field and boundary. The caller
 * passes whether the rule set's hash spread is the wide one (read from B1 or T10 keys).
 */
export function staffDefaultAlignment(pair: PositionPair, wideHashes: boolean): AlignmentRule {
  return wideHashes && (pair === 'corners' || pair === 'safeties') ? 'field_boundary' : 'sides';
}
