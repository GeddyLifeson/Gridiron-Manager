// Long-run constants (G-88; Q1.6.1, Q1.6.2, Q1.6.4, P6.1.1, P5.4.1). Starting values from the leaves, or
// named Assumptions. The budgets are the bible's own "unmeasured starting values"; the drift tolerances are
// Q1.6.4's open question (research from real year-to-year variation is owed), so every one is an Assumption.
import type { ParamFile, TuningParam } from '@gm/schema';

type Row = readonly [string, number, number, number, string, 'bible' | 'assumption', string, string];

export const MODULE = 'headless.long_run';
const ROWS: readonly Row[] = [
  // Q1.6.1 inputs and budgets.
  ['run.seasons', 30, 1, 200, 'count', 'bible', 'Q1.6.1', 'Q1.6.1: a 30-season career run'],
  ['run.seeds', 5, 1, 100, 'count', 'bible', 'Q1.6.1', 'Q1.6.1: starting set of 5 seeds'],
  ['run.weeklySeasons', 60, 30, 200, 'count', 'bible', 'Q1.6.4', 'Q1.6.4: one 60-season run weekly'],
  ['budget.runMinutes', 90, 1, 1440, 'min', 'bible', 'Q1.6.1', 'Q1.6.1/P6.1.1: 90 minutes on 16 cores, unmeasured starting value'],
  ['budget.runCores', 16, 1, 256, 'count', 'bible', 'Q1.6.1', 'Q1.6.1: the 16-core reference build machine'],
  ['budget.saveBytesAtEnd', 1_000_000_000, 1, 1e12, 'byte', 'bible', 'P5.4.1', 'Q1.6.1/P5.4.1: save under 1 GB at season 30, unmeasured starting value'],
  ['budget.advanceSeasons', 20, 1, 100, 'count', 'bible', 'P6.1.1', 'P6.1.1 open question: the 20-season advance'],
  ['budget.advanceMinutes', 60, 1, 1440, 'min', 'bible', 'P6.1.1', 'P6.1.1: 60 minutes on the minimum machine, starting target'],
  // Q1.6.4 drift test: fit seasons 5 to 30.
  ['drift.fitFrom', 5, 1, 50, 'index', 'bible', 'Q1.6.4', 'Q1.6.4: fit a line over seasons 5 to 30'],
  ['drift.recordsFrom', 10, 1, 50, 'index', 'bible', 'Q1.6.4', 'Q1.6.4: record-fall rate after season 10'],
  // Tolerances. Q1.6.4 open question: no source read yet. Assumption, research owed.
  ['drift.slopeShare', 0.005, 0, 1, 'ratio', 'assumption', 'Q1.6.4', 'Largest |slope| per season as a share of the series mean. No source read: Unverified'],
  ['drift.bandShare', 0.25, 0, 10, 'ratio', 'assumption', 'Q1.6.4', 'Default band: every season within this share of the fitted mean. No source read: Unverified'],
  ['series.minSample', 20, 1, 10000, 'count', 'assumption', 'Q1.6.4', 'Fewest people behind a by-position or career value before it is a series point; below it the value is noise'],
  ['drift.recordWindow', 5, 2, 20, 'count', 'assumption', 'Q1.6.4', 'Seasons per window when testing that record falls decline'],
  ['drift.recordSteadyRate', 0.2, 0, 10, 'ratio', 'assumption', 'Q1.6.4', 'Record falls per tracked record per season that count as a low steady rate. No source read: Unverified'],
];

export const PARAMS: ParamFile = {
  module: MODULE,
  version: '1',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf, constrainedBy]): TuningParam => ({
    name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE, basis, leaf, constrainedBy, status: 'starting',
  })),
};

const BY_NAME = new Map<string, number>(PARAMS.params.map((p) => [p.name.slice(MODULE.length + 1), p.value]));

/** Reads a long-run constant by short name. Throws on an unknown name. */
export function param(name: string): number {
  const v = BY_NAME.get(name);
  if (v === undefined) throw new Error(`unknown long-run parameter ${name}`);
  return v;
}
