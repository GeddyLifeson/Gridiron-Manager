// The user's interview screens, both directions (career/interviews, PR 323; S6.4.1, E2.4.3, O4, O7).
// Marlon 2026-11-26 14:26: view questions have no right answer; candidates say what they believe and are
// hired on fit. 14:52: the knowledge parts (whiteboard, film, teaching, game plan, game management) stay
// GRADED on correctness, by the same tools the job uses.
//
// 1. coach.interview: the user sits an interview for a job. He answers the panel's slate in his own words
//    (any option, or he declines one) and does the graded work in the job's own tools. He never sees the
//    panel's views or a fit number: he learns how it went from the outcome, as in life.
// 2. people.hiring: the user hires for his staff. He sees each shortlisted candidate's record, what his
//    referees said, his answers to the slate, and how his graded work went on the day. He judges fit
//    himself (marks each answer "with me" or "not for me"); no fit score, belief or craft is shown (MA-48:
//    observed grades only). He offers, passes, or leaves the search to the lead below him.
//
// Pure: no clock, no randomness. The host runs career `interviews.runSearch` and feeds the results in.
import { interviews } from '@gm/career';

type Question = interviews.Question;
type RoleGroup = interviews.RoleGroup;

// ---------- shared pieces ----------

export interface UiOption { readonly key: string; readonly text: string }
/** A slate question. Option positions on the stance line are not shown: no answer is marked right. */
export interface UiQuestion { readonly id: string; readonly text: string; readonly options: readonly UiOption[] }

/** The screen where a graded task is done (screens.json id). The job's own tool grades it. */
export const TASK_TOOL: Readonly<Record<string, string>> = {
  tag_reel: 'film.tagging',
  tendency_report: 'week.scouting_report',
  teach_install: 'football.install',
  grade_snaps: 'film.grades',
  game_plan: 'football.game_plan',
  board_what_if: 'school.drills',
  board_work: 'school.drills',
  game_management: 'school.drills',
  program_design: 'week.practice',
  evaluate_players: 'team.draft',
};

/** Word for a graded result 0..1 (observed on the day; never a true rating). */
export type GradeWord = 'excellent' | 'good' | 'fair' | 'poor';
export function gradeWord(g: number): GradeWord {
  if (g >= 0.75) return 'excellent';
  if (g >= 0.55) return 'good';
  if (g >= 0.4) return 'fair';
  return 'poor';
}

export interface UiTask {
  readonly id: string;
  readonly text: string;
  readonly tool: string;
  /** Null until done. */
  readonly grade: GradeWord | null;
}

function uiQuestion(q: Question): UiQuestion {
  return { id: q.id, text: q.text, options: q.options.map((o) => ({ key: o.key, text: o.text })) };
}

function tasksOf(group: RoleGroup, grades: Readonly<Record<string, number>> | undefined): UiTask[] {
  return interviews.PRACTICAL_TASKS[group].map((t) => {
    const g = grades?.[t.id];
    return { id: t.id, text: t.text, tool: TASK_TOOL[t.id] ?? 'school.drills', grade: g === undefined ? null : gradeWord(g) };
  });
}

export interface UiOpening {
  readonly title: string;
  readonly team: string;
  readonly date: string;
  readonly group: RoleGroup;
}

// ---------- 1. the user sits an interview (coach.interview) ----------

export type SitStage = 'open' | 'submitted' | 'offered' | 'not_offered';

export interface SitState {
  /** Chosen option per question; null = he declined to answer it. Missing = not answered yet. */
  readonly answers: Readonly<Record<string, string | null>>;
  readonly submitted: boolean;
}
export const NEW_SIT: SitState = { answers: {}, submitted: false };

export interface SitInput {
  readonly opening: UiOpening;
  /** Panel names, lead first (career interviews.panelFor order). */
  readonly panel: readonly string[];
  /** Question ids of the slate (career interviews.slate). */
  readonly slate: readonly string[];
  /** His graded results 0..1 by task id, from the job's own tools. */
  readonly grades: Readonly<Record<string, number>>;
  readonly state: SitState;
  /** Set once the search has run. */
  readonly outcome: 'offered' | 'not_offered' | null;
}

export interface SitView {
  readonly opening: UiOpening;
  readonly panel: readonly { readonly name: string; readonly lead: boolean }[];
  readonly questions: readonly (UiQuestion & { readonly chosen: string | null; readonly declined: boolean })[];
  readonly tasks: readonly UiTask[];
  readonly stage: SitStage;
  /** Answered or declined, out of the slate. */
  readonly done: number;
  readonly canSubmit: boolean;
}

