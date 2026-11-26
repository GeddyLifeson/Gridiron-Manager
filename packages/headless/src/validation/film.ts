// The film room link (G-63). Headless may not import app-services (P1.2.1), so this reads the film
// room's FilmRecord (app-services read-models/film/views.ts) through the structural subset below; any
// FilmRecord or FilmRecordWire fits it. Two jobs:
//  1. blindFilmRecord: the clip a reviewer watches in the standard film viewer with every overlay off
//     (Q5.2.1 "What the user sees"): no coaching set, no assignment lines, no viewer side, so neither
//     side's calls are drawn. Film itself (trajectory, events, base set) stays.
//  2. clipTruthFromFilm: the scoring truth for that clip, from the record plus the engine-side truth
//     (both teams' calls and the play explainer's decisive event, Q2.6.1), which never reaches a viewer.
import type { CoverageFamily } from '@gm/schema';
import type { ClipSource, ClipTruth, Level, OutcomeBucket } from './clips.ts';

/** The fields of the film room's FilmRecord this module reads or blanks. */
export interface FilmRecordLike {
  readonly playId: string;
  viewerSide: 0 | 1 | null;
  readonly base: { readonly playType: string; readonly gainLoss: number };
  coaching: { values: Record<string, string | null>; sources: Record<string, string> };
  assignments: readonly unknown[];
  readonly epa: number | null;
}

/** Engine-side truth for one play, from the play record and the play explainer (Q2.6.1). Never shown. */
export interface PlayTruth {
  readonly playId: string;
  readonly coverageFamily: CoverageFamily | null;
  readonly disguiseEndedBeforeSnap: boolean;
  /** Protection content id on pass plays, else null. */
  readonly protection: string | null;
  /** Run concept content id on run plays, else null. */
  readonly runConcept: string | null;
  readonly decisiveEvent: string;
}

/** The record as a blind reviewer sees it: overlays off. Returns a copy; the input is not changed. */
export function blindFilmRecord<T extends FilmRecordLike>(r: T): T {
  const values: Record<string, string | null> = {};
  const sources: Record<string, string> = {};
  for (const k of Object.keys(r.coaching.values).sort()) { values[k] = null; sources[k] = 'uncharted'; }
  return { ...r, viewerSide: null, coaching: { values, sources }, assignments: [] };
}

/** Problems if a record would show anything beyond film to a blind reviewer. Empty means safe to show. */
export function blindProblems(r: FilmRecordLike): string[] {
  const out: string[] = [];
  if (r.viewerSide !== null) out.push(`${r.playId}: viewer side set, so one side's calls would be drawn`);
  if (r.assignments.length > 0) out.push(`${r.playId}: ${r.assignments.length} assignment line(s) would be drawn`);
  for (const [k, v] of Object.entries(r.coaching.values)) if (v !== null) out.push(`${r.playId}: coaching field ${k} is filled`);
  return out;
}

/** Same rule as outcomeOf: EPA sign when the record has it, else a gain of at least 4 yards (module choice). */
function filmOutcome(r: FilmRecordLike): OutcomeBucket {
  if (r.epa !== null) return r.epa > 0 ? 'success' : 'failure';
  return r.base.gainLoss >= 4 ? 'success' : 'failure';
}

export function clipTruthFromFilm(r: FilmRecordLike, level: Level, t: PlayTruth): ClipTruth {
  if (t.playId !== r.playId) throw new Error(`validation: truth ${t.playId} does not belong to film ${r.playId}`);
  const conceptKind = t.protection !== null ? 'protection' : t.runConcept !== null ? 'run_concept' : null;
  return {
    clipId: r.playId, level, playType: r.base.playType, coverageFamily: t.coverageFamily, disguiseEndedBeforeSnap: t.disguiseEndedBeforeSnap,
    conceptKind, concept: t.protection ?? t.runConcept, outcome: filmOutcome(r), decisiveEvent: t.decisiveEvent,
  };
}

export interface FilmClip<T extends FilmRecordLike> { readonly truth: ClipTruth; readonly blind: T }

/**
 * Pairs film records with their truth. A record with no truth row is left out and named, so a clip
 * can never be scored against nothing. The ClipSource feeds the sampler; `blind` is what the viewer gets.
 */
export function filmClipSource<T extends FilmRecordLike>(level: Level, records: readonly T[], truths: readonly PlayTruth[]): { source: ClipSource; clips: readonly FilmClip<T>[]; missingTruth: readonly string[] } {
  const byId = new Map(truths.map((t) => [t.playId, t]));
  const clips: FilmClip<T>[] = [];
  const missing: string[] = [];
  for (const r of records) {
    const t = byId.get(r.playId);
    if (!t) { missing.push(r.playId); continue; }
    clips.push({ truth: clipTruthFromFilm(r, level, t), blind: blindFilmRecord(r) });
  }
  const truthList = clips.map((c) => c.truth);
  return { source: { level, clips: () => truthList }, clips, missingTruth: missing.sort() };
}
