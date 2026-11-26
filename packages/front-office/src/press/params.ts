// Tuning constants of the press question generator (H7.2, L6, K8.7.1).
// Game build plan section 2: PARAMS with basis `bible` (the leaf states the starting value; the bible marks
// every one Assumption) or `assumption` (the leaf names the parameter, this module chose the number).
// Real-world numbers are not here: the calibration targets this module is checked against are facts.json.
import type { ParamFile, TuningParam } from '@gm/schema';
import paramsJson from './params.json' with { type: 'json' };

export const MODULE = 'frontOffice.press';

type Row = readonly [string, number, number, number, string, string, string, string];

const params: TuningParam[] = (paramsJson.rows as unknown as Row[]).map(([name, value, min, max, unit, basis, leaf, constrainedBy]) => ({
  name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE,
  basis: basis === 'bible' ? 'bible' : 'assumption', leaf, constrainedBy, status: 'starting',
}));

export const PARAMS: ParamFile = { module: MODULE, version: paramsJson.version, params };

const byName = new Map(params.map((p) => [p.name.slice(MODULE.length + 1), p.value]));

/** Read one constant by its short name. Throws on an unknown name, so a typo cannot read as zero. */
export function P(name: string): number {
  const v = byName.get(name);
  if (v === undefined) throw new Error(`unknown press parameter ${name}`);
  return v;
}
