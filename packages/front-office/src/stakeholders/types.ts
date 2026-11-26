// Shared records of the stakeholder models (K8). Every profile here is TRUTH: never shown, no labels
// stored, and no field marks a subject as the user (K8.1.1 rule 1, K8.3.1 rule 2, K8.4.2 rule 6).
// People appear on screen only through X2 labels over logged behaviour (G-22, G-52).

/** K8.1.1 goal weights, 0 to 1 each. */
export const GOAL_KEYS = ['winNow', 'buildLong', 'profit', 'prestige', 'cleanProgram', 'rivalry', 'playoffOrBowl'] as const;
export type GoalKey = (typeof GOAL_KEYS)[number];

export const INTERFERENCE_KEYS = ['roster', 'staff', 'quarterback', 'playCalling'] as const;
export type InterferenceKey = (typeof INTERFERENCE_KEYS)[number];

export const RESULTS_KEYS = ['record', 'pointDiff', 'playoff', 'rivalry', 'recentGames'] as const;
export type ResultsKey = (typeof RESULTS_KEYS)[number];

/**
 * The decider-model record: everything that differs between an owner's club and a college program is
 * data here, selected by the position record's `position.appointsHeadCoach` kind (K8 header, X8). Code
 * never branches on a level word (P1.1.2).
 */
export interface DeciderModel {
  readonly id: string;
  /** E4.3.1 rule 5: firing multiplier when the current general manager did not hire the coach. */
  readonly gmFactorNotHired: number;
  /** 1 when a general manager sits between decider and coach (blame split, gm factor); 0 otherwise. */
  readonly hasGeneralManager: boolean;
  /** E4.7.2 rule 1: booster mood points from neutral to confidence, per month. 0 where no boosters vote. */
  readonly boosterPerPoint: number;
  /** K8.5.1 rule 4: a president above the decider can veto or force a firing. */
  readonly presidentChain: boolean;
  /**
   * E4.3.1 "rates via owner_model.<level>": one multiplier on the hazard, fitted so simulated firings meet
   * the level's calibration target (E4.3.1 acceptance 1, E4.7.2 acceptance 2). Not a bible number.
   */
  readonly hazardScale: number;
}

/**
 * K8.1.1 `DecisionMakerProfile` plus the E4 owner traits K8 hands E4 (volatility, money sensitivity,
 * football literacy, candour, patience). Truth only.
 */
export interface DecisionMakerProfile {
  readonly personId: number;
  readonly teamId: number;
  readonly deciderModel: string;
  readonly goals: Readonly<Record<GoalKey, number>>;
  readonly interference: Readonly<Record<InterferenceKey, number>>;
  /** Raw weights 0 to 1; read through `resultsShare`. */
  readonly resultsWeighting: Readonly<Record<ResultsKey, number>>;
  readonly spendWillingness: number;
  readonly loyaltyToOwnHires: number;
  readonly mediaSensitivity: number;
  /** E4.4 and E4.5.1: 0 impatient to 1 patient. */
  readonly patience: number;
  /** E4.2.1 rule 3: 0.7 calm to 1.4 reactive. */
  readonly volatility: number;
  /** E4.3.2 rule 3. */
  readonly moneySensitivity: number;
  /** E4.2.2 decision-quality term, 0 to 1. */
  readonly footballLiteracy: number;
  /** E4.2.3, 0 to 1. */
  readonly candour: number;
  /** K8.2.1 rule 3: share of full outcome bias he applies, 0.2 (process-minded) to 1.0. */
  readonly outcomeBias: number;
}

/** E4.2.1 rule 5: the five-step word, mapped from last week's value. */
export type ConfidenceWord = 'secure' | 'stable' | 'uneasy' | 'hot_seat' | 'last_chance';

/**
 * Anyone who reacts to results (K8.2.1): decider, outlet, booster group, fan base. Observers see only what
 * the public sees (rule 4): no field here can carry a true win probability, luck measure or rating.
 */
export interface Observer {
  readonly id: string;
  /** 0.2 to 1.0 of full outcome bias (K8.2.1 rule 3). Fans and boosters run at 1.0 (K8.5.1, K8.8.1). */
  readonly outcomeBias: number;
  /** Extra multiplier on rivalry games for this observer. */
  readonly rivalryWeight: number;
}
