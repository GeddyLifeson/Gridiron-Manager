// S5.4.1 the coordinator calling for someone else. He runs the full I2 or I3 loop (the G-60 console); above him
// the head coach comes on the channel a few times a game with an instruction, a veto, or a game-management
// decision that is his alone. Ignoring an instruction is logged and costs trust. A question asked ahead of time
// that the head coach answers removes that series' decision from the count. If the head coach calls, the
// coordinator suggests calls between plays, runs the bench and prepares the next series' first calls.
import { clamp, lerp, type Draw } from '../gameday/math.ts';
import { sp } from './params.ts';

export interface HeadCoachProfile {
  /** K2 hands-on trait, 0 to 1. */
  readonly handsOn: number;
  /** Trust in the user, 0 to 1 (S4.2). */
  readonly trustInUser: number;
  /** K2 ego, 0 to 1. */
  readonly ego: number;
}

/** Interventions this game (depth pass): 2 + 4 x hands-on x (1 - trust), plus 1 when trailing by more than a score in the second half. */
export function interventionBudget(hc: HeadCoachProfile, trailingBigInSecondHalf: boolean): number {
  const base = sp('coord.baseInterventions') + sp('coord.handsOnScale') * clamp(hc.handsOn, 0, 1) * (1 - clamp(hc.trustInUser, 0, 1));
  return Math.round(base) + (trailingBigInSecondHalf ? sp('coord.trailingAdd') : 0);
}

export const trailingBig = (scoreDiff: number, secondHalf: boolean): boolean => secondHalf && scoreDiff < -sp('coord.oneScorePoints');

export type InterventionKind = 'instruction' | 'veto' | 'decision';

export interface Intervention { readonly series: number; readonly kind: InterventionKind }

/** Pick the intervention kind with the 50/20/30 split. */
export function interventionKind(draw: Draw): InterventionKind {
  const u = draw();
  const a = sp('coord.shareInstruction'), b = a + sp('coord.shareVeto');
  return u < a ? 'instruction' : u < b ? 'veto' : 'decision';
}

/**
 * Lay the game's interventions over its series, at most one per series. Series whose decision was asked ahead and
 * answered (`answeredAhead`) carry no `decision` intervention: it is dropped from the count (depth pass).
 */
export function planInterventions(budget: number, seriesCount: number, answeredAhead: ReadonlySet<number>, draw: Draw): Intervention[] {
  const order = Array.from({ length: seriesCount }, (_, i) => ({ i, k: draw() })).sort((x, y) => x.k - y.k).map((x) => x.i);
  const out: Intervention[] = [];
  for (const series of order) {
    if (out.length >= budget) break;
    const kind = interventionKind(draw);
    if (kind === 'decision' && answeredAhead.has(series)) continue;
    out.push({ series, kind });
  }
  return out.sort((a, b) => a.series - b.series);
}

/** An instruction narrows the menu for a play or a series: calls carrying any of `allowTags` stay. */
export interface Instruction { readonly id: string; readonly allowTags: readonly string[]; readonly scope: 'play' | 'series' }

export function narrowMenu<T extends { tags: readonly string[] }>(menu: readonly T[], ins: Instruction): T[] {
  const kept = menu.filter((c) => c.tags.some((t) => ins.allowTags.includes(t)));
  return kept.length ? kept : [...menu];
}

/** Trust lost for ignoring an instruction: 2, or 5 if the play fails, scaled by the head coach's ego. */
export function ignoreCost(playFailed: boolean, ego: number): number {
  const base = sp(playFailed ? 'coord.ignoreCostFailed' : 'coord.ignoreCost');
  return base * lerp(sp('coord.egoScaleLow'), sp('coord.egoScaleHigh'), clamp(ego, 0, 1));
}

export interface ComplianceRow { readonly series: number; readonly instructionId: string; readonly followed: boolean; readonly playFailed: boolean; readonly trustCost: number }

export function complianceRow(series: number, ins: Instruction, callTags: readonly string[], playFailed: boolean, hc: HeadCoachProfile): ComplianceRow {
  const followed = callTags.some((t) => ins.allowTags.includes(t));
  return { series, instructionId: ins.id, followed, playFailed, trustCost: followed ? 0 : ignoreCost(playFailed, hc.ego) };
}

/** The head coach takes play calling away (edge case): the `calls_plays` flag moves and the market notices (S6). */
export function takesCallingAway(rows: readonly ComplianceRow[]): boolean {
  return rows.filter((r) => !r.followed).length >= sp('coord.takeCallingIgnored');
}
