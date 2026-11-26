// The body side of a player: growth shares (D8.1.1, T8.1.1) times the aging physical index
// (D8.2.1), spread over attributes and drill results by the D8.3.1 weights. A body attribute's value
// moves by the change in its body factor; training (gain.ts) then works toward a ceiling that the
// same factor lowers. Technique never declines with age by itself (D8.3.1).
import type { AttributeId, PlayingBlock } from '@gm/schema';
import { BODY_ATTRIBUTES, MOBILITY, STRENGTH_LIKE, type PositionFamily } from './classes.ts';
import { growthShares, effectiveAge } from './growth.ts';
import { HIDDEN, adultTestKey, bodyKey, hiddenNum } from './hidden.ts';
import { num, type DevNumbers } from './params.ts';

type Tests = PlayingBlock['tests'];
/** Drill results that move with the body. `changeOfDirectionZ` is a standard score and is left alone. */
export const BODY_TESTS = ['fortyS', 'tenSplitS', 'threeConeS', 'shuttleS', 'verticalIn', 'broadIn'] as const;
export type BodyTest = (typeof BODY_TESTS)[number];
/** Timed drills: a slower body means a larger number. */
const TIMED: ReadonlySet<BodyTest> = new Set(['fortyS', 'tenSplitS', 'threeConeS', 'shuttleS']);

/** Weight of a yearly physical change on play strength (and arm and leg strength) at an age (D8.3.1). */
export function strengthWeight(n: DevNumbers, ageYears: number): number {
  const w = n.tables.agingWeights;
  return ageYears < num(n, 'aging.playStrengthLateAge') ? w.playStrengthEarly : w.playStrengthLate;
}

/** Factor of the adult peak an output is at: growth share times (1 + weight x (index - 1)). */
export function bodyFactors(n: DevNumbers, p: PlayingBlock, ageYears: number, family: PositionFamily): Record<string, number> {
  const w = n.tables.agingWeights;
  const idx = hiddenNum(p, HIDDEN.agingIndex, 1);
  const sh = growthShares(n, effectiveAge(n, p, ageYears), family);
  const aged = (weight: number) => 1 + weight * (idx - 1);
  const strength = sh.strength * aged(strengthWeight(n, ageYears));
  const out: Record<string, number> = {
    play_strength: strength,
    explosiveness: sh.speed * aged(w.explosiveness),
    stamina: aged(w.stamina),
    durability: aged(w.durability),
  };
  for (const a of STRENGTH_LIKE) out[a] = strength;
  for (const a of MOBILITY) out[a] = aged(w.mobility);
  for (const t of BODY_TESTS) out[t] = sh.speed * aged(w[t]);
  return out;
}

/** ISS points per percent for an attribute moved by the body. */
export function issPerPercent(n: DevNumbers, a: AttributeId): number {
  if ((STRENGTH_LIKE as readonly string[]).includes(a)) return num(n, 'aging.issPerPercent.play_strength');
  if ((MOBILITY as readonly string[]).includes(a)) return num(n, 'aging.issPerPercent.mobility');
  return num(n, `aging.issPerPercent.${a}`);
}

/** Attributes whose value the body moves directly. */
export const BODY_MOVED: readonly AttributeId[] = [...BODY_ATTRIBUTES, ...STRENGTH_LIKE, ...MOBILITY];

/**
 * Apply the current body factors: shift each body-moved attribute by the change in its factor since
 * last applied, and set drill results from the adult targets. A missing adult target is back-solved
 * from the current value the first time (people made before G-17 or imported without targets).
 * Returns a new block; the input is not changed.
 */
export function applyBody(n: DevNumbers, p: PlayingBlock, ageYears: number, family: PositionFamily): PlayingBlock {
  const f = bodyFactors(n, p, ageYears, family);
  const attributes = { ...p.attributes };
  const ceilings = { ...p.ceilings };
  const hidden = { ...p.hidden };
  for (const a of BODY_MOVED) {
    const now = f[a]!;
    const before = hiddenNum(p, bodyKey(a), now);
    hidden[bodyKey(a)] = now;
    const cur = attributes[a];
    if (typeof cur !== 'number') continue;
    const shift = issPerPercent(n, a) * num(n, 'scale.percent') * (now - before);
    attributes[a] = clampIss(n, cur + shift);
  }
  const tests: Tests = { ...p.tests };
  for (const t of BODY_TESTS) {
    const cur = tests[t];
    if (cur === null || cur === undefined) continue;
    const key = adultTestKey(t);
    const factor = f[t]!;
    const adult = hiddenNum(p, key, TIMED.has(t) ? cur * factor : cur / factor);
    hidden[key] = adult;
    tests[t] = TIMED.has(t) ? adult / factor : adult * factor;
  }
  return { ...p, attributes, ceilings, tests, hidden };
}

/**
 * Ceiling shift for a body-moved attribute: training cannot take it past what the body allows now
 * (a young body not grown, an old one in decline). Zero at the adult peak.
 */
export function bodyCeilingShift(n: DevNumbers, p: PlayingBlock, a: AttributeId): number {
  const f = hiddenNum(p, bodyKey(a), 1);
  return issPerPercent(n, a) * num(n, 'scale.percent') * (f - 1);
}

export function clampIss(n: DevNumbers, v: number): number {
  return Math.min(num(n, 'scale.issMax'), Math.max(0, v));
}
