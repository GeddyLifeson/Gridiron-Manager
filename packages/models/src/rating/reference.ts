// The reference coach (N4.2.3): a typical coach, not a perfect one. Its game management follows the
// league's median aggressiveness in the save, measured each season from the AI coaches' own decisions;
// before a save has a season of AI decisions it uses the two starting rates of N4.2.3.
import type { GameManagementView, OptionScore } from '../decisions/types.ts';
import { param } from './params.ts';

/** Versioned definition. Each score stores the reference version it was computed against (N4.2.3). */
export const REFERENCE_VERSION = 'reference.g95.1';

export interface ReferencePolicy {
  readonly version: string;
  /** Share of fourth downs where going is clearly better that the reference coach goes for it. */
  readonly goRateWhenGoClear: number;
  /** Share of fourth downs where kicking is clearly better that the reference coach kicks. */
  readonly kickRateWhenKickClear: number;
  /** For other game-management classes: share of clear calls where it picks the model's best option. */
  readonly followRateWhenClear: number;
  readonly source: 'starting' | 'league_median';
  /** Season of AI decisions the median came from, or null for the starting rates. */
  readonly seasonYear: number | null;
}

/**
 * Starting policy (N4.2.3 starting values). N4.2.3 gives no rate for classes other than fourth downs;
 * the module uses the go rate there too, the more conservative of the two numbers, until the league
 * median replaces it (README "Readings").
 */
export function startingPolicy(): ReferencePolicy {
  const go = param('referenceGoRate');
  return { version: REFERENCE_VERSION, goRateWhenGoClear: go, kickRateWhenKickClear: param('referenceKickRate'), followRateWhenClear: go, source: 'starting', seasonYear: null };
}

function half(o: OptionScore): number { return (o.high - o.low) / 2; }

/** The best option and the best other option of a view, by the staff value (N3.3.1). */
function topTwo(options: readonly OptionScore[]): { best: OptionScore; second: OptionScore } | null {
  if (options.length < 2) return null;
  const sorted = [...options].sort((a, b) => b.value - a.value || (a.optionId < b.optionId ? -1 : 1));
  return { best: sorted[0]!, second: sorted[1]! };
}

/**
 * A view is clear when the best option's edge over every other option is at least the loss band and
 * the edge's interval excludes zero (N4.2.1 rule 7). Sparse states are never clear (N3.3.1 edge case).
 */
export function clearEdge(view: GameManagementView, band = param('lossBandWp')): { best: string; edge: number } | null {
  const t = topTwo(view.options);
  if (!t || t.best.sparse || t.second.sparse) return null;
  const edge = t.best.value - t.second.value;
  if (edge < band || edge <= half(t.best) + half(t.second)) return null;
  return { best: t.best.optionId, edge };
}

/**
 * Expected WP the reference coach gives up on this fourth down. When going is clearly best it goes at
 * the go rate and otherwise kicks; when a kick is clearly best it kicks at the kick rate and otherwise
 * goes. A close call costs nothing whoever decides (N4.2.1 rule 7).
 */
export function referenceFourthDownLoss(view: GameManagementView, policy: ReferencePolicy, goOptionId = 'go'): number {
  const clear = clearEdge(view);
  if (!clear) return 0;
  const go = view.options.find((o) => o.optionId === goOptionId);
  if (!go) return (1 - policy.followRateWhenClear) * clear.edge;
  const best = view.options.find((o) => o.optionId === clear.best)!;
  if (clear.best === goOptionId) {
    const kicks = view.options.filter((o) => o.optionId !== goOptionId);
    const bestKick = kicks.reduce((a, b) => (b.value > a.value ? b : a));
    return (1 - policy.goRateWhenGoClear) * (go.value - bestKick.value);
  }
  return (1 - policy.kickRateWhenKickClear) * (best.value - go.value);
}

/** Expected WP the reference coach gives up on another clear game-management call. */
export function referenceFollowLoss(view: GameManagementView, policy: ReferencePolicy): number {
  const clear = clearEdge(view);
  return clear ? (1 - policy.followRateWhenClear) * clear.edge : 0;
}

/** One AI coach's fourth down, for the league median. */
export interface AiFourthDown {
  readonly coachId: number;
  readonly view: GameManagementView;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * The league median policy from one season of AI coaches' fourth downs (N4.2.3). Each coach's go rate on
 * clear-go downs and kick rate on clear-kick downs; the median over coaches. A rate with no coach behind
 * it keeps the previous value.
 */
export function leagueMedianPolicy(seasonYear: number, downs: readonly AiFourthDown[], previous: ReferencePolicy, goOptionId = 'go'): ReferencePolicy {
  const per = new Map<number, { goClear: number; went: number; kickClear: number; kicked: number }>();
  for (const d of downs) {
    const clear = clearEdge(d.view);
    if (!clear) continue;
    const r = per.get(d.coachId) ?? { goClear: 0, went: 0, kickClear: 0, kicked: 0 };
    const wentForIt = d.view.chosen === goOptionId;
    if (clear.best === goOptionId) { r.goClear++; if (wentForIt) r.went++; } else { r.kickClear++; if (!wentForIt) r.kicked++; }
    per.set(d.coachId, r);
  }
  const goRates: number[] = [], kickRates: number[] = [];
  for (const r of per.values()) {
    if (r.goClear) goRates.push(r.went / r.goClear);
    if (r.kickClear) kickRates.push(r.kicked / r.kickClear);
  }
  const go = median(goRates) ?? previous.goRateWhenGoClear;
  const kick = median(kickRates) ?? previous.kickRateWhenKickClear;
  return { version: REFERENCE_VERSION, goRateWhenGoClear: go, kickRateWhenKickClear: kick, followRateWhenClear: go, source: 'league_median', seasonYear };
}
