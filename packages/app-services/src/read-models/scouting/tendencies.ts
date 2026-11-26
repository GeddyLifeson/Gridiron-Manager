// The tendency table for both directions (O3.6.1; G8.1.1 self-scout, H2.2.1 opponent tables, N2.3.1 one
// store and one query). Every number comes from `models.tendencies`; this file picks the window, keeps the
// rows the subject allows, and shapes the result for the screen.
//
// Guards (O3.6.1 acceptance "no opponent truth-layer field is reachable"):
// - Self-scout reads only rows with source 'own' of the viewer's own team (his real call records).
// - An opponent table reads only rows with source 'charted' (what his staff tagged, with its errors). An
//   'own' row of another team handed in by mistake is dropped, never shown.
import { DMATH } from '@gm/engine-core';
import { predictability as pr, tendencies as td } from '@gm/models';
import type { CellView, ExposureView, ScoutingSubject, ScoutingView, TellView } from './types.ts';

export const WINDOW_IDS = ['last3', 'last4', 'season', 'career', 'relevance'] as const;
export type WindowId = (typeof WINDOW_IDS)[number];

const WINDOW_LABEL: Readonly<Record<WindowId, string>> = {
  last3: 'last 3 games', last4: 'last 4 games', season: 'this season', career: 'all charted games', relevance: 'weighted by relevance',
};

/** Default cuts and measure by side (G8.1.1 "down and distance" first; H2.1.3 buckets). */
export const DEFAULT_QUERY: Readonly<Record<'offense' | 'defense', { readonly cuts: readonly string[]; readonly measure: string }>> = {
  offense: { cuts: ['downDistance'], measure: 'runPass' },
  defense: { cuts: ['downDistance'], measure: 'pressure' },
};

export interface TendencyInput {
  readonly subject: ScoutingSubject;
  /** The team whose tendencies these are (the viewer's club for self-scout). */
  readonly teamId: number;
  readonly teamName: string;
  /** Rows of the shared store for this team (and, for an opponent, his caller's previous team). */
  readonly plays: readonly td.ChartedPlay[];
  readonly window: WindowId;
  /** Season the screen stands in. */
  readonly season: number;
  readonly cuts: readonly string[];
  readonly measure: string;
  readonly league?: td.TableQuery['league'];
  /** H2.1.1 edge case: the first game (order in `season`) under a new caller. */
  readonly callerChangeAtOrder?: number | null;
  /** G8.1.2 inputs, self-scout only: the user's games and his staff's estimate of the opponent's charting. */
  readonly exposure?: { readonly games: readonly td.OwnGame[]; readonly chartingQuality: number } | null;
  /** G8.3.1 tells the user keeps as bait (tell ids). */
  readonly keptTells?: ReadonlySet<string>;
  /** G8.2.1 league baseline; no index without it. */
  readonly baseline?: { readonly baseline: pr.LeagueBaseline; readonly periodSeconds: number; readonly periods: number; readonly withFormation?: boolean } | null;
  readonly taggerLine?: string | null;
  readonly partial?: boolean;
}

/** Rows the subject allows (see the guards above). */
export function allowedRows(subject: ScoutingSubject, teamId: number, plays: readonly td.ChartedPlay[]): td.ChartedPlay[] {
  return subject === 'self'
    ? plays.filter((p) => p.source === 'own' && p.teamId === teamId)
    : plays.filter((p) => p.source === 'charted');
}

export function windowed(rows: readonly td.ChartedPlay[], inp: Pick<TendencyInput, 'subject' | 'teamId' | 'window' | 'season' | 'callerChangeAtOrder'>): td.ChartedPlay[] {
  const own = rows.filter((p) => p.teamId === inp.teamId);
  switch (inp.window) {
    case 'last3': return td.selfScoutWindow(own, { kind: 'lastGames', games: 3 });
    case 'last4': return td.selfScoutWindow(own, { kind: 'lastGames', games: 4 });
    case 'season': return td.selfScoutWindow(own, { kind: 'season', season: inp.season });
    case 'career': return td.selfScoutWindow(own, { kind: 'career' });
    case 'relevance': return td.relevanceWeights(rows, { teamId: inp.teamId, season: inp.season, callerChangeAtOrder: inp.callerChangeAtOrder ?? null });
  }
}

const cellView = (c: td.TendencyCell): CellView => ({
  key: c.key, cuts: { ...c.cuts }, calls: c.calls, nEff: c.nEff, thin: c.thin, countsOnly: c.countsOnly,
  outcomes: c.outcomes.map((o) => ({ outcome: o.outcome, count: o.count, rate: o.rate, low: o.low, high: o.high, leagueRate: o.leagueRate })),
  band: c.band, bandOutcome: c.bandOutcome, refs: [...c.refs],
});

const exposureLabel = (c: td.TendencyCell): string => `${Object.values(c.cuts).join(', ')}: ${c.bandOutcome ?? ''}`;

export function buildTendencyView(inp: TendencyInput): ScoutingView {
  const m = td.MEASURES[inp.measure];
  if (!m) throw new Error(`scouting read model: unknown measure ${inp.measure}`);
  for (const c of inp.cuts) if (!td.CUTS[c]) throw new Error(`scouting read model: unknown cut ${c}`);
  const rows = windowed(allowedRows(inp.subject, inp.teamId, inp.plays), inp);
  const q: td.TableQuery = { cuts: inp.cuts, measure: m, ...(inp.league ? { league: inp.league } : {}) };
  const cells = td.tendencyTable(rows, q);
  const games = new Set(rows.filter((p) => p.teamId === inp.teamId).map((p) => p.gameId)).size;

  let exposure: ExposureView[] = [];
  if (inp.subject === 'self' && inp.exposure) {
    const w = td.opponentWindow(inp.exposure.games, inp.season);
    exposure = td.exposedTendencies(cells, rows, w, inp.exposure.chartingQuality)
      .filter((e) => e.cell.band !== null)
      .map((e) => ({ key: e.cell.key, label: exposureLabel(e.cell), band: e.cell.band!, calls: e.cell.calls, shareInWindow: e.shareInWindow, top: e.top }));
  }

  const tells: TellView[] = td.structuralTells(rows, m.side, inp.keptTells ?? new Set())
    .map((t) => ({ feature: t.feature, value: t.value, givesAway: t.givesAway, count: t.count, snaps: t.snaps, kept: t.kept }));

  let predictability: ScoutingView['predictability'] = null;
  const sideRows = rows.filter((p) => p.side === m.side && p.teamId === inp.teamId);
  if (inp.baseline && sideRows.length) {
    const r = td.chartedPredictability(sideRows, inp.baseline.baseline, {
      withFormation: inp.baseline.withFormation ?? false, periodSeconds: inp.baseline.periodSeconds, periods: inp.baseline.periods,
    }, DMATH);
    if (r.overall.calls > 0) {
      predictability = { index: r.overall.index, calls: r.overall.calls, words: r.overall.runPassAccuracy === null ? null : td.accuracyWords(r.overall.runPassAccuracy) };
    }
  }

  return {
    subject: inp.subject, teamId: inp.teamId, teamName: inp.teamName,
    windowLabel: WINDOW_LABEL[inp.window], windowGames: games,
    measure: inp.measure, cuts: [...inp.cuts], cells: cells.map(cellView), exposure, tells, predictability,
    taggerLine: inp.subject === 'self' ? null : (inp.taggerLine ?? null),
    partial: inp.partial ?? false,
  };
}
