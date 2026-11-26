// Test bench starting values (G1.6.2, O3.1.4). Starting values the bible puts in config, never rule values.
import type { ParamFile } from '@gm/schema';

const p = (name: string, value: number, min: number, max: number, unit: string, leaf: string, basis: 'bible' | 'assumption' = 'bible') => ({
  name, value, min, max, unit, belongsTo: 'app-services.play-bench', basis, leaf, constrainedBy: 'Q1.1.3', status: 'starting' as const,
});

export const PARAMS: ParamFile = {
  module: 'app-services.play-bench',
  version: '1',
  params: [
    /** O3.1.4: "number of runs (starting default 200, the G1.6.2 staff estimate)". */
    p('bench.runs.default', 200, 20, 2000, 'count', 'G1.6.2'),
    /** G1.6.2: "starting value 0.5 hours per estimate" (E7 action class). */
    p('bench.hours.perSession', 0.5, 0, 4, 'h', 'G1.6.2'),
    /** Two-sided 95% normal quantile for the intervals every result panel shows (O3.1.4). */
    p('bench.confidence.z', 1.96, 1, 3, 'ratio', 'O3.1.4', 'assumption'),
    /** Histogram edges in yards; gains outside fall in the end bins. */
    p('bench.histogram.minYd', -10, -30, 0, 'yd', 'O3.1.4', 'assumption'),
    p('bench.histogram.maxYd', 30, 10, 100, 'yd', 'O3.1.4', 'assumption'),
    p('bench.samples.perOpponent', 5, 1, 50, 'count', 'O3.1.4', 'assumption'),
    /** Runs between cancellation checks. */
    p('bench.chunk.runs', 25, 1, 500, 'count', 'O3.1.4', 'assumption'),
  ],
};

export function benchParam(name: string): number {
  const row = PARAMS.params.find((r) => r.name === name);
  if (!row) throw new Error(`unknown bench parameter ${name}`);
  return row.value;
}
