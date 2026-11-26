// Tuning constants of the recruiting module (plans/game-build-plan.md section 2). Values live in
// params.json because league source holds no number other than 0 and 1 (P1.1.2). Each row names the
// bible leaf that states it as a starting value (basis bible) or says it is this module's assumption.
import type { ParamFile, TuningParam } from '@gm/schema';
import paramsJson from './params.json' with { type: 'json' };

export const MODULE = 'league.recruiting';

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
  if (v === undefined) throw new Error(`unknown recruiting parameter ${name}`);
  return v;
}
