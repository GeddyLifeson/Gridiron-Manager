// Tuning constants of culture records (X9) and culture strength (L2.4.1). Every number is a starting value
// stated in the leaf (`bible`) or a value this module's author chose to make a rule computable
// (`assumption`). Only one football fact touches this module: the X9.1.1 patience calibration target
// (head coach counts per franchise, 1 of 3, computed by the bible writer from nflverse schedules); it is a
// test target, not a value the code reads.
import type { ParamFile, TuningParam } from '@gm/schema';

export const CULTURE_MODULE = 'people.culture';

type Row = [name: string, value: number, min: number, max: number, unit: string, basis: 'bible' | 'assumption', leaf: string, constrainedBy: string];

const ROWS: Row[] = [
  // X9.1.1 record ranges and decider blend
  ['patience.min', 1, 1, 1, 'count', 'bible', 'X9.1.1 rule 4', 'culture test "ranges"'],
  ['patience.max', 6, 6, 6, 'count', 'bible', 'X9.1.1 rule 4', 'culture test "ranges"'],
  ['tolerance.max', 100, 100, 100, 'index', 'bible', 'X9.1.1 rule 4', 'culture test "ranges"'],
  ['preference.min', -1, -1, -1, 'ratio', 'bible', 'X9.1.1', 'culture test "ranges"'],
  ['preference.max', 1, 1, 1, 'ratio', 'bible', 'X9.1.1', 'culture test "ranges"'],
  ['tradition.max', 100, 100, 100, 'index', 'bible', 'X9.1.1', 'culture test "ranges"'],
  ['blend.person', 0.6, 0.6, 0.6, 'ratio', 'bible', 'X9.1.1 rule 3', 'culture test "blend"'],
  ['blend.adTraditionAbove', 70, 70, 70, 'index', 'bible', 'X9.1.1 rule 3', 'culture test "blend"'],
  // X9.2.1 expectations
  ['expect.w.longRun', 0.4, 0.4, 0.4, 'ratio', 'bible', 'X9.2.1 rule 1', 'culture test "expectation"'],
  ['expect.w.recent', 0.4, 0.4, 0.4, 'ratio', 'bible', 'X9.2.1 rule 1', 'culture test "expectation"'],
  ['expect.w.projection', 0.2, 0.2, 0.2, 'ratio', 'bible', 'X9.2.1 rule 1', 'culture test "expectation"'],
  ['expect.longRunSeasons', 10, 10, 10, 'count', 'bible', 'X9.2.1 rule 1', 'culture test "expectation"'],
  ['expect.recentSeasons', 3, 3, 3, 'count', 'bible', 'X9.2.1 rule 1', 'culture test "expectation"'],
  ['expect.ratchetUp', 0.5, 0.5, 0.5, 'ratio', 'bible', 'X9.2.1 rule 2', 'culture test "ratchet"'],
  ['expect.ratchetDown', 0.25, 0.25, 0.25, 'ratio', 'bible', 'X9.2.1 rule 2', 'culture test "ratchet"'],
  ['expect.bandWidth', 0.125, 0.125, 0.125, 'ratio', 'bible', 'X9.2.1 rule 4', 'culture test "expectation"'],
  ['expect.topShare', 0.2, 0.2, 0.2, 'ratio', 'bible', 'X9.2.1 rule 5 (top fifth)', 'culture test "postseason target"'],
  // X9.3.1 drift
  ['drift.rate', 0.05, 0.05, 0.05, 'ratio', 'bible', 'X9.3.1 rule 2', 'culture test "drift"'],
  ['drift.traditionDivisor', 125, 125, 125, 'index', 'bible', 'X9.3.1 rule 2', 'culture test "tradition slows drift"'],
  ['drift.maxRangeShare', 0.05, 0.05, 0.05, 'ratio', 'bible', 'X9.3.1 rule 3', 'culture test "drift cap"'],
  ['tradition.stableGain', 1, 1, 1, 'index', 'bible', 'X9.3.1 rule 4', 'culture test "tradition"'],
  ['tradition.ownerChange', 10, 10, 10, 'index', 'bible', 'X9.3.1 rule 4', 'culture test "tradition"'],
  ['tradition.headCoachChange', 3, 3, 3, 'index', 'bible', 'X9.3.1 rule 4', 'culture test "tradition"'],
  // X9.4.1 readers
  ['reader.conductGap', 30, 30, 30, 'index', 'bible', 'X9.4.1 (harsher or softer by more than 30 points)', 'culture test "conduct reading"'],
  // L2.4.1 culture strength
  ['strength.w.buyIn', 0.35, 0.35, 0.35, 'ratio', 'bible', 'L2.4.1', 'culture test "strength"'],
  ['strength.w.consistency', 0.3, 0.3, 0.3, 'ratio', 'bible', 'L2.4.1', 'culture test "strength"'],
  ['strength.w.cohesion', 0.15, 0.15, 0.15, 'ratio', 'bible', 'L2.4.1', 'culture test "strength"'],
  ['strength.w.continuity', 0.1, 0.1, 0.1, 'ratio', 'bible', 'L2.4.1', 'culture test "strength"'],
  ['strength.w.tenure', 0.1, 0.1, 0.1, 'ratio', 'bible', 'L2.4.1', 'culture test "strength"'],
  ['strength.tenureCapSeasons', 4, 4, 4, 'count', 'bible', 'L2.4.1', 'culture test "strength"'],
  ['strength.weeklyShare', 0.08, 0.08, 0.08, 'ratio', 'bible', 'L2.4.1', 'culture test "strength weekly cap"'],
  ['strength.newCoachStart', 40, 40, 40, 'index', 'bible', 'L2.4.1', 'culture test "coach change"'],
  ['strength.newCoachKeep', 0.6, 0.6, 0.6, 'ratio', 'bible', 'L2.4.1', 'culture test "coach change"'],
  ['strength.interimKeep', 0.8, 0.8, 0.8, 'ratio', 'bible', 'L2.4.1 edge case', 'culture test "coach change"'],
  ['strength.max', 100, 100, 100, 'index', 'bible', 'L2.4.1', 'culture test "strength"'],
];

export const PARAMS: ParamFile = {
  module: CULTURE_MODULE,
  version: '0.1.0',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf, constrainedBy]): TuningParam => ({
    name, value, min, max, unit, belongsTo: CULTURE_MODULE, basis, leaf, constrainedBy, status: 'starting',
  })),
};

const BY_NAME = new Map(PARAMS.params.map((p) => [p.name, p.value]));

export function cp(name: string): number {
  const v = BY_NAME.get(name);
  if (v === undefined) throw new Error(`${CULTURE_MODULE}: unknown parameter ${name}`);
  return v;
}

/** Seeded draw in [0, 1) from the `team.culture` stream (X9.5.1), passed in by the caller (P1.2.1, J13). */
export type Draw = () => number;
