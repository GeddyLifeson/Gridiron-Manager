// The gain model (D7.1.1), class rates (D7.1.2), ceilings and the development rate (D7.4.1), the
// form term (D7.4.2) and decay without use (D7.5.1).
//
// weekly gain = k x (ceiling - current) x (1 - exp(-reps / R)) x teaching x traits x age x freshness
//   x class rate x development rate x form, with noise sd 15 percent of the gain.
// A span of n weeks with constant inputs uses the closed form of n such weeks, so the fast path
// is the same model, not a lighter one (A3 row 20); `developAttribute` with weeks = 1 is one week.
import type { AttributeId, DeterministicMath, PlayingBlock, RandomStream } from '@gm/schema';
import { BODY_MOVED, bodyCeilingShift, clampIss } from './body.ts';
import { DEV_CLASS, DEV_CLASSES, MOVEMENT_TECHNIQUE, TENDENCIES, type DevClass } from './classes.ts';
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
  return classRateOf(n, DEV_CLASS[a], ageYears);
}

function classRateOf(n: DevNumbers, c: DevClass, ageYears: number): number {
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

/**
 * The form term after n weeks (D7.4.2, Marlon's ruling 2026-11-26: uncapped). Its logarithm reverts
 * toward the level that keeps the mean at 1 with an 8-week half-life; there are no bounds, only
 * positivity, because improvement comes down to more than the player.
 */
export function stepForm(n: DevNumbers, math: DeterministicMath, form: number, weeks: number, z: number): number {
  const half = 1 / (1 + 1);
  const rho1 = math.pow(half, 1 / num(n, 'form.halfLifeWeeks'));
  const rho = math.pow(rho1, weeks);
  const s = num(n, 'form.weeklySdLog');
  const stationaryVar = (s * s) / (1 - rho1 * rho1);
  const centre = -stationaryVar * half;
  const sd = s * math.sqrt((1 - rho * rho) / (1 - rho1 * rho1));
  const logNow = math.log(Math.max(form, Number.MIN_VALUE));
  return math.exp(centre + (logNow - centre) * rho + sd * z);
}

/** A change of teacher, role or scheme resets form toward 1 with a random kick (D7.4.2), uncapped. */
export function resetForm(n: DevNumbers, math: DeterministicMath, stream: RandomStream): number {
  return meanOneLogNormal(math, num(n, 'form.resetKickSdLog'), stream.normal());
}

/** exp(sd z - sd^2 / 2): positive, mean 1, no cap. */
export function meanOneLogNormal(math: DeterministicMath, sdLog: number, z: number): number {
  return math.exp(sdLog * z - (sdLog * sdLog) / (1 + 1));
}

/**
 * This year's surroundings multiplier (D7.4.2 ruling): everything around the player that the model
 * does not name one by one (scheme fit, role, health, life away from football, the building). Drawn
 * at each rollover, mean 1, uncapped.
 */
export function drawSurroundings(n: DevNumbers, math: DeterministicMath, stream: RandomStream): number {
  return meanOneLogNormal(math, num(n, 'surroundings.yearSdLog'), stream.normal());
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
const BODY_SET: ReadonlySet<string> = new Set(BODY_MOVED);
const MOVEMENT_SET: ReadonlySet<string> = new Set(MOVEMENT_TECHNIQUE);

export function effectiveCeiling(n: DevNumbers, p: PlayingBlock, a: AttributeId, ageYears: number): number {
  const stored = p.ceilings[a] ?? p.attributes[a] ?? 0;
  let c = stored;
  if (BODY_SET.has(a)) c += bodyCeilingShift(n, p, a);
  if (MOVEMENT_SET.has(a) && ageYears >= num(n, 'aging.movementCeilingAge')) {
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
  const out: PlayingBlock = { ...p, attributes: { ...p.attributes }, hidden: { ...p.hidden } };
  developSpanInPlace(n, math, out as MutableBlock, inp, stream);
  return out;
}

/** A playing block whose attribute, ceiling, test and hidden maps the caller owns and may change in place. */
export type MutableBlock = {
  -readonly [K in keyof PlayingBlock]: PlayingBlock[K];
} & {
  attributes: Record<string, number>;
  hidden: Record<string, number>;
};

/** The numbers one span reads, looked up once per DevNumbers (the same values `num` returns). */
interface SpanNumbers {
  readonly minReps: number;
  readonly floorShare: number;
  readonly weeklyRate: number;
  readonly repScale: number;
  readonly k: number;
  readonly relearn: number;
  readonly noiseSd: number;
  readonly movementAge: number;
  readonly movementIss: number;
  readonly percent: number;
  readonly issMax: number;
  readonly workSwing: number;
  readonly coachSwing: number;
}
const SPAN_NUMBERS = new WeakMap<DevNumbers, SpanNumbers>();
function spanNumbers(n: DevNumbers): SpanNumbers {
  let s = SPAN_NUMBERS.get(n);
  if (!s) {
    s = {
      minReps: num(n, 'decay.minReps'), floorShare: num(n, 'decay.floorShare'), weeklyRate: num(n, 'decay.weeklyRate'),
      repScale: num(n, 'gain.repScale'), k: num(n, 'gain.k'), relearn: num(n, 'decay.relearnMultiplier'), noiseSd: num(n, 'gain.noiseSd'),
      movementAge: num(n, 'aging.movementCeilingAge'), movementIss: num(n, 'aging.movementCeilingIssPerPercent'),
      percent: num(n, 'scale.percent'), issMax: num(n, 'scale.issMax'),
      workSwing: num(n, 'trait.workEthicSwing'), coachSwing: num(n, 'trait.coachabilitySwing'),
    };
    SPAN_NUMBERS.set(n, s);
  }
  return s;
}

/**
 * `developSpan` on a block the caller owns: the same reads, draws and arithmetic in the same order, written
 * into `p` instead of a copy (each attribute reads only its own value, ceiling, peak and body factor, so
 * writing as it goes changes nothing). The one transcendental per attribute, the rep term, is a pure
 * function of the reps, so it is computed once per distinct reps value in the span.
 */
export function developSpanInPlace(n: DevNumbers, math: DeterministicMath, p: MutableBlock, inp: SpanInputs, stream: RandomStream): void {
  const sn = spanNumbers(n);
  const devRate = hiddenNum(p, HIDDEN.devRate, 1);
  const formNow = hiddenNum(p, HIDDEN.form, 1);
  const form = formNow * hiddenNum(p, HIDDEN.surroundings, 1);
  const work = traitMultiplier(n, inp.facets[FACET.workEthic], sn.workSwing);
  const coach = traitMultiplier(n, inp.facets[FACET.coachability], sn.coachSwing);
  const age = ageFactor(n, inp.ageYears);
  const fresh = inp.freshness ?? 1;
  const points = inp.coachingPoints ?? [];
  const attributes = p.attributes;
  const hidden = p.hidden;
  const metas = attributeMetas(attributes);
  const shared = devRate * age * work * fresh * form;
  const rates = classRates(n, inp.ageYears);
  const ceilings = p.ceilings;
  const reps0 = inp.reps;
  const weeks = inp.weeks;
  const teaching = inp.teaching;
  const ceilingOld = inp.ageYears >= sn.movementAge;
  const lost = Math.max(0, 1 - hiddenNum(p, HIDDEN.agingIndex, 1));
  const repTerms = new Map<number, number>();
  const decayPow = weeks > 0 ? math.pow(1 - sn.weeklyRate, weeks) : 1;
  const sqrtWeeks = math.sqrt(weeks);
  for (let i = 0; i < metas.length; i++) {
    const m = metas[i]!;
    const a = m.a;
    const z = stream.normal();
    const cur = attributes[a]!;
    const cls = m.cls;
    if (cls === undefined) continue;
    const key = m.peakKey;
    const pk = hidden[key];
    const peak = typeof pk === 'number' && pk > cur ? pk : cur;
    let reps = reps0[a] ?? 0;
    if (points.length > 0 && points.includes(a) && !m.tendency) reps = pointReps(n, reps, coach, points.length);
    const rate = rates.get(cls)! * shared * (teaching?.[a] ?? 1);
    // effectiveCeiling, with its numbers read once.
    let ceiling = ceilings[a] ?? cur;
    if (m.body) ceiling += bodyCeilingShift(n, p, a);
    if (ceilingOld && m.movement) ceiling -= sn.movementIss * sn.percent * lost;
    ceiling = Math.min(sn.issMax, Math.max(0, ceiling));
    // stepAttribute, with its numbers read once.
    let next = cur;
    if (weeks > 0) {
      if (reps < sn.minReps) {
        const floor = sn.floorShare * peak;
        if (!(cur <= floor)) next = Math.max(floor, cur * decayPow);
      } else if (!(cur >= ceiling)) {
        let repTerm = repTerms.get(reps);
        if (repTerm === undefined) { repTerm = 1 - math.exp(-reps / sn.repScale); repTerms.set(reps, repTerm); }
        const q = Math.min(1, Math.max(0, sn.k * rate * repTerm));
        const qRel = Math.min(1, q * sn.relearn);
        const normal = ceiling - (ceiling - cur) * math.pow(1 - q, weeks);
        const back = Math.min(peak, ceiling);
        const relearn = cur < back ? back - (back - cur) * math.pow(1 - qRel, weeks) : cur;
        const expected = Math.max(normal, relearn) - cur;
        const noisy = expected * (1 + (sn.noiseSd * z) / sqrtWeeks);
        next = Math.min(ceiling, cur + Math.max(0, noisy));
      }
    }
    if (next !== cur) attributes[a] = next;
    if (pk === undefined || next > peak || cur > peak) hidden[key] = Math.max(peak, next);
  }
  hidden[HIDDEN.form] = stepForm(n, math, formNow, weeks, stream.normal());
}

/** What the span loop needs to know of one attribute id, independent of the player. */
interface AttributeMeta {
  readonly a: AttributeId;
  readonly cls: DevClass | undefined;
  readonly peakKey: string;
  readonly body: boolean;
  readonly movement: boolean;
  readonly tendency: boolean;
}
let lastMetas: readonly AttributeMeta[] = [];
let lastSet: ReadonlySet<string> = new Set();
/** The block's attribute ids in sorted order with their facts: reused while the key set is the last block's. */
function attributeMetas(attributes: Record<string, number>): readonly AttributeMeta[] {
  const keys = Object.keys(attributes);
  if (keys.length === lastMetas.length) {
    let same = true;
    for (let i = 0; i < keys.length; i++) if (!lastSet.has(keys[i]!)) { same = false; break; }
    if (same) return lastMetas;
  }
  const sorted = keys.sort() as AttributeId[];
  lastMetas = sorted.map((a) => ({
    a, cls: DEV_CLASS[a] as DevClass | undefined, peakKey: peakKey(a), body: BODY_SET.has(a), movement: MOVEMENT_SET.has(a),
    tendency: (TENDENCIES as readonly string[]).includes(a),
  }));
  lastSet = new Set(sorted);
  return lastMetas;
}

const CLASS_RATES = new WeakMap<DevNumbers, Map<number, ReadonlyMap<string, number>>>();
/** D7.1.2 class rates at an age, per DevNumbers. */
function classRates(n: DevNumbers, ageYears: number): ReadonlyMap<string, number> {
  let byAge = CLASS_RATES.get(n);
  if (!byAge) { byAge = new Map(); CLASS_RATES.set(n, byAge); }
  let rates = byAge.get(ageYears);
  if (!rates) {
    const m = new Map<string, number>();
    for (const c of DEV_CLASSES) m.set(c, classRateOf(n, c, ageYears));
    rates = m;
    byAge.set(ageYears, rates);
  }
  return rates;
}
