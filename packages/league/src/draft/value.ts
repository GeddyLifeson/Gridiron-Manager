// The pick value chart (C7.5.1) and offer pricing (C7.2.3 rule 3). No real chart values are shipped: the chart is
// fitted to the game's own simulated drafts (mean career value per slot over a soak run, N2), smoothed to a
// strictly falling curve. Each general manager's own version (rule 3) is the shipped chart bent by K7 habits.
import type { RuleSet } from '@gm/schema';
import { FIRST_ROUND, KEY, param } from './params.ts';
import type { Pick, PickLedger } from './types.ts';

/** Value by overall slot; `values[0]` is pick 1. */
export interface PickValueChart { readonly values: readonly number[] }

/** Problems with a chart: empty, not finite, or not strictly falling (C7.5.1 acceptance). */
export function chartProblems(c: PickValueChart): string[] {
  const out: string[] = [];
  if (c.values.length === 0) out.push('empty chart');
  c.values.forEach((v, i) => {
    if (!Number.isFinite(v) || v < 0) out.push(`slot ${i + FIRST_ROUND}: value must be finite and not negative`);
    if (i > 0 && !(v < c.values[i - FIRST_ROUND]!)) out.push(`slot ${i + FIRST_ROUND}: not below slot ${i}`);
  });
  return out;
}

/**
 * Fit a chart from soak samples (C7.5.1 rule 2): mean value per slot, then pool-adjacent-violators for a falling
 * fit, then each plateau stepped down by `chartMinStepRatio` so the chart is strictly falling.
 */
export function fitChart(samples: readonly { overall: number; value: number }[], slots: number): PickValueChart {
  const sum = new Array<number>(slots).fill(0);
  const cnt = new Array<number>(slots).fill(0);
  for (const s of samples) {
    const i = s.overall - FIRST_ROUND;
    if (i < 0 || i >= slots) continue;
    sum[i] = sum[i]! + s.value;
    cnt[i] = cnt[i]! + FIRST_ROUND;
  }
  const means = sum.map((v, i) => (cnt[i]! > 0 ? v / cnt[i]! : null));
  // Fill slots without samples from the previous slot (first slot falls back to the next sampled one).
  const firstKnown = means.find((m) => m !== null) ?? 0;
  let last = firstKnown;
  const filled = means.map((m) => { if (m !== null) last = m; return last; });
  // Pool adjacent violators, non-increasing.
  const blocks: { mean: number; n: number }[] = [];
  for (const v of filled) {
    blocks.push({ mean: v, n: FIRST_ROUND });
    while (blocks.length > FIRST_ROUND && blocks[blocks.length - FIRST_ROUND - FIRST_ROUND]!.mean < blocks[blocks.length - FIRST_ROUND]!.mean) {
      const b = blocks.pop()!;
      const a = blocks.pop()!;
      blocks.push({ mean: (a.mean * a.n + b.mean * b.n) / (a.n + b.n), n: a.n + b.n });
    }
  }
  const fitted = blocks.flatMap((b) => new Array<number>(b.n).fill(b.mean));
  const step = param('league.draft.chartMinStepRatio');
  const values: number[] = [];
  for (const v of fitted) {
    const prev = values[values.length - FIRST_ROUND];
    values.push(prev !== undefined && v >= prev ? prev * (FIRST_ROUND - step) : v);
  }
  return { values };
}

/** Largest change of any slot between two fits, as a share of the old value (C7.5.1 acceptance: refit stability). */
export function chartDrift(a: PickValueChart, b: PickValueChart): number {
  let worst = 0;
  a.values.forEach((v, i) => { const w = b.values[i]; if (w !== undefined && v > 0) worst = Math.max(worst, Math.abs(w - v) / v); });
  return worst;
}

/**
 * Chart value of one pick (C7.2.3 rule 3). A current-year pick with a known slot takes that slot's value; a future
 * pick is moved down `futureDiscountRoundsPerYear` rounds per year of delay and priced at a set fraction through
 * that round (its slot is unknown). Rounds past the last take the last slot.
 * @param slotOf overall slot of a current-year pick, from the selection order.
 */
export function pickValue(chart: PickValueChart, p: Pick, ledger: PickLedger, clubs: number, rules: RuleSet, slotOf: (id: string) => number | undefined): number {
  const lastSlot = chart.values.length;
  const at = (overall: number) => chart.values[Math.min(Math.max(overall, FIRST_ROUND), lastSlot) - FIRST_ROUND]!;
  if (p.year === ledger.currentYear) {
    const slot = slotOf(p.id);
    if (slot !== undefined) return at(slot);
  }
  const delay = Math.max(0, p.year - ledger.currentYear);
  const round = Math.min(p.round + delay * param('league.draft.futureDiscountRoundsPerYear'), rules.num(KEY.rounds));
  const into = Math.round(param('league.draft.futureSlotFractionOfRound') * (clubs - FIRST_ROUND));
  return at((round - FIRST_ROUND) * clubs + into + FIRST_ROUND);
}

/** Both sides' chart totals for an offer card (C7.5.1: any offer card shows both sides' totals). */
export function offerTotals(chart: PickValueChart, give: readonly Pick[], get: readonly Pick[], ledger: PickLedger, clubs: number, rules: RuleSet, slotOf: (id: string) => number | undefined): { give: number; get: number } {
  const total = (ps: readonly Pick[]) => ps.reduce((s, p) => s + pickValue(chart, p, ledger, clubs, rules, slotOf), 0);
  return { give: total(give), get: total(get) };
}
