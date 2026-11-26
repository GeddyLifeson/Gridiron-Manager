// The personal lesson picker (N5.4.1), duty-linked lesson offers (N5.5.1) and "why" answers from the
// coaches above the user (N5.6.1). None of these changes anything in the simulation (N5.5.1 rule 1).
import PATTERN_JSON from './data/pattern-lessons.json' with { type: 'json' };
import DUTY_JSON from './data/duty-lessons.json' with { type: 'json' };
import type { Curriculum, DrillKind } from './curriculum.ts';
import { param } from './params.ts';

// ---------------------------------------------------------------- N5.4.1

/** A qualifying N3.4.2 pattern (shape of @gm/models `decisions.Pattern`): sample and band rules already applied. */
export interface PatternLike {
  readonly bucket: string;
  readonly decisions: number;
  readonly chosen: Readonly<Record<string, number>>;
  readonly modelFavoured: Readonly<Record<string, number>>;
  readonly totalCost: number;
  readonly combinedRange: number;
}

export interface PatternLessonRow { readonly decisionType: string; readonly lesson: string | null; readonly drill: DrillKind | null }
export const PATTERN_LESSONS: readonly PatternLessonRow[] = (PATTERN_JSON as { rows: PatternLessonRow[] }).rows;

export const decisionTypeOf = (bucket: string): string => bucket.split(':')[0]!;

export interface WorkOnCard {
  readonly bucket: string;
  readonly decisionType: string;
  /** Games the evidence covers. */
  readonly games: number;
  readonly decisions: number;
  readonly chosen: Readonly<Record<string, number>>;
  readonly modelFavoured: Readonly<Record<string, number>>;
  /** Value given up per game against the model's best (win probability). */
  readonly costPerGame: number;
  readonly lesson: string | null;
  readonly drill: DrillKind | null;
}

/**
 * The "Something to work on" card (rules 1 to 3, 6): rank qualifying patterns by value lost per game and
 * show the top one, at most one per game. The card states what the user did; it never labels him.
 * `lastCardGame` is the game a card was last shown after; null when none.
 */
export function workOnCard(patterns: readonly PatternLike[], games: number, gameId: number, lastCardGame: number | null, map: readonly PatternLessonRow[] = PATTERN_LESSONS): WorkOnCard | null {
  if (games <= 0 || lastCardGame === gameId) return null;
  const ranked = patterns.filter((p) => p.totalCost > p.combinedRange)
    .map((p) => ({ p, perGame: p.totalCost / games }))
    .sort((a, b) => b.perGame - a.perGame || (a.p.bucket < b.p.bucket ? -1 : 1));
  const top = ranked[0];
  if (!top) return null;
  const type = decisionTypeOf(top.p.bucket);
  const row = map.find((r) => r.decisionType === type);
  return {
    bucket: top.p.bucket, decisionType: type, games, decisions: top.p.decisions, chosen: top.p.chosen, modelFavoured: top.p.modelFavoured,
    costPerGame: top.perGame, lesson: row?.lesson ?? null, drill: row?.drill ?? null,
  };
}

export type Improvement = 'pending' | 'improved' | 'not_yet';

/** Rule 4: improved when, over the next `improveGames` games, the bucket no longer qualifies (falls inside the band). */
export function improvement(bucket: string, gamesSince: number, patternsSince: readonly PatternLike[]): Improvement {
  if (gamesSince < param('improveGames')) return 'pending';
  return patternsSince.some((p) => p.bucket === bucket && p.totalCost > p.combinedRange) ? 'not_yet' : 'improved';
}

/** Map problems: every mapped lesson exists, every decision type appears once. */
export function patternMapProblems(c: Curriculum, map: readonly PatternLessonRow[] = PATTERN_LESSONS, types?: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of map) {
    if (seen.has(r.decisionType)) out.push(`pattern map: ${r.decisionType} twice`);
    seen.add(r.decisionType);
    if (r.lesson !== null && !c.lessons.some((l) => l.id === r.lesson)) out.push(`pattern map: ${r.decisionType} names unknown lesson ${r.lesson}`);
    if (types && !types.includes(r.decisionType)) out.push(`pattern map: ${r.decisionType} is not a logged decision type`);
  }
  return out;
}

