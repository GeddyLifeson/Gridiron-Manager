// K7.2.2 player value as the front office sees it: one function used by every transaction decision.
// value = wins above a replacement-level player over the horizon, as this club estimates; surplus = value - cost.
// Reads the club's estimate only (rule 6). A position's worth to a club is its lineup: a player's value in a
// deal is what he adds to the lineup he joins, so three depth players never add up to a starter (Q4.3.1).
import { effectiveHorizon, type GmProfile } from './profile.ts';
import { P } from './params.ts';
import { clamp, sum, type PlayerView, type ValueContext } from './types.ts';

/** Sd of this general manager's persistent grading lean, ISS (K7.1.1 reader of `evaluation`). */
export function leanSd(evaluation: number): number {
  return P('value.leanSdBase') * clamp(1 - P('value.leanSdPerZ') * evaluation, P('value.leanSdMinFactor'), P('value.leanSdMaxFactor'));
}

/** Weight of a season `y` years ahead (rule 3): 1 this season, falling by his horizon, shortened under pressure. */
export function yearWeight(gm: GmProfile, pressure: number, y: number): number {
  const h = effectiveHorizon(gm.philosophy.timeHorizon, pressure);
  const perYear = P('value.futureWeightMin') + (P('value.futureWeightMax') - P('value.futureWeightMin')) * h;
  let w = 1;
  for (let i = 0; i < y; i++) w *= perYear;
  return w;
}

/** The grade he expects `y` seasons ahead (rules 2 and 3 and the edge case on thin evidence). */
export function expectedGrade(gm: GmProfile, v: PlayerView, ctx: ValueContext, y: number): number {
  const ph = gm.philosophy;
  const sd = Math.sqrt(v.grade.variance);
  const lean = ctx.draw('grade', gm.personId, v.personId) * leanSd(gm.behavior.evaluation);
  // A risk-averse general manager values the lower part of the band.
  const caution = (1 - ph.riskOnTraits) / 2;
  let g = v.grade.mean + lean - caution * P('value.riskBandZ') * sd;
  if (v.projected) {
    const toPeak = Math.max(1, ctx.curve.peakAge(v.position) - v.age);
    const share = Math.min(1, y / toPeak);
    const trust = P('value.projectionTrustMin') + (P('value.projectionTrustMax') - P('value.projectionTrustMin')) * (1 - caution);
    g += share * trust * Math.max(0, v.projected.mean - v.grade.mean);
  }
  const past = Math.max(0, v.age + y - ctx.curve.primeEndAge(v.position));
  const belief = ph.ageCurveBelief[ctx.curve.group(v.position)] ?? 1;
  return g - past * ctx.curve.declineIssPerYear(v.position) * belief;
}

/** Estimated wins above replacement by season, undiscounted, for `years` seasons from this one. */
export function winsByYear(gm: GmProfile, v: PlayerView, ctx: ValueContext, years: number = P('value.horizonYears')): number[] {
  if (!ctx.memo) return computeWinsByYear(gm, v, ctx, years);
  let byGm = WINS.get(ctx);
  if (!byGm) { byGm = new WeakMap(); WINS.set(ctx, byGm); }
  let byView = byGm.get(gm);
  if (!byView) { byView = new WeakMap(); byGm.set(gm, byView); }
  let byYears = byView.get(v);
  if (!byYears) { byYears = new Map(); byView.set(v, byYears); }
  let out = byYears.get(years);
  if (!out) { out = computeWinsByYear(gm, v, ctx, years); byYears.set(years, out); }
  // A fresh array each call, as without the memory, so a caller may change what it gets.
  return [...out];
}

const WINS = new WeakMap<ValueContext, WeakMap<GmProfile, WeakMap<PlayerView, Map<number, readonly number[]>>>>();

