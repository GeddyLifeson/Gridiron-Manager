// The pay scale by position (C8.3.1 rule 1) and the market price of a contract the world signs (rules 2
// to 4). The scale is the real league's: shares of the cap at evenly spaced percentiles of the active
// contracts at each position (pay-scale.json, built from OverTheCap's data by facts/market-pay-build,
// fact rows F-market-pay-*, status 1 of 3). A player's place on it is his public grade rank at his
// position among the players of his level's capped clubs (D6: public estimates, never true values).
// See README decisions PC-02 and PC-11 to PC-13.
import { market } from '@gm/league';
import type { LiveWorld } from '../loop/types.ts';
import type { GradeContext } from '../turnover/binding.ts';
import scaleFile from './pay-scale.json' with { type: 'json' };
import lengthFile from './length-scale.json' with { type: 'json' };

interface ScaleRow { readonly from: readonly string[]; readonly contracts: number; readonly factId: string; readonly shares: readonly number[] }
const ROWS: Readonly<Record<string, ScaleRow>> = scaleFile.positions;

/** The snapshot date of the sourced scale. */
export const PAY_SCALE_SNAPSHOT: string = scaleFile.snapshot;

/** Fact rows the scale cites, by world position. */
export const PAY_SCALE_FACTS: Readonly<Record<string, string>> = Object.fromEntries(Object.entries(ROWS).map(([p, r]) => [p, r.factId]));

// PC-11: a position the file does not name prices from every position's shares pooled.
const POOLED: readonly number[] = Object.values(ROWS).flatMap((r) => r.shares).sort((a, b) => b - a);

/** The sourced scale at a world position, as the market module's `PositionScale` (shares highest first). */
export function sourcedScale(position: string): market.PositionScale {
  const r = ROWS[position];
  if (r) return { position, shares: r.shares, from: r.from };
  return { position, shares: POOLED, from: Object.keys(ROWS).sort() };
}

/**
 * Public percentile of each player at a position in a population (1 = best, 0 = last), ties sharing their
 * middle rank. A population of one sits at the middle.
 */
export function publicPercentiles(world: LiveWorld, grades: GradeContext, ids: readonly number[]): Map<number, number> {
  const byPos = new Map<string, { id: number; g: number }[]>();
  for (const id of ids) {
    const pos = world.people.get(id)?.playing?.position;
    if (!pos) continue;
    const list = byPos.get(pos) ?? [];
    list.push({ id, g: grades.publicGrade(id) });
    byPos.set(pos, list);
  }
  const out = new Map<number, number>();
  for (const list of byPos.values()) {
    const sorted = [...list].sort((a, b) => a.g - b.g || a.id - b.id);
    const n = sorted.length;
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && sorted[j + 1]!.g === sorted[i]!.g) j++;
      const p = n === 1 ? 0.5 : ((i + j) / 2) / (n - 1);
      for (let k = i; k <= j; k++) out.set(sorted[k]!.id, p);
      i = j + 1;
    }
  }
  return out;
}

const LENGTH = lengthFile as { readonly tierStarts: readonly number[]; readonly ageStarts: readonly number[]; readonly yearsAtQuantile: readonly (readonly (readonly number[])[])[] };

const lastStartAtOrBelow = (starts: readonly number[], x: number): number => {
  let i = 0;
  for (let k = 0; k < starts.length; k++) if (x >= starts[k]!) i = k;
  return i;
};

/**
 * PC-14: veteran contract years from the real league (length-scale.json, OverTheCap veteran signings
 * 2011-2025, fact rows F-aging-0023..0029). The pay tier and age band pick a cell; the player's place
 * within his tier picks the quantile of that cell's years, so the better-paid in a tier sign longer.
 */
export function sourcedYears(percentile: number, age: number): number {
  const ti = lastStartAtOrBelow(LENGTH.tierStarts, percentile);
  const ai = lastStartAtOrBelow(LENGTH.ageStarts, age);
  const lo = LENGTH.tierStarts[ti]!;
  const hi = ti + 1 < LENGTH.tierStarts.length ? LENGTH.tierStarts[ti + 1]! : 1;
  const qs = LENGTH.yearsAtQuantile[ti]![ai]!;
  const u = hi > lo ? (percentile - lo) / (hi - lo) : 0;
  return qs[Math.min(qs.length - 1, Math.max(0, Math.floor(u * qs.length)))]!;
}

export interface PriceInput {
  readonly position: string;
  readonly percentile: number;
  readonly suitors: number;
  readonly age: number;
  readonly primeEndAge: number;
  readonly capCents: number;
  readonly minimumCents: number;
  /** C8.3.1 rule 4 time factor (1 = the first wave). */
  readonly time: number;
}

/** C8.3.1 rules 1 to 4 on the sourced scale: years, average per year and guarantee share of one deal. */
export function marketPrice(x: PriceInput): market.ExpectedContract {
  const p = { low: x.percentile, mid: x.percentile, high: x.percentile };
  return market.contractAtTime({
    scale: sourcedScale(x.position), percentile: p, suitors: x.suitors, age: x.age, primeEndAge: x.primeEndAge,
    productiveYearsLeft: sourcedYears(x.percentile, x.age), injuryFlag: false, capCents: x.capCents, minimumCents: x.minimumCents,
  }, x.time);
}

/**
 * TO-18 (world turnover README): how much the real market pays for being better at each position, as a weight around 1. A position's
 * spread is the mean share of the cap its above-median players are paid over its median player (pay-scale.json,
 * PC-11); the weights are the spreads over their mean across `mix` (positions weighted by their roster counts).
 * Read as wins per ISS point, it makes the front office value a better quarterback over a worse one by about
 * what the league pays for that difference, instead of one rate for every position.
 */
export function positionValueWeights(mix: Readonly<Record<string, number>>): Record<string, number> {
  const spread = (position: string): number => {
    const sh = sourcedScale(position).shares;
    const mid = Math.floor((sh.length - 1) / 2);
    let s = 0;
    for (let i = 0; i < mid; i++) s += sh[i]! - sh[mid]!;
    return mid > 0 ? s / mid : 0;
  };
  const positions = Object.keys(mix).sort();
  const total = positions.reduce((a, p) => a + (mix[p] ?? 0), 0);
  const mean = total > 0 ? positions.reduce((a, p) => a + (mix[p] ?? 0) * spread(p), 0) / total : 0;
  const out: Record<string, number> = {};
  for (const p of positions) out[p] = mean > 0 ? spread(p) / mean : 1;
  return out;
}
