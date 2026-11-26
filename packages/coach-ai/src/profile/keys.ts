// Field lists and readers of the profile (K2.1.4 table, K2.6.1, X1 reader rule).
// The reader rule: a parameter with no reader fails the content build (K2.1.4 rule 1, K2.7.1 rule 6).
import type { BehaviorBlock, CoachRole, DefenseRates, EmphasisBlock, OffenseRates, PersonnelKey, TendencyBlock } from './types.ts';

export const BEHAVIOR_KEYS = ['callFit', 'preparation', 'adjustment', 'selfScout', 'clockManagement', 'teaching', 'evaluation'] as const satisfies readonly (keyof BehaviorBlock)[];
export type BehaviorKey = typeof BEHAVIOR_KEYS[number];

/** K2.1.4 table: the leaf that reads each behaviour parameter. */
export const BEHAVIOR_READERS: Readonly<Record<BehaviorKey, readonly string[]>> = {
  callFit: ['K4.3.2'],
  preparation: ['K3.1.1', 'K3.3.1'],
  adjustment: ['K4.2.2'],
  selfScout: ['K4.3.3'],
  clockManagement: ['K5.6.1'],
  teaching: ['G5.1.2', 'H3.5.1'],
  evaluation: ['K3.2.1', 'D6.4.3'],
};

export const TENDENCY_KEYS = [
  'fourthDownOffset', 'twoPointOffset', 'endOfHalfAggression', 'leadProtection', 'deficitUrgency',
  'lateDefenseRisk', 'starterRestBias', 'analyticsTrust', 'challengeEagerness', 'iceKicker',
  'veteranBias', 'backupRepShare',
] as const satisfies readonly (keyof TendencyBlock)[];
export type TendencyKey = typeof TENDENCY_KEYS[number];

/** K2.1.3 outputs: readers are K5 (game management) and K4 (lead and deficit behaviour, K4.3.7). */
export const TENDENCY_READERS: Readonly<Record<TendencyKey, readonly string[]>> = {
  fourthDownOffset: ['K5'],
  twoPointOffset: ['K5'],
  endOfHalfAggression: ['K5'],
  leadProtection: ['K4.3.7', 'K5'],
  deficitUrgency: ['K4.3.7', 'K5'],
  lateDefenseRisk: ['K5'],
  starterRestBias: ['K5'],
  analyticsTrust: ['K5', 'I5.1.2'],
  challengeEagerness: ['K5'],
  iceKicker: ['K5'],
  veteranBias: ['K3.7.1'],
  backupRepShare: ['K3.5.1'],
};

/** K2.1.3 rule 4: the emphasis dials, a block inside `tendencies`. Readers: K3.4.1 writes them to the plan (G6.4.2). */
export const EMPHASIS_KEYS = ['takeaway', 'tackleAttack', 'rushLanes', 'cornerJump'] as const satisfies readonly (keyof EmphasisBlock)[];
export type EmphasisKey = typeof EMPHASIS_KEYS[number];
export const EMPHASIS_READERS: readonly string[] = ['K3.4.1', 'G6.4.2'];
/** Tendency fields added after the first release of the generator: drawn last so earlier draws keep their values. */
export const LATE_TENDENCY_KEYS: readonly TendencyKey[] = ['veteranBias', 'backupRepShare'];

/** Tendencies stored as probabilities (0 to 1) and as win-probability points; the rest are z-scores. */
export const PROBABILITY_TENDENCIES: readonly TendencyKey[] = ['analyticsTrust', 'iceKicker'];
export const WP_POINT_TENDENCIES: readonly TendencyKey[] = ['fourthDownOffset', 'twoPointOffset'];

export const OFFENSE_RATE_KEYS = ['neutralPass', 'motion', 'playAction', 'shotgun', 'screen', 'rpo', 'deepShot'] as const satisfies readonly (keyof OffenseRates)[];
export const DEFENSE_RATE_KEYS = ['blitz', 'simulatedPressure', 'man', 'twoHigh', 'disguise'] as const satisfies readonly (keyof DefenseRates)[];
export const PERSONNEL_KEYS = ['p10', 'p11', 'p12', 'p13', 'p21', 'p22', 'other'] as const satisfies readonly PersonnelKey[];
export type OffenseRateKey = typeof OFFENSE_RATE_KEYS[number];
export type DefenseRateKey = typeof DEFENSE_RATE_KEYS[number];

/** System rates are read by K4.3.7 (habit lean) and K3.4.1 (game-plan prior). */
export const SYSTEM_RATE_READERS: readonly string[] = ['K4.3.7', 'K3.4.1'];

/**
 * K2.6.1: which behaviour parameters each role actually uses. A parameter can grow between seasons
 * only if the role held last season reads it (K2.5.1 rule 2). A head coach's calling fields apply only
 * when he calls a side; `callsPlays` in the change context says so.
 */
export const ROLE_USES: Readonly<Record<CoachRole, readonly BehaviorKey[]>> = {
  headCoach: ['preparation', 'clockManagement', 'teaching', 'evaluation'],
  offensiveCoordinator: ['callFit', 'preparation', 'adjustment', 'selfScout', 'teaching', 'evaluation'],
  defensiveCoordinator: ['callFit', 'preparation', 'adjustment', 'selfScout', 'teaching', 'evaluation'],
  specialTeamsCoordinator: ['callFit', 'preparation', 'adjustment', 'selfScout', 'teaching', 'evaluation'],
  positionCoach: ['teaching', 'evaluation'],
};

/** Calling fields a head coach uses when he calls a side himself (K2.6.1 rule 1). */
export const CALLER_FIELDS: readonly BehaviorKey[] = ['callFit', 'adjustment', 'selfScout'];
