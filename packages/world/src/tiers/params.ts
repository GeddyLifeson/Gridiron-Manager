// Fidelity tier constants (G-82; X13, P6.4). Starting values from the leaves, or named Assumptions.
// X13.3.1 rule 6: until the first measurement run exists, every line here is a starting value.
import type { ParamFile, TuningParam } from '@gm/schema';

type Row = readonly [string, number, number, number, string, 'bible' | 'assumption', string, string];

export const MODULE = 'world.tiers';
const ROWS: readonly Row[] = [
  // X13.1.1 rule 6: the strength lines are config, set from X13.3.1 measurement. The leaf gives no
  // starting number; 30 is the strength X12.1.3 rule 1 uses for "an edge to anyone at tier 1 or 2".
  ['edge.tier1Line', 30, 0, 100, 'index', 'assumption', 'X13.1.1', 'Edge strength from a member of the user team that puts the other person at tier 1 (X13.1.1 rule 1). No number in the leaf; X12.1.3 rule 1 strength reused'],
  ['edge.userLine', 30, 0, 100, 'index', 'assumption', 'X13.1.1', 'Edge strength to the user that puts a person at tier 2 and keeps him there (X13.1.1 rule 2, X13.2.2 rule 3). No number in the leaf'],
  // X13.2.2 rule 4.
  ['hold.weeks', 2, 0, 8, 'weeks', 'bible', 'X13.2.2', 'X13.2.2 rule 4: a short-reason promotion is held for a starting value of 2 weeks'],
  // X13.3.1 rule 4 asks for three agreeing measurements and a reported spread; it gives no number for "agree".
  ['measure.spread', 0.1, 0.01, 0.5, 'ratio', 'assumption', 'X13.3.1', 'Largest spread (max minus min, over the median) for three measurements to count as agreeing. No number in the leaf'],
  // X13.3.1 rule 5.
  ['measure.rerunChange', 0.1, 0.01, 0.5, 'ratio', 'bible', 'X13.3.1', 'X13.3.1 rule 5: rerun when counts, play time or budgets change by more than 10 percent'],
];

export const PARAMS: ParamFile = {
  module: MODULE,
  version: '1',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf, constrainedBy]): TuningParam => ({
    name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE, basis, leaf, constrainedBy, status: 'starting',
  })),
};

const BY_NAME = new Map<string, number>(PARAMS.params.map((p) => [p.name.slice(MODULE.length + 1), p.value]));

/** Reads a tier constant by short name. Throws on an unknown name. */
export function param(name: string): number {
  const v = BY_NAME.get(name);
  if (v === undefined) throw new Error(`unknown world tiers parameter ${name}`);
  return v;
}
