// Tendency tables (G8.1.1 own tables, H2.2.1 opponent tables, N2.3.1 the shared store query). One
// function serves all three: group-by counts over a chosen window, with the H2.2.1 weighted rate,
// effective sample size and interval, the G8.1.1 bands and the N2.3.1 strength mark.
import { param } from './params.ts';
import { CUTS, MEASURES, countsForCalls, type CutDef, type MeasureDef } from './cuts.ts';
import { effectiveN, wilson } from './stats.ts';
import type { ChartedPlay } from './types.ts';

export type Band = 'strong' | 'watch' | 'lean';
export type StoreMark = 'strong' | 'lean';

export interface OutcomeCell {
  readonly outcome: string;
  /** Direct count of calls with this outcome (G8.1.1 acceptance: equals a count from the call log). */
  readonly count: number;
  readonly weighted: number;
  /** Null when the cell shows counts only (G8.1.1: no rate under 5 calls). */
  readonly rate: number | null;
  /** H2.2.1 90% Wilson interval on n_eff; null with the rate. */
  readonly low: number | null;
  readonly high: number | null;
  /** League rate for the bucket, shown beside it and never mixed in (H2.2.1 rule 5). */
  readonly leagueRate: number | null;
}

export interface TendencyCell {
  /** Cut values joined, in the order of the query's cuts. */
  readonly key: string;
  readonly cuts: Readonly<Record<string, string>>;
  readonly measure: string;
  readonly calls: number;
  readonly nEff: number;
  /** H2.2.1 rule 4: n_eff under the thin mark. */
  readonly thin: boolean;
  /** G8.1.1: under 5 calls, counts only. */
  readonly countsOnly: boolean;
  readonly outcomes: readonly OutcomeCell[];
  /** G8.1.1 band and the outcome it is about. */
  readonly band: Band | null;
  readonly bandOutcome: string | null;
  /** N2.3.1 rule 3 mark against the team's overall share, and its outcome. */
  readonly mark: StoreMark | null;
  readonly markOutcome: string | null;
  /** The plays behind the cell, so it opens as a cut-up (G8.1.1, N1.2.2). */
  readonly refs: readonly string[];
}

export interface TableQuery {
  readonly cuts: readonly (string | CutDef)[];
  readonly measure: string | MeasureDef;
  /** Keep only rows matching these cut values (the N2.3.1 query conditions). */
  readonly where?: Readonly<Record<string, readonly string[]>>;
  /** Keep only calls by these callers (G8.1.1 edge case: delegated coordinator filter). */
  readonly callerIds?: readonly (number | null)[];
  /** League share of each outcome for a cell key, for the side column and the multi-outcome line. */
  readonly league?: (cellKey: string, outcome: string) => number | null;
}

const resolveCut = (c: string | CutDef): CutDef => {
  if (typeof c !== 'string') return c;
  const d = CUTS[c];
  if (!d) throw new Error(`unknown cut ${c}`);
  return d;
};
const resolveMeasure = (m: string | MeasureDef): MeasureDef => {
  if (typeof m !== 'string') return m;
  const d = MEASURES[m];
  if (!d) throw new Error(`unknown measure ${m}`);
  return d;
};

/** Rows a query reads: right side, counted for calls, matching the conditions and callers. */
export function queryRows(plays: readonly ChartedPlay[], q: Pick<TableQuery, 'measure' | 'where' | 'callerIds'>): { play: ChartedPlay; outcome: string }[] {
  const m = resolveMeasure(q.measure);
  const where = Object.entries(q.where ?? {}).map(([k, vals]) => [resolveCut(k), new Set(vals)] as const);
  const callers = q.callerIds ? new Set(q.callerIds) : null;
  const out: { play: ChartedPlay; outcome: string }[] = [];
  for (const p of plays) {
    if (p.side !== m.side || !countsForCalls(p)) continue;
    if (callers && !callers.has(p.callerId)) continue;
    if (where.some(([c, vals]) => { const v = c.of(p); return v === null || !vals.has(v); })) continue;
    const o = m.of(p);
    if (o === null) continue;
    out.push({ play: p, outcome: o });
  }
  return out;
}

