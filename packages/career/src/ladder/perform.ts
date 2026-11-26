// Headless duty performance (G-55 acceptance: every rung's duty list can be performed in a headless run).
// A duty becomes a task built from the truth record; a worker (the user's input, or an AI coach per K6)
// submits a product; the product is graded by S3.1.1's grader kind. Truth comes through `TruthSource`: the
// engine, H2 and N1 own the real record, and `syntheticTruth` stands in for headless runs until they land.
// Every draw uses the stream it is handed (J13), so a run is deterministic.
import type { RandomStream } from '@gm/schema';
import type { DutyDef, DutyKind, GraderKind, Ownership } from './duties.ts';
import type { DutyAssignment } from './ownership.ts';
import {
  TAG_WEIGHTS, adviceScore, chartScore, fieldScore, lookQuality, mixedGrade, reelScore, selfScoutScore, signalScore,
  snapGradeScore, teachingTerm, tendencyReportScore, videoScore,
  type AnswerRow, type FieldRow, type Finding, type SignalRep, type SnapMark, type TeachingChecks, type TrueTendency,
} from './grading.ts';
import { param } from './params.ts';

/** Truth for one duty this week. Each kind carries what its S3 leaf grades against. */
export type DutyTask =
  | { readonly kind: 'chart' | 'tagging' | 'cards' | 'drawings'; readonly rows: readonly FieldRow[] }
  | { readonly kind: 'signal'; readonly calls: number }
  | { readonly kind: 'video'; readonly periods: readonly FieldRow[] }
  | { readonly kind: 'scout_team'; readonly cardAccuracy: number; readonly scoutEffort: number }
  | { readonly kind: 'tendency'; readonly truth: readonly TrueTendency[]; readonly sample: number }
  | { readonly kind: 'self_scout'; readonly truth: readonly TrueTendency[] }
  | { readonly kind: 'reel'; readonly clips: number }
  | { readonly kind: 'advice'; readonly decisions: readonly (readonly number[])[] }
  | { readonly kind: 'snap_grades'; readonly snaps: readonly SnapMark[] }
  | { readonly kind: 'drills' | 'meeting' }
  | { readonly kind: 'plan'; readonly dutyKind: DutyKind; readonly options: readonly string[] };

export type Submission =
  | { readonly kind: 'rows'; readonly answers: readonly AnswerRow[]; readonly missed: number }
  | { readonly kind: 'signal'; readonly reps: readonly SignalRep[] }
  | { readonly kind: 'video'; readonly filmed: readonly boolean[]; readonly labels: readonly AnswerRow[] }
  | { readonly kind: 'scout_team'; readonly alignment: number }
  | { readonly kind: 'findings'; readonly findings: readonly Finding[] }
  | { readonly kind: 'flags'; readonly keys: readonly string[] }
  | { readonly kind: 'reel'; readonly matches: readonly boolean[] }
  | { readonly kind: 'advice'; readonly picks: readonly number[] }
  | { readonly kind: 'snaps'; readonly marks: readonly SnapMark[] }
  | { readonly kind: 'teaching'; readonly checks: TeachingChecks | 'default_plan' }
  | { readonly kind: 'plan'; readonly choices: readonly string[] };

export interface TruthSource { task(duty: DutyDef): DutyTask }
export interface Worker { submit(duty: DutyDef, task: DutyTask, ownership: Ownership): Submission }
/** The boss's rating of a product against his standards and beliefs (S4.3; G-78 supplies the real one). */
export interface BossJudge { rate(duty: DutyDef, submission: Submission): number }

export interface WorkProduct {
  readonly dutyId: string;
  readonly kind: DutyKind;
  readonly ownership: Ownership;
  readonly grader: GraderKind;
  readonly truthScore: number | null;
  readonly bossScore: number | null;
  /** The grade now; null while a boss or outcome part is still to come. */
  readonly grade: number | null;
  readonly pending: 'boss' | 'outcome' | null;
  readonly hours: number;
  /** Own: his product is used as is. Recommend: the boss decides. Observe: nothing of his is used (S3.1.1). */
  readonly used: boolean | 'boss_decides';
  readonly detail: Readonly<Record<string, number>>;
  readonly submission: Submission;
}

