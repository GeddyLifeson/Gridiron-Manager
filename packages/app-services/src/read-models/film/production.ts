// Production against grade (N1.4.3). A note when the stat line and the film grade disagree by more
// than the threshold, with the reason taken from the grader's and staff's readings (so a note can be
// wrong in a career). A long run of the same disagreement folds into one note.
import { param } from './params.ts';

export interface ProductionInput {
  readonly personId: number;
  readonly gameId: number;
  /** Short stat line, for example "2 sacks" or "0 catches". */
  readonly statLine: string;
  /** Percentiles at the position, 0 to 100. */
  readonly statPercentile: number;
  readonly gradePercentile: number;
  /** Displayed grade on the user's scale. */
  readonly gradeText: string;
  /** Reasons from the grade sheet and the staff breakdown ("both came unblocked on stunts"). */
  readonly reasons: readonly string[];
  /** Snaps in garbage time (win probability past the line at the snap): counted, but named. */
  readonly garbageSnaps: number;
}

export interface DivergenceNote { readonly personId: number; readonly gameIds: readonly number[]; readonly direction: 'grade_above' | 'grade_below'; readonly text: string }

export function divergenceNote(p: ProductionInput): DivergenceNote | null {
  const gap = p.gradePercentile - p.statPercentile;
  if (Math.abs(gap) < param('divergence.percentilePoints')) return null;
  const why = p.reasons.length ? `: ${p.reasons.join('; ')}` : '';
  const garbage = p.garbageSnaps > 0 ? ` (${p.garbageSnaps} snaps in garbage time)` : '';
  return { personId: p.personId, gameIds: [p.gameId], direction: gap > 0 ? 'grade_above' : 'grade_below', text: `${p.statLine}, grade ${p.gradeText}${why}${garbage}` };
}

/** Garbage time at the snap (N1.4.3 edge case), from the offense's win probability. */
export function isGarbageTime(wp: number): boolean { return wp > param('garbage.wp') || wp < 1 - param('garbage.wp'); }

/**
 * Folds each player's run of same-direction notes over consecutive games (in the order given) into
 * one combined note once the run reaches the streak length.
 */
export function foldStreaks(notes: readonly DivergenceNote[], gameOrder: readonly number[]): DivergenceNote[] {
  const need = param('divergence.combineGames');
  const out: DivergenceNote[] = [];
  const byPerson = new Map<number, DivergenceNote[]>();
  for (const n of notes) byPerson.set(n.personId, [...(byPerson.get(n.personId) ?? []), n]);
  for (const [, list] of byPerson) {
    const sorted = [...list].sort((a, b) => gameOrder.indexOf(a.gameIds[0]!) - gameOrder.indexOf(b.gameIds[0]!));
    let run: DivergenceNote[] = [];
    const flush = () => {
      if (run.length >= need) out.push({ personId: run[0]!.personId, gameIds: run.map((r) => r.gameIds[0]!), direction: run[0]!.direction, text: `${run.length} straight games: ${run.map((r) => r.text).join(' / ')}` });
      else out.push(...run);
      run = [];
    };
    for (const n of sorted) {
      const prev = run[run.length - 1];
      const consecutive = prev && gameOrder.indexOf(n.gameIds[0]!) === gameOrder.indexOf(prev.gameIds[0]!) + 1 && prev.direction === n.direction;
      if (prev && !consecutive) flush();
      run.push(n);
    }
    flush();
  }
  return out;
}
