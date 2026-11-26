// Test fixtures for the gm module: a seeded generator, a persistent draw, and a small league table.
import type { AgeCurve, ContributionTable, PersistentDraw, PlayerView, Rng, ValueContext } from '../../src/gm/index.ts';

export function rng(seed: number): Rng & { int(n: number): number } {
  let s = seed >>> 0;
  const u = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { uniform: u, normal: () => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u()), int: (n) => Math.floor(u() * n) };
}

/** The same standard normal for the same key, every time (what the world supplies from scoped streams). */
export const draw: PersistentDraw = (kind, gmId, key) => rng((kind === 'grade' ? 7919 : 104729) * (gmId + 1) + key * 31 + 17).normal();
export const noDraw: PersistentDraw = () => 0;

export const POSITIONS = ['QB', 'WR', 'OT', 'CB', 'RB'];
export const GROUPS = ['skill', 'line'];
const SLOTS: Record<string, number[]> = { QB: [1, 0.1], WR: [1, 1, 0.6, 0.2], OT: [1, 1, 0.2], CB: [1, 1, 0.6, 0.2], RB: [1, 0.4, 0.1] };
const WINS: Record<string, number> = { QB: 0.2, WR: 0.05, OT: 0.06, CB: 0.05, RB: 0.03 };

export const table: ContributionTable = { winsPerIss: (p) => WINS[p] ?? 0.04, replacementIss: () => 40, slotWeights: (p) => SLOTS[p] ?? [1, 0.3] };
export const curve: AgeCurve = { group: (p) => (p === 'OT' ? 'line' : 'skill'), peakAge: () => 26, primeEndAge: (p) => (p === 'RB' ? 27 : 30), declineIssPerYear: () => 2 };

export const CENTS_PER_WIN = 300_000_000;
export const ctx = (over: Partial<ValueContext> = {}): ValueContext => ({ table, curve, centsPerWin: CENTS_PER_WIN, draw: noDraw, pressure: 0, ...over });

let nextId = 1;
export function player(position: string, grade: number, over: Partial<PlayerView> = {}): PlayerView {
  return { personId: nextId++, position, age: 26, grade: { mean: grade, variance: 16 }, projected: null, fit: 1, flags: 0, costCentsByYear: [], ...over };
}

export function mean(xs: readonly number[]): number { return xs.reduce((s, x) => s + x, 0) / xs.length; }
export function corr(xs: readonly number[], ys: readonly number[]): number {
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  xs.forEach((x, i) => { sxy += (x - mx) * (ys[i]! - my); sxx += (x - mx) * (x - mx); syy += (ys[i]! - my) * (ys[i]! - my); });
  return sxy / Math.sqrt(sxx * syy);
}
