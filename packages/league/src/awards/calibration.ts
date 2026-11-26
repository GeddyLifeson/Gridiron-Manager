// X4.2.3 rarity anchors: measures a generated world's honour rates against real ones. This file only
// measures; a failed anchor is fixed by tuning inputs, never by forcing an election (rule 4).
import { fact, isProvisional } from './facts.ts';
import { param } from './params.ts';
import { COUNTER, type CareerRollup } from './rollup.ts';

/** Anchor rows: fact id and what to count among generated draftees. */
export const ANCHORS = [
  { measure: 'hall_share', factId: 'F-honours-0023' },
  { measure: 'all_league_1', factId: 'F-honours-0024' },
  { measure: 'all_league_3', factId: 'F-honours-0025' },
  { measure: 'all_league_5', factId: 'F-honours-0026' },
  { measure: 'all_star_1', factId: 'F-honours-0027' },
  { measure: 'all_star_3', factId: 'F-honours-0028' },
  { measure: 'all_star_5', factId: 'F-honours-0029' },
  { measure: 'played', factId: 'F-honours-0030' },
] as const;
export type Measure = (typeof ANCHORS)[number]['measure'];

/** One generated draftee's finished (or long enough) career. */
export interface Draftee { readonly personId: number; readonly rollup: CareerRollup; readonly games: number; readonly elected: boolean }

export interface CalibrationRow {
  readonly measure: Measure; readonly factId: string; readonly real: number; readonly measured: number | null;
  readonly tolerance: number; readonly ok: boolean | null; readonly provisional: boolean;
}

function counted(d: Draftee, m: Measure): boolean {
  const h = d.rollup.honourCounters;
  const at = (k: string, n: number) => (h[k] ?? 0) >= n;
  const three = 1 + 1 + 1;
  const five = three + 1 + 1;
  switch (m) {
    case 'hall_share': return d.elected;
    case 'all_league_1': return at(COUNTER.allLeagueFirst, 1);
    case 'all_league_3': return at(COUNTER.allLeagueFirst, three);
    case 'all_league_5': return at(COUNTER.allLeagueFirst, five);
    case 'all_star_1': return at(COUNTER.allStar, 1);
    case 'all_star_3': return at(COUNTER.allStar, three);
    case 'all_star_5': return at(COUNTER.allStar, five);
    case 'played': return d.games > 0;
  }
}

/**
 * The calibration report. With no draftees (a short history run) every row is not yet measurable
 * (measured null, ok null). A measured rate passes inside a factor of the tolerance of its anchor.
 */
export function calibrationReport(draftees: readonly Draftee[]): CalibrationRow[] {
  const tol = param('calibration.tolerance');
  return ANCHORS.map(({ measure, factId }) => {
    const real = fact(factId).value as number;
    if (draftees.length === 0) return { measure, factId, real, measured: null, tolerance: tol, ok: null, provisional: isProvisional(factId) };
    const measured = draftees.filter((d) => counted(d, measure)).length / draftees.length;
    const ok = measured >= real / tol && measured <= real * tol;
    return { measure, factId, real, measured, tolerance: tol, ok, provisional: isProvisional(factId) };
  });
}

/** X4.2.1 acceptance: share of generated players with a `historic` season, within the factor of the all-league anchor. */
export function historicSeasonCheck(playersWithHistoricSeason: number, players: number): { share: number; anchor: number; ok: boolean } {
  const anchor = fact('F-honours-0024').value as number;
  const f = param('calibration.historicSeasonTolerance');
  const share = players === 0 ? 0 : playersWithHistoricSeason / players;
  return { share, anchor, ok: share >= anchor / f && share <= anchor * f };
}
