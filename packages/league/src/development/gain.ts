// The gain model (D7.1.1), class rates (D7.1.2), ceilings and the development rate (D7.4.1), the
// form term (D7.4.2) and decay without use (D7.5.1).
//
// weekly gain = k x (ceiling - current) x (1 - exp(-reps / R)) x teaching x traits x age x freshness
//   x class rate x development rate x form, with noise sd 15 percent of the gain.
// A span of n weeks with constant inputs uses the closed form of n such weeks, so the fast path
// is the same model, not a lighter one (A3 row 20); `developAttribute` with weeks = 1 is one week.
import type { AttributeId, DeterministicMath, PlayingBlock, RandomStream } from '@gm/schema';
import { BODY_MOVED, bodyCeilingShift, clampIss } from './body.ts';
import { DEV_CLASS, MOVEMENT_TECHNIQUE, TENDENCIES } from './classes.ts';
import { HIDDEN, hiddenNum, peakKey } from './hidden.ts';
import { num, type DevNumbers } from './params.ts';
import { pointReps, traitMultiplier } from './teaching.ts';

/** D7.1.1 age factor. */
export function ageFactor(n: DevNumbers, ageYears: number): number {
  if (ageYears < num(n, 'gain.ageEdge.prime')) return num(n, 'gain.ageFactor.young');
  if (ageYears < num(n, 'gain.ageEdge.late')) return num(n, 'gain.ageFactor.prime');
  if (ageYears < num(n, 'gain.ageEdge.veteran')) return num(n, 'gain.ageFactor.late');
  return num(n, 'gain.ageFactor.veteran');
}

/** D7.1.2 class rate of an attribute at an age (speed and power only until 23). */
export function classRate(n: DevNumbers, a: AttributeId, ageYears: number): number {
  const c = DEV_CLASS[a];
  if (c === 'speedPower' && ageYears >= num(n, 'classRate.speedPowerMaxAge')) return 0;
  return num(n, `classRate.${c}`);
}

/** One attribute's numbers for one step. */
export interface AttributeStep {
  readonly current: number;
  /** Ceiling the training works toward now (stored ceiling with body and movement shifts). */
  readonly ceiling: number;
  /** Highest value ever held (D7.5.1). */
  readonly peak: number;
  /** Quality reps per week (after coaching points). */
  readonly reps: number;
  /** Product of every multiplier except k and the rep term. */
  readonly rate: number;
}

/**
 * n weeks of one attribute (D7.1.1, D7.5.1). Fewer than 5 reps a week: lose 0.15 percent of the value
 * per week, never below 85 percent of the peak. Otherwise close the gap to the ceiling at q per week,
 * and close the gap back to the old peak at the relearning rate (whichever is ahead). `z` is a standard
 * normal draw for the span's noise (0 for the expected path).
 */
export function stepAttribute(n: DevNumbers, math: DeterministicMath, s: AttributeStep, weeks: number, z: number): number {
  if (weeks <= 0) return s.current;
  if (s.reps < num(n, 'decay.minReps')) {
    const floor = num(n, 'decay.floorShare') * s.peak;
    if (s.current <= floor) return s.current;
    return Math.max(floor, s.current * math.pow(1 - num(n, 'decay.weeklyRate'), weeks));
  }
  const top = s.ceiling;
  if (s.current >= top) return s.current;
  const repTerm = 1 - math.exp(-s.reps / num(n, 'gain.repScale'));
  const q = Math.min(1, Math.max(0, num(n, 'gain.k') * s.rate * repTerm));
  const qRel = Math.min(1, q * num(n, 'decay.relearnMultiplier'));
  const normal = top - (top - s.current) * math.pow(1 - q, weeks);
  const back = Math.min(s.peak, top);
  const relearn = s.current < back ? back - (back - s.current) * math.pow(1 - qRel, weeks) : s.current;
  const expected = Math.max(normal, relearn) - s.current;
  const noisy = expected * (1 + (num(n, 'gain.noiseSd') * z) / math.sqrt(weeks));
  return Math.min(top, s.current + Math.max(0, noisy));
}

/** The form term after n weeks (D7.4.2): mean-reverting to 1 with an 8-week half-life, kept to 0.5..1.5. */
export function stepForm(n: DevNumbers, math: DeterministicMath, form: number, weeks: number, z: number): number {
  const half = 1 / (1 + 1);
  const rho1 = math.pow(half, 1 / num(n, 'form.halfLifeWeeks'));
  const rho = math.pow(rho1, weeks);
  const sd = num(n, 'form.weeklySd') * math.sqrt((1 - rho * rho) / (1 - rho1 * rho1));
  const next = 1 + (form - 1) * rho + sd * z;
  return Math.min(num(n, 'form.max'), Math.max(num(n, 'form.min'), next));
}

