// Off-screen recruiting constants (T4, X12.1.1). Rule values (contact limits, visits, signing dates) are read
// by key from the league rules and the G-12 calendar, never stored here. Rows below are the world binding's
// own tuning and stand-ins, each an Assumption until its owner's data is held in the world.
import type { ParamFile, TuningParam } from '@gm/schema';

type Row = readonly [string, number, number, number, string, 'bible' | 'assumption', string, string];

export const MODULE = 'world.recruiting';
const ROWS: readonly Row[] = [
  // RC-02: a class's recruiting opens on January 1 of the year before it enrols (the window the G-36
  // calibration ran, 2026-01-07 to 2027-02-03, which met five of the six T4 targets).
  ['cycle.yearsBeforeEnrolment', 1, 1, 4, 'years', 'assumption', 'T4.1.1', 'One cycle per class; D13.3.2 tracks classes four years out. No source read on when real staffs start'],
  ['cycle.openMonth', 1, 1, 12, 'month', 'assumption', 'T4.1.1', 'The G-36 calibration window opens in January of the junior year'],
  // RC-03: a class first seen this many weeks after its cycle opened is still recruited; one seen later is
  // left to the turnover default fill (the first season of a new world has no recruited class).
  ['cycle.openGraceWeeks', 4, 0, 52, 'weeks', 'assumption', 'X12.1.1', 'A class needs most of a cycle to be recruited at all. No source read'],
  // RC-01: the cohort lead that gives each class its cycle.
  ['cohort.leadYears', 1, 0, 4, 'years', 'assumption', 'D13.3.2', 'Smallest lead that gives one full cycle before enrolment'],
  ['class.advisersAllowed', 1, 0, 1, 'switch', 'assumption', 'T4.4.2, T7', 'Advisers join a circle where players may be paid; no rule key says which years, so on for every year (the G-36 fixture)'],
  // RC-06 stand-ins: program and staff facts the world does not hold yet.
  ['program.prestigeScale', 100, 1, 100, 'points per prestige unit', 'assumption', 'T2', 'TeamRecord.prestige is a 0 to 1 ratio; recruiting reads 0 to 100'],
  ['program.academics', 50, 0, 100, 'points', 'assumption', 'T2', 'No academic standing on a world team yet: the middle of the scale for every program'],
  ['facts.schemeFit', 0.5, 0, 1, 'ratio', 'assumption', 'E10, T10', 'No scheme on a world staff yet: neutral fit everywhere'],
  ['people.skillScale', 100, 1, 100, 'skill points per unit', 'assumption', 'D6.4.2', 'G-36 reads evaluation skill 0 to 1; the off-screen evaluator skill (world.turnover grade.aiSkill) is on the 0 to 100 skill scale'],
  ['people.judgementError', 0.15, 0, 1, 'share of reads', 'assumption', 'K2', 'The G-36 fixture value; K2 judgement is not on a world person yet'],
  ['people.reach', 1, 0, 3, 'multiplier', 'assumption', 'T4.6.1', 'Neutral reach: staff ties to regions are not held in the world yet'],
  ['people.pressure', 0, 0, 1, 'ratio', 'assumption', 'K2.8.2', 'E4 job security is not held off-screen yet (same stand-in as world.compliance)'],
];

export const PARAMS: ParamFile = {
  module: MODULE,
  version: '1',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf, constrainedBy]): TuningParam => ({
    name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE, basis, leaf, constrainedBy, status: 'starting',
  })),
};

const BY_NAME = new Map<string, number>(PARAMS.params.map((p) => [p.name.slice(MODULE.length + 1), p.value]));

/** Reads a recruiting binding constant by short name. Throws on an unknown name. */
export function param(name: string): number {
  const v = BY_NAME.get(name);
  if (v === undefined) throw new Error(`unknown world recruiting parameter ${name}`);
  return v;
}
