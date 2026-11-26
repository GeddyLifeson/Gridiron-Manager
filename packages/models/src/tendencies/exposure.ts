// What the opponent probably knows (G8.1.2). An estimate by the user's own staff: it reads his own
// tables, the games the opponent is assumed to break down, and the opposing staff's charting quality
// as his staff estimates it. The opponent's true knowledge (K3) is never an input.
import { param } from './params.ts';
import { bandWeight, type TendencyCell } from './table.ts';
import type { ChartedPlay } from './types.ts';

export interface OwnGame {
  readonly gameId: number;
  readonly season: number;
  readonly gameOrder: number;
  /** Played against a team whose scheme is like the next opponent's. */
  readonly similarScheme?: boolean;
  /** Last season's game against the next opponent with the same staff. */
  readonly lastMeetingSameStaff?: boolean;
}

/**
 * G8.1.2 default opponent window: the three most recent games (1.0), up to two earlier games against
 * similar schemes (0.7), and last season's meeting if the same staff faced him (0.5).
 */
export function opponentWindow(games: readonly OwnGame[], season: number): Map<number, number> {
  const sorted = [...games].sort((a, b) => a.season - b.season || a.gameOrder - b.gameOrder);
  const thisSeason = sorted.filter((g) => g.season === season);
  const recent = thisSeason.slice(-param('exposure.recentGames'));
  const w = new Map<number, number>();
  for (const g of recent) w.set(g.gameId, param('exposure.weightRecent'));
  const similar = thisSeason.filter((g) => !w.has(g.gameId) && g.similarScheme).slice(-param('exposure.similarGames'));
  for (const g of similar) w.set(g.gameId, param('exposure.weightSimilar'));
  for (const g of sorted) if (g.season === season - 1 && g.lastMeetingSameStaff && !w.has(g.gameId)) w.set(g.gameId, param('exposure.weightLastMeeting'));
  return w;
}

export interface ExposedTendency {
  readonly cell: TendencyCell;
  /** Band weight x share of the cell's calls inside the window x charting quality (G8.1.2). */
  readonly score: number;
  readonly shareInWindow: number;
  /** In the first block shown (top 5). */
  readonly top: boolean;
}

/**
 * Ranks the user's highlighted cells by exposure. `chartingQuality` is his staff's estimate of the
 * opposing staff (0 to 1). A coach or player who left for the opponent raises it (G8.1.2 edge case);
 * the caller passes the raised value.
 */
export function exposedTendencies(cells: readonly TendencyCell[], plays: readonly ChartedPlay[], inWindow: ReadonlyMap<number, number>, chartingQuality: number): ExposedTendency[] {
  const gameOf = new Map(plays.map((p) => [p.ref, p.gameId]));
  const q = Math.min(1, Math.max(0, chartingQuality));
  const ranked = cells.filter((c) => c.band !== null).map((cell) => {
    let inW = 0;
    for (const r of cell.refs) inW += inWindow.get(gameOf.get(r) ?? -1) ?? 0;
    const share = cell.refs.length ? inW / cell.refs.length : 0;
    return { cell, score: bandWeight(cell.band) * share * q, shareInWindow: share };
  }).sort((a, b) => b.score - a.score || b.cell.calls - a.cell.calls || (a.cell.key < b.cell.key ? -1 : a.cell.key > b.cell.key ? 1 : 0));
  const top = param('exposure.topShown');
  return ranked.map((r, i) => ({ ...r, top: i < top }));
}
