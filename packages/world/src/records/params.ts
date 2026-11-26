// Constants of the world's record book, notability index and label pass (X3.4.1, X4.2.2, X2.2.2). Score
// weights, bands and the keep line stay in league.awards; label maths stays in models.labels.
import type { ParamFile, TuningParam } from '@gm/schema';

type Row = readonly [string, number, number, number, string, 'bible' | 'assumption', string, string];

export const MODULE = 'world.records';
const ROWS: readonly Row[] = [
  // X3.4.1 rule 4: each list shows the top 10 (tuning knob), ties sharing a rank.
  ['book.listLength', 10, 1, 100, 'entries', 'bible', 'X3.4.1', 'X3.4.1 rule 4 top 10'],
  // X2.2.2 rule 6: labels are computed as events arrive for tier 1 and tier 2 people; tier 3 on demand.
  ['labels.weeklyTierMax', 2, 1, 3, 'tier', 'bible', 'X2.2.2', 'X2.2.2 rule 6'],
];

export const PARAMS: ParamFile = {
  module: MODULE,
  version: '1',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf, constrainedBy]): TuningParam => ({
    name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE, basis, leaf, constrainedBy, status: 'starting',
  })),
};

const BY_NAME = new Map<string, number>(PARAMS.params.map((p) => [p.name.slice(MODULE.length + 1), p.value]));

/** Reads a records constant by short name. Throws on an unknown name. */
export function param(name: string): number {
  const v = BY_NAME.get(name);
  if (v === undefined) throw new Error(`unknown world records parameter ${name}`);
  return v;
}
