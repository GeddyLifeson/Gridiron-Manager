// Position profiles (D13.2.2): the fixed distributions the generator draws from. Never the current
// population (D13.2 intro), so errors cannot feed on themselves.
import { cholesky, type Matrix } from './linalg.ts';
import { PRO_PROFILE_DATA, PROFILE_VARS, type VarStats } from './data/pro-profiles.ts';
import type { ProfilePosition } from './catalogue.ts';

export type ProfileVar = (typeof PROFILE_VARS)[number];
export { PROFILE_VARS };

/**
 * Direction of "worse" for each variable, used to shift the college-entrant profile by tier (D13.2.2):
 * +1 means a larger value is worse (times), -1 means a smaller value is worse (jumps, bench), and body
 * size shifts by half toward smaller.
 */
export const WORSE_DIRECTION: Readonly<Record<ProfileVar, number>> = {
  heightIn: -0.5, weightLb: -0.5, fortyS: 1, verticalIn: -1, broadIn: -1, threeConeS: 1, shuttleS: 1, benchReps: -1,
};

export interface Profile {
  readonly position: ProfilePosition;
  readonly n: number;
  readonly lowSample: boolean;
  /** Variables present for this position, in PROFILE_VARS order (QB has no bench, D2.3.1 edge case). */
  readonly vars: readonly ProfileVar[];
  readonly stats: Readonly<Record<ProfileVar, VarStats | null>>;
  readonly corr: Matrix;
  readonly chol: Matrix;
  /** Index of a variable in `vars`, or -1. */
  indexOf(v: ProfileVar): number;
  mean(v: ProfileVar): number;
  sd(v: ProfileVar): number;
}

const cache = new Map<string, Profile>();

/** The pro-entrant profile of a position (frozen era, D13.4.3 default). */
export function proProfile(position: ProfilePosition): Profile {
  const hit = cache.get(position);
  if (hit) return hit;
  const d = PRO_PROFILE_DATA[position];
  if (!d) throw new Error(`profile missing for ${position} (D13.2.2: a missing cell fails the build)`);
  const vars = PROFILE_VARS.filter((v) => d.vars[v] !== null);
  if (d.corr.length !== vars.length) throw new Error(`profile ${position}: correlation size ${d.corr.length} != ${vars.length} variables`);
  const stat = (v: ProfileVar) => {
    const s = d.vars[v];
    if (!s) throw new Error(`profile ${position} has no ${v}`);
    return s;
  };
  const p: Profile = {
    position, n: d.n, lowSample: d.lowSample, vars, stats: d.vars, corr: d.corr, chol: cholesky(d.corr),
    indexOf: (v) => vars.indexOf(v),
    mean: (v) => stat(v).mean,
    sd: (v) => stat(v).sd,
  };
  cache.set(position, p);
  return p;
}
