// The predictability index on charted plays (G8.2.1), per game and over a window. The index itself is
// the reference model in ../predictability (G-07); this file maps charted rows to its categories.
import type { DeterministicMath } from '@gm/schema';
import {
  predictability, defenseCategory, offenseCategory, type CallRecord, type LeagueBaseline, type PredictabilityResult,
} from '../predictability/index.ts';
import { isPressure, manZoneOf, shellOf } from './cuts.ts';
import type { ChartedPlay } from './types.ts';

/** G8.2.1 offense category of a charted row: kind family by direction. Null leaves the row out. */
export function offenseCategoryOf(p: ChartedPlay): string | null {
  const dir = p.runDirection ?? 'middle';
  switch (p.playKind) {
    case 'run': case 'draw': case 'qb_run': case 'rpo': return offenseCategory('run', dir);
    case 'quick_pass': return offenseCategory('quick_pass', 'middle');
    case 'dropback_pass': case 'movement_pass': return offenseCategory('dropback', 'middle');
    case 'play_action': return offenseCategory('play_action', 'middle');
    case 'screen': return offenseCategory('screen', 'middle');
    default: return null;
  }
}

/** G8.2.1 defense category: pressure or not, one-high or two-high, man or zone. Zero-high counts as one-high. */
export function defenseCategoryOf(p: ChartedPlay): string | null {
  const pr = isPressure(p.rushers);
  const sh = shellOf(p.coverageFamily);
  const mz = manZoneOf(p.coverageFamily);
  if (pr === null || sh === null || mz === null) return null;
  return defenseCategory(pr, sh === 'two_high' ? 'two_high' : 'one_high', mz);
}

/**
 * Charted row to the index's call record. `periodSeconds` is the rule set's period length (the caller
 * reads `clock.period_length_s`), so half and game time left follow the level.
 */
export function toCallRecord(p: ChartedPlay, periodSeconds: number, periods: number): CallRecord | null {
  const category = p.side === 'offense' ? offenseCategoryOf(p) : defenseCategoryOf(p);
  if (category === null || p.lookOnly) return null;
  const inPeriod = p.clockTenths / 10;
  const half = periods / 2;
  const firstOfHalf = p.quarter <= periods && (p.quarter - 1) % half < half - 1;
  const halfSecondsLeft = inPeriod + (firstOfHalf ? periodSeconds * (half - 1 - ((p.quarter - 1) % half)) : 0);
  const gameSecondsLeft = p.quarter > periods ? inPeriod : inPeriod + periodSeconds * (periods - p.quarter);
  return {
    info: {
      down: p.down, distanceYd: p.distanceYd, yardsToGoalYd: p.yardsToGoalYd, scoreDiff: p.scoreDiff,
      halfSecondsLeft, gameSecondsLeft, shotgun: p.shotgun, noHuddle: p.tempo !== 'huddle',
      personnel: p.personnel, formation: p.formation, motion: p.motion !== null,
    },
    category,
    forced: p.forced,
  };
}

export interface GameIndex { readonly gameId: number; readonly calls: number; readonly index: number }

export interface ChartedPredictability {
  readonly overall: PredictabilityResult;
  /** Per game: the mean gain of that game's counted calls (G8.2.1 "per game and over a window"). */
  readonly byGame: readonly GameIndex[];
  /** Rows the categories could not place (trick plays, unknown coverage). */
  readonly unplaced: number;
}

/** Runs the index over one caller's rows in order (one side). */
export function chartedPredictability(plays: readonly ChartedPlay[], baseline: LeagueBaseline, opt: { withFormation: boolean; periodSeconds: number; periods: number }, math: DeterministicMath): ChartedPredictability {
  const ordered = [...plays].sort((a, b) => a.season - b.season || a.gameOrder - b.gameOrder || a.index - b.index);
  const recs: CallRecord[] = [];
  const games: number[] = [];
  let unplaced = 0;
  for (const p of ordered) {
    const r = toCallRecord(p, opt.periodSeconds, opt.periods);
    if (!r) { unplaced++; continue; }
    recs.push(r); games.push(p.gameId);
  }
  const side = ordered[0]?.side ?? 'offense';
  const isRun = side === 'offense' ? (c: string) => c.startsWith('run.') : undefined;
  const overall = predictability(recs, baseline, { withFormation: opt.withFormation, ...(isRun ? { isRun } : {}) }, math);
  const by = new Map<number, { calls: number; sum: number }>();
  overall.perCall.forEach((g, i) => {
    if (g === null) return;
    const e = by.get(games[i]!) ?? { calls: 0, sum: 0 };
    e.calls++; e.sum += g; by.set(games[i]!, e);
  });
  const byGame = [...by.entries()].map(([gameId, e]) => ({ gameId, calls: e.calls, index: e.sum / e.calls }));
  return { overall, byGame, unplaced };
}

/** G8.2.1 plain words shown beside the index. */
export function accuracyWords(runPassAccuracy: number): string {
  return `an opponent guessing from your situations alone would call run or pass right ${Math.round(runPassAccuracy * 100)}% of the time`;
}
