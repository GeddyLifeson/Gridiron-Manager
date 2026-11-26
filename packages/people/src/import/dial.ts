// The career-curve dial (X14.3.1, D13.6.3 rules 2 and 3). Set once at world setup, 0 to 100, fixed for the life of
// the world. It blends only football attributes, and only for seasons the pack covers; past the pack's last
// season, and for injuries, events, transactions and retirement, the world's own rules apply.
import { param } from './params.ts';

export interface DialConfig { readonly value: number; readonly frozen: true }

/** Creates the world's dial. A value outside 0 to 100 or not a whole number is refused. Default 50 (Marlon to confirm). */
export function createDial(value: number = param('dial.default')): DialConfig {
  if (!Number.isInteger(value) || value < 0 || value > 100) throw new Error(`career-curve dial must be a whole number from 0 to 100, got ${value}`);
  return Object.freeze({ value, frozen: true as const });
}

/** A per-season target path: attribute values the real seasons imply, by season year (U3 applied to each real season). */
export type TargetPath = ReadonlyMap<number, Readonly<Record<string, number>>>;

/**
 * X14.3.1 rule 2: applied change = dial/100 of the step toward the target + (100 - dial)/100 of the generated
 * change. With no target for `season` (past the pack's data, rule 3), the generated change applies whole.
 */
export function blendSeason(
  current: Readonly<Record<string, number>>, generatedChange: Readonly<Record<string, number>>, target: TargetPath, season: number, dial: DialConfig,
): Record<string, number> {
  const t = target.get(season);
  const w = dial.value / 100;
  const out: Record<string, number> = {};
  for (const [a, v] of Object.entries(current)) {
    const g = generatedChange[a] ?? 0;
    const step = t && t[a] !== undefined ? t[a]! - v : null;
    const next = step === null ? v + g : v + w * step + (1 - w) * g;
    out[a] = Math.min(100, Math.max(0, Math.round(next * 10) / 10));
  }
  return out;
}

/**
 * Builds a target path by running an estimator once per future season with the data known up to that season.
 * `estimateAt(season)` is U3 with the world start moved to `season + 1`; it is called only for seasons the pack
 * holds for that person, so the path stops at his last real season.
 */
export function targetPathFrom(futureSeasons: readonly number[], estimateAt: (season: number) => Record<string, number>): TargetPath {
  const m = new Map<number, Record<string, number>>();
  for (const season of [...new Set(futureSeasons)].sort((a, b) => a - b)) m.set(season, estimateAt(season));
  return m;
}
