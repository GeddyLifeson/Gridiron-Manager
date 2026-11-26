// Results beside the roster (N4.2.2): where the actual season sits on the distribution of the same
// season played by the reference coach on both sidelines. Shown beside the component scores, never
// folded into them (N4.2.1 rule 4).
import { param } from './params.ts';
import { bootstrap, seedOf } from './stats.ts';

export type RosterWords = 'well_above' | 'about' | 'well_below' | 'too_few_games';

export interface RosterExpectation {
  /** Percentile of the actual result among the reference runs, 0 to 100 (ties count half). */
  readonly percentile: number;
  /** 80% bootstrap interval over the runs (N4.2.2 starting value). */
  readonly low: number;
  readonly high: number;
  /** Median wins of the reference runs: the "expected with this roster" line. */
  readonly expectedWins: number;
  readonly actualWins: number;
  readonly runs: number;
  readonly words: RosterWords;
  /** Text key of the words. */
  readonly wordsKey: string;
  /** Which strength estimate the runs used (N4.2.2: public in career, true attributes only in the export). */
  readonly basis: 'public_estimate' | 'true_attributes';
}

export function percentileOf(actual: number, runs: readonly number[]): number {
  if (!runs.length) throw new Error('no reference runs (N4.2.2)');
  let below = 0, ties = 0;
  for (const r of runs) { if (r < actual) below++; else if (r === actual) ties++; }
  return (100 * (below + ties / 2)) / runs.length;
}

/**
 * `runs` are the wins of the season simulated with both sides run by the reference coach (N4.2.2: a
 * starting 200 runs, injuries carried as they happened). The simulation itself belongs to J14; this
 * function places the actual result on it.
 */
export function rosterExpectation(actualWins: number, gamesUnderCoach: number, runs: readonly number[], basis: RosterExpectation['basis']): RosterExpectation {
  const percentile = percentileOf(actualWins, runs);
  const range = bootstrap(runs, (xs) => percentileOf(actualWins, xs), seedOf(`roster|${actualWins}|${runs.join(',')}`), param('bootstrapDraws'), 0.8);
  const sorted = [...runs].sort((a, b) => a - b);
  const m = sorted.length >> 1;
  const expectedWins = sorted.length % 2 ? sorted[m]! : (sorted[m - 1]! + sorted[m]!) / 2;
  let words: RosterWords;
  if (gamesUnderCoach < param('rosterMinGames')) words = 'too_few_games';
  else if (percentile >= param('rosterHighPct')) words = 'well_above';
  else if (percentile <= param('rosterLowPct')) words = 'well_below';
  else words = 'about';
  return { percentile, low: range.low, high: range.high, expectedWins, actualWins, runs: runs.length, words, wordsKey: `rating.roster.${words}`, basis };
}
