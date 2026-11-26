// Expected points model shapes (N2.2.1). Everything here is derived from play records and the game
// state a staff can see; nothing reads a hidden player rating (N2 "What a builder needs").

/** The state the model values: the team in possession is "the offense". */
export interface EpState {
  /** A kickoff (or other free kick) is a state of its own (N2.2.1 edge cases). */
  readonly kind: 'scrimmage' | 'kickoff';
  /** 1 to 4 for scrimmage downs; ignored for a kickoff. */
  readonly down: number;
  /** Yards to the line to gain; ignored for a kickoff. */
  readonly distanceYd: number;
  /** Yards from the ball to the goal line the offense attacks ("yardline 100"). */
  readonly yardsToGoalYd: number;
  /** Seconds left in the half (in overtime: in the period). */
  readonly halfSecondsLeft: number;
  readonly timeoutsOffense: number;
  readonly timeoutsDefense: number;
  /** The offense is the home team. */
  readonly home: boolean;
}

/** Next score in the same half, from the offense's view (N2.2.1 rule 2). Index order is fixed. */
export const NEXT_SCORE_CLASSES = ['touchdown', 'field_goal', 'safety', 'no_score', 'opp_safety', 'opp_field_goal', 'opp_touchdown'] as const;
export type NextScoreClass = (typeof NEXT_SCORE_CLASSES)[number];
export const NO_SCORE_INDEX = 3;

export interface EpTrainingRow {
  readonly state: EpState;
  /** Index into NEXT_SCORE_CLASSES. */
  readonly nextScore: number;
}

/** One fitted multinomial: feature terms, standardiser and coefficients (classes by terms, row-major). */
export interface EpSubmodel {
  readonly terms: readonly string[];
  readonly mean: readonly number[];
  readonly sd: readonly number[];
  readonly beta: readonly number[];
  readonly trainingPlays: number;
  readonly iterations: number;
  readonly converged: boolean;
}

/** Bucket edges of the support grid that counts training plays near each state (N2.2.1 rule 5). */
export interface SupportGrid {
  readonly distanceEdges: readonly number[];
  readonly yardEdges: readonly number[];
  readonly secondsEdges: readonly number[];
  /** Counts, flattened by `supportIndex`. */
  readonly counts: readonly number[];
}

/** A fitted, versioned expected points model (N2.2.1 rule 3). Saved as JSON. */
export interface EpModelFile {
  readonly format: 'gm.ep-model';
  readonly version: string;
  /** Rule set the class values were taken from (`score.*` keys). A rule change means a refit. */
  readonly ruleSetId: string;
  /** Where the training plays came from: an engine build and batch, or the bootstrap dataset. */
  readonly trainedOn: string;
  readonly classValues: readonly number[];
  /** The model's own average try value, added to a touchdown's points (N2.2.1 rule 2). */
  readonly tryValue: number;
  readonly scrimmage: EpSubmodel;
  readonly kickoff: EpSubmodel;
  readonly support: SupportGrid;
}

/** Output of `ep()`: the value, its standard error, the class probabilities and the support count. */
export interface EpValue {
  readonly value: number;
  readonly se: number;
  readonly probabilities: readonly number[];
  /** Training plays in this state's support bucket. */
  readonly support: number;
  /** Too few training plays near this state to trust the value (N2.7.2). */
  readonly sparse: boolean;
}
