// J8 formulas as pure functions of grades and context. No state, no draws: the stage takes the draws
// and passes them in, so each formula can be tested on its own.
import { issToZ } from '@gm/schema';
import { logistic } from '../dmath.ts';
import type { CarrierParams } from './params.ts';

export const clip = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

/** Internal skill scale to z (J6.1.1). A missing grade reads as the middle of the scale. */
export const zOf = (iss: number | undefined): number => issToZ(iss ?? 50);

/** J8.1.1 rule 4: look-ahead horizon in seconds. */
export function horizonS(zVision: number, p: CarrierParams): number {
  return clip(p['look.horizonBaseS'] + p['look.horizonPerZS'] * zVision, p['look.horizonMinS'], p['look.horizonMaxS']);
}

/** J8.1.1 rule 4: number of nearest defenders he accounts for. */
export function accountedDefenders(zVision: number, p: CarrierParams): number {
  return Math.round(clip(p['look.accountBase'] + p['look.accountPerZ'] * zVision, p['look.accountMin'], p['look.accountMax']));
}

/** J8.1.1 rule 4: standard deviation of the noise on lane scores, yards. */
export function laneNoiseSdYd(zVision: number, p: CarrierParams): number {
  const sd = p['look.noiseBaseYd'] - p['look.noisePerZYd'] * zVision;
  return sd < p['look.noiseFloorYd'] ? p['look.noiseFloorYd'] : sd;
}

/** J8.2.2: softmax temperature over lane scores, yards. */
export function laneTemperatureYd(zDecisiveness: number, p: CarrierParams): number {
  const t = p['style.tempBaseYd'] - p['style.tempPerZYd'] * zDecisiveness;
  return t < p['style.tempMinYd'] ? p['style.tempMinYd'] : t;
}

/** J8.2.2: bounce bias added to an outside lane, yards. `edgeTenths` is his perceived time advantage to the edge, floor 0. */
export function bounceBiasYd(edgeTenths: number, zCreativity: number, p: CarrierParams): number {
  const edge = clip(edgeTenths, 0, p['style.bounceMaxEdgeTenths']);
  return p['style.bounceYd'] * edge * (1 + p['style.bounceCreativityPerZ'] * zCreativity);
}

/** J8.2.1 rule 2: press duration, seconds. `patienceShift` is the K1.3.2 instruction shift in z. */
export function pressDurationS(zPatience: number, patienceShift: number, p: CarrierParams): number {
  const m = 1 + p['read.pressPerZ'] * (zPatience + patienceShift);
  return p['read.pressS'] * (m < 0.2 ? 0.2 : m);
}

/** J8.2.1 rule 5: chance he reads his key correctly at the read point. `knowledge` is 0 to 1 (D9, J4.5). */
export function readChance(zVision: number, knowledge: number, p: CarrierParams): number {
  return logistic(p['read.recogBeta0'] + p['read.recogPerZ'] * zVision + p['read.recogKnowledge'] * (knowledge - 0.5));
}

/** J8.4.2: chance a situation rule is known and followed this play. */
export function awarenessChance(zFbIQ: number, practicedThisWeek: boolean, p: CarrierParams): number {
  return logistic(p['aware.beta0'] + p['aware.perZ'] * zFbIQ + (practicedThisWeek ? p['aware.practiced'] : 0));
}

/** J8.4.2: the second, harder draw for "do not score, go down at the 1". */
export function doNotScoreChance(zFbIQ: number, practicedThisWeek: boolean, p: CarrierParams): number {
  return logistic(p['aware.doNotScoreBeta0'] + p['aware.perZ'] * zFbIQ + (practicedThisWeek ? p['aware.practiced'] : 0));
}

/** J8.4.3: with protection on and a high-leverage chance at the sticks, does competitiveness keep him up? */
export function competesChance(zCompetitiveness: number, p: CarrierParams): number {
  return logistic(p['slide.competeBeta0'] + p['slide.competePerZ'] * zCompetitiveness);
}

/** J8.6.1: turn-up delay after a catch, seconds. Zero in stride; otherwise falls with run after catch. */
export function turnUpDelayS(inStride: boolean, zRac: number, p: CarrierParams): number {
  if (inStride) return 0;
  const t = clip(0.5 - zRac / 4, 0, 1);
  return p['yac.turnMinS'] + (p['yac.turnMaxS'] - p['yac.turnMinS']) * t;
}

/** Softmax over scores with a temperature; ties keep the given order. Writes probabilities into `out`. */
export function softmax(scores: ArrayLike<number>, n: number, temperature: number, exp: (x: number) => number, out: Float64Array): void {
  let max = -Infinity;
  for (let i = 0; i < n; i++) if (scores[i]! > max) max = scores[i]!;
  let sum = 0;
  for (let i = 0; i < n; i++) { const e = exp((scores[i]! - max) / temperature); out[i] = e; sum += e; }
  for (let i = 0; i < n; i++) out[i] = out[i]! / sum;
}

/** Index whose cumulative probability first exceeds `u`. The last index takes any rounding remainder. */
export function pick(probs: ArrayLike<number>, n: number, u: number): number {
  let acc = 0;
  for (let i = 0; i < n - 1; i++) { acc += probs[i]!; if (u < acc) return i; }
  return n - 1;
}
