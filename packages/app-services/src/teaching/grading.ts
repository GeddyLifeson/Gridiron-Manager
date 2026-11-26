// Graded scenarios and lesson progress (N5.1.2, N5.1.1). A scenario pack is solved on the engine in
// advance (N5.1.2 rule 1); this file scores answers against the stored solution, draws a retake from the
// pack, and turns attempts into lesson and course states. Nothing here grants a career benefit (rule 4).
import { seedFromNumber, stream } from '@gm/engine-core';
import type { Curriculum } from './curriculum.ts';
import { param } from './params.ts';

export type ValueUnit = 'wp' | 'ep';

/** One situation of a pack, already solved across its seed list (N4.3.2 format plus the stored answer). */
export interface SolvedSituation {
  readonly id: string;
  /** Problem type for "errors by type" (for example `kneel`, `timeout`, `fourth_down`, `coverage`). */
  readonly tag: string;
  readonly unit: ValueUnit;
  /** Value of each allowed answer: win probability (0 to 1) or expected points. */
  readonly options: readonly { readonly id: string; readonly value: number }[];
  readonly best: string;
  /** Answers inside the "coach's call" band (N2.7.2); all get full credit. Includes `best`. */
  readonly band: readonly string[];
  /** Seeds the solution was run on (acceptance: stored with the pack). */
  readonly seeds: number;
  /** Real time limit for the task in seconds (play clock for a call), or null when untimed (rule 5). */
  readonly timeLimitS: number | null;
}

export interface ScenarioPack { readonly id: string; readonly lessonId: string; readonly perAttempt: number; readonly situations: readonly SolvedSituation[] }

export interface Answer { readonly situationId: string; readonly option: string | null; readonly seconds: number }

export type ErrorKind = 'delay_of_game' | 'no_answer' | 'outside_band';

export interface AnswerResult {
  readonly situationId: string;
  readonly tag: string;
  readonly option: string | null;
  readonly best: string;
  readonly credit: number;
  /** Value given up against the best answer (0 inside the band). */
  readonly lost: number;
  readonly margin: number;
  readonly error: ErrorKind | null;
  readonly bothAccepted: boolean;
}

export interface AttemptResult {
  readonly lessonId: string;
  readonly packId: string;
  /** Sorted situation ids: two attempts with the same key drew the same situations. */
  readonly drawKey: string;
  readonly score: number;
  readonly passed: boolean;
  readonly answers: readonly AnswerResult[];
  readonly errorsByType: Readonly<Record<string, number>>;
  readonly medianSeconds: number;
}

export class PackError extends Error {}

/** Pack problems: stored best answer, band containing it, seed count, enough situations for retakes. */
export function packProblems(p: ScenarioPack): string[] {
  const out: string[] = [];
  if (p.situations.length < p.perAttempt * param('packMultiple')) out.push(`pack ${p.id}: ${p.situations.length} situations, needs ${p.perAttempt * param('packMultiple')} (rule 4)`);
  for (const s of p.situations) {
    const ids = new Set(s.options.map((o) => o.id));
    if (!ids.has(s.best)) out.push(`${s.id}: best answer ${s.best} is not an option`);
    if (!s.band.includes(s.best)) out.push(`${s.id}: band must include the best answer`);
    for (const b of s.band) if (!ids.has(b)) out.push(`${s.id}: band answer ${b} is not an option`);
    if (!(s.seeds >= param('scenarioSeeds'))) out.push(`${s.id}: solved on ${s.seeds} seeds, needs ${param('scenarioSeeds')}`);
    const best = s.options.find((o) => o.id === s.best);
    if (best && s.options.some((o) => o.value > best.value + 1e-12 && !s.band.includes(o.id))) out.push(`${s.id}: an answer outside the band beats the stored best`);
  }
  return out;
}

/** Draw one attempt's situations from the pack (seeded; a different seed gives a different draw). */
export function drawAttempt(p: ScenarioPack, seed: number): SolvedSituation[] {
  if (p.situations.length < p.perAttempt) throw new PackError(`pack ${p.id} has fewer situations than one attempt uses`);
  const st = stream(seedFromNumber(seed), 'teaching.draw', [p.id]);
  const pool = [...p.situations];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(st.uniform() * (i + 1));
    const t = pool[i]!; pool[i] = pool[j]!; pool[j] = t;
  }
  return pool.slice(0, p.perAttempt);
}