/** A change of teacher, role or scheme resets form toward 1.0 with a random kick (D7.4.2). */
export function resetForm(n: DevNumbers, stream: RandomStream): number {
  return Math.min(num(n, 'form.max'), Math.max(num(n, 'form.min'), 1 + stream.normal() * num(n, 'form.resetKickSd')));
}

/** What one development span needs besides the player. */
export interface SpanInputs {
  readonly ageYears: number;
  readonly weeks: number;
  /** Quality reps per week by attribute (D7.2.1 credit). Missing attributes had none. */
  readonly reps: Readonly<Partial<Record<AttributeId, number>>>;
  /** Teaching multiplier by attribute (D7.3.1); default 1 (median coach). */
  readonly teaching?: Readonly<Partial<Record<AttributeId, number>>>;
  /** Active coaching points (D7.3.2). Tendencies listed here move only by `tendencyStep`. */
  readonly coachingPoints?: readonly AttributeId[];
  /** D10 freshness factor 0.6 to 1 for the span; default 1. */
  readonly freshness?: number;
  /** Trait facets of the person (X1): work_habits, coachability. Missing facets read as the middle. */
  readonly facets: Readonly<Record<string, number>>;
}

/** Facet ids read here (X1.1.2 starting set; D5 calls work habits "work ethic"). */
export const FACET = { workEthic: 'work_habits', coachability: 'coachability', competitiveness: 'competitiveness', loveOfFootball: 'love_of_football' } as const;

/** Ceiling an attribute trains toward now: stored ceiling, lowered by the body and, after 30, by lost movement. */
export function effectiveCeiling(n: DevNumbers, p: PlayingBlock, a: AttributeId, ageYears: number): number {
  const stored = p.ceilings[a] ?? p.attributes[a] ?? 0;
  let c = stored;
  if (BODY_MOVED.includes(a)) c += bodyCeilingShift(n, p, a);
  if (ageYears >= num(n, 'aging.movementCeilingAge') && MOVEMENT_TECHNIQUE.includes(a)) {
    const lost = Math.max(0, 1 - hiddenNum(p, HIDDEN.agingIndex, 1));
    c -= num(n, 'aging.movementCeilingIssPerPercent') * num(n, 'scale.percent') * lost;
  }
  return clampIss(n, c);
}

/**
 * Develop every attribute of a player over one span of constant inputs, and move the form term.
 * Draws: one normal per attribute in `ATTRIBUTE_IDS` order of the block's keys (sorted), then one for form.
 */
export function developSpan(n: DevNumbers, math: DeterministicMath, p: PlayingBlock, inp: SpanInputs, stream: RandomStream): PlayingBlock {
  const devRate = hiddenNum(p, HIDDEN.devRate, num(n, 'devRate.mean'));
  const form = hiddenNum(p, HIDDEN.form, 1);
  const work = traitMultiplier(n, inp.facets[FACET.workEthic], num(n, 'trait.workEthicSwing'));
  const coach = traitMultiplier(n, inp.facets[FACET.coachability], num(n, 'trait.coachabilitySwing'));
  const age = ageFactor(n, inp.ageYears);
  const fresh = inp.freshness ?? 1;
  const points = inp.coachingPoints ?? [];
  const attributes = { ...p.attributes };
  const hidden = { ...p.hidden };
  const ids = Object.keys(p.attributes).sort() as AttributeId[];
  for (const a of ids) {
    const z = stream.normal();
    const cur = p.attributes[a]!;
    if (DEV_CLASS[a] === undefined) continue;
    const peak = Math.max(cur, hiddenNum(p, peakKey(a), cur));
    let reps = inp.reps[a] ?? 0;
    if (points.includes(a) && !TENDENCIES.includes(a)) reps = pointReps(n, reps, coach, points.length);
    const rate = classRate(n, a, inp.ageYears) * devRate * age * work * (inp.teaching?.[a] ?? 1) * fresh * form;
    const next = stepAttribute(n, math, { current: cur, ceiling: effectiveCeiling(n, p, a, inp.ageYears), peak, reps, rate }, inp.weeks, z);
    attributes[a] = next;
    hidden[peakKey(a)] = Math.max(peak, next);
  }
  hidden[HIDDEN.form] = stepForm(n, math, form, inp.weeks, stream.normal());
  return { ...p, attributes, hidden };
}
