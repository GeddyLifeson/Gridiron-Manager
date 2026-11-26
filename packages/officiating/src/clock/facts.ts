// Facts the game clock needs about a down that `PlayOutcome` and `EnforcementSummary` do not carry yet
// (contract change request CR-02-2). The scrimmage ruling fills the first; the foul module can fill the others.
export interface ClockFacts {
  /** A fumble or backward pass went out of bounds, as opposed to a runner (B1.2.3 exception 5). */
  readonly looseBallOutOfBounds: boolean;
  /** The offense fouled after the ball was ready, stopping the clock before a snap (B1.2.3 exception 9, item 3). */
  readonly offenseFoulAfterReady?: boolean;
  /** Second successive delay of game by the offense in the same down while time was in (B1.2.3 exception 9, item 4). */
  readonly successiveDelayOfGame?: boolean;
}

export const NO_CLOCK_FACTS: ClockFacts = { looseBallOutOfBounds: false };
