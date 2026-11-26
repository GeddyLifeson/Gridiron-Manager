// Constants of the world's news binding (X12.2.1, C10). Routing numbers (hop delay, pass chance, error
// rates, the national-media line, the news floor) stay in league.news; these rows only say how much of the
// routing the live world keeps between passes. Every row is a named Assumption.
import type { ParamFile, TuningParam } from '@gm/schema';

type Row = readonly [string, number, number, number, string, 'bible' | 'assumption', string, string];

export const MODULE = 'world.news';
const ROWS: readonly Row[] = [
  // News items and person-to-person deliveries are kept for the current season and this many before it; older
  // seasons keep only their tallies. Items are rebuilt from log rows on demand (C10 creates no world state), and
  // X6 memory reads deliveries within a season or two, so the window bounds a 150-season run.
  ['keepSeasons', 1, 0, 200, 'seasons', 'assumption', 'X12.2.1', 'Storage window for items and deliveries; the routing itself is unchanged. No source read'],
];

export const PARAMS: ParamFile = {
  module: MODULE,
  version: '1',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf, constrainedBy]): TuningParam => ({
    name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE, basis, leaf, constrainedBy, status: 'starting',
  })),
};

const BY_NAME = new Map<string, number>(PARAMS.params.map((p) => [p.name.slice(MODULE.length + 1), p.value]));

/** Reads a world news constant by short name. Throws on an unknown name. */
export function param(name: string): number {
  const v = BY_NAME.get(name);
  if (v === undefined) throw new Error(`unknown world news parameter ${name}`);
  return v;
}