// ---------------------------------------------------------------- N5.5.1

export interface DutyLessonRow { readonly duty: string; readonly lessons: readonly string[]; readonly drills: readonly DrillKind[] }
export const DUTY_LESSONS: readonly DutyLessonRow[] = (DUTY_JSON as { rows: DutyLessonRow[] }).rows;

export interface DutyOffer { readonly duty: string; readonly lessons: readonly string[]; readonly drills: readonly DrillKind[] }

/**
 * Offers for duties held now and never offered before (rule 4: once, at the time the duty is gained).
 * A user who starts high gets every duty's offer at once; the screen groups them by course (edge case).
 */
export function dutyOffers(heldDuties: readonly string[], alreadyOffered: ReadonlySet<string>, map: readonly DutyLessonRow[] = DUTY_LESSONS): DutyOffer[] {
  const out: DutyOffer[] = [];
  for (const d of [...new Set(heldDuties)].sort()) {
    if (alreadyOffered.has(d)) continue;
    const row = map.find((r) => r.duty === d);
    if (row && (row.lessons.length || row.drills.length)) out.push({ duty: d, lessons: row.lessons, drills: row.drills });
  }
  return out;
}

/** Group offered lessons by course, in course order (edge case: many duties at once). */
export function groupByCourse(c: Curriculum, offers: readonly DutyOffer[]): { course: string; lessons: string[] }[] {
  const ids = new Set(offers.flatMap((o) => o.lessons));
  return [...c.courses].sort((a, b) => a.order - b.order)
    .map((k) => ({ course: k.id, lessons: c.lessons.filter((l) => l.course === k.id && ids.has(l.id)).map((l) => l.id) }))
    .filter((g) => g.lessons.length > 0);
}

export function dutyMapProblems(c: Curriculum, dutyIds: readonly string[] | null, map: readonly DutyLessonRow[] = DUTY_LESSONS): string[] {
  const out: string[] = [];
  for (const r of map) {
    if (dutyIds && !dutyIds.includes(r.duty)) out.push(`duty map: ${r.duty} is not a ladder duty`);
    for (const l of r.lessons) if (!c.lessons.some((x) => x.id === l)) out.push(`duty map: ${r.duty} names unknown lesson ${l}`);
  }
  return out;
}

// ---------------------------------------------------------------- N5.6.1

/** An AI call as the K-area decision record keeps it: the reason codes that fired, stored at the time. */
export interface AiCallRecord {
  readonly callId: string;
  readonly teamId: number;
  readonly coachId: number;
  /** Reason codes in firing order, top first, with the values that filled them. */
  readonly reasons: readonly { readonly code: string; readonly slots: Readonly<Record<string, string | number>> }[];
}

export interface WhyContext {
  readonly userTeamId: number;
  /** "Why" questions already asked in this game review. */
  readonly askedThisReview: number;
  /** The coach's profile reads as low openness (K2): short answers. Decided by the profile, not here. */
  readonly lowOpenness: boolean;
  /** The relationship module says this coach will not answer the user now (L4). */
  readonly declines: boolean;
}

export type WhyAnswer =
  | { readonly kind: 'answer'; readonly callId: string; readonly coachId: number; readonly reasons: AiCallRecord['reasons'] }
  | { readonly kind: 'not_own_staff' | 'limit' | 'declined'; readonly callId: string };

/**
 * N5.6.1: only the user's own staff answers (rule 2), a limited number per review (rule 3), from the
 * reason codes stored at the time of the call (rule 1). Nothing is invented after the fact.
 */
export function askWhy(call: AiCallRecord, ctx: WhyContext): WhyAnswer {
  if (call.teamId !== ctx.userTeamId) return { kind: 'not_own_staff', callId: call.callId };
  if (ctx.askedThisReview >= param('whyPerReview')) return { kind: 'limit', callId: call.callId };
  if (ctx.declines) return { kind: 'declined', callId: call.callId };
  return { kind: 'answer', callId: call.callId, coachId: call.coachId, reasons: call.reasons.slice(0, ctx.lowOpenness ? 1 : param('whyReasons')) };
}
