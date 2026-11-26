// D13.2.1 steps 2, 3 and 7: adult body and true tests from the position profile, then youth growth
// backward from adult values (D8.1.1). Also the derived physical attributes of D2.3 and D2.4.
import type { DeterministicMath, RandomStream } from '@gm/schema';
import { lowerTimes } from './linalg.ts';
import { proProfile, WORSE_DIRECTION, PROFILE_VARS, type Profile, type ProfileVar } from './profiles.ts';
import { param, GROWTH_TABLE, TIER_BODY_SHIFT_SD, TIER_BODY_WIDEN } from './params.ts';
import { clamp } from './normal.ts';
import type { ProfilePosition } from './catalogue.ts';

export type Tier = 1 | 2 | 3 | 4 | 5;

/** Adult values for every profile variable the position has. Missing variables are absent. */
export type BodyVector = Partial<Record<ProfileVar, number>>;

/**
 * Draws adult height, weight and tests jointly from the profile's correlation matrix (D13.2.1 steps 2
 * and 3: "conditioned on the body by the correlation matrix"; a joint draw is the same distribution).
 * A tier shifts and widens the profile (D13.2.2 college-entrant profile); no tier is the pro profile.
 */
export function drawAdultBody(s: RandomStream, prof: Profile, tier: Tier | null): { adult: BodyVector; z: number[] } {
  const e = prof.vars.map(() => s.normal());
  const z = lowerTimes(prof.chol, e);
  const shift = tier === null ? 0 : TIER_BODY_SHIFT_SD[tier];
  const widen = tier === null ? 1 : TIER_BODY_WIDEN[tier];
  const adult: BodyVector = {};
  prof.vars.forEach((v, i) => {
    const sd = prof.sd(v);
    adult[v] = prof.mean(v) + sd * (shift * WORSE_DIRECTION[v] + widen * z[i]!);
  });
  return { adult, z };
}

/** D8.1.1 share of adult value by age, linear between table rows, clamped to the table. */
export function growthShare(age: number, kind: 'height' | 'weight' | 'strength' | 'speed'): number {
  const t = GROWTH_TABLE;
  if (age <= t[0]!.age) return t[0]![kind];
  for (let i = 1; i < t.length; i++) {
    const a = t[i - 1]!, b = t[i]!;
    if (age <= b.age) return a[kind] + ((age - a.age) / (b.age - a.age)) * (b[kind] - a[kind]);
  }
  return 1;
}

/**
 * Current values at an age from adult values (D8.1.1). `effectiveAge` already includes the maturity
 * offset. Times divide by the speed share (a slower body runs longer), jumps multiply by it, bench by
 * the strength share.
 */
export function youthBody(adult: BodyVector, effectiveAge: number): BodyVector {
  const h = growthShare(effectiveAge, 'height'), w = growthShare(effectiveAge, 'weight');
  const st = growthShare(effectiveAge, 'strength'), sp = growthShare(effectiveAge, 'speed');
  const out: BodyVector = {};
  for (const v of PROFILE_VARS) {
    const a = adult[v];
    if (a === undefined) continue;
    switch (v) {
      case 'heightIn': out[v] = a * h; break;
      case 'weightLb': out[v] = a * w; break;
      case 'fortyS': case 'threeConeS': case 'shuttleS': out[v] = a / sp; break;
      case 'verticalIn': case 'broadIn': out[v] = a * sp; break;
      case 'benchReps': out[v] = a * st; break;
    }
  }
  return out;
}

/** Standard score of a value in the pro profile (fast times are negative z). */
export function zIn(prof: Profile, v: ProfileVar, value: number): number {
  return (value - prof.mean(v)) / prof.sd(v);
}

function corrOf(prof: Profile, a: ProfileVar, b: ProfileVar): number {
  const i = prof.indexOf(a), j = prof.indexOf(b);
  return i >= 0 && j >= 0 ? prof.corr[i]![j]! : 0;
}

