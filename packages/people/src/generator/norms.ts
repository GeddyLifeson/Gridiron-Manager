// D2.5.1 position norms: percentile of a test result against the pro profile of its position.
// The quantile table and the skewed-cell list are D2.5.1 rules 1 and 2 (computed from
// data/people/nfl_players.csv, 1 of 3). The profile test recomputes the table from the same data.
import type { DeterministicMath } from '@gm/schema';
import { normalCdf, clamp } from './normal.ts';
import { proProfile, type ProfileVar } from './profiles.ts';
import { MAIN_POSITIONS, type ProfilePosition } from './catalogue.ts';

/** Tests with a norm (D2.5.1); height and weight are shown against D1.2.1 means, not percentiles. */
export const NORM_TESTS = ['fortyS', 'verticalIn', 'broadIn', 'threeConeS', 'shuttleS', 'benchReps'] as const;
export type NormTest = (typeof NORM_TESTS)[number];

/** Timed tests: lower is better, so the shown percentile is flipped (D2.5.1 rule 2). */
export const TIMED: ReadonlySet<NormTest> = new Set<NormTest>(['fortyS', 'threeConeS', 'shuttleS']);

type Q = readonly [number, number, number, number, number];
/** D2.5.1 rule 2: 10th, 25th, 50th, 75th, 90th raw quantiles. `null` = n/a. */
export const D25_QUANTILES: Readonly<Record<string, Readonly<Record<NormTest, Q | null>>>> = {
  QB: { fortyS: [4.59, 4.70, 4.81, 4.91, 5.01], verticalIn: [27.0, 29.0, 31.0, 33.5, 35.5], broadIn: [102, 107, 111, 116, 120], threeConeS: [6.85, 6.98, 7.12, 7.27, 7.42], shuttleS: [4.11, 4.21, 4.33, 4.44, 4.53], benchReps: null },
  RB: { fortyS: [4.40, 4.46, 4.54, 4.61, 4.68], verticalIn: [30.5, 32.5, 34.5, 36.5, 38.5], broadIn: [112, 115, 119, 123, 127], threeConeS: [6.82, 6.91, 7.07, 7.19, 7.38], shuttleS: [4.08, 4.15, 4.25, 4.38, 4.49], benchReps: [15, 17, 20, 23, 26] },
  WR: { fortyS: [4.36, 4.42, 4.49, 4.56, 4.61], verticalIn: [32.0, 33.5, 36.0, 38.0, 39.5], broadIn: [115, 118, 122, 126, 129], threeConeS: [6.68, 6.81, 6.95, 7.08, 7.22], shuttleS: [4.04, 4.12, 4.21, 4.32, 4.42], benchReps: [9, 12, 14, 17, 20] },
  TE: { fortyS: [4.55, 4.63, 4.74, 4.83, 4.91], verticalIn: [29.6, 31.5, 33.5, 35.6, 37.5], broadIn: [109, 112.5, 116, 120, 124], threeConeS: [6.87, 6.99, 7.12, 7.30, 7.44], shuttleS: [4.15, 4.25, 4.34, 4.44, 4.51], benchReps: [16, 18, 20, 23, 26] },
  OT: { fortyS: [4.96, 5.08, 5.20, 5.32, 5.42], verticalIn: [24.5, 26.5, 29.0, 30.5, 32.6], broadIn: [96, 100, 105, 110, 113], threeConeS: [7.43, 7.60, 7.80, 8.01, 8.24], shuttleS: [4.49, 4.60, 4.74, 4.87, 4.99], benchReps: [19, 21, 24, 28, 31] },
  IOL: { fortyS: [5.01, 5.12, 5.23, 5.33, 5.44], verticalIn: [24.5, 26.0, 28.0, 30.3, 32.5], broadIn: [94.5, 98, 103, 108, 111], threeConeS: [7.45, 7.58, 7.79, 7.96, 8.15], shuttleS: [4.49, 4.58, 4.70, 4.83, 4.96], benchReps: [20, 23, 26, 29, 33] },
  DT: { fortyS: [4.86, 4.96, 5.06, 5.17, 5.28], verticalIn: [26.0, 27.5, 29.5, 31.6, 33.5], broadIn: [98, 101.5, 106, 110, 114], threeConeS: [7.33, 7.49, 7.69, 7.90, 8.06], shuttleS: [4.39, 4.53, 4.65, 4.78, 4.87], benchReps: [21, 24, 27, 30, 35] },
  EDGE: { fortyS: [4.62, 4.70, 4.81, 4.92, 5.07], verticalIn: [28.5, 31.0, 33.0, 35.0, 37.4], broadIn: [106, 110, 115, 120, 124], threeConeS: [6.97, 7.12, 7.28, 7.50, 7.68], shuttleS: [4.22, 4.32, 4.41, 4.53, 4.69], benchReps: [18, 21, 24, 27, 31] },
  LB: { fortyS: [4.52, 4.60, 4.68, 4.77, 4.86], verticalIn: [30.5, 32.0, 34.0, 36.5, 39.0], broadIn: [110, 114, 118, 122, 126], threeConeS: [6.88, 6.99, 7.13, 7.27, 7.40], shuttleS: [4.09, 4.20, 4.30, 4.40, 4.51], benchReps: [17, 20, 22, 25, 28] },
  CB: { fortyS: [4.37, 4.41, 4.47, 4.53, 4.59], verticalIn: [33.0, 34.5, 36.0, 38.0, 40.0], broadIn: [117, 120, 123, 127, 131], threeConeS: [6.70, 6.82, 6.94, 7.06, 7.18], shuttleS: [3.97, 4.07, 4.19, 4.29, 4.37], benchReps: [10, 12, 15, 17, 20] },
  S: { fortyS: [4.41, 4.47, 4.54, 4.61, 4.65], verticalIn: [32.5, 33.5, 35.5, 37.5, 40.0], broadIn: [113, 117, 121, 125, 128], threeConeS: [6.66, 6.78, 6.95, 7.08, 7.21], shuttleS: [4.02, 4.10, 4.16, 4.26, 4.34], benchReps: [11, 14.5, 17, 19, 22] },
};