const TRUTH_KINDS: Readonly<Partial<Record<DutyKind, true>>> = {
  chart: true, tagging: true, cards: true, drawings: true, signal: true, video: true, scout_team: true, tendency: true, self_scout: true,
  reel: true, advice: true, snap_grades: true,
};

/** The truth part of a product (0 to 100) with detail figures, or null for duties with no truth part. */
export function truthPart(task: DutyTask, sub: Submission): { score: number | null; detail: Record<string, number> } {
  switch (task.kind) {
    case 'chart': {
      if (sub.kind !== 'rows') break;
      const due = task.rows.reduce((s, r) => s + Object.keys(r).length, 0);
      const right = (fieldScore(task.rows, sub.answers) / 100) * due;
      return { score: chartScore(right, due, sub.missed), detail: { fieldsDue: due, repsMissed: sub.missed } };
    }
    case 'tagging': if (sub.kind === 'rows') return { score: fieldScore(task.rows, sub.answers, TAG_WEIGHTS), detail: { plays: task.rows.length } }; break;
    case 'cards': case 'drawings': if (sub.kind === 'rows') return { score: fieldScore(task.rows, sub.answers), detail: { items: task.rows.length } }; break;
    case 'signal': if (sub.kind === 'signal') { const g = signalScore(sub.reps); return { score: g.score, detail: { playClockLostSeconds: g.playClockLostSeconds, wrong: g.wrong } }; } break;
    case 'video': if (sub.kind === 'video') {
      const filmedRows = task.periods.filter((_, i) => sub.filmed[i]);
      const filmedLabels = sub.labels.filter((_, i) => sub.filmed[i]);
      const acc = filmedRows.length === 0 ? 0 : fieldScore(filmedRows, filmedLabels) / 100;
      const filmed = sub.filmed.filter(Boolean).length;
      return { score: videoScore(acc, filmed, task.periods.length), detail: { periodsFilmed: filmed, periodsUngradable: task.periods.length - filmed } };
    } break;
    case 'scout_team': if (sub.kind === 'scout_team') { const q = lookQuality(task.cardAccuracy, sub.alignment, task.scoutEffort); return { score: 100 * q, detail: { lookQuality: q } }; } break;
    case 'tendency': if (sub.kind === 'findings') { const g = tendencyReportScore(task.truth, sub.findings); return { score: g.score, detail: { overreach: g.overreach.length, missed: g.missed.length, wrong: g.wrong.length } }; } break;
    case 'self_scout': if (sub.kind === 'flags') { const g = selfScoutScore(task.truth, sub.keys); return { score: g.score, detail: { omitted: g.omitted.length } }; } break;
    case 'reel': if (sub.kind === 'reel') return { score: reelScore(sub.matches), detail: { clips: sub.matches.length } }; break;
    case 'advice': if (sub.kind === 'advice') {
      const costs = task.decisions.map((opts, i) => { const best = Math.min(...opts); return (opts[sub.picks[i] ?? 0] ?? best) - best; });
      const g = adviceScore(costs);
      return { score: g.score, detail: { errors: g.errors } };
    } break;
    case 'snap_grades': if (sub.kind === 'snaps') return { score: snapGradeScore(task.snaps, sub.marks), detail: { snaps: task.snaps.length } }; break;
    case 'drills': case 'meeting': if (sub.kind === 'teaching') return { score: null, detail: { teachingTerm: teachingTerm(sub.checks) } }; break;
    default: return { score: null, detail: {} };
  }
  throw new Error(`ladder: submission ${sub.kind} does not fit task ${task.kind}`);
}

/** Grade one product by the duty's grader kind (S3.1.1). Outcome parts are left pending; they arrive from play. */
export function gradeProduct(a: DutyAssignment, task: DutyTask, sub: Submission, judge: BossJudge | null): WorkProduct {
  const d = a.duty;
  if (a.ownership === 'observe') return observed(a, sub);
  const { score: truth, detail } = truthPart(task, sub);
  const needsBoss = d.grader === 'boss' || d.grader === 'mixed';
  const boss = needsBoss && judge ? judge.rate(d, sub) : null;
  let grade: number | null = null;
  let pending: WorkProduct['pending'] = null;
  switch (d.grader) {
    case 'truth': grade = truth; break;
    case 'boss': grade = boss; if (boss === null) pending = 'boss'; break;
    case 'mixed': grade = truth === null ? boss : mixedGrade(truth, boss); if (grade === null) pending = 'boss'; break;
    case 'outcome': pending = 'outcome'; break;
  }
  return {
    dutyId: d.id, kind: d.kind, ownership: a.ownership, grader: d.grader, truthScore: truth, bossScore: boss, grade, pending,
    hours: d.hoursEst,
    used: a.ownership === 'own' ? true : a.ownership === 'recommend' ? 'boss_decides' : false,
    detail, submission: sub,
  };
}

