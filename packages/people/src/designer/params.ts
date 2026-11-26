// Player designer constants (G-92, D13.1). None is a measured football fact: the plausibility limits,
// record values and profiles are the generator's (G-17, D13.1.2, D13.2.2) and are read from there, so the
// designer and the generator can never disagree about what is plausible.
import type { ParamFile, TuningParam } from '@gm/schema';

type Row = readonly [string, number, number, number, string, 'bible' | 'assumption', string, string];

const MODULE = 'people.designer';
const ROWS: readonly Row[] = [
  // D13.1.1 staff grade in the side panel: what a standard look is. D13.1.1 says only "the D6 grade the
  // staff would give"; a season of film by an average position coach is an Assumption.
  ['gradeLookSnaps', 300, 1, 2000, 'count', 'assumption', 'D13.1.1', 'D6.4.2 noise per snap'],
  ['gradeStaffSkill', 50, 0, 100, 'iss', 'assumption', 'D13.1.1', 'D6.4.2 skill multiplier'],
  ['gradePriorMean', 40, 0, 100, 'iss', 'assumption', 'D13.1.1', 'D6.4.1 prior for an unknown player'],
  ['gradePriorSd', 12, 1, 30, 'iss', 'assumption', 'D13.1.1', 'D6.4.1 prior sd'],
  // Archetype shifts are held inside the plausible range: the largest centred body shift, in profile sd.
  ['archetypeMaxBodyShiftSd', 1, 0, 2, 'sd', 'assumption', 'D13.1.1', 'D13.1.2 |z| limit 3.5'],
  // Redraws of the archetype start before the last draw is kept with its warnings (D13.2.1 step 9 limit).
  ['archetypeMaxRedraws', 20, 1, 100, 'count', 'bible', 'D13.2.1', 'D13.2.1 step 9 redraw limit'],
];

export const PARAMS: ParamFile = {
  module: MODULE,
  version: 'g92.1',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf, constrainedBy]): TuningParam => ({
    name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE, basis, leaf, constrainedBy, status: 'starting',
  })),
};

const BY_NAME = new Map<string, number>(PARAMS.params.map((p) => [p.name.slice(MODULE.length + 1), p.value]));

/** Reads a designer constant by short name. Throws on an unknown name. */
export function param(name: string): number {
  const v = BY_NAME.get(name);
  if (v === undefined) throw new Error(`unknown designer parameter ${name}`);
  return v;
}
