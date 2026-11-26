// Numbers of the boss above the user (S4, K6.5): tuning constants read from params.json. Each row names
// the leaf that states it or the leaf an assumption serves. No real-world fact lives here.
import paramsJson from './params.json' with { type: 'json' };

export const MODULE = 'coachAi.boss';

type Row = readonly [string, number, number, number, string, string, string, string];

/** One tuning constant, in the contract's `TuningParam` shape (P3, plans/game-build-plan.md section 2). */
export interface BossParam {
  readonly name: string; readonly value: number; readonly min: number; readonly max: number; readonly unit: string;
  readonly belongsTo: string; readonly basis: 'bible' | 'assumption'; readonly leaf: string; readonly constrainedBy: string;
  readonly status: 'starting';
}

const params: BossParam[] = (paramsJson.rows as unknown as Row[]).map(([name, value, min, max, unit, basis, leaf, constrainedBy]) => ({
  name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE,
  basis: basis === 'bible' ? 'bible' : 'assumption', leaf, constrainedBy, status: 'starting',
}));

/** Parameter file of this module, in the contract's `ParamFile` shape. */
export const PARAMS: { readonly module: string; readonly version: string; readonly params: readonly BossParam[] } = {
  module: MODULE, version: paramsJson.version, params,
};

const byName = new Map(params.map((p) => [p.name.slice(MODULE.length + 1), p.value]));

/** Read one constant by its short name. Throws on an unknown name, so a typo cannot read as zero. */
export function B(name: string): number {
  const v = byName.get(name);
  if (v === undefined) throw new Error(`unknown boss parameter ${name}`);
  return v;
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** A 0 to 100 facet as a share from 0 to 1. */
export function share(v: number): number {
  return clamp(v, 0, B('facet_max')) / B('facet_max');
}

/** A chance kept inside [floor, 1 - floor] (MA-52: nothing possible is certain or impossible). */
export function chance(p: number): number {
  const f = B('prob_floor');
  return clamp(p, f, 1 - f);
}

export function clampTrust(t: number): number {
  return clamp(t, B('trust_min'), B('trust_max'));
}

/** A behaviour z-score as a share from 0 (worst in the design range) to 1 (best). */
export function zShare(z: number): number {
  const lim = B('z_limit');
  return (clamp(z, -lim, lim) + lim) / (lim + lim);
}
