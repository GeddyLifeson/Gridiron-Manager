// Design constants of the positions module (game build plan section 2). Every value here is a starting
// value the bible states (basis "bible", all marked Assumption in X8) or one this module chose where the
// leaf names a parameter without a number (basis "assumption"). None is a real-world fact. Real-world
// staff limits are league-rules values read by key (keys.ts); turnover reference rates (X8.4.3) are
// soak bands for calibration, never inputs here.
import type { ParamFile, TuningParam } from '@gm/schema';

type Row = readonly [name: string, value: number, min: number, max: number, unit: string, basis: 'bible' | 'assumption', leaf: string];

export const MODULE = 'career.positions';

const ROWS: readonly Row[] = [
  // X8.1.2 staff size by resource band: share of each cap or seat range filled.
  ['fill.top', 1, 0, 1, 'ratio', 'bible', 'X8.1.2'],
  ['fill.middle', 0.75, 0, 1, 'ratio', 'bible', 'X8.1.2'],
  ['fill.low', 0.5, 0, 1, 'ratio', 'bible', 'X8.1.2'],
  ['fill.minGraduateAssistants', 1, 0, 10, 'count', 'bible', 'X8.1.2'],
  ['fill.minStrength', 1, 0, 10, 'count', 'bible', 'X8.1.2'],
  // X8.3.1 interim naming.
  ['interim.outsideChance', 0.05, 0, 1, 'probability', 'bible', 'X8.3.1'],
  // X8.3.2 absent play caller.
  ['standin.pregameDeadlineMinutes', 90, 0, 600, 'min', 'bible', 'X8.3.2'],
  ['standin.absenceRatePerGame', 0.003, 0, 0.1, 'probability', 'bible', 'X8.3.2'],
  // X8.4.1 firing cascade.
  ['cascade.meetWithinDays', 7, 1, 60, 'days', 'bible', 'X8.4.1'],
  ['cascade.coordinatorWindowDays', 14, 1, 90, 'days', 'bible', 'X8.4.1'],
  ['cascade.otherWindowDays', 30, 1, 120, 'days', 'bible', 'X8.4.1'],
  ['keep.coordinator', 0.15, 0, 1, 'probability', 'bible', 'X8.4.1'],
  ['keep.special_teams_coordinator', 0.30, 0, 1, 'probability', 'bible', 'X8.4.1'],
  ['keep.position_coach', 0.30, 0, 1, 'probability', 'bible', 'X8.4.1'],
  ['keep.strength_head', 0.20, 0, 1, 'probability', 'bible', 'X8.4.1'],
  ['keep.analyst_qc', 0.35, 0, 1, 'probability', 'bible', 'X8.4.1'],
  ['keep.graduate_assistant', 0.50, 0, 1, 'probability', 'bible', 'X8.4.1'],
  ['keep.adjust.strongEdge', 0.40, -1, 1, 'probability', 'bible', 'X8.4.1'],
  ['keep.adjust.topQuarterUnit', 0.10, -1, 1, 'probability', 'bible', 'X8.4.1'],
  ['keep.adjust.sameScheme', 0.10, -1, 1, 'probability', 'bible', 'X8.4.1'],
  ['keep.adjust.negativeEdge', -0.40, -1, 1, 'probability', 'bible', 'X8.4.1'],
  ['keep.clampMax', 0.95, 0, 1, 'probability', 'bible', 'X8.4.1'],
  ['follow.sameOrHigher', 0.60, 0, 1, 'probability', 'bible', 'X8.4.1'],
  ['follow.lower', 0.30, 0, 1, 'probability', 'bible', 'X8.4.1'],
  ['cascade.exitAfterDaysUnemployed', 365, 30, 1000, 'days', 'bible', 'X8.4.1'],
  // X8.4.2 vacancy filling.
  ['vacancy.poolAfterWeeks', 3, 1, 26, 'weeks', 'bible', 'X8.4.2'],
  ['vacancy.poolRungMax', 3, 0, 9, 'rung', 'assumption', 'X8.4.2'],
  ['vacancy.maxEmptyDays', 60, 7, 365, 'days', 'bible', 'X8.4.2'],
  ['vacancy.daysPerWeek', 7, 7, 7, 'days', 'assumption', 'X8.4.2'],
];

export const PARAMS: ParamFile = {
  module: MODULE,
  version: 'g25.1',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf]): TuningParam => ({
    name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE, basis, leaf,
    constrainedBy: basis === 'bible'
      ? `${leaf} acceptance; X8.4.3 soak bands (starting value, Assumption in the bible)`
      : `${leaf} acceptance (module assumption, needs research)`,
    status: 'starting',
  })),
};

const VALUES = new Map(PARAMS.params.map((p) => [p.name.slice(MODULE.length + 1), p.value] as const));

/** Read one design constant by its short name; throws on an unknown name. */
export function param(name: string): number {
  const v = VALUES.get(name);
  if (v === undefined) throw new Error(`positions: unknown parameter ${name}`);
  return v;
}
