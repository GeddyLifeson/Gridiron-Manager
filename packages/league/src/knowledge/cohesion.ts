// D9.5.1 unit cohesion from snaps together: pair cohesion = 100 x (1 - exp(-snaps / S)), game snaps at 1.0
// and full-speed practice reps at 0.6, S by unit. Decays 10 percent per season apart and 2 percent per
// in-season week apart. Effects are small and capped; every cap set to zero removes every effect.
//
// The raw counts come from the relationships ledger (people/src/relationships/cohesion.ts, `d95Inputs`).
// league may not import people (P1.2.1), so the input shape is restated here structurally.
import type { DeterministicMath } from '@gm/schema';
import { num, type KnowledgeNumbers } from './params.ts';

export const UNITS = ['ol', 'qb_center', 'qb_receiver', 'secondary'] as const;
export type CohesionUnit = (typeof UNITS)[number];

const S_KEY: Readonly<Record<CohesionUnit, string>> = {
  ol: 'cohesion.s.ol', qb_center: 'cohesion.s.qbCenter', qb_receiver: 'cohesion.s.qbReceiver', secondary: 'cohesion.s.secondary',
};

/** Raw counts for one pair, same fields as `D95PairInput` in people. */
export interface PairCounts {
  readonly unit: CohesionUnit;
  readonly a: number;
  readonly b: number;
  readonly gameSnaps: number;
  readonly practiceReps: number;
}

/** Time apart for the decay terms, computed by the caller from the pair's last date together. */
export interface Apart {
  readonly seasons: number;
  readonly inSeasonWeeks: number;
}

export function weightedSnaps(n: KnowledgeNumbers, c: Pick<PairCounts, 'gameSnaps' | 'practiceReps'>): number {
  return c.gameSnaps * num(n, 'cohesion.gameWeight') + c.practiceReps * num(n, 'cohesion.practiceWeight');
}

/** Pair cohesion 0 to 100 (hidden, K9: staff see counts and opinions, never this number). */
export function pairCohesion(n: KnowledgeNumbers, math: DeterministicMath, c: PairCounts, apart: Apart = { seasons: 0, inSeasonWeeks: 0 }): number {
  const raw = num(n, 'scale.max') * (1 - math.exp(-weightedSnaps(n, c) / num(n, S_KEY[c.unit])));
  const keep = math.pow(1 - num(n, 'cohesion.decaySeason'), Math.max(0, apart.seasons))
    * math.pow(1 - num(n, 'cohesion.decayWeek'), Math.max(0, apart.inSeasonWeeks));
  return raw * keep;
}

/** A unit's cohesion: the mean over its pairs (empty unit reads zero). */
export function unitCohesion(n: KnowledgeNumbers, math: DeterministicMath, pairs: readonly PairCounts[], apart?: (p: PairCounts) => Apart): number {
  if (pairs.length === 0) return 0;
  let s = 0;
  for (const p of pairs) s += pairCohesion(n, math, p, apart?.(p));
  return s / pairs.length;
}

/** What the engine reads (J4 to J7). Additive chances, the option agreement, and a multiplier on pass-off errors. */
export interface CohesionEffects {
  /** Added to stunt and twist pickup success (J6). */
  readonly stuntPickup: number;
  /** Added to combination block timing success (J6). */
  readonly comboTiming: number;
  /** Added to timing-route completion probability (J7). */
  readonly timingCompletion: number;
  /** Chance QB and receiver read an option route the same way (J7). */
  readonly optionAgreement: number;
  /** Multiplier on coverage pass-off error chance (J4): 1 at cohesion 0. */
  readonly passOffErrorFactor: number;
}

export function cohesionEffects(n: KnowledgeNumbers, cohesion: number): CohesionEffects {
  const t = Math.min(1, Math.max(0, cohesion / num(n, 'scale.max')));
  const lo = num(n, 'cohesion.optionAgreeLow');
  return {
    stuntPickup: t * num(n, 'cohesion.cap.stunt'),
    comboTiming: t * num(n, 'cohesion.cap.combo'),
    timingCompletion: t * num(n, 'cohesion.cap.timing'),
    optionAgreement: lo + t * (num(n, 'cohesion.optionAgreeHigh') - lo),
    passOffErrorFactor: 1 - t * num(n, 'cohesion.cap.passOff'),
  };
}
