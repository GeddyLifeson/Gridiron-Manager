// K8.1.2 expectations that rise with success. Formed from public information and the decider's own
// beliefs only (rule 5): nothing here reads a true rating, and nothing corrects for luck.
import { P } from './params.ts';
import { resultsShare } from './profile.ts';
import type { DecisionMakerProfile } from './types.ts';

export interface ExpectationInputs {
  /** Rule 1: wins implied by the public team-strength estimate (N2.6.1) and the schedule. */
  readonly publicBaseWins: number;
  /** Rule 2: the culture record's expectation level in wins (X9), before this season's update. */
  readonly historyLevelWins: number;
  /** Rule 3: roster plus staff spend in standard deviations above the league mean (public estimate). */
  readonly spendSd: number;
  /** E4.5.1 edge case: first season of a new coach widens the band. */
  readonly firstSeasonOfCoach: boolean;
  readonly gamesInSeason: number;
}

export interface SeasonExpectation {
  readonly expectedWins: number;
  readonly bandLow: number;
  readonly bandHigh: number;
}

/**
 * Rules 1 to 4. The blend of base and history follows his results weighting: an owner who reads the
 * record and recent games leans on history; one who reads point differential leans on the public estimate.
 */
export function seasonExpectation(dm: DecisionMakerProfile, x: ExpectationInputs): SeasonExpectation {
  const historyShare = resultsShare(dm, 'record') + resultsShare(dm, 'recentGames');
  const blended = (1 - historyShare) * x.publicBaseWins + historyShare * x.historyLevelWins;
  const spend = Math.max(0, x.spendSd) * P('expect.spendWinsPerSd') * dm.spendWillingness * 2;
  const expected = Math.min(x.gamesInSeason, Math.max(0, blended + spend));
  const band = P('expect.band.base') + (x.firstSeasonOfCoach ? P('expect.band.firstSeasonExtra') : 0);
  return { expectedWins: expected, bandLow: expected - band, bandHigh: expected + band };
}

/**
 * Rule 2: the X9 expectation level after a season. Rises at 0.5 of the gap after a season above it,
 * falls at 0.2 after one below: success is remembered longer than failure is forgiven.
 */
export function updateHistoryLevel(levelWins: number, actualWins: number): number {
  const gap = actualWins - levelWins;
  return levelWins + gap * (gap > 0 ? P('expect.riseShare') : P('expect.fallShare'));
}
