// Tuning constants of the memory layers (X6). Every number is an X6 starting value (`bible`) or a value
// this module's author chose to make an X6 rule computable (`assumption`). X6 states "Football facts used:
// None" for every leaf, so no fact row applies.
import type { ParamFile, TuningParam } from '@gm/schema';

export const MEMORY_MODULE = 'people.memory';

type Row = [name: string, value: number, min: number, max: number, unit: string, basis: 'bible' | 'assumption', leaf: string, constrainedBy: string];

const ROWS: Row[] = [
  ['memory.strength.max', 100, 100, 100, 'index', 'bible', 'X6.1.1', 'memory test "row strength"'],
  ['memory.stake.subject', 1.0, 1.0, 1.0, 'ratio', 'bible', 'X6.1.1 rule 2', 'memory test "row strength"'],
  ['memory.stake.room', 0.6, 0.6, 0.6, 'ratio', 'bible', 'X6.1.1 rule 2', 'memory test "row strength"'],
  ['memory.stake.onlooker', 0.3, 0.3, 0.3, 'ratio', 'bible', 'X6.1.1 rule 2', 'memory test "row strength"'],
  ['memory.secondHandFactor', 0.5, 0.5, 0.5, 'ratio', 'bible', 'X6.1.1 rule 1', 'memory test "second hand"'],
  ['memory.short.slotsPerGroup', 8, 8, 8, 'count', 'bible', 'X6.1.2', 'memory test "slot limit"'],
  ['memory.short.deleteBelow', 5, 5, 5, 'index', 'bible', 'X6.1.2', 'memory test "fade and delete"'],
  ['memory.short.flatMonthlyLoss', 0.1, 0.1, 0.1, 'ratio', 'bible', 'X6.1.2', 'memory test "fade and delete"'],
  ['memory.kind.holdShare', 0.7, 0.7, 0.7, 'ratio', 'bible', 'X6.1.3 rule 2', 'memory test "hold then fade"'],
  ['memory.kind.lifeShortMonths', 6, 6, 6, 'month', 'bible', 'X6.1.3 rule 2 (game, roster)', 'memory test "hold then fade"'],
  ['memory.kind.lifeLongMonths', 24, 24, 24, 'month', 'bible', 'X6.1.3 rule 2 (relationship, career)', 'memory test "hold then fade"'],
  ['memory.kind.stackFactor', 0.75, 0.75, 0.75, 'ratio', 'bible', 'X6.1.3 rule 3', 'memory test "repeats give less"'],
  ['memory.kind.stackCap', 5, 5, 5, 'count', 'bible', 'X6.1.3 rule 3', 'memory test "repeats give less"'],
  ['memory.kind.negativeWeight', 1.5, 1.5, 1.5, 'ratio', 'bible', 'X6.1.3 rule 4', 'memory test "losses weigh more"'],
  ['memory.permanent.cap', 12, 12, 12, 'count', 'bible', 'X6.2.1', 'memory test "permanent cap"'],
  ['memory.permanent.promoteMin', 70, 70, 70, 'index', 'bible', 'X6.2.1', 'memory test "promotion"'],
  ['memory.permanent.softenPerSeason', 0.05, 0.05, 0.05, 'ratio', 'bible', 'X6.2.2', 'memory test "softening"'],
  ['memory.permanent.softenFloor', 0.4, 0.4, 0.4, 'ratio', 'bible', 'X6.2.2', 'memory test "softening"'],
  ['memory.permanent.positiveSpeedup', 1.5, 1.5, 1.5, 'ratio', 'bible', 'X6.2.2 ("by half again")', 'memory test "softening"'],
  ['memory.permanent.refeelFactor', 0.2, 0.2, 0.2, 'ratio', 'bible', 'X6.2.2', 'memory test "re-feeling once per meeting"'],
  ['memory.outlook.minStrength', 90, 90, 90, 'index', 'bible', 'X6.3.1', 'memory test "outlook change"'],
  ['memory.outlook.chance', 0.2, 0.2, 0.2, 'probability', 'bible', 'X6.3.1 rule 1', 'memory test "outlook change"'],
  ['memory.outlook.maxPerCareer', 2, 2, 2, 'count', 'bible', 'X6.3.1 rule 1', 'memory test "outlook change"'],
  ['memory.outlook.maxShift', 10, 10, 10, 'index', 'bible', 'X6.3.1', 'memory test "outlook change"'],
  ['memory.impression.perPoint', 0.01, 0.01, 0.01, 'ratio', 'bible', 'X6.4.1', 'memory test "impressions"'],
  ['memory.months.perYear', 12, 12, 12, 'count', 'bible', 'X6.1.3 (months of a calendar year)', 'memory test "hold then fade"'],
];

export const PARAMS: ParamFile = {
  module: MEMORY_MODULE,
  version: '0.1.0',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf, constrainedBy]): TuningParam => ({
    name, value, min, max, unit, belongsTo: MEMORY_MODULE, basis, leaf, constrainedBy, status: 'starting',
  })),
};

const BY_NAME = new Map(PARAMS.params.map((p) => [p.name, p.value]));

export function mp(name: string): number {
  const v = BY_NAME.get(name);
  if (v === undefined) throw new Error(`${MEMORY_MODULE}: unknown parameter ${name}`);
  return v;
}

/** Seeded draw in [0, 1) from a `@gm/engine-core` stream, passed in by the caller (P1.2.1, J13). */
export type Draw = () => number;