function marginOf(s: SolvedSituation): number {
  const vals = s.options.map((o) => o.value).sort((a, b) => b - a);
  return vals.length > 1 ? vals[0]! - vals[1]! : 0;
}

/** N5.1.2 rule 2 scoring and acceptance "a timed answer after the clock expires is a delay of game". */
export function scoreAnswer(s: SolvedSituation, a: Answer): AnswerResult {
  const base = { situationId: s.id, tag: s.tag, option: a.option, best: s.best, margin: marginOf(s), bothAccepted: s.band.length > 1 };
  if (s.timeLimitS !== null && a.seconds > s.timeLimitS) return { ...base, credit: 0, lost: 0, error: 'delay_of_game' };
  if (a.option === null) return { ...base, credit: 0, lost: 0, error: 'no_answer' };
  if (s.band.includes(a.option)) return { ...base, credit: 1, lost: 0, error: null };
  const best = s.options.find((o) => o.id === s.best)!;
  const chosen = s.options.find((o) => o.id === a.option);
  if (!chosen) return { ...base, credit: 0, lost: 0, error: 'no_answer' };
  const lost = Math.max(0, best.value - chosen.value);
  const zero = s.unit === 'wp' ? param('zeroCreditWp') : param('zeroCreditEp');
  return { ...base, credit: Math.max(0, 1 - lost / zero), lost, error: 'outside_band' };
}

function median(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function scoreAttempt(p: ScenarioPack, drawn: readonly SolvedSituation[], answers: readonly Answer[]): AttemptResult {
  const byId = new Map(answers.map((a) => [a.situationId, a]));
  const results = drawn.map((s) => scoreAnswer(s, byId.get(s.id) ?? { situationId: s.id, option: null, seconds: 0 }));
  const score = results.length ? results.reduce((t, r) => t + r.credit, 0) / results.length : 0;
  const errorsByType: Record<string, number> = {};
  for (const r of results) if (r.error) errorsByType[`${r.tag}:${r.error}`] = (errorsByType[`${r.tag}:${r.error}`] ?? 0) + 1;
  return {
    lessonId: p.lessonId, packId: p.id, drawKey: drawn.map((s) => s.id).sort().join(','), score,
    passed: score >= param('passShare'), answers: results, errorsByType, medianSeconds: median(answers.map((a) => a.seconds)),
  };
}

export type LessonState = 'not_started' | 'attempted' | 'passed' | 'mastered';

/** A placement result marks a lesson known (passed) without an attempt (N5.1.1). */
export interface LessonRecord { readonly lessonId: string; readonly attempts: readonly AttemptResult[]; readonly placed: boolean }

/** N5.1.2 rule 3: pass at 70 percent; mastered at 90 percent on two attempts with different draws. */
export function lessonState(r: LessonRecord | undefined): LessonState {
  if (!r || (r.attempts.length === 0 && !r.placed)) return 'not_started';
  const masteredDraws = new Set(r.attempts.filter((a) => a.score >= param('masteredShare')).map((a) => a.drawKey));
  if (masteredDraws.size >= param('masteredAttempts')) return 'mastered';
  if (r.placed || r.attempts.some((a) => a.passed)) return 'passed';
  return 'attempted';
}

export type CourseState = 'not_started' | 'in_progress' | 'passed';

/** N5.1.1 acceptance: passing every lesson in a course marks the course passed. */
export function courseState(c: Curriculum, courseId: string, records: ReadonlyMap<string, LessonRecord>): CourseState {
  const states = c.lessons.filter((l) => l.course === courseId).map((l) => lessonState(records.get(l.id)));
  if (states.length > 0 && states.every((s) => s === 'passed' || s === 'mastered')) return 'passed';
  return states.some((s) => s !== 'not_started') ? 'in_progress' : 'not_started';
}

/** A placement item: one question or scenario tied to the lesson it tests. */
export interface PlacementItem { readonly lessonId: string; readonly correct: boolean }

/** Lessons the placement test shows the user already knows: every item for the lesson correct. */
export function placementKnown(items: readonly PlacementItem[]): string[] {
  const by = new Map<string, boolean>();
  for (const i of items) by.set(i.lessonId, (by.get(i.lessonId) ?? true) && i.correct);
  return [...by.entries()].filter(([, ok]) => ok).map(([id]) => id).sort();
}

/** Placement size check (N5.1.1: starting 20 questions and 6 scenarios). */
export function placementShapeOk(questions: number, scenarios: number): boolean {
  return questions === param('placementQuestions') && scenarios === param('placementScenarios');
}
