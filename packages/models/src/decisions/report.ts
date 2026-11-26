// Review data (N3.4): the game decision report and season patterns. Data only; screens render it.
import { param } from './params.ts';
import type { DecisionView, GameManagementView } from './types.ts';

/**
 * Win probability the chosen option gained against the best alternative: positive when the chosen option
 * was the best (its lead over the next one), negative when it was not (minus the cost).
 */
export function decisionDelta(v: GameManagementView): number {
  const chosen = v.options.find((o) => o.optionId === v.chosen);
  if (!chosen) return 0;
  if (v.best !== v.chosen) return -v.cost;
  let next = -Infinity;
  for (const o of v.options) if (o.optionId !== v.chosen && o.value > next) next = o.value;
  return next === -Infinity ? 0 : chosen.value - next;
}

export interface ManagementLine {
  readonly decisionId: string;
  readonly type: string;
  readonly playIndex: number | null;
  readonly class: GameManagementView['class'];
  readonly delta: number;
}

export interface CallLine {
  readonly situation: string;
  readonly calls: number;
  readonly meanForesight: number;
  readonly meanPredictability: number;
}

export interface GameReport {
  readonly gameId: number;
  readonly management: readonly ManagementLine[];
  /** Sum of deltas of decisions classed clearly right or clearly wrong only (N3.4.1 rule). */
  readonly managementTotal: number;
  readonly calling: readonly CallLine[];
  /** Calling credited to a delegate is judged as the coach's choice of coordinator (N3.4.1 edge case). */
  readonly callingDelegatedTo: readonly number[];
  readonly time: { readonly decisions: number; readonly meanTenths: number; readonly lateCalls: number };
  /** The decisions with the largest effect, linked to film by play index. */
  readonly largest: readonly ManagementLine[];
}

export interface ReportOptions {
  /** Situation bucket of a play call for the calling summary (down and distance, field zone; from I2). */
  readonly situationOf: (v: DecisionView) => string;
  /** A call is late when it was confirmed with this much play clock or less (the owner, I2, sets it). */
  readonly lateCallTenths: number;
}

/** N3.4.1. Totals equal the sums of the listed records (acceptance). */
export function gameReport(views: readonly DecisionView[], gameId: number, opt: ReportOptions): GameReport {
  const mine = views.filter((v) => v.record.time.gameId === gameId && v.supersededBy.length === 0);
  const management: ManagementLine[] = [];
  const calls = new Map<string, { n: number; f: number; p: number }>();
  const delegated = new Set<number>();
  let timeSum = 0, late = 0;
  for (const v of mine) {
    timeSum += v.record.timeTaken.tenthsFromPrompt;
    const pc = v.record.timeTaken.playClockLeftTenths;
    if (pc !== null && pc <= opt.lateCallTenths) late++;
    const mv = v.modelView;
    if (mv?.kind === 'game_management') {
      management.push({ decisionId: v.record.id, type: v.record.type, playIndex: v.record.time.playIndex, class: mv.class, delta: decisionDelta(mv) });
    } else if (mv?.kind === 'play_call') {
      const key = opt.situationOf(v);
      const c = calls.get(key) ?? { n: 0, f: 0, p: 0 };
      c.n++; c.f += mv.foresight; c.p += mv.predictability;
      calls.set(key, c);
      if (v.record.attribution.basis === 'delegated' && v.record.attribution.viaPersonId !== null) delegated.add(v.record.attribution.viaPersonId);
    }
  }
  let total = 0;
  for (const m of management) if (m.class !== 'toss_up') total += m.delta;
  const calling = [...calls.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([situation, c]) => ({ situation, calls: c.n, meanForesight: c.f / c.n, meanPredictability: c.p / c.n }));
  const largest = [...management].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || (a.decisionId < b.decisionId ? -1 : 1)).slice(0, param('reportTopEffects'));
  return {
    gameId,
    management,
    managementTotal: total,
    calling,
    callingDelegatedTo: [...delegated].sort((a, b) => a - b),
    time: { decisions: mine.length, meanTenths: mine.length ? timeSum / mine.length : 0, lateCalls: late },
    largest,
  };
}

export interface Pattern {
  readonly bucket: string;
  readonly decisions: number;
  /** How often each option was chosen. */
  readonly chosen: Readonly<Record<string, number>>;
  /** How often the model favoured each option. */
  readonly modelFavoured: Readonly<Record<string, number>>;
  /** Sum of win probability given up against the model's best. */
  readonly totalCost: number;
  /** Combined range of the bucket: root of the sum of squared margins (decisions treated as independent). */
  readonly combinedRange: number;
}

/**
 * N3.4.2 patterns over game-management decisions. A bucket is stated only with at least `patternMinimum`
 * decisions and a total cost beyond its combined range. Reading of "a difference from the model beyond
 * the range": the module author's, recorded in README.md.
 */
export function patterns(views: readonly DecisionView[], bucketOf: (v: DecisionView) => string | null, sqrt: (x: number) => number): Pattern[] {
  const buckets = new Map<string, { n: number; chosen: Record<string, number>; fav: Record<string, number>; cost: number; m2: number }>();
  for (const v of views) {
    const mv = v.modelView;
    if (mv?.kind !== 'game_management' || v.supersededBy.length) continue;
    const key = bucketOf(v);
    if (key === null) continue;
    const b = buckets.get(key) ?? { n: 0, chosen: {}, fav: {}, cost: 0, m2: 0 };
    b.n++;
    b.chosen[mv.chosen] = (b.chosen[mv.chosen] ?? 0) + 1;
    b.fav[mv.best] = (b.fav[mv.best] ?? 0) + 1;
    b.cost += mv.cost;
    b.m2 += mv.margin * mv.margin;
    buckets.set(key, b);
  }
  const out: Pattern[] = [];
  for (const [bucket, b] of [...buckets.entries()].sort((a, c) => (a[0] < c[0] ? -1 : 1))) {
    const range = sqrt(b.m2);
    if (b.n < param('patternMinimum') || !(b.cost > range)) continue;
    out.push({ bucket, decisions: b.n, chosen: b.chosen, modelFavoured: b.fav, totalCost: b.cost, combinedRange: range });
  }
  return out;
}

export interface CoverageInput {
  readonly gameId: number;
  /** Play indexes of every snap on the side of the ball the user calls. */
  readonly calledSnaps: readonly number[];
  readonly fourthDowns: readonly number[];
  readonly tries: readonly number[];
}

/** N3.2.1 acceptance: a record for every called snap, every fourth down and every try. Returns the gaps. */
export function coverageGaps(views: readonly DecisionView[], c: CoverageInput): string[] {
  const at = (types: string[]) => new Set(views.filter((v) => v.record.time.gameId === c.gameId && types.includes(v.record.type)).map((v) => v.record.time.playIndex));
  const calls = at(['offensive_play_call', 'defensive_call']);
  const fourth = at(['fourth_down']);
  const tries = at(['try']);
  const gaps: string[] = [];
  for (const s of c.calledSnaps) if (!calls.has(s)) gaps.push(`snap ${s}: no play call record`);
  for (const s of c.fourthDowns) if (!fourth.has(s)) gaps.push(`snap ${s}: no fourth-down record`);
  for (const s of c.tries) if (!tries.has(s)) gaps.push(`snap ${s}: no try record`);
  return gaps;
}