/** G8.1.1 band for one outcome of a cell. Exported for the plant counter and the tests. */
export function bandFor(count: number, calls: number, nEff: number, twoWay: boolean, leagueShare: number | null): Band | null {
  if (calls < param('band.countsOnlyBelow') || nEff <= 0) return null;
  const p = count / calls;
  const low = wilson(p, nEff, param('band.rangeZ')).low;
  if (twoWay) {
    if (low >= param('band.strongRate')) return 'strong';
    if (p >= param('band.watchRate') && calls >= param('band.watchMinCalls')) return 'watch';
    if (p >= param('band.leanRate') && calls >= param('band.leanMinCalls')) return 'lean';
    return null;
  }
  const line = Math.max(param('band.multiMinRate'), leagueShare === null ? 0 : param('band.multiLeagueFactor') * leagueShare);
  return low >= line ? 'strong' : null;
}

const BAND_ORDER: Record<Band, number> = { strong: 3, watch: 2, lean: 1 };

/** Group-by counts over the rows (N2.3.1 rule 1), one cell per combination of cut values. */
export function tendencyTable(plays: readonly ChartedPlay[], q: TableQuery): TendencyCell[] {
  const cuts = q.cuts.map(resolveCut);
  const m = resolveMeasure(q.measure);
  const rows = queryRows(plays, q);
  // Team baseline for the N2.3.1 mark: the same rows with no cut.
  const base = new Map<string, number>();
  for (const r of rows) base.set(r.outcome, (base.get(r.outcome) ?? 0) + 1);
  const total = rows.length;

  const groups = new Map<string, { vals: string[]; rows: { play: ChartedPlay; outcome: string }[] }>();
  for (const r of rows) {
    const vals = cuts.map((c) => c.of(r.play));
    if (vals.some((v) => v === null)) continue;
    const key = (vals as string[]).join('|');
    let g = groups.get(key);
    if (!g) { g = { vals: vals as string[], rows: [] }; groups.set(key, g); }
    g.rows.push(r);
  }

  const thinMark = param('table.thinNEff');
  const z = param('table.intervalZ');
  const out: TendencyCell[] = [];
  for (const key of [...groups.keys()].sort()) {
    const g = groups.get(key)!;
    const weights = g.rows.map((r) => r.play.weight ?? 1);
    const W = weights.reduce((a, b) => a + b, 0);
    const nEff = effectiveN(weights);
    const calls = g.rows.length;
    const countsOnly = calls < param('band.countsOnlyBelow');
    const byOutcome = new Map<string, { count: number; weighted: number }>();
    for (const r of g.rows) {
      const e = byOutcome.get(r.outcome) ?? { count: 0, weighted: 0 };
      e.count++; e.weighted += r.play.weight ?? 1;
      byOutcome.set(r.outcome, e);
    }
    let band: Band | null = null, bandOutcome: string | null = null;
    let mark: StoreMark | null, markOutcome: string | null = null, markGap = 0;
    const outcomes: OutcomeCell[] = [];
    for (const o of [...byOutcome.keys()].sort()) {
      const e = byOutcome.get(o)!;
      const rate = W > 0 ? e.weighted / W : 0;
      const ci = wilson(rate, nEff, z);
      const league = q.league ? q.league(key, o) : null;
      outcomes.push({ outcome: o, count: e.count, weighted: e.weighted, rate: countsOnly ? null : rate, low: countsOnly ? null : ci.low, high: countsOnly ? null : ci.high, leagueRate: league });
      const b = bandFor(e.count, calls, nEff, m.twoWay, league);
      if (b && (!band || BAND_ORDER[b] > BAND_ORDER[band])) { band = b; bandOutcome = o; }
      // N2.3.1 rule 3: share against the team's own overall rate.
      const gap = Math.abs(rate - (base.get(o) ?? 0) / total);
      if (gap > markGap) { markGap = gap; markOutcome = o; }
    }
    mark = markGap > param('store.strongPoints') && calls >= param('store.strongMinPlays') ? 'strong'
      : markGap > param('store.leanPoints') && calls >= param('store.leanMinPlays') ? 'lean' : null;
    if (!mark) markOutcome = null;
    out.push({
      key, cuts: Object.fromEntries(cuts.map((c, i) => [c.id, g.vals[i]!])), measure: m.id, calls, nEff,
      thin: nEff < thinMark, countsOnly, outcomes, band, bandOutcome, mark, markOutcome,
      refs: g.rows.map((r) => r.play.ref),
    });
  }
  return out;
}

/** Highlighted cells only, strongest first, then by calls (G8.1.1 "each highlighted cell names its window and count"). */
export function highlighted(cells: readonly TendencyCell[]): TendencyCell[] {
  return cells.filter((c) => c.band !== null)
    .sort((a, b) => BAND_ORDER[b.band!] - BAND_ORDER[a.band!] || b.calls - a.calls || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

export const bandWeight = (b: Band | null): number => (b === null ? 0 : BAND_ORDER[b]);