export function buildSitView(x: SitInput): SitView {
  const qs = x.slate.map(interviews.question);
  const questions = qs.map((q) => {
    const has = q.id in x.state.answers;
    const a = x.state.answers[q.id];
    return { ...uiQuestion(q), chosen: has && a !== null ? a ?? null : null, declined: has && a === null };
  });
  const done = qs.filter((q) => q.id in x.state.answers).length;
  const stage: SitStage = x.outcome ?? (x.state.submitted ? 'submitted' : 'open');
  return {
    opening: x.opening,
    panel: x.panel.map((name, i) => ({ name, lead: i === 0 })),
    questions,
    tasks: tasksOf(x.opening.group, x.grades),
    stage,
    done,
    canSubmit: stage === 'open' && done === qs.length,
  };
}

export type SitAction =
  | { readonly kind: 'answer'; readonly questionId: string; readonly option: string }
  | { readonly kind: 'decline'; readonly questionId: string }
  | { readonly kind: 'submit' };

export type ActResult<S> = { readonly ok: true; readonly state: S } | { readonly ok: false; readonly key: string };

export function applySitAction(slate: readonly string[], s: SitState, a: SitAction): ActResult<SitState> {
  if (s.submitted) return { ok: false, key: 'interview.already_submitted' };
  if (a.kind === 'submit') {
    if (!slate.every((id) => id in s.answers)) return { ok: false, key: 'interview.unanswered' };
    return { ok: true, state: { ...s, submitted: true } };
  }
  if (!slate.includes(a.questionId)) return { ok: false, key: 'interview.unknown_question' };
  if (a.kind === 'decline') return { ok: true, state: { ...s, answers: { ...s.answers, [a.questionId]: null } } };
  if (!interviews.question(a.questionId).options.some((o) => o.key === a.option)) return { ok: false, key: 'interview.unknown_option' };
  return { ok: true, state: { ...s, answers: { ...s.answers, [a.questionId]: a.option } } };
}

/**
 * What the user said and did, in the shape career `interviews.Applicant` takes (`answers`, `practical`).
 * Declined questions are left out (the engine skips them). Graded work missing a result scores 0 there.
 */
export function sitApplicant(s: SitState, grades: Readonly<Record<string, number>>): { answers: interviews.Answers; practical: Readonly<Record<string, number>> } {
  const answers: Record<string, string> = {};
  for (const [q, k] of Object.entries(s.answers)) if (k !== null) answers[q] = k;
  return { answers, practical: { ...grades } };
}

// ---------- 2. the user hires for his staff (people.hiring) ----------

export type RefWord = 'strong_backing' | 'speaks_well' | 'lukewarm' | 'warns_against';
export function referralWord(regard: number): RefWord {
  if (regard >= 0.5) return 'strong_backing';
  if (regard >= 0.15) return 'speaks_well';
  if (regard > -0.15) return 'lukewarm';
  return 'warns_against';
}
export type TieWord = 'close' | 'known' | 'stranger';
export function tieWord(tie: number): TieWord {
  if (tie >= 60) return 'close';
  if (tie >= 20) return 'known';
  return 'stranger';
}

export interface CandidateInput {
  readonly personId: number;
  readonly name: string;
  /** Public record line, already worded by the host. */
  readonly record: string;
  readonly referrals: readonly { readonly name: string; readonly regard: number; readonly tieToYou: number }[];
  /** What he said in the room (career Interviewed result notes, or answerAll for an AI candidate). */
  readonly answers: interviews.Answers;
  /** His graded results on the day (career Interviewed.grades). */
  readonly grades: Readonly<Record<string, number>>;
}

export type Mark = 'with' | 'against';

export interface HireState {
  /** His own read of each answer, by person then question. */
  readonly marks: Readonly<Record<number, Readonly<Record<string, Mark>>>>;
  readonly passed: readonly number[];
  readonly offered: number | null;
  readonly delegated: boolean;
}
export const NEW_HIRE: HireState = { marks: {}, passed: [], offered: null, delegated: false };

export interface HireInput {
  readonly opening: UiOpening;
  readonly slate: readonly string[];
  readonly candidates: readonly CandidateInput[];
  readonly state: HireState;
  /** Name of the lead below him who runs it if he delegates; null when he must sit (head coach hiring his coordinators). */
  readonly delegateTo: string | null;
  /** Set once an offer is answered. */
  readonly answer: 'accepted' | 'declined' | null;
}

