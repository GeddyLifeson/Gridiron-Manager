// Constants of club money in the world (C6.2.3). The cap itself is a rule value read by key, never stored here.
import type { ParamFile, TuningParam } from '@gm/schema';

type Row = readonly [string, number, number, number, string, 'bible' | 'assumption', string, string];

export const MODULE = 'world.money';
const ROWS: readonly Row[] = [
  // C6.2.3 rule 3: "Owner cash budget is a starting 95 to 110 percent of the cap by owner profile (Assumption (design tuning))".
  ['budget.capShareLow', 0.95, 0.5, 1.5, 'share of cap', 'bible', 'C6.2.3', 'Bible starting value, itself marked Assumption (design tuning). No source read'],
  ['budget.capShareHigh', 1.1, 0.5, 1.5, 'share of cap', 'bible', 'C6.2.3', 'Bible starting value, itself marked Assumption (design tuning). No source read'],
];

export const PARAMS: ParamFile = {
  module: MODULE,
  version: '1',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf, constrainedBy]): TuningParam => ({
    name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE, basis, leaf, constrainedBy, status: 'starting',
  })),
};

const BY_NAME = new Map<string, number>(PARAMS.params.map((p) => [p.name.slice(MODULE.length + 1), p.value]));

export function param(name: string): number {
  const v = BY_NAME.get(name);
  if (v === undefined) throw new Error(`unknown world money parameter ${name}`);
  return v;
}