export interface PhysicalDraws { strengthE: number; staminaE: number; durabilityZ: number }

/**
 * D2.3.1, D2.3.2, D2.4.1, D2.4.2: physical attributes on the ISS from the current body, within the
 * position's pro profile (50 + 10 z, D2.3.1 "50 = average pro starter at the position").
 */
export function physicalIss(prof: Profile, body: BodyVector, d: PhysicalDraws): Record<'play_strength' | 'explosiveness' | 'stamina' | 'durability', number> {
  const iss = (z: number) => clamp(param('physicalProfileIss') + param('issPerSd') * z, 0, 100);
  const wz = zIn(prof, 'weightLb', body.weightLb!);
  // Play strength (D2.3.1): 0.5 bench z + 0.3 weight z + 0.2 independent, restandardised to unit variance.
  const a = param('playStrengthBench'), b = param('playStrengthWeight'), c = param('playStrengthIndependent');
  let ps: number;
  if (body.benchReps !== undefined) {
    const bz = zIn(prof, 'benchReps', body.benchReps);
    const r = corrOf(prof, 'benchReps', 'weightLb');
    // Independent weight that puts corr(bench z, strength) at the target, never below the starting 0.2.
    const t = param('playStrengthBenchCorrTarget');
    const shared = a * a + b * b + 2 * a * b * r;
    const cFit = Math.sqrt(Math.max(0, ((a + b * r) / t) * ((a + b * r) / t) - shared));
    const cUse = Math.max(c, cFit);
    ps = (a * bz + b * wz + cUse * d.strengthE) / Math.sqrt(shared + cUse * cUse);
  } else {
    // No bench column (QB, K, P): weight and the independent part only (D2.3.1 edge case).
    ps = (b * wz + c * d.strengthE) / Math.sqrt(b * b + c * c);
  }
  // Explosiveness (D2.3.2): mean of vertical z and broad z, restandardised; one jump alone if only one.
  const hasV = body.verticalIn !== undefined, hasB = body.broadIn !== undefined;
  let ex = 0;
  if (hasV && hasB) {
    const r = corrOf(prof, 'verticalIn', 'broadIn');
    ex = (zIn(prof, 'verticalIn', body.verticalIn!) + zIn(prof, 'broadIn', body.broadIn!)) / 2 / Math.sqrt((1 + r) / 2);
  } else if (hasV) ex = zIn(prof, 'verticalIn', body.verticalIn!);
  else if (hasB) ex = zIn(prof, 'broadIn', body.broadIn!);
  // Stamina (D2.4.1): correlation -0.3 with weight z.
  const rs = param('staminaWeightCorr');
  const st = rs * wz + Math.sqrt(1 - rs * rs) * d.staminaE;
  // Durability (D2.4.2): the multiplier's log z; low multiplier = durable = high ISS.
  return { play_strength: iss(ps), explosiveness: iss(ex), stamina: iss(st), durability: iss(-d.durabilityZ) };
}

/** D2.4.2 multiplier on injury probability from its log z. */
export function durabilityMultiplier(z: number, math: DeterministicMath): number {
  return clamp(math.exp(param('durabilityLogSd') * z), param('durabilityMin'), param('durabilityMax'));
}

/** D2.2.2: change-of-direction standard score from 3-cone and shuttle (fast = positive). */
export function changeOfDirectionZ(prof: Profile, body: BodyVector): number {
  const hasC = body.threeConeS !== undefined, hasS = body.shuttleS !== undefined;
  if (hasC && hasS) {
    const r = corrOf(prof, 'threeConeS', 'shuttleS');
    return -(zIn(prof, 'threeConeS', body.threeConeS!) + zIn(prof, 'shuttleS', body.shuttleS!)) / 2 / Math.sqrt((1 + r) / 2);
  }
  if (hasC) return -zIn(prof, 'threeConeS', body.threeConeS!);
  if (hasS) return -zIn(prof, 'shuttleS', body.shuttleS!);
  return 0;
}

export { proProfile, type ProfilePosition };
