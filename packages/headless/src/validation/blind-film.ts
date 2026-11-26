// Q5.2.1 Blind film test: the answer sheet, its checks, and the scores. Reviewers watch clips in the
// standard film viewer with every overlay off (the viewer is G-63); this file never shows truth to a
// reviewer, it only scores sheets against the truth the clip source holds.
import type { CoverageFamily } from '@gm/schema';
import { CoverageFamily as CoverageFamilyEnum } from '@gm/schema';
import type { ClipTruth, Level } from './clips.ts';
import { param } from './params.ts';

export const CANNOT_TELL = 'cannot_tell';
export type CoverageAnswer = CoverageFamily | typeof CANNOT_TELL;

/** One reviewer's answer for one clip (rule 2: fixed list plus "cannot tell", and one line on why). */
export interface FilmAnswer {
  readonly reviewerId: string;
  readonly clipId: string;
  readonly coverage: CoverageAnswer;
  /** A content id from the concept list for the clip's concept kind, or "cannot_tell". */
  readonly concept: string;
  /** One line: why the play worked or failed. */
  readonly reason: string;
  /** Reviewer's own confidence, 1 (guess) to 5 (sure). Rule 4 uses it as the v1 benchmark. */
  readonly confidence: 1 | 2 | 3 | 4 | 5;
}

/** Rule 3: a second person judges each reason against the explainer's decisive event. */
export interface ReasonJudgement {
  readonly reviewerId: string;
  readonly clipId: string;
  readonly judgeId: string;
  readonly agrees: boolean;
}

export interface AnswerLists {
  readonly protection: readonly string[];
  readonly run_concept: readonly string[];
}

/** Sheet problems. An empty list means the sheet can be scored. */
export function checkSheet(answers: readonly FilmAnswer[], clips: readonly ClipTruth[], lists: AnswerLists, judgements: readonly ReasonJudgement[] = []): string[] {
  const out: string[] = [];
  const byId = new Map(clips.map((c) => [c.clipId, c]));
  const seen = new Set<string>();
  const coverageOk = new Set<string>([...CoverageFamilyEnum.options, CANNOT_TELL]);
  for (const a of answers) {
    const tag = `${a.reviewerId}/${a.clipId}`;
    const clip = byId.get(a.clipId);
    if (!clip) { out.push(`${tag}: clip not in the set`); continue; }
    if (seen.has(tag)) out.push(`${tag}: answered twice`);
    seen.add(tag);
    if (!coverageOk.has(a.coverage)) out.push(`${tag}: coverage "${a.coverage}" is not on the fixed list`);
    if (clip.conceptKind && a.concept !== CANNOT_TELL && !lists[clip.conceptKind].includes(a.concept)) out.push(`${tag}: concept "${a.concept}" is not on the ${clip.conceptKind} list`);
    if (clip.concept && clip.conceptKind && !lists[clip.conceptKind].includes(clip.concept)) out.push(`${tag}: truth concept "${clip.concept}" is missing from the ${clip.conceptKind} list`);
    const line = a.reason.trim();
    if (line.length === 0) out.push(`${tag}: reason is empty`);
    if (/[\r\n]/.test(line)) out.push(`${tag}: reason must be one line`);
    if (![1, 2, 3, 4, 5].includes(a.confidence)) out.push(`${tag}: confidence must be 1 to 5`);
  }
  for (const j of judgements) {
    if (j.judgeId === j.reviewerId) out.push(`${j.reviewerId}/${j.clipId}: a reason must be judged by a second person`);
  }
  return out;
}

export interface Rate { readonly hit: number; readonly of: number; readonly rate: number | null }
const rate = (hit: number, of: number): Rate => ({ hit, of, rate: of === 0 ? null : hit / of });

export interface ReviewerScore {
  readonly reviewerId: string;
  readonly coverage: Rate;
  readonly concept: Rate;
  readonly reason: Rate;
  readonly cannotTell: number;
  readonly meanConfidence: number | null;
}

export interface MisreadClip {
  readonly clipId: string;
  readonly question: 'coverage' | 'concept';
  readonly wrong: number;
  readonly of: number;
  /** Rule 5: either the simulation moved wrongly or the 2D view hides a cue a real camera shows. */
  readonly study: string;
}

export type FilmVerdict = 'pass' | 'fail' | 'not_run';

export interface FilmLevelResult {
  readonly level: Level;
  readonly clips: number;
  readonly reviewers: readonly ReviewerScore[];
  readonly pooled: { readonly coverage: Rate; readonly concept: Rate; readonly reason: Rate };
  readonly marks: { readonly coverage: number; readonly concept: number; readonly reason: number };
  readonly verdict: FilmVerdict;
  /** Why the verdict is not_run, or which marks failed. */
  readonly notes: readonly string[];
  readonly misread: readonly MisreadClip[];
}

