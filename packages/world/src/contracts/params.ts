// Constants of player contracts in the off-screen world (C6, C8.3.1). Rule values (cap, minimums, rookie
// lengths, the floor periods and percents) are read by key from the league rules, never stored here.
import type { ParamFile, TuningParam } from '@gm/schema';

type Row = readonly [string, number, number, number, string, 'bible' | 'assumption', string, string];

export const MODULE = 'world.contracts';
const ROWS: readonly Row[] = [
  // C6.2.3 edge case: "A generated league year beyond 2030 keeps the last period rule (Assumption, since the
  // agreement ends then)". The last period, 2027 to 2030, is four league years (F-cap-0001). PC-04 reads the
  // same length before the first known period, under the today's-rules ruling (MO-02).
  ['floor.periodYears', 4, 1, 10, 'league years', 'bible', 'C6.2.3', 'Length of the last CBA period (2027 to 2030, F-cap-0001); the bible keeps it past 2030 (Assumption)'],
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
  if (v === undefined) throw new Error(`unknown world contracts parameter ${name}`);
  return v;
}

/** One minimum-cash-spending period, first and last league year inclusive (C6.2.3 rule 2), and its percent of the caps. */
export interface FloorPeriod { readonly from: number; readonly to: number; readonly pct: number }
