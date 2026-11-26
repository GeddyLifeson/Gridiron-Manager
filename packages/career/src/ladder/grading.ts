// S3 grading rules, one function per leaf. Truth-graded parts compare a work product with the engine's truth
// record (passed in; the engine and H2/N1 tools own producing it). Boss parts come from a judge (S4, G-78) and
// outcome parts arrive later (S3.1.1 grader kinds). Nothing here reads or raises any value on the coach: a
// grade describes one product (E9.1.3, INDEX rule 9), and no setting changes how a graded task is scored.
import { clamp, param } from './params.ts';

/** Partial credit along a tag's family tree (S3.3.1 rule 3): values are paths like `cover3/buzz`. */
export function tagCredit(truth: string, answer: string | null): number {
  if (answer === null) return 0;
  if (truth === answer) return 1;
  const t = truth.split('/'), a = answer.split('/');
  let shared = 0;
  while (shared < t.length && shared < a.length && t[shared] === a[shared]) shared++;
  return shared / Math.max(t.length, a.length);
}

export type FieldRow = Readonly<Record<string, string>>;
export type AnswerRow = Readonly<Record<string, string | null>>;

/** Weighted field accuracy over rows (0 to 100). Fields missing from `weights` weigh 1. */
export function fieldScore(truth: readonly FieldRow[], answers: readonly AnswerRow[], weights: Readonly<Record<string, number>> = {}): number {
  let got = 0, due = 0;
  truth.forEach((row, i) => {
    const ans = answers[i] ?? {};
    for (const [f, v] of Object.entries(row)) {
      const w = weights[f] ?? 1;
      due += w;
      got += w * tagCredit(v, ans[f] ?? null);
    }
  });
  return due === 0 ? 100 : (100 * got) / due;
}

/** S3.3.1 rule 2: coverage after the snap and protection weigh most, down and distance least (module weights, Assumption). */
export const TAG_WEIGHTS: Readonly<Record<string, number>> = {
  down: 0.5, distance: 0.5, hash: 0.5, zone: 0.5,
  personnel: 1, formation: 1, backfield: 1, motion: 1, runPass: 0.75, concept: 1.5, protection: 2, playAction: 1, result: 0.75,
  front: 1.25, shellPre: 1.25, coveragePost: 2, pressure: 1.5, stunt: 1.25,
};

/** S3.2.1: 100 x right / due, minus a penalty per rep missed entirely, floor 0. */
export function chartScore(fieldsRight: number, fieldsDue: number, repsMissed: number): number {
  if (fieldsDue <= 0) return 0;
  return Math.max(0, (100 * fieldsRight) / fieldsDue - param('chart.missPenalty') * repsMissed);
}

/** S3.2.1 use: a chart under the threshold is not trusted and H3 falls back to the script. */
export const chartChecked = (score: number): boolean => score >= param('chart.checkedBelow');

export interface SignalRep { readonly correct: boolean; readonly delaySeconds: number }

/** S3.2.2: share of signals right and inside the window; every second past it costs a second of play clock. */
export function signalScore(reps: readonly SignalRep[]): { score: number; playClockLostSeconds: number; wrong: number } {
  const w = param('signal.windowSeconds');
  let ok = 0, lost = 0, wrong = 0;
  for (const r of reps) {
    if (!r.correct) wrong++;
    if (r.correct && r.delaySeconds <= w) ok++;
    lost += Math.max(0, r.delaySeconds - w);
  }
  return { score: reps.length === 0 ? 100 : (100 * ok) / reps.length, playClockLostSeconds: lost, wrong };
}

/** S3.2.3: 60% label accuracy + 40% coverage of periods. Unfilmed periods cannot be graded by anyone that day. */
export function videoScore(labelAccuracy: number, periodsFilmed: number, periodsTotal: number): number {
  const coverage = periodsTotal === 0 ? 1 : periodsFilmed / periodsTotal;
  return 100 * (param('video.labelWeight') * clamp(labelAccuracy, 0, 1) + param('video.coverageWeight') * clamp(coverage, 0, 1));
}

export function gradablePeriods(filmed: readonly boolean[]): number[] {
  return filmed.flatMap((f, i) => (f ? [i] : []));
}

/** S3.3.3: look quality = card accuracy x alignment correctness x scout effort; readiness gain scales with it. */
export function lookQuality(cardAccuracy: number, alignment: number, effort: number): number {
  return clamp(cardAccuracy, 0, 1) * clamp(alignment, 0, 1) * clamp(effort, 0, 1);
}
export const readinessGain = (baseGain: number, quality: number): number => baseGain * quality;

/** S3.1.1 mixed grade: the truth part and the boss part, the boss part pending until a judge rates it. */
export function mixedGrade(truth: number, boss: number | null): number | null {
  if (boss === null) return null;
  const w = param('mixed.truthWeight');
  return w * truth + (1 - w) * boss;
}

/** A true tendency in the opponent's real call rules (K4) for one report section. */
export interface TrueTendency { readonly key: string; readonly share: number }
/** A finding he claimed from the sample: situation key, claimed share, sample size. */
export interface Finding { readonly key: string; readonly share: number; readonly n: number }

export interface ReportGrade { readonly score: number; readonly overreach: readonly string[]; readonly missed: readonly string[]; readonly wrong: readonly string[] }

/**
 * S3.4.1 truth part: hits on the section's largest true tendencies, by strength; wrong findings cost points;
 * a wrong finding from n under the threshold is flagged as overreach; the largest true tendencies left out are missed.
 */