function computeWinsByYear(gm: GmProfile, v: PlayerView, ctx: ValueContext, years: number): number[] {
  const own = (gm.philosophy.positionValues[v.position] ?? 1) * v.fit;
  const flags = Math.max(0, 1 - P('value.flagDiscount') * v.flags);
  const t = ctx.table;
  const above = (iss: number) => (t.winsAbove ? Math.max(0, t.winsAbove(v.position, iss)) : Math.max(0, iss - t.replacementIss(v.position)) * t.winsPerIss(v.position));
  const out: number[] = [];
  for (let y = 0; y < years; y++) out.push(above(expectedGrade(gm, v, ctx, y)) * own * flags);
  return out;
}

export interface Worth { readonly value: number; readonly cost: number; readonly surplus: number }

/** `value(player, team, horizon)` and `surplus = value - cost`, in wins (K7.2.2 outputs). */
export function playerWorth(gm: GmProfile, v: PlayerView, ctx: ValueContext, years: number = P('value.horizonYears')): Worth {
  const value = sum(winsByYear(gm, v, ctx, years).map((w, y) => w * yearWeight(gm, ctx.pressure, y)));
  const cost = costWins(gm, v.costCentsByYear, ctx, years);
  return { value, cost, surplus: value - cost };
}

/** Cost in the same unit (rule 5): cap cents at the league's going rate per win, weighted like the value. */
export function costWins(gm: GmProfile, centsByYear: readonly number[], ctx: ValueContext, years: number = P('value.horizonYears')): number {
  return sum(centsByYear.slice(0, years).map((c, y) => (c / ctx.centsPerWin) * yearWeight(gm, ctx.pressure, y)));
}

/** The most he would pay per season for these wins: his walk-away number in cents (K7.4.1 rule 3, K7.4.2 rule 1). */
export function walkAwayCents(gm: GmProfile, v: PlayerView, ctx: ValueContext, years: number): number {
  const w = winsByYear(gm, v, ctx, years);
  const weights = w.map((_, y) => yearWeight(gm, ctx.pressure, y));
  const total = sum(weights);
  return total === 0 ? 0 : Math.round((sum(w.map((x, y) => x * weights[y]!)) / total) * ctx.centsPerWin);
}

/** Value of a position's lineup: each depth rank carries its slot weight, best player first. */
export function lineupValue(values: readonly number[], weights: readonly number[]): number {
  const sorted = [...values].sort((a, b) => b - a);
  return sum(weights.map((w, i) => w * (sorted[i] ?? 0)));
}

/** What the whole roster is worth to this general manager: lineups by position, less what the contracts cost. */
export function rosterWorth(gm: GmProfile, roster: readonly PlayerView[], ctx: ValueContext): number {
  const by = new Map<string, number[]>();
  let cost = 0;
  for (const v of roster) {
    const w = playerWorth(gm, v, ctx);
    cost += w.cost;
    const list = by.get(v.position) ?? [];
    list.push(w.value);
    by.set(v.position, list);
  }
  let value = 0;
  for (const [pos, vals] of [...by].sort(([a], [b]) => (a < b ? -1 : 1))) value += lineupValue(vals, ctx.table.slotWeights(pos));
  return value - cost;
}

/** Change in roster worth from adding and removing players: the only player number a deal is judged on. */
export function rosterDelta(gm: GmProfile, roster: readonly PlayerView[], add: readonly PlayerView[], removeIds: readonly number[], ctx: ValueContext): number {
  const gone = new Set(removeIds);
  return rosterWorth(gm, [...roster.filter((v) => !gone.has(v.personId)), ...add], ctx) - rosterWorth(gm, roster, ctx);
}

/**
 * K7.2.2 rule 5: the going rate per win, from the contracts signed in the last market. Each row is a signed
 * contract's average per year and the signing club's own estimate of the wins it bought.
 */
export function goingRateCentsPerWin(signed: readonly { readonly apyCents: number; readonly wins: number }[], fallback: number): number {
  const wins = sum(signed.map((s) => s.wins));
  return wins > 0 ? Math.round(sum(signed.map((s) => s.apyCents)) / wins) : fallback;
}