export interface CandidateView {
  readonly personId: number;
  readonly name: string;
  readonly record: string;
  readonly referrals: readonly { readonly name: string; readonly says: RefWord; readonly toYou: TieWord }[];
  readonly answers: readonly { readonly questionId: string; readonly question: string; readonly said: string | null; readonly mark: Mark | null }[];
  readonly tasks: readonly UiTask[];
  /** His own tally of marks; a count, not a score of ours. */
  readonly withYou: number;
  readonly against: number;
  readonly passed: boolean;
  readonly offered: boolean;
}

export type HireStage = 'reviewing' | 'offer_out' | 'accepted' | 'declined' | 'delegated';

export interface HireView {
  readonly opening: UiOpening;
  readonly candidates: readonly CandidateView[];
  readonly stage: HireStage;
  readonly delegateTo: string | null;
}

export function buildHireView(x: HireInput): HireView {
  const qs = x.slate.map(interviews.question);
  const candidates = x.candidates.map((c): CandidateView => {
    const marks = x.state.marks[c.personId] ?? {};
    const answers = qs.map((q) => {
      const key = c.answers[q.id];
      const said = key === undefined ? null : q.options.find((o) => o.key === key)?.text ?? null;
      return { questionId: q.id, question: q.text, said, mark: marks[q.id] ?? null };
    });
    return {
      personId: c.personId, name: c.name, record: c.record,
      referrals: c.referrals.map((r) => ({ name: r.name, says: referralWord(r.regard), toYou: tieWord(r.tieToYou) })),
      answers,
      tasks: tasksOf(x.opening.group, c.grades),
      withYou: answers.filter((a) => a.mark === 'with').length,
      against: answers.filter((a) => a.mark === 'against').length,
      passed: x.state.passed.includes(c.personId),
      offered: x.state.offered === c.personId,
    };
  });
  const stage: HireStage = x.state.delegated ? 'delegated' : x.answer ?? (x.state.offered !== null ? 'offer_out' : 'reviewing');
  return { opening: x.opening, candidates, stage, delegateTo: x.delegateTo };
}

export type HireAction =
  | { readonly kind: 'mark'; readonly personId: number; readonly questionId: string; readonly mark: Mark | null }
  | { readonly kind: 'pass'; readonly personId: number }
  | { readonly kind: 'offer'; readonly personId: number }
  | { readonly kind: 'delegate' };

export function applyHireAction(x: Pick<HireInput, 'candidates' | 'slate' | 'delegateTo'>, s: HireState, a: HireAction): ActResult<HireState> {
  if (s.delegated || s.offered !== null) return { ok: false, key: 'hiring.closed' };
  if (a.kind === 'delegate') {
    if (x.delegateTo === null) return { ok: false, key: 'hiring.cannot_delegate' };
    return { ok: true, state: { ...s, delegated: true } };
  }
  if (!x.candidates.some((c) => c.personId === a.personId)) return { ok: false, key: 'hiring.unknown_candidate' };
  if (a.kind === 'mark') {
    if (!x.slate.includes(a.questionId)) return { ok: false, key: 'hiring.unknown_question' };
    const own: Record<string, Mark> = { ...(s.marks[a.personId] ?? {}) };
    if (a.mark === null) delete own[a.questionId]; else own[a.questionId] = a.mark;
    return { ok: true, state: { ...s, marks: { ...s.marks, [a.personId]: own } } };
  }
  if (a.kind === 'pass') return { ok: true, state: { ...s, passed: s.passed.includes(a.personId) ? s.passed : [...s.passed, a.personId] } };
  if (s.passed.includes(a.personId)) return { ok: false, key: 'hiring.passed' };
  return { ok: true, state: { ...s, offered: a.personId } };
}

/** Feed the engine's search results (career `interviews.runSearch`) to the hiring screen: what each said and how his work graded. */
export function candidatesFrom(
  out: interviews.SearchOutcome,
  people: (personId: number) => { name: string; record: string; referrals: CandidateInput['referrals'] },
): CandidateInput[] {
  return out.interviewed.map((i) => {
    const p = people(i.personId);
    const answers: Record<string, string> = {};
    for (const n of i.result.notes) if (n.option !== null) answers[n.questionId] = n.option;
    return { personId: i.personId, name: p.name, record: p.record, referrals: p.referrals, answers, grades: i.grades };
  });
}
