// Tuning constants of the front office AI (K7). Rows live in params.json: basis `bible` when the K7 leaf
// states the starting value, `assumption` when the leaf names the quantity and this module chose the number.
// No real-world fact is stored here (K7 marks its philosophy and behaviour fields Assumption).
import type { ParamFile, TuningParam } from '@gm/schema';
import paramsJson from './params.json' with { type: 'json' };

export const MODULE = 'frontOffice.gm';

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
  if (v === undefined) throw new Error(`unknown front office parameter ${name}`);
  return v;
}