/**
 * Scores one level. Coverage counts only clips whose disguise ended before the snap (rule 4), and a
 * disguised clip is scored on its post-snap answer (edge case) by the truth field already holding it.
 * "Cannot tell" counts as not identified. A reason counts as agreed when every judgement of it agrees.
 * The verdict is `not_run` unless at least the minimum number of reviewers scored the level.
 */
export function scoreLevel(level: Level, clips: readonly ClipTruth[], answers: readonly FilmAnswer[], judgements: readonly ReasonJudgement[]): FilmLevelResult {
  const set = clips.filter((c) => c.level === level);
  const byId = new Map(set.map((c) => [c.clipId, c]));
  const mine = answers.filter((a) => byId.has(a.clipId));
  const reviewerIds = [...new Set(mine.map((a) => a.reviewerId))].sort();
  const judged = new Map<string, boolean[]>();
  for (const j of judgements) {
    if (j.judgeId === j.reviewerId) continue;
    const k = `${j.reviewerId}|${j.clipId}`;
    const g = judged.get(k);
    if (g) g.push(j.agrees); else judged.set(k, [j.agrees]);
  }
  const tally = { cov: [0, 0], con: [0, 0], rea: [0, 0] };
  const wrongBy = new Map<string, { cov: [number, number]; con: [number, number] }>();
  const reviewers: ReviewerScore[] = reviewerIds.map((rid) => {
    const t = { cov: [0, 0], con: [0, 0], rea: [0, 0] };
    let cannot = 0; let confSum = 0; let confN = 0;
    for (const a of mine.filter((x) => x.reviewerId === rid)) {
      const c = byId.get(a.clipId)!;
      const w = wrongBy.get(c.clipId) ?? { cov: [0, 0], con: [0, 0] };
      if (a.coverage === CANNOT_TELL || a.concept === CANNOT_TELL) cannot++;
      if (c.coverageFamily !== null && c.disguiseEndedBeforeSnap) {
        const ok = a.coverage === c.coverageFamily;
        t.cov[1]!++; if (ok) t.cov[0]!++;
        w.cov[1]++; if (!ok) w.cov[0]++;
      }
      if (c.concept !== null) {
        const ok = a.concept === c.concept;
        t.con[1]!++; if (ok) t.con[0]!++;
        w.con[1]++; if (!ok) w.con[0]++;
      }
      const js = judged.get(`${rid}|${a.clipId}`);
      if (js && js.length > 0) { t.rea[1]!++; if (js.every(Boolean)) t.rea[0]!++; }
      confSum += a.confidence; confN++;
      wrongBy.set(c.clipId, w);
    }
    for (const k of ['cov', 'con', 'rea'] as const) { tally[k][0]! += t[k][0]!; tally[k][1]! += t[k][1]!; }
    return { reviewerId: rid, coverage: rate(t.cov[0]!, t.cov[1]!), concept: rate(t.con[0]!, t.con[1]!), reason: rate(t.rea[0]!, t.rea[1]!), cannotTell: cannot, meanConfidence: confN ? confSum / confN : null };
  });
  const pooled = { coverage: rate(tally.cov[0]!, tally.cov[1]!), concept: rate(tally.con[0]!, tally.con[1]!), reason: rate(tally.rea[0]!, tally.rea[1]!) };
  const marks = { coverage: param('validation.film.passCoverage'), concept: param('validation.film.passConcept'), reason: param('validation.film.passReason') };
  const notes: string[] = [];
  const minReviewers = param('validation.film.minReviewersPerLevel');
  let verdict: FilmVerdict;
  if (reviewers.length < minReviewers) {
    verdict = 'not_run';
    notes.push(`${reviewers.length} reviewer(s); the test needs at least ${minReviewers} per level`);
  } else {
    const fails: string[] = [];
    for (const q of ['coverage', 'concept', 'reason'] as const) {
      const r = pooled[q].rate;
      if (r === null) fails.push(`${q}: nothing scored`);
      else if (r < marks[q]) fails.push(`${q}: ${fmtPct(r)} below ${fmtPct(marks[q])}`);
    }
    verdict = fails.length ? 'fail' : 'pass';
    notes.push(...fails);
  }
  const share = param('validation.film.misreadShare');
  const misread: MisreadClip[] = [];
  const study = 'study: either the simulation moved wrongly, or the 2D overhead view hides a cue a real camera shows';
  for (const id of [...wrongBy.keys()].sort()) {
    const w = wrongBy.get(id)!;
    if (w.cov[1] >= 2 && w.cov[0] / w.cov[1] > share) misread.push({ clipId: id, question: 'coverage', wrong: w.cov[0], of: w.cov[1], study });
    if (w.con[1] >= 2 && w.con[0] / w.con[1] > share) misread.push({ clipId: id, question: 'concept', wrong: w.con[0], of: w.con[1], study });
  }
  return { level, clips: set.length, reviewers, pooled, marks, verdict, notes, misread };
}

export function fmtPct(x: number | null): string {
  return x === null ? 'n/a' : `${(Math.round(x * 1000) / 10).toFixed(1)}%`;
}