/**
 * D2.5.1 rule 1: cells with |skew| above 0.4. Kept for reference and checked against the data by the
 * profile test. Deviation from rule 1, logged for the D2 owner: the leaf's own acceptance (a 4.37 corner
 * shows the 90th percentile, a 4.59 corner the 10th) fails on the normal curve by about 3 points (87 and
 * 10), so every main cell reads the empirical table inside its range and the normal curve only in the tails.
 */
export const SKEWED_CELLS: ReadonlySet<string> = new Set([
  'RB.fortyS', 'EDGE.fortyS', 'IOL.threeConeS', 'EDGE.threeConeS', 'RB.threeConeS', 'EDGE.shuttleS', 'DT.benchReps', 'S.verticalIn', 'S.benchReps',
]);

const QS = [0.1, 0.25, 0.5, 0.75, 0.9] as const;

/** Raw quantile rank (0 to 1, share of the profile at or below the value) from the empirical table, linear between points and normal tails outside. */
function empiricalRank(q: Q, value: number, sd: number, math: DeterministicMath): number {
  if (value <= q[0]) return normalCdf((value - q[0]) / sd + -1.2815515655446004, math);
  if (value >= q[4]) return normalCdf((value - q[4]) / sd + 1.2815515655446004, math);
  for (let i = 1; i < 5; i++) {
    if (value <= q[i]!) {
      const span = q[i]! - q[i - 1]!;
      const f = span > 0 ? (value - q[i - 1]!) / span : 0;
      return QS[i - 1]! + f * (QS[i]! - QS[i - 1]!);
    }
  }
  return 0.9;
}

/**
 * Shown percentile (0 to 100, higher is better, timed tests flipped) of a result on the pro profile
 * of its position (D2.5.1). Main positions only; specialists and fullbacks have no norm table.
 */
export function percentile(position: ProfilePosition, test: NormTest, value: number, math: DeterministicMath): number {
  if (!MAIN_POSITIONS.includes(position)) throw new Error(`no norm table for ${position} (D2.5.1 covers the eleven main positions)`);
  const prof = proProfile(position);
  if (prof.indexOf(test as ProfileVar) < 0) throw new Error(`${position} has no ${test} norm (n/a in D2.5.1)`);
  const sd = prof.sd(test as ProfileVar);
  const q = D25_QUANTILES[position]?.[test] ?? null;
  const rank = q
    ? empiricalRank(q, value, sd, math)
    : normalCdf((value - prof.mean(test as ProfileVar)) / sd, math);
  const shown = TIMED.has(test) ? 1 - rank : rank;
  return clamp(100 * shown, 0, 100);
}
