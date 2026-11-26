// The school's use of the G-63 film room (N5.1.2 Show and review, N5.3.2 clips, N5.4.1 rule 7).
// FilmViewer mode 'school' is the truth mode G-63 reserves for the coaching school: lesson plays are
// constructed, so the review may show both sides' assignments (N5.1.2 rule 6). Career film never does;
// these functions refuse a career viewer.
import { filmRecord, ownAssignments, playIdOf, type AssignmentLine, type ChartOptions, type FilmRecord, type FilmSource, type FilmViewer, type GradingEvidence } from '../read-models/film/index.ts';
import type { ClipTruth, Shell } from './drills.ts';

export class SchoolFilmError extends Error {}

function needSchool(v: FilmViewer): void {
  if (v.mode !== 'school') throw new SchoolFilmError('school film needs a school viewer (career film never shows opponent assignments, N1.1.2)');
}

/**
 * Shell of a coverage family, from A4.5: term.cover-0 "no deep safety help" (Verified), term.single-high
 * "as in Cover 1 and Cover 3" (Verified), term.two-high "two safeties deep" (2 of 3; the Cover 2, 4, 6
 * and two-man rows of the starter defence carry their own sources). 'other' has no shell label.
 */
export const SHELL_BY_FAMILY: Readonly<Record<string, Shell | null>> = {
  cover0: 'zero_high', cover1: 'one_high', cover3: 'one_high', cover2: 'two_high', cover4: 'two_high', cover6: 'two_high', two_man: 'two_high', other: null,
};

export interface ClipOptions {
  /** Disguise tier the generator built into the clip (N5.3.2 rule 1). */
  readonly disguise: number;
  /** The pre-snap look fits more than one coverage (edge case: score only the post-snap answer). */
  readonly ambiguousPreSnap: boolean;
}

/**
 * Truth label of a clip from the call that generated it (N5.3.2 rule 1, acceptance: the label matches the
 * call record). Returns null for a play with no defensive call or a family with no shell label.
 */
export function clipTruth(src: FilmSource, o: ClipOptions): ClipTruth | null {
  const opp = src.calls.opposing;
  if (opp.unit !== 'defense') return null;
  const shell = SHELL_BY_FAMILY[opp.coverageFamily] ?? null;
  if (shell === null) return null;
  return {
    clipId: playIdOf(src.gameId, src.playNumber), shell, coverage: opp.coverageFamily, pressure: opp.pressureId ?? null,
    disguise: o.disguise, ambiguousPreSnap: o.ambiguousPreSnap,
  };
}

export interface LessonClip {
  readonly record: FilmRecord;
  /** Both sides' drawn assignments, for the answer review only (N5.1.2 rule 6). */
  readonly reviewAssignments: readonly AssignmentLine[];
}

/** A lesson or drill clip for the play viewer, with the review's full assignments. School viewer only. */
export function lessonClip(src: FilmSource, viewer: FilmViewer, chart: Omit<ChartOptions, 'viewerTeamId'>): LessonClip {
  needSchool(viewer);
  const record = filmRecord(src, { ...chart, viewerTeamId: viewer.teamId });
  const both = [...ownAssignments(src, src.teams[0]), ...ownAssignments(src, src.teams[1])].sort((a, b) => a.slot - b.slot);
  return { record, reviewAssignments: both };
}

/**
 * N5.4.1 rule 7: a pattern built on hidden truth (his grades against truth, N1.4.1) states only the
 * aggregate over its sample, never which single play he got wrong. Takes G-63 grading evidence.
 */
export interface GradingPattern { readonly games: number; readonly marks: number; readonly agreementShare: number }

export function gradingPattern(ev: readonly GradingEvidence[]): GradingPattern | null {
  const marks = ev.reduce((t, e) => t + e.marks, 0);
  if (marks === 0) return null;
  return { games: new Set(ev.map((e) => e.gameId)).size, marks, agreementShare: ev.reduce((t, e) => t + e.agreements, 0) / marks };
}
