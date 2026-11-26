// Constants of the season gate harness (G-87). Harness settings, not football facts: run sizes the
// bible states as starting values, and the interval width of the paired-policy form.
import type { ParamFile, TuningParam } from '@gm/schema';

const p = (name: string, value: number, min: number, max: number, unit: string, basis: TuningParam['basis'], leaf: string, constrainedBy: string): TuningParam => ({
  name, value, min, max, unit, belongsTo: 'headless.seasonGate', basis, leaf, constrainedBy, status: 'starting',
});

export const PARAMS: ParamFile = {
  module: 'headless.seasonGate',
  version: '1',
  params: [
    p('seasonGate.seasonsPerLevel', 1000, 1, 100000, 'count', 'bible', 'Q1.7.2', 'Q1.7.2 season level: 1,000 seasons per level; the season report prints the count it ran'),
    p('seasonGate.seedGroups', 5, 1, 100, 'count', 'assumption', 'Q2.3.1', 'season report: seed groups for spread of the measured rows across groups'),
    p('battery.intervalZ', 1.96, 1, 4, 'ratio', 'assumption', 'Q3.1.1', 'two-sided 95 percent normal interval on the paired difference; season-gate test "identical policies give an interval that includes zero"'),
    p('battery.minPairs', 30, 2, 100000, 'count', 'assumption', 'Q3.1.1', 'fewest paired runs before an interval is reported; season-gate battery tests'),
  ],
};

export function param(name: string): number {
  const row = PARAMS.params.find((x) => x.name === name);
  if (!row) throw new Error(`${PARAMS.module}: no parameter ${name}`);
  return row.value;
}
