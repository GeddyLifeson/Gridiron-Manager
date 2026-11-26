// Design constants of the ladder and duty module (game build plan section 2). Every value is either a
// starting value the bible states (basis "bible", S3 marks them Assumption) or one this module chose where
// a leaf names a parameter without a number (basis "assumption"). None is a real-world fact: graduate
// assistant bylaw values are rule keys (keys.ts) and S1.3.1 path figures are calibration targets (paths.ts).
import type { ParamFile, TuningParam } from '@gm/schema';

type Row = readonly [name: string, value: number, min: number, max: number, unit: string, basis: 'bible' | 'assumption', leaf: string];

export const MODULE = 'career.ladder';

const ROWS: readonly Row[] = [
  // S3.2.1 practice charting.
  ['chart.missPenalty', 5, 0, 50, 'points', 'bible', 'S3.2.1'],
  ['chart.checkedBelow', 80, 0, 100, 'points', 'bible', 'S3.2.1'],
  ['chart.repSecondsNormal', 40, 10, 90, 'seconds', 'bible', 'S3.2.1'],
  ['chart.repSecondsTempo', 15, 5, 60, 'seconds', 'bible', 'S3.2.1'],
  // S3.2.2 cards and signals.
  ['signal.windowSeconds', 4, 1, 20, 'seconds', 'bible', 'S3.2.2'],
  ['signal.aiWrong', 0.01, 0, 1, 'probability', 'bible', 'S3.2.2'],
  ['signal.aiLate', 0.02, 0, 1, 'probability', 'bible', 'S3.2.2'],
  ['card.windowSecondsNormal', 8, 1, 30, 'seconds', 'bible', 'S3.2.2'],
  ['card.windowSecondsTempo', 4, 1, 30, 'seconds', 'bible', 'S3.2.2'],
  // S3.2.3 video labels.
  ['video.labelWeight', 0.6, 0, 1, 'ratio', 'bible', 'S3.2.3'],
  ['video.coverageWeight', 0.4, 0, 1, 'ratio', 'bible', 'S3.2.3'],
  // S3.3.1 tagging: fixed real time per game at rung 2; never a setting (INDEX rule 9).
  ['tag.minutesPerGame', 20, 1, 120, 'min', 'bible', 'S3.3.1'],
  // S3.3.4 graduate assistant enrolment (bylaw values are rule keys; these are the bible's starting values).
  ['enrol.courseworkHoursPerWeek', 8, 0, 40, 'hours', 'bible', 'S3.3.4'],
  ['enrol.fullTimeGradLoad', 10, 1, 24, 'credit_hours', 'bible', 'S3.3.4'],
  ['enrol.termsPerYear', 2, 1, 4, 'count', 'assumption', 'S3.3.4'],
  // S3.4.1 tendency report.
  ['report.overreachBelowN', 8, 1, 100, 'count', 'bible', 'S3.4.1'],
  ['report.topTendencies', 3, 1, 10, 'count', 'bible', 'S3.4.1'],
  ['report.shareTolerance', 0.15, 0, 1, 'ratio', 'assumption', 'S3.4.1'],
  ['report.wrongFindingPenalty', 15, 0, 100, 'points', 'assumption', 'S3.4.1'],
  // S3.4.2 self-scout: G8 owns the alert threshold; this is the module's stand-in until G8 lands.
  ['selfScout.alertShare', 0.65, 0.5, 1, 'ratio', 'assumption', 'S3.4.2'],
  ['selfScout.omissionPenalty', 20, 0, 100, 'points', 'assumption', 'S3.4.2'],
  // S3.4.4 game-management advice.
  ['advice.errorPp', 2, 0, 20, 'percentage_points', 'bible', 'S3.4.4'],
  ['advice.correctMarginPp', 0.5, 0, 5, 'percentage_points', 'assumption', 'S3.4.4'],
  // S3.5.1 and S3.5.2 teaching term (H4.1.2 teach range) and its check weights.
  ['teach.min', 0.8, 0, 2, 'ratio', 'bible', 'S3.5.1'],
  ['teach.max', 1.2, 0, 2, 'ratio', 'bible', 'S3.5.1'],
  ['teach.defaultPlan', 1.0, 0, 2, 'ratio', 'bible', 'S3.5.1'],
  ['teach.weightWeakest', 0.4, 0, 1, 'ratio', 'bible', 'S3.5.1'],
  ['teach.weightPoint', 0.3, 0, 1, 'ratio', 'bible', 'S3.5.1'],
  ['teach.weightReps', 0.3, 0, 1, 'ratio', 'bible', 'S3.5.1'],
  // S3.5.3 snap grading: share of the grade from assignment agreement, the rest from technique.
  ['snap.assignmentWeight', 0.7, 0, 1, 'ratio', 'assumption', 'S3.5.3'],
  // Mixed grading (S3.1.1): truth share of a mixed grade.
  ['mixed.truthWeight', 0.6, 0, 1, 'ratio', 'assumption', 'S3.1.1'],
  // S3.1.1 edge case: how many empty rungs directly above a seat may push their duties down to it.
  ['pushDown.maxRungs', 3, 0, 9, 'count', 'assumption', 'S3.1.1'],
];

export const PARAMS: ParamFile = {
  module: MODULE,
  version: 'g55.1',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf]): TuningParam => ({
    name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE, basis, leaf,
    constrainedBy: basis === 'bible'
      ? `${leaf} starting value (Assumption or acceptance line in the bible)`
      : `${leaf} (module assumption, needs research or playtest)`,
    status: 'starting',
  })),
};

const VALUES = new Map(PARAMS.params.map((p) => [p.name.slice(MODULE.length + 1), p.value] as const));

/** Read one design constant by its short name; throws on an unknown name. */
export function param(name: string): number {
  const v = VALUES.get(name);
  if (v === undefined) throw new Error(`ladder: unknown parameter ${name}`);
  return v;
}

export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
