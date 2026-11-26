// World generation constants (G-81; X10). Every number is a starting value an X10 leaf states (basis
// 'bible', with the leaf) or a named Assumption. Measured football facts are not here: roster mixes are
// in ./data/roster-mix.json with their source, and limits come from the league rules files.
import type { ParamFile, TuningParam } from '@gm/schema';

type Row = readonly [string, number, number, number, string, 'bible' | 'assumption', string, string];

export const MODULE = 'world.generation';
const ROWS: readonly Row[] = [
  // X10.1.1 history length presets (design choices, Assumption in the leaf).
  ['history.blank', 0, 0, 0, 'seasons', 'bible', 'X10.1.1', 'X10.1.1 preset: blank world'],
  ['history.short', 10, 1, 29, 'seasons', 'bible', 'X10.1.1', 'X10.1.1 preset'],
  ['history.default', 30, 10, 59, 'seasons', 'bible', 'X10.1.1', 'X10.1.1 default (Assumption in the leaf; open after X13.3.1 measurement)'],
  ['history.long', 60, 31, 120, 'seasons', 'bible', 'X10.1.1', 'X10.1.1 preset'],
  // Marlon 2026-11-26: the history may run from football's first season to today, under today's rules
  // throughout. The year is fact F-history-0001 (Verified: Rutgers, Princeton Alumni Weekly, History.com,
  // scarletknights.com, Sports Illustrated): the first intercollegiate game, 6 November 1869.
  ['history.footballStartYear', 1869, 1869, 1869, 'y', 'bible', 'X10.1.1', 'F-history-0001 (Verified): first intercollegiate game, 1869'],
  // X10.1.2 world code.
  ['code.formatVersion', 1, 1, 255, 'version', 'bible', 'X10.1.2', 'X10.1.2 rule 1: format version byte'],
  ['code.blockLength', 5, 4, 8, 'count', 'bible', 'X10.1.2', 'X10.1.2 rule 2: blocks of 5'],
  // X10.2.2 founding ages.
  ['age.proQ10', 23, 20, 26, 'y', 'bible', 'X10.2.2', 'X10.2.2 rule 1: 80 percent between 23 and 31 (project data, 1 of 3)'],
  ['age.proMedian', 26, 23, 29, 'y', 'bible', 'X10.2.2', 'X10.2.2 rule 1: median 26 (project data, 1 of 3)'],
  ['age.proQ90', 31, 28, 35, 'y', 'bible', 'X10.2.2', 'X10.2.2 rule 1: 80 percent between 23 and 31 (project data, 1 of 3)'],
  ['age.proMin', 21, 20, 23, 'y', 'assumption', 'X10.2.2', 'Lower tail of the founding pro age curve; the leaf gives only the median and the 80 percent band'],
  ['age.proMax', 40, 33, 48, 'y', 'assumption', 'X10.2.2', 'Upper tail of the founding pro age curve; the leaf gives only the median and the 80 percent band'],
  ['age.collegeFirstYear', 18, 17, 19, 'y', 'assumption', 'X10.2.2', 'Age in the first class year; T5 owns class rules and gives no founding age'],
  ['age.collegeClassYears', 5, 4, 6, 'count', 'assumption', 'X10.2.2', 'Class years spread evenly on a founding roster until T5 class shares are wired (rule 2)'],
  ['age.headCoachMin', 35, 28, 45, 'y', 'bible', 'X10.2.2', 'X10.2.2 rule 3 (Assumption in the leaf: 35 to 70, mode 50)'],
  ['age.headCoachMode', 50, 40, 60, 'y', 'bible', 'X10.2.2', 'X10.2.2 rule 3 (Assumption in the leaf)'],
  ['age.headCoachMax', 70, 60, 80, 'y', 'bible', 'X10.2.2', 'X10.2.2 rule 3 (Assumption in the leaf)'],
  ['age.staffMin', 21, 18, 25, 'y', 'bible', 'X10.2.2', 'X10.2.2 rule 4: assistants and staff 21 to 65'],
  ['age.staffMax', 65, 55, 80, 'y', 'bible', 'X10.2.2', 'X10.2.2 rule 4'],
  ['age.entryMax', 23, 21, 30, 'y', 'bible', 'X10.2.2', 'X10.2.2 rule 4: entry-level chairs 21 to 23 (S1.3.1)'],
  ['age.entryRungMax', 1, 0, 3, 'index', 'assumption', 'X10.2.2', 'Rungs treated as entry-level chairs for founding ages'],
  ['age.yearsPerRung', 2, 0, 5, 'y', 'assumption', 'X10.2.2', 'Youngest founding age rises by this per rung, so no founding coordinator is 21'],
  ['age.staffModeOffset', 10, 0, 25, 'y', 'assumption', 'X10.2.2', 'Mode of a founding assistant age above his youngest age'],
  ['age.bossMin', 40, 30, 55, 'y', 'assumption', 'X10.2.2', 'Founding owners, presidents and athletic directors: the leaf gives no spread'],
  ['age.bossMode', 58, 45, 70, 'y', 'assumption', 'X10.2.2', 'Founding bosses: mode'],
  ['age.bossMax', 80, 65, 90, 'y', 'assumption', 'X10.2.2', 'Founding bosses: oldest'],
  // X10.2.2 rule 5: staggered contract end years, 1 to the S and E maximum length.
  ['contract.staffMaxYears', 5, 1, 10, 'y', 'assumption', 'X10.2.2', 'Longest founding staff deal until E3 and S9 lengths are wired (spread is a tuning knob in the leaf)'],
  // X10.2.2 rule 6 and X8.4.3: seasons left out of calibration bands.
  ['calibration.skipSeasons', 5, 0, 10, 'seasons', 'bible', 'X10.2.2', 'X10.2.2 rule 6'],
  // Founding prestige of a club with no history level in content.
  ['prestige.neutral', 0.5, 0, 1, 'ratio', 'assumption', 'X10.2.1', 'Founding prestige where content gives no football history level'],
  // X10.3.2 validator starting bounds (for a 30-season run).
  ['validate.championsPerDecade', 3, 1, 10, 'count', 'bible', 'X10.3.2', 'X10.3.2: at least 3 different champions per level per decade'],
  ['validate.maxTitleShare', 0.6, 0.1, 1, 'ratio', 'bible', 'X10.3.2', 'X10.3.2: no team with more than 60 percent of titles'],
  ['validate.treeDepth', 3, 1, 6, 'count', 'bible', 'X10.3.2', 'X10.3.2: at least one coaching tree with depth 3'],
  ['validate.treeDepthSeasons', 30, 0, 60, 'seasons', 'bible', 'X10.1.1', 'X10.1.1 rule 4c: depth 3 needs about 30 seasons, so the check applies from there'],
  ['validate.decade', 10, 5, 20, 'seasons', 'bible', 'X10.3.2', 'X10.3.2: per decade'],
  ['validate.redoSeedStep', 1, 1, 1, 'count', 'bible', 'X10.3.2', 'X10.3.2: redo once with seed plus 1'],
  // X10.3.3 time budget.
  ['budget.targetSeconds', 600, 60, 3600, 's', 'bible', 'X10.3.3', 'X10.3.3 starting target: 30 seasons in under 10 minutes'],
  ['budget.targetSeasons', 30, 10, 60, 'seasons', 'bible', 'X10.3.3', 'X10.3.3 starting target'],
  ['budget.estimateTolerance', 0.25, 0.05, 1, 'ratio', 'bible', 'X10.1.1', 'X10.1.1 acceptance: estimate within 25 percent'],
];

export const PARAMS: ParamFile = {
  module: MODULE,
  version: '1',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf, constrainedBy]): TuningParam => ({
    name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE, basis, leaf, constrainedBy, status: 'starting',
  })),
};

const BY_NAME = new Map<string, number>(PARAMS.params.map((p) => [p.name.slice(MODULE.length + 1), p.value]));

/** Reads a generation constant by short name. Throws on an unknown name. */
export function param(name: string): number {
  const v = BY_NAME.get(name);
  if (v === undefined) throw new Error(`unknown world generation parameter ${name}`);
  return v;
}
