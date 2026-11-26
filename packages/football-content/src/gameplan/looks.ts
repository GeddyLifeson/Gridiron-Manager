// The looks board (G6.1.1): what the opponent does, by situation bucket, with rate, sample size and an 80%
// Wilson range; buckets under 5 plays show counts only. The rows are the scouting database's charted plays
// (H2, the tendency store of G-66), passed in with the charting staff's errors already in them: a coverage
// mislabelled in the breakdown is wrong here too. This package may import only schema, so the row type is a
// structural subset of the tendency module's ChartedPlay; the world package passes those rows straight in.
import { param } from './params.ts';

/** The fields of a charted play the board reads (a structural subset of models' ChartedPlay). */
export interface ScoutRow {
  readonly ref: string;
  readonly gameOrder: number;
  readonly season: number;
  readonly teamId: number;
  readonly callerId: number | null;
  readonly side: 'offense' | 'defense';
  readonly down: number;
  readonly distanceYd: number;
  readonly yardsToGoalYd: number;
  readonly personnel: string;
  readonly formation: string | null;
  readonly playKind: string | null;
  readonly concept: string | null;
  readonly front: string | null;
  readonly coverageFamily: string | null;
  readonly pressureDesign: string | null;
  readonly forced: boolean;
}

export type Window =
  | { readonly kind: 'recent'; readonly games: number }
  | { readonly kind: 'season'; readonly season: number }
  | { readonly kind: 'similar'; readonly gameOrders: readonly number[] };

export interface BoardOptions {
  readonly window: Window;
  /** Situation bucket of a row; the default files rows by the sheet catalogue's down-and-distance ids. */
  readonly bucket: (r: ScoutRow) => string;
  /** The look measured: for offense planning the opponent defense's coverage, front or pressure; for defense planning their concept or formation. */
  readonly look: (r: ScoutRow) => string | null;
  /** Weight recent games more (G6.1.1). Off by default so counts equal the database. */
  readonly weightRecent?: boolean;
  /** Rows from the opposing caller's earlier jobs, added at a lower weight (H2). */
  readonly callerHistory?: readonly ScoutRow[];
}

export interface LookCell {
  readonly bucket: string;
  readonly look: string;
  /** Plays in the bucket showing this look, and plays in the bucket (raw counts, always shown). */
  readonly count: number;
  readonly n: number;
  /** Weighted rate and its 80% Wilson range; null under the counts-only line. */
  readonly rate: number | null;
  readonly lo: number | null;
  readonly hi: number | null;
  readonly refs: readonly string[];
}

export interface LooksBoard {
  readonly cells: readonly LookCell[];
  /** Early in a season the window holds only last year's games (G6.1.1 edge case). */
  readonly stale: boolean;
  /** The latest charted caller differs from earlier rows: last year's tables are his former team's. */
  readonly callerChanged: boolean;
}

/** Wilson score interval for a proportion (weights allowed: n is the weight total). */
export function wilson(k: number, n: number, z = param('looks.wilsonZ')): { lo: number; hi: number } {
  if (n <= 0) return { lo: 0, hi: 1 };
  const p = k / n;
  const z2 = z * z;
  const den = 1 + z2 / n;
  const mid = (p + z2 / (2 * n)) / den;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
  return { lo: Math.max(0, mid - half), hi: Math.min(1, mid + half) };
}

export function inWindow(rows: readonly ScoutRow[], w: Window): ScoutRow[] {
  const live = rows.filter((r) => !r.forced);
  if (w.kind === 'season') return live.filter((r) => r.season === w.season);
  if (w.kind === 'similar') { const set = new Set(w.gameOrders); return live.filter((r) => set.has(r.gameOrder)); }
  const orders = [...new Set(live.map((r) => r.gameOrder))].sort((a, b) => b - a).slice(0, w.games);
  const keep = new Set(orders);
  return live.filter((r) => keep.has(r.gameOrder));
}

/** Build the board. Every count equals the database count for the window (G6.1.1 acceptance). */
export function looksBoard(rows: readonly ScoutRow[], currentSeason: number, opt: BoardOptions): LooksBoard {
  const win = inWindow(rows, opt.window);
  const latestOrder = win.reduce((m, r) => Math.max(m, r.gameOrder), Number.NEGATIVE_INFINITY);
  const recent = new Set([...new Set(win.map((r) => r.gameOrder))].sort((a, b) => b - a).slice(0, param('looks.recentGames')));
  const weightOf = (r: ScoutRow): number => (opt.weightRecent ? (recent.has(r.gameOrder) ? param('looks.recentWeight') : param('looks.olderWeight')) : 1);
  const all: { r: ScoutRow; w: number; history: boolean }[] = [
    ...win.map((r) => ({ r, w: weightOf(r), history: false })),
    ...(opt.callerHistory ?? []).filter((r) => !r.forced).map((r) => ({ r, w: param('looks.callerHistoryWeight'), history: true })),
  ];
  const byBucket = new Map<string, { r: ScoutRow; w: number; history: boolean }[]>();
  for (const x of all) {
    if (opt.look(x.r) === null) continue;
    const b = opt.bucket(x.r);
    (byBucket.get(b) ?? byBucket.set(b, []).get(b)!).push(x);
  }
  const cells: LookCell[] = [];
  for (const [bucket, xs] of [...byBucket].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const own = xs.filter((x) => !x.history);
    const n = own.length;
    const wTotal = xs.reduce((a, x) => a + x.w, 0);
    const looks = [...new Set(xs.map((x) => opt.look(x.r)!))].sort();
    for (const look of looks) {
      const hit = xs.filter((x) => opt.look(x.r) === look);
      const count = hit.filter((x) => !x.history).length;
      const wHit = hit.reduce((a, x) => a + x.w, 0);
      const show = n >= param('looks.countsOnlyBelow');
      const range = show ? wilson(wHit, wTotal) : null;
      cells.push({ bucket, look, count, n, rate: show ? wHit / wTotal : null, lo: range?.lo ?? null, hi: range?.hi ?? null, refs: hit.filter((x) => !x.history).map((x) => x.r.ref) });
    }
  }
  const callers = win.filter((r) => r.callerId !== null);
  const last = callers.filter((r) => r.gameOrder === latestOrder)[0]?.callerId ?? null;
  return {
    cells,
    stale: win.length > 0 && !win.some((r) => r.season === currentSeason),
    callerChanged: last !== null && callers.some((r) => r.callerId !== last),
  };
}
