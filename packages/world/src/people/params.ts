// Constants of the people-dynamics binding: how the off-screen world measures what X5, X6, X7 and X9 read.
// The people modules hold their own rule values (needs, memory, relationships and culture PARAMS). Rows here
// are only the readings the world has to supply where no owning system measures them yet. Each is an
// Assumption, flagged, until its owner lands.
import type { ParamFile, TuningParam } from '@gm/schema';

type Row = readonly [string, number, number, number, string, 'bible' | 'assumption', string, string];

export const MODULE = 'world.people';
const ROWS: readonly Row[] = [
  // X5.1.2 playing_time: snap shares are not recorded off-screen (no depth chart step). A starter's need is
  // met; a backup's is met by this share. No source read.
  ['needs.backupPlayingTimeMet', 0.35, 0, 1, 'share', 'assumption', 'X5.1.2', 'Backup snap share stand-in until the M2 depth chart and snap counts are recorded off-screen. No source read'],
  // X5.1.2 security: a staff member in the last season of his contract has this share of the need met.
  ['needs.lastContractSeasonSecurityMet', 0.5, 0, 1, 'share', 'assumption', 'X5.1.2', 'Final contract season stand-in until C6/E3 contract security is read. No source read'],
  // X5.2.1 edge case: the offseason is one update of this many weeks at the first pass of a season
  // (the loop runs no weekly passes between the season point and week 0).
  ['needs.offseasonWeeks', 30, 0, 40, 'weeks', 'assumption', 'X5.2.1 edge case', 'Weeks between the last game and the next season, run as one update. No source read'],
  // X6.1.1 rule 2 and X7.2.2 rule 1: the memory strength a season on one staff or roster carries into the
  // tie it grows: the event type's X4 base score at room stake.
  ['edges.seasonStake', 0.6, 0, 1, 'ratio', 'bible', 'X6.1.1 rule 2', 'Room stake, X6.1.1 rule 2 starting value'],
  // X9.2.1: the public preseason projection is not frozen off-screen (X4.1.2 unbound): the long-run rate stands in.
  ['culture.projectionSeasons', 3, 1, 10, 'seasons', 'assumption', 'X9.2.1 rule 1', 'Projection stand-in: mean win rate of the last seasons until X4.1.2 freezes a projection. No source read'],
  // X9.2.1 rule 5: the top fifth of a level's win rates.
  ['culture.topFifthQuantile', 0.8, 0.8, 0.8, 'quantile', 'bible', 'X9.2.1 rule 5', 'Top fifth, X9.2.1 rule 5'],
];

export const PARAMS: ParamFile = {
  module: MODULE,
  version: '1',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf, constrainedBy]): TuningParam => ({
    name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE, basis, leaf, constrainedBy, status: 'starting',
  })),
};

const BY_NAME = new Map<string, number>(PARAMS.params.map((p) => [p.name.slice(MODULE.length + 1), p.value]));

/** Reads a binding constant by short name. Throws on an unknown name. */
export function param(name: string): number {
  const v = BY_NAME.get(name);
  if (v === undefined) throw new Error(`unknown world people parameter ${name}`);
  return v;
}
