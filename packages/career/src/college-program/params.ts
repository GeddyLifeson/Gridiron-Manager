// Tuning constants of the college program module (G-38; game build plan section 2: PARAMS with basis
// bible or assumption). Every number here is a design value; real-world numbers live in facts.json.
// Rule values (staff seat limits) are not here: they are league-rule keys in rules.ts (RULE_KEYS).
import type { ParamFile, TuningParam } from '@gm/schema';
import paramsJson from './params.json' with { type: 'json' };

export const MODULE = 'career.collegeProgram';

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
  if (v === undefined) throw new Error(`unknown college-program parameter ${name}`);
  return v;
}
