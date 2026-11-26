// WP-24 diff runner parameters (Q1.3.2). The play sample is the bible's starting value; the other two are
// assumptions this module chose, named here so a reader can change them and see what they do.
import type { ParamFile, TuningParam } from '@gm/schema';

const p = (name: string, value: number, min: number, max: number, unit: string, basis: TuningParam['basis'], constrainedBy: string): TuningParam => ({
  name, value, min, max, unit, belongsTo: 'headless.diff', basis, leaf: 'Q1.3.2', constrainedBy, status: 'starting',
});

export const PARAMS: ParamFile = {
  module: 'headless.diff',
  version: '1',
  params: [
    // Q1.3.2: "a larger sample (starting value 2,000 plays)".
    p('diff.playSample', 2000, 1, 1_000_000, 'plays', 'bible', 'Q1.3.2 starting value'),
    // Share of changed plays above which the report says the random stream order probably changed and
    // play-by-play comparison is not meaningful (Q1.3.2 edge case). Assumption.
    p('diff.streamOrderShare', 0.9, 0, 1, 'share', 'assumption', 'Q1.3.2 edge case: stream order change'),
    // |z| of a mean difference above which a target row's distribution is reported as shifted. Assumption.
    p('diff.shiftZ', 3, 0, 100, 'z', 'assumption', 'Q1.3.2 distribution shift per target row (Q2.1.1)'),
  ],
};

export function diffParam(name: string): number {
  const row = PARAMS.params.find((x) => x.name === name);
  if (!row) throw new Error(`unknown diff parameter ${name}`);
  return row.value;
}
