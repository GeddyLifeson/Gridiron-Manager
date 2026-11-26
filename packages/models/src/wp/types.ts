// Win probability model shapes (N2.2.2).
import type { EpState } from '../ep/types.ts';

/** The full game state, from the view of the team in possession (the offense). */
export interface WpState {
  /** Field state: down, distance, yard line, timeouts, home, kickoff or scrimmage. */
  readonly field: EpState;
  /** Offense points minus defense points. */
  readonly scoreDiff: number;
  /** Seconds left in regulation; in overtime, seconds left in the overtime period. */
  readonly gameSecondsLeft: number;
  readonly overtime: boolean;
  /** The state is in the first half (the second-half kickoff is still to come). */
  readonly firstHalf: boolean;
  /** The offense receives the second-half kickoff. */
  readonly receivesSecondHalfKickoff: boolean;
  /**
   * Pregame strength gap in points, positive when the offense is the stronger side (N2.6.1). It enters as
   * a prior that fades as time runs out (N2.2.2 rule 2). The bootstrap fit uses the closing spread.
   */
  readonly pregameGap: number;
}

export interface WpTrainingRow {
  readonly state: WpState;
  /** Offense result: 1 win, 0 loss, 0.5 tie (N2.2.2 rule 1). */
  readonly result: number;
}

/** Rule values the model was fitted under, kept in the file so evaluation needs no rule set. */
export interface WpRuleValues {
  readonly regulationSeconds: number;
  readonly playClockS: number;
  readonly downs: number;
}

export interface WpSupportGrid {
  readonly scoreEdges: readonly number[];
  readonly secondsEdges: readonly number[];
  readonly counts: readonly number[];
}

export interface WpModelFile {
  readonly format: 'gm.wp-model';
  readonly version: string;
  readonly ruleSetId: string;
  readonly trainedOn: string;
  /** Version of the expected points model whose value is a feature. */
  readonly epModelVersion: string;
  readonly rules: WpRuleValues;
  readonly terms: readonly string[];
  /** Terms whose coefficient is held at or above zero: the monotone limit on score difference. */
  readonly monotoneTerms: readonly string[];
  readonly mean: readonly number[];
  readonly sd: readonly number[];
  /** Coefficients of the win class (the loss class is the reference). */
  readonly beta: readonly number[];
  readonly trainingPlays: number;
  readonly iterations: number;
  readonly converged: boolean;
  readonly support: WpSupportGrid;
}

export interface WpValue {
  readonly value: number;
  readonly se: number;
  readonly support: number;
  readonly sparse: boolean;
  /** Set when a rule, not the fitted model, gave the value. */
  readonly ruled: 'game_over' | 'kneel_out' | null;
}
