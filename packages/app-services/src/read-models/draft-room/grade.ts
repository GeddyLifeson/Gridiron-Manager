// The observed grade a front office screen shows for one player (MA-48, D6.1.1, O6.5.1): the grade a named
// grader assigned after watching, with when, how much was watched and confidence in words; the numeric
// band only on tap. A player nobody watched shows no grade at all. Built from the club's own G-19 grade
// cell (`scouting.gradeCells` over the club's PersonView), so no true rating can reach a screen here.
import type { scouting } from '@gm/people';

export type ObservedGrade =
  | {
    readonly state: 'graded';
    /** The default text: grade, confidence word, grader, amount watched, date (G-19 `formatGrade`). */
    readonly text: string;
    readonly label: string;
    readonly confidence: string;
    /** For the tap only (MA-48). */
    readonly bandText: string;
    readonly grader: string;
    readonly n: number;
    readonly asOf: { readonly seasonYear: number; readonly dayIndex: number };
  }
  | { readonly state: 'unwatched' };

export const UNWATCHED: ObservedGrade = { state: 'unwatched' };

/** Maps the club's grade cell to what a screen shows. A missing cell reads as unwatched. */
export function observedGrade(cell: scouting.GradeCell | null | undefined): ObservedGrade {
  if (!cell || cell.state === 'unwatched') return UNWATCHED;
  return {
    state: 'graded', text: cell.text, label: cell.label, confidence: cell.confidence, bandText: cell.bandText, grader: cell.grader, n: cell.n,
    asOf: { seasonYear: cell.as_of.seasonYear, dayIndex: cell.as_of.dayIndex },
  };
}
