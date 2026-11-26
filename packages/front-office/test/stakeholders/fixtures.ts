// Fixtures for the stakeholder tests. Synthetic people and seasons only; nothing here is a real person or
// a real-world number.
import { stream, seedFromNumber } from '@gm/engine-core';
import type { RandomStream } from '@gm/schema';
import {
  GOAL_KEYS, INTERFERENCE_KEYS, RESULTS_KEYS,
  type ConfidenceWeek, type DecisionMakerProfile, type GameReading, type GoalKey, type InterferenceKey, type ResultsKey,
} from '../../src/stakeholders/index.ts';

export const rng = (seed: number, name = 'test'): RandomStream => stream(seedFromNumber(seed), `stakeholders.${name}`, []);

const fill = <K extends string>(keys: readonly K[], v: number) => Object.fromEntries(keys.map((k) => [k, v])) as Record<K, number>;

/** A middle-of-the-road decider; override any field. */
export function dm(over: Partial<DecisionMakerProfile> = {}): DecisionMakerProfile {
  return {
    personId: 1, teamId: 1, deciderModel: 'pro',
    goals: fill<GoalKey>(GOAL_KEYS, 0.5), interference: fill<InterferenceKey>(INTERFERENCE_KEYS, 0.3),
    resultsWeighting: fill<ResultsKey>(RESULTS_KEYS, 0.5),
    spendWillingness: 0.5, loyaltyToOwnHires: 0.5, mediaSensitivity: 0.5, patience: 0.5, volatility: 1,
    moneySensitivity: 0.5, footballLiteracy: 0, candour: 0.5, outcomeBias: 1,
    ...over,
  };
}

export function game(over: Partial<GameReading> = {}): GameReading {
  return { gameId: 1, result: 'W', pPublic: 0.5, margin: 3, stage: 'regular', rivalry: false, starterQbOutPublicEarly: false, injuryAllowance: false, decisions: [], ...over };
}

export function week(over: Partial<ConfidenceWeek> = {}): ConfidenceWeek {
  return {
    weekId: 'w', games: [], quarterPoint: null, seasonEnd: null, goals: [], playerNoise: [], mediaTone: null, fanMood: null,
    conduct: [], violations: [], relationship: null, boosterMood: null, blameMultiplier: 1, ...over,
  };
}

/** Logistic win chance from a strength gap in points (test-only; core code never does this). */
export function winChance(gapPoints: number): number {
  return 1 / (1 + Math.exp(-gapPoints / 6.5));
}