/** He sat in and saw how it was done: hours spent, nothing of his used or graded (S3.1.1 Observe). */
function observed(a: DutyAssignment, sub: Submission): WorkProduct {
  return {
    dutyId: a.duty.id, kind: a.duty.kind, ownership: 'observe', grader: a.duty.grader, truthScore: null, bossScore: null, grade: null,
    pending: null, hours: a.duty.hoursEst, used: false, detail: {}, submission: sub,
  };
}

export interface WeekResult {
  readonly products: readonly WorkProduct[];
  readonly hours: number;
}

/** Perform every listed duty once (a week's work for the duties on his week screen). Observed duties are sat in on and produce nothing used. */
export function performDuties(list: readonly DutyAssignment[], truth: TruthSource, worker: Worker, judge: BossJudge | null): WeekResult {
  const products: WorkProduct[] = [];
  for (const a of list) {
    if (a.ownership === 'observe') { products.push(observed(a, { kind: 'plan', choices: [] })); continue; }
    const task = truth.task(a.duty);
    products.push(gradeProduct(a, task, worker.submit(a.duty, task, a.ownership), judge));
  }
  return { products, hours: products.reduce((s, p) => s + p.hours, 0) };
}

export const hasTruthPart = (kind: DutyKind): boolean => TRUTH_KINDS[kind] === true;

// ---- Stand-ins for headless runs ------------------------------------------------------------------------

const OFFENSE_TAGS: Readonly<Record<string, readonly string[]>> = {
  down: ['1', '2', '3', '4'], distance: ['short', 'medium', 'long'], hash: ['left', 'middle', 'right'], zone: ['own', 'middle', 'red'],
  personnel: ['11', '12', '21', '10'], formation: ['2x2', '3x1', 'bunch', 'empty'], concept: ['run/zone/inside', 'run/zone/outside', 'run/gap/power', 'pass/quick/slant', 'pass/dropback/mesh'],
  protection: ['slide/left', 'slide/right', 'man/bob', 'max'],
};
const DEFENSE_TAGS: Readonly<Record<string, readonly string[]>> = {
  personnel: ['base', 'nickel', 'dime'], front: ['even/4-3', 'odd/3-4', 'tite'], shellPre: ['one_high', 'two_high'],
  coveragePost: ['cover3/sky', 'cover3/buzz', 'cover1/robber', 'quarters/match', 'cover2/tampa'], pressure: ['none', 'five/fire_zone', 'six/zero'],
};

function draw(stream: RandomStream, table: Readonly<Record<string, readonly string[]>>): FieldRow {
  const row: Record<string, string> = {};
  for (const [f, vals] of Object.entries(table)) row[f] = vals[stream.int(0, vals.length - 1)]!;
  return row;
}