export function tendencyReportScore(truth: readonly TrueTendency[], findings: readonly Finding[]): ReportGrade {
  const tol = param('report.shareTolerance');
  const top = [...truth].sort((a, b) => b.share - a.share || (a.key < b.key ? -1 : 1)).slice(0, param('report.topTendencies'));
  const byKey = new Map(truth.map((t) => [t.key, t] as const));
  const hit = new Set<string>();
  const wrong: string[] = [], overreach: string[] = [];
  for (const f of findings) {
    const t = byKey.get(f.key);
    if (t && Math.abs(t.share - f.share) <= tol) { hit.add(f.key); continue; }
    wrong.push(f.key);
    if (f.n < param('report.overreachBelowN')) overreach.push(f.key);
  }
  const topWeight = top.reduce((s, t) => s + t.share, 0);
  const got = top.filter((t) => hit.has(t.key)).reduce((s, t) => s + t.share, 0);
  const score = clamp((topWeight === 0 ? 100 : (100 * got) / topWeight) - param('report.wrongFindingPenalty') * wrong.length, 0, 100);
  return { score, overreach, missed: top.filter((t) => !hit.has(t.key)).map((t) => t.key), wrong };
}

/** S3.4.2: every own tendency above the alert threshold that he leaves out lowers the grade. */
export function selfScoutScore(ownTendencies: readonly TrueTendency[], flagged: readonly string[]): { score: number; omitted: readonly string[] } {
  const above = ownTendencies.filter((t) => t.share >= param('selfScout.alertShare')).map((t) => t.key);
  const set = new Set(flagged);
  const omitted = above.filter((k) => !set.has(k));
  return { score: clamp(100 - param('selfScout.omissionPenalty') * omitted.length, 0, 100), omitted };
}

/** S3.4.3 truth part: share of clips that match the request. */
export function reelScore(clipsMatch: readonly boolean[]): number {
  return clipsMatch.length === 0 ? 0 : (100 * clipsMatch.filter(Boolean).length) / clipsMatch.length;
}

export interface AdviceGrade { readonly score: number; readonly errors: number }

/**
 * S3.4.4: each recommendation's cost in win probability (percentage points) against the full-information best.
 * Within the margin counts as correct, over the error line is logged as an error, linear between.
 * Graded on the advice, never on whether the head coach took it.
 */
export function adviceScore(costsPp: readonly number[]): AdviceGrade {
  const m = param('advice.correctMarginPp'), e = param('advice.errorPp');
  let sum = 0, errors = 0;
  for (const c of costsPp) {
    if (c > e) errors++;
    sum += c <= m ? 1 : c > e ? 0 : 1 - (c - m) / (e - m);
  }
  return { score: costsPp.length === 0 ? 100 : (100 * sum) / costsPp.length, errors };
}

/** S3.5.3 per-snap mark: assignment right or wrong, technique plus, zero or minus. */
export interface SnapMark { readonly assignment: boolean; readonly technique: -1 | 0 | 1 }

/** S3.5.3: agreement with truth on assignment, and with contest results on technique. Random marks land near 50. */
export function snapGradeScore(truth: readonly SnapMark[], marks: readonly SnapMark[]): number {
  if (truth.length === 0) return 100;
  let a = 0, t = 0;
  truth.forEach((s, i) => {
    const m = marks[i];
    if (!m) return;
    if (m.assignment === s.assignment) a++;
    if (m.technique === s.technique) t += 1; else if (Math.abs(m.technique - s.technique) === 1) t += 0.5;
  });
  const w = param('snap.assignmentWeight');
  return (100 * (w * a + (1 - w) * t)) / truth.length;
}

/** S3.5.1 and S3.5.2: the user's teaching term for one period, built only from his choices checked against truth. */
export interface TeachingChecks { readonly aimedAtWeakest: number; readonly pointCorrect: number; readonly repsToNeediest: number }

export function teachingTerm(checks: TeachingChecks | 'default_plan'): number {
  if (checks === 'default_plan') return param('teach.defaultPlan');
  const lo = param('teach.min'), hi = param('teach.max');
  const share = param('teach.weightWeakest') * clamp(checks.aimedAtWeakest, 0, 1)
    + param('teach.weightPoint') * clamp(checks.pointCorrect, 0, 1)
    + param('teach.weightReps') * clamp(checks.repsToNeediest, 0, 1);
  return lo + (hi - lo) * share;
}

/** S3.5.1 gain per player per drill = minutes x fit x teaching term x coachability and effort. */
export function drillGain(minutes: number, fit: number, term: number, coachEffort: number): number {
  return minutes * clamp(fit, 0, 1) * term * clamp(coachEffort, 0, 1);
}

/**
 * S3.5.2: knowledge gain per call in a fixed-length meeting. Time per call shrinks as calls are added, so
 * doubling the calls lowers per-call gain; film and testing add a bonus.
 */
export function meetingGainPerCall(meetingMinutes: number, calls: number, term: number, learningRate: number, film: boolean, tested: boolean): number {
  if (calls <= 0) return 0;
  const bonus = 1 + (film ? 0.1 : 0) + (tested ? 0.1 : 0);
  return (meetingMinutes / calls) * term * learningRate * bonus;
}

/**
 * S3.5.4 recommend-level ownership: the boss keeps the user's depth order unless their disagreement (0 to 1)
 * exceeds what his trust (0 to 100) allows. At maximum trust the order is used unchanged.
 */
export function bossTakesRecommendation(disagreement: number, trust: number): boolean {
  return clamp(disagreement, 0, 1) <= clamp(trust, 0, 100) / 100;
}
