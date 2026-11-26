// K8.1.1 decision-maker record and goals, and the decider-model record (E4.7.2, owner_model.<kind>).
import type { RandomStream } from '@gm/schema';
import { P } from './params.ts';
import { bell, clamp, correlated } from './mathx.ts';
import {
  GOAL_KEYS, INTERFERENCE_KEYS, RESULTS_KEYS,
  type DeciderModel, type DecisionMakerProfile, type GoalKey, type InterferenceKey, type ResultsKey,
} from './types.ts';

/** The decider-model record for a kind id from the position record (`position.appointsHeadCoach`). */
export function deciderModel(id: string): DeciderModel {
  return {
    id,
    gmFactorNotHired: P(`ownerModel.${id}.gmFactorNotHired`),
    hasGeneralManager: P(`ownerModel.${id}.hasGeneralManager`) > 0,
    boosterPerPoint: P(`ownerModel.${id}.boosterPerPoint`),
    presidentChain: P(`ownerModel.${id}.presidentChain`) > 0,
    hazardScale: P(`ownerModel.${id}.hazardScale`),
    inSeasonScale: P(`ownerModel.${id}.inSeasonScale`),
  };
}

/** X1 facets the generator reads (0 to 100, 50 the middle). Generated people only; imported people get neutral facets. */
export interface DeciderFacets {
  readonly patience: number;
  readonly ego: number;
  readonly candor: number;
  readonly risk_tolerance: number;
}

const FACET_MID = 50;
const FACET_HALF = 50;
const z = (facet: number) => clamp((facet - FACET_MID) / FACET_HALF, -1, 1);

/**
 * K8.1.1 rule 2: bell-shaped draws with correlations to X1 (`patience` with `buildLong` +0.4, `ego` with
 * every interference weight +0.4). Draw order is fixed so a seed always gives the same person.
 */
export function generateDecisionMaker(personId: number, teamId: number, model: string, facets: DeciderFacets, rng: RandomStream): DecisionMakerProfile {
  const gMean = P('profile.goalWeight.mean');
  const gSd = P('profile.goalWeight.sd');
  const goals = {} as Record<GoalKey, number>;
  for (const k of GOAL_KEYS) {
    const e = k === 'buildLong' ? correlated(rng, z(facets.patience), P('profile.corr.patienceBuildLong')) : rng.normal();
    goals[k] = clamp(gMean + gSd * e, 0, 1);
  }
  const iMean = P('profile.interference.mean');
  const iSd = P('profile.interference.sd');
  const interference = {} as Record<InterferenceKey, number>;
  for (const k of INTERFERENCE_KEYS) interference[k] = clamp(iMean + iSd * correlated(rng, z(facets.ego), P('profile.corr.egoInterference')), 0, 1);
  const resultsWeighting = {} as Record<ResultsKey, number>;
  for (const k of RESULTS_KEYS) resultsWeighting[k] = clamp(gMean + gSd * rng.normal(), 0, 1);
  const vMin = P('profile.volatility.min');
  const vMax = P('profile.volatility.max');
  const patience = clamp((facets.patience) / (2 * FACET_HALF), 0, 1);
  const bMin = P('profile.processMinded.min');
  return {
    personId, teamId, deciderModel: model, goals, interference, resultsWeighting,
    spendWillingness: bell(rng, gMean, gSd, 0, 1),
    loyaltyToOwnHires: bell(rng, gMean, gSd, 0, 1),
    mediaSensitivity: bell(rng, gMean, gSd, 0, 1),
    patience,
    // Calm owners are patient ones: volatility leans on (1 - patience), with noise.
    volatility: clamp(vMin + (vMax - vMin) * clamp(1 - patience + gSd * rng.normal(), 0, 1), vMin, vMax),
    moneySensitivity: bell(rng, gMean, gSd, 0, 1),
    footballLiteracy: bell(rng, P('profile.literacy.mean'), gSd, 0, 1),
    candour: clamp(facets.candor / (2 * FACET_HALF), 0, 1),
    // Rule 3: weighting on point differential makes him process-minded.
    outcomeBias: clamp(1 - (1 - bMin) * resultsWeighting.pointDiff, bMin, 1),
  };
}

/** Normalised share of one results weight (K8.1.2 rule 4 reads these). */
export function resultsShare(p: DecisionMakerProfile, k: ResultsKey): number {
  const total = RESULTS_KEYS.reduce((s, key) => s + p.resultsWeighting[key], 0);
  return total > 0 ? p.resultsWeighting[k] / total : 1 / RESULTS_KEYS.length;
}

/** K8.1.1 rule 3: stated goals are the top two weights; unstated goals are the rest above the threshold. */
export function statedAndUnstatedGoals(p: DecisionMakerProfile): { readonly stated: readonly GoalKey[]; readonly unstated: readonly GoalKey[] } {
  const sorted = [...GOAL_KEYS].sort((a, b) => p.goals[b] - p.goals[a] || GOAL_KEYS.indexOf(a) - GOAL_KEYS.indexOf(b));
  const n = P('profile.statedGoalCount');
  return {
    stated: sorted.slice(0, n),
    unstated: sorted.slice(n).filter((k) => p.goals[k] >= P('profile.unstatedGoalThreshold')),
  };
}

/** Goal weight on the E4.2.2 scale (3 to 8) used when a goal is passed or failed. */
export function goalStake(p: DecisionMakerProfile, k: GoalKey): number {
  return P('conf.goal.min') + (P('conf.goal.max') - P('conf.goal.min')) * p.goals[k];
}

/** K8.1.1 rule 5: a sale, inheritance or new athletic director replaces the record (E4.3.4 resets standing). */
export function replaceDecisionMaker(next: DecisionMakerProfile): { readonly profile: DecisionMakerProfile; readonly resetConfidence: true } {
  return { profile: next, resetConfidence: true };
}