/** A deterministic truth record for headless runs (sizes from the S3 leaves: 10 to 15 reps a period, 60 to 80 plays a game). */
export function syntheticTruth(stream: RandomStream): TruthSource {
  return {
    task(duty: DutyDef): DutyTask {
      switch (duty.kind) {
        case 'chart': return { kind: 'chart', rows: Array.from({ length: stream.int(10, 15) }, () => draw(stream, { script: ['1', '2', '3', '4', '5'], personnel: OFFENSE_TAGS.personnel!, formation: OFFENSE_TAGS.formation!, result: ['gain', 'complete', 'incomplete', 'sack', 'turnover'] })) };
        case 'tagging': return { kind: 'tagging', rows: Array.from({ length: stream.int(60, 80) }, () => draw(stream, stream.chance(0.5) ? OFFENSE_TAGS : DEFENSE_TAGS)) };
        case 'cards': return { kind: 'cards', rows: Array.from({ length: stream.int(20, 40) }, () => draw(stream, DEFENSE_TAGS)) };
        case 'drawings': return { kind: 'drawings', rows: Array.from({ length: stream.int(5, 12) }, () => draw(stream, OFFENSE_TAGS)) };
        case 'signal': return { kind: 'signal', calls: stream.int(60, 75) };
        case 'video': return { kind: 'video', periods: Array.from({ length: stream.int(12, 20) }, () => draw(stream, { periodType: ['individual', 'group', '7on7', 'team'], angle: ['sideline', 'end_zone'] })) };
        case 'scout_team': return { kind: 'scout_team', cardAccuracy: 0.8 + 0.2 * stream.uniform(), scoutEffort: 0.6 + 0.4 * stream.uniform() };
        case 'tendency': case 'self_scout': {
          const truth = Array.from({ length: 6 }, (_, i) => ({ key: `situation_${i}`, share: 0.4 + 0.55 * stream.uniform() }));
          return duty.kind === 'tendency' ? { kind: 'tendency', truth, sample: stream.int(20, 60) } : { kind: 'self_scout', truth };
        }
        case 'reel': return { kind: 'reel', clips: 15 };
        case 'advice': return { kind: 'advice', decisions: Array.from({ length: stream.int(3, 8) }, () => [0, 3 * stream.uniform(), 6 * stream.uniform()]) };
        case 'snap_grades': return { kind: 'snap_grades', snaps: Array.from({ length: stream.int(60, 80) }, () => ({ assignment: stream.chance(0.9), technique: ([-1, 0, 1] as const)[stream.int(0, 2)]! })) };
        case 'drills': case 'meeting': return { kind: duty.kind };
        default: return { kind: 'plan', dutyKind: duty.kind, options: ['a', 'b', 'c'] };
      }
    },
  };
}

/**
 * An AI staff member doing the duty (K6): each answer is right with probability `accuracy`, otherwise a wrong
 * value. Observed duties produce nothing. The same worker serves as a scripted user in headless tests.
 */
export function aiWorker(accuracy: number, stream: RandomStream): Worker {
  const ok = () => stream.chance(accuracy);
  const answerRows = (rows: readonly FieldRow[]): AnswerRow[] => rows.map((r) => Object.fromEntries(Object.entries(r).map(([f, v]) => [f, ok() ? v : `${v}~wrong`])));
  return {
    submit(_duty, task, ownership): Submission {
      if (ownership === 'observe') return { kind: 'plan', choices: [] };
      switch (task.kind) {
        case 'chart': case 'tagging': case 'cards': case 'drawings': return { kind: 'rows', answers: answerRows(task.rows), missed: 0 };
        case 'signal': return { kind: 'signal', reps: Array.from({ length: task.calls }, () => ({ correct: ok(), delaySeconds: ok() ? 2 : param('signal.windowSeconds') + 2 })) };
        case 'video': return { kind: 'video', filmed: task.periods.map(() => ok()), labels: answerRows(task.periods) };
        case 'scout_team': return { kind: 'scout_team', alignment: accuracy };
        case 'tendency': {
          const top = [...task.truth].sort((a, b) => b.share - a.share).slice(0, param('report.topTendencies'));
          return { kind: 'findings', findings: top.map((t) => ({ key: t.key, share: ok() ? t.share : 1 - t.share, n: task.sample })) };
        }
        case 'self_scout': return { kind: 'flags', keys: task.truth.filter((t) => t.share >= param('selfScout.alertShare') && ok()).map((t) => t.key) };
        case 'reel': return { kind: 'reel', matches: Array.from({ length: task.clips }, ok) };
        case 'advice': return { kind: 'advice', picks: task.decisions.map((opts) => (ok() ? opts.indexOf(Math.min(...opts)) : opts.length - 1)) };
        case 'snap_grades': return { kind: 'snaps', marks: task.snaps.map((s) => (ok() ? s : { assignment: !s.assignment, technique: s.technique })) };
        case 'drills': case 'meeting': return { kind: 'teaching', checks: { aimedAtWeakest: accuracy, pointCorrect: accuracy, repsToNeediest: accuracy } };
        case 'plan': return { kind: 'plan', choices: [task.options[ok() ? 0 : task.options.length - 1]!] };
      }
    },
  };
}

/** A boss who rates every product the same (headless stand-in until G-78's evaluations land). */
export const fixedJudge = (score: number): BossJudge => ({ rate: () => score });
