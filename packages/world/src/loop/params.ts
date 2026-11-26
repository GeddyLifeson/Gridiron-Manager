// Off-screen loop constants (G-81; X12.1, X12.3). Starting values from the leaves, or named Assumptions.
import type { ParamFile, TuningParam } from '@gm/schema';

type Row = readonly [string, number, number, number, string, 'bible' | 'assumption', string, string];

export const MODULE = 'world.loop';
const ROWS: readonly Row[] = [
  ['week.days', 7, 7, 7, 'd', 'bible', 'X12.1.1', 'X12.1.1: one ordered pass each week'],
  // X12.1.2: leaving football after failing to land a job for 2 cycles (starting value).
  ['career.jobCyclesBeforeLeaving', 2, 1, 6, 'count', 'bible', 'X12.1.2', 'X12.1.2 starting value'],
  // X12.1.3 rule 1: no edge above 30 to anyone at tier 1 or 2.
  ['inactive.edgeStrength', 30, 0, 100, 'index', 'bible', 'X12.1.3', 'X12.1.3 rule 1 starting strength'],
  ['inactive.nearTier', 2, 1, 3, 'index', 'bible', 'X12.1.3', 'X12.1.3 rule 1: tier 1 or 2'],
  // X12.1.3 rule 2: only over 65; the yearly chance must rise with age and stay low before 75.
  ['death.minAge', 65, 50, 80, 'y', 'bible', 'X12.1.3', 'X12.1.3 rule 2 starting age: only people over this age'],
  // The age table is an Assumption until sourced (X12.1.3 open question, research owed): a yearly chance
  // that starts at `base` in the first eligible year and grows by `growth` each year, capped below 1.
  ['death.base', 0.012, 0.0001, 0.1, 'ratio', 'assumption', 'X12.1.3', 'Yearly chance in the first eligible year. No source read: Unverified, research owed'],
  ['death.growth', 1.09, 1, 1.3, 'ratio', 'assumption', 'X12.1.3', 'Growth of the yearly chance per year of age. No source read: Unverified, research owed'],
  ['death.cap', 0.6, 0.1, 0.99, 'ratio', 'assumption', 'X12.1.3', 'Highest yearly chance; below 1 so no age is a certain end'],
  ['death.lowBefore', 75, 66, 90, 'y', 'bible', 'X12.1.3', 'X12.1.3 rule 2: stay low before 75'],
  ['death.lowCeiling', 0.05, 0.001, 0.2, 'ratio', 'assumption', 'X12.1.3', 'What "low" means before 75, for the table check'],
  // Hall of Fame in the world's past (loop/hall.ts; C9.3.1, E5.6.3).
  ['hall.proOpensAfterSeasons', 43, 0, 100, 'seasons', 'assumption', 'C9.3.1', 'Real pro hall first class 1963 (2 of 3) minus league formation 1920 (1 of 3): 43. Flagged until the formation year has two more sources'],
  ['hall.proCharterClassMax', 17, 3, 40, 'count', 'assumption', 'C9.3.1', 'Real charter class of 1963 had 17 members (research/history-run: 2 of 3)'],
  ['hall.collegeOpensAfterSeasons', 82, 0, 150, 'seasons', 'assumption', 'C9.3.1', 'College hall opening after the first college season. Not sourced: Assumption, research owed (first college hall class year)'],
];

export const PARAMS: ParamFile = {
  module: MODULE,
  version: '1',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf, constrainedBy]): TuningParam => ({
    name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE, basis, leaf, constrainedBy, status: 'starting',
  })),
};

const BY_NAME = new Map<string, number>(PARAMS.params.map((p) => [p.name.slice(MODULE.length + 1), p.value]));

/** Reads a loop constant by short name. Throws on an unknown name. */
export function param(name: string): number {
  const v = BY_NAME.get(name);
  if (v === undefined) throw new Error(`unknown world loop parameter ${name}`);
  return v;
}
