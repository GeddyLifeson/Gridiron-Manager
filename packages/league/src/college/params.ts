// Tuning constants of the college module (plans/game-build-plan.md section 2). The values live in
// params.json because league source holds no number other than 0 and 1 (P1.1.2). Each row names the
// bible leaf that states it as a starting value, or says it is this module's assumption.
import { ParamFile } from '@gm/schema';
import file from './params.json' with { type: 'json' };
import units from './units.json' with { type: 'json' };

export const PARAMS: ParamFile = ParamFile.parse(file);

const byName = new Map(PARAMS.params.map((p) => [p.name, p.value]));

/** One tuning constant by short name (without the `league.college.` prefix). Throws on an unknown name. */
export function param(name: string): number {
  const v = byName.get(`league.college.${name}`);
  if (v === undefined) throw new Error(`league.college: unknown parameter ${name}`);
  return v;
}

export const U = units;

/**
 * 2 to the power x with + and * only (no platform transcendental math, P1.1.1): whole part by
 * repeated doubling, fraction by the exponential series of f ln 2. Deterministic on every platform.
 */
export function pow2(x: number): number {
  const whole = Math.floor(x);
  const f = (x - whole) * units.ln2;
  let term = 1, sum = 1;
  for (let n = 1; n < units.expSeriesTerms; n++) { term = (term * f) / n; sum += term; }
  let out = sum;
  if (whole >= 0) for (let i = 0; i < whole; i++) out *= 1 + 1;
  else for (let i = 0; i > whole; i--) out /= 1 + 1;
  return out;
}

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
