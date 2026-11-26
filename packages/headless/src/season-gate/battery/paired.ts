// The paired-policy test form (Q3.1.1). Two or more policies that differ in one choice run on the same
// seeds with everything else equal; the result is the paired difference of the measure, its interval,
// and pass or fail by the item's assertion:
//   sign      the first arm beats the second: the interval on (A - B) lies above zero.
//   ordering  each arm beats the next: every adjacent interval lies above zero.
//   band      the difference stays inside a range: the interval on (A - B) lies inside [low, high].
// An interval that straddles a bound is a fail, so a noisy run cannot pass by luck; the answer to noise
// is more pairs. A binding states how to run each arm; an item with no binding is reported NOT RUN and
// can never pass.
import { deriveSeed, seedFromHex, seedToHex } from '@gm/engine-core';
import { param } from '../params.ts';
import type { BatteryItem } from './items.ts';

/** One arm's measure for one paired unit (a game, a drive sample, a season), or null when the unit gives none. */
export type ArmRun = (seedHex: string, ruleSetId: string) => number | null;

export interface Arm { readonly label: string; readonly run: ArmRun }

export interface ItemBinding {
  readonly itemId: string;
  /** Two arms for sign and band, two or more for ordering; best first. */
  readonly arms: readonly Arm[];
  readonly pairs: number;
  /** What the number is (expected points per play, success rate, pressure rate, win probability...). */
  readonly measure: string;
  /** Band assertions only: the allowed range of (A - B). Tunable, never a single-source fact (Q3.1.1). */
  readonly band?: { readonly low: number; readonly high: number };
}

export interface PairedDifference {
  readonly armA: string;
  readonly armB: string;
  readonly n: number;
  readonly mean: number;
  readonly low: number;
  readonly high: number;
}

export type RunState = 'run' | 'not_bound' | 'not_active' | 'too_few_pairs';

export interface ItemResult {
  readonly itemId: string;
  readonly ruleSetId: string;
  readonly state: RunState;
  readonly measure: string | null;
  readonly armMeans: readonly { readonly label: string; readonly mean: number }[];
  readonly differences: readonly PairedDifference[];
  /** Null when the item did not run. */
  readonly pass: boolean | null;
  readonly note: string | null;
}

const PAIR_SEED_SCOPE = 'battery.pair';

export function pairSeedHex(masterSeedHex: string, itemId: string, pair: number): string {
  return seedToHex(deriveSeed(seedFromHex(masterSeedHex), PAIR_SEED_SCOPE, [itemId, pair]));
}

/** Mean and normal interval of paired differences. With every difference equal the interval has zero width. */
export function pairedDifference(armA: string, armB: string, diffs: readonly number[], z: number = param('battery.intervalZ')): PairedDifference {
  const n = diffs.length;
  const mean = diffs.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? diffs.reduce((a, d) => a + (d - mean) * (d - mean), 0) / (n - 1) : 0;
  const half = z * Math.sqrt(variance / n);
  return { armA, armB, n, mean, low: mean - half, high: mean + half };
}

export function assertionHolds(kind: BatteryItem['kind'], differences: readonly PairedDifference[], band: ItemBinding['band']): boolean {
  if (kind === 'band') {
    if (!band) throw new Error('a band assertion needs a range');
    return differences.every((d) => d.low >= band.low && d.high <= band.high);
  }
  return differences.every((d) => d.low > 0);
}

export function runItem(item: BatteryItem, binding: ItemBinding | undefined, ruleSetId: string, masterSeedHex: string): ItemResult {
  const blank = (state: RunState, note: string): ItemResult => ({ itemId: item.id, ruleSetId, state, measure: binding?.measure ?? null, armMeans: [], differences: [], pass: null, note });
  if (item.state !== 'active') return blank('not_active', `${item.state}: ${item.stateReason ?? ''}`.trim());
  if (!binding) return blank('not_bound', 'no binding: the policies and the measure are not wired to the engine yet');
  const want = item.kind === 'ordering' ? binding.arms.length >= 2 : binding.arms.length === 2;
  if (!want) throw new Error(`${item.id}: a ${item.kind} item cannot run with ${binding.arms.length} arms`);
  if (item.kind === 'band' && !binding.band) throw new Error(`${item.id}: a band item needs a range`);
  // Each row holds one paired unit: every arm on the same seed. A unit is kept only when every arm gave a value.
  const rows: number[][] = [];
  for (let p = 0; p < binding.pairs; p++) {
    const seed = pairSeedHex(masterSeedHex, item.id, p);
    const vals = binding.arms.map((a) => a.run(seed, ruleSetId));
    if (vals.every((v): v is number => v !== null)) rows.push(vals as number[]);
  }
  if (rows.length < param('battery.minPairs')) return blank('too_few_pairs', `${rows.length} usable pairs of ${binding.pairs}; the form needs at least ${param('battery.minPairs')}`);
  const armMeans = binding.arms.map((a, i) => ({ label: a.label, mean: rows.reduce((s, r) => s + r[i]!, 0) / rows.length }));
  const differences: PairedDifference[] = [];
  for (let i = 0; i + 1 < binding.arms.length; i++) differences.push(pairedDifference(binding.arms[i]!.label, binding.arms[i + 1]!.label, rows.map((r) => r[i]! - r[i + 1]!)));
  return { itemId: item.id, ruleSetId, state: 'run', measure: binding.measure, armMeans, differences, pass: assertionHolds(item.kind, differences, binding.band), note: null };
}
