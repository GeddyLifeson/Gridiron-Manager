// One interview and one search, the same for every seat and every applicant (Marlon 2026-11-26 14:26
// and 14:27: referrals from old coaches, interviews, offers, for all staff; the head coach need not sit
// in on every one). The process:
//   1. Referrals: coaches who worked with the candidate vouch for him to the people hiring. A word
//      counts by the referee's tie to the hirer (S6.2.1, F-interview-0010).
//   2. Shortlist: referrals, record and ties decide who gets an interview (no interview for everyone).
//   3. Interview: every shortlisted candidate gets the same slate (F-interview-0013). He answers what he
//      believes. Each panel member scores each answer by how close it is to his own view, weighted by
//      how much he cares. These view questions have no right answer. The interview also has graded work
//      with right answers (practical.ts: film, teaching, game plan, board work, game management;
//      Marlon 14:52), as real interviews do.
//   4. Reverse questions: the candidate asks the lead interviewer about the job; how well the answers
//      fit what he believes moves whether he says yes (F-interview-0009).
//   5. Offers go down the ranking until someone accepts.
// The user and an AI candidate who give the same answers and the same graded results, with the same
// record, ties and referrals, get the same score (K7.6.1 rule 4, E2.4.3 acceptance). An AI candidate's
// graded results come from his hidden craft (S6.4.1 "AI use"); the user's from what he does.
import type { RandomStream } from '@gm/schema';
import { STANCES, care, stanceDef, type Beliefs, type StanceId } from './beliefs.ts';
import { clamp, param } from './params.ts';
import { practicalScore } from './practical.ts';
import { QUESTIONS, type Option, type Question, type QuestionSide, type RoleGroup } from './questions.ts';

// ---------- the opening and the panel ----------

export interface Opening {
  readonly seatId: number;
  readonly positionId: string;
  readonly rung: number;
  readonly group: RoleGroup;
  readonly side: QuestionSide;
  readonly level: 'pro' | 'college';
}

/** One person on the hiring side. `wants` is his own beliefs, shifted by the situation (wantsAfterFiring). */
export interface PanelMember {
  readonly personId: number;
  readonly wants: Beliefs;
  /** The lead interviewer: the seat's direct boss, or the appointer for a head coach. */
  readonly lead: boolean;
}

export interface PanelSeat { readonly seatId: number; readonly positionId: string; readonly rung: number | null; readonly reportsToSeatId: number | null; readonly holderPersonId: number | null }

/**
 * Who interviews for a seat. Lead: the first filled seat up the reporting line (a position coach hires
 * his assistant, a coordinator his position coaches, the head coach his coordinators). The head coach
 * sits in from `panel.headSitsInFromRung` up; below that he leaves it to his staff. A head coach seat is
 * interviewed by the appointer (owner, athletic director or president) and the general manager if any.
 * Returns person ids, lead first.
 */
export function panelFor(seats: readonly PanelSeat[], seatId: number, appointerId: number | null): readonly number[] {
  const byId = new Map(seats.map((s) => [s.seatId, s] as const));
  const seat = byId.get(seatId);
  if (!seat) throw new Error(`interviews: unknown seat ${seatId}`);
  if (seat.positionId === 'pos:head_coach') {
    const gm = seats.find((s) => s.positionId.startsWith('pos:general_manager') && s.holderPersonId !== null)?.holderPersonId ?? null;
    return [...new Set([appointerId, gm].filter((x): x is number => x !== null))];
  }
  const head = seats.find((s) => s.positionId === 'pos:head_coach')?.holderPersonId ?? null;
  let lead: number | null = null;
  const seen = new Set<number>();
  for (let up = seat.reportsToSeatId; up !== null && !seen.has(up); up = byId.get(up)?.reportsToSeatId ?? null) {
    seen.add(up);
    const h = byId.get(up)?.holderPersonId ?? null;
    if (h !== null) { lead = h; break; }
  }
  lead ??= head ?? appointerId;
  const out = lead === null ? [] : [lead];
  if (head !== null && head !== lead && (seat.rung ?? 0) >= param('panel.headSitsInFromRung')) out.push(head);
  return out;
}

/**
 * E2.3.2 "the opposite of the coach just fired" (F-interview-0012): the appointer's wants move away from
 * the fired head coach's stances. He then cares more where the result stands far from the middle (care).
 */
export function wantsAfterFiring(own: Beliefs, fired: Beliefs): Beliefs {
  const k = param('opposite.pull');
  return Object.fromEntries(STANCES.map((s) => [s.id, clamp((1 - k) * (own[s.id] ?? 0) - k * (fired[s.id] ?? 0), -1, 1)]));
}

// ---------- the slate ----------

const fitsSide = (q: Question, side: QuestionSide): boolean => q.side === 'any' || side === 'any' || q.side === side;

function slateSize(group: RoleGroup): number {
  if (group === 'head') return param('slate.head');
  if (group === 'coordinator') return param('slate.coordinator');
  if (group === 'entry' || group === 'support') return param('slate.entry');
  return param('slate.assistant');
}

/**
 * The questions for one opening, asked of every candidate (F-interview-0013). The panel asks about what
 * it cares about most: stances ranked by the panel's summed care, one question per stance first, bank
 * order breaking ties, so the slate is the same on every machine.
 */
export function slate(op: Opening, panel: readonly PanelMember[], asker: 'hirer' | 'candidate' = 'hirer'): readonly Question[] {
  const pool = QUESTIONS.filter((q) => q.asker === asker && q.groups.includes(op.group) && fitsSide(q, op.side)
    && (stanceDef(q.stance).level === 'both' || stanceDef(q.stance).level === op.level));
  const weight = (id: StanceId): number => panel.reduce((s, m) => s + care(m.wants, id) * (m.lead ? param('panel.leadWeight') : 1), 0);
  const ranked = [...pool].sort((a, b) => weight(b.stance) - weight(a.stance) || QUESTIONS.indexOf(a) - QUESTIONS.indexOf(b));
  const first: Question[] = []; const rest: Question[] = []; const seen = new Set<string>();
  for (const q of ranked) {
    if (seen.has(q.stance)) rest.push(q); else first.push(q);
    seen.add(q.stance);
  }
  const n = asker === 'candidate' ? Math.min(3, pool.length) : slateSize(op.group);
  return [...first, ...rest].slice(0, n);
}

// ---------- answering ----------

export type Answers = Readonly<Record<string, string>>;

/** What a person with these beliefs says: the option nearest his view (first in the list on a tie). */
export function answerOf(q: Question, b: Beliefs): Option {
  const x = b[q.stance] ?? 0;
  return q.options.reduce((best, o) => (Math.abs(o.at - x) < Math.abs(best.at - x) ? o : best));
}

/** An AI candidate answers every question truthfully from his beliefs. */
export function answerAll(qs: readonly Question[], b: Beliefs): Answers {
  return Object.fromEntries(qs.map((q) => [q.id, answerOf(q, b).key]));
}

function optionOf(q: Question, key: string | undefined): Option | null {
  return key === undefined ? null : q.options.find((o) => o.key === key) ?? null;
}

// ---------- scoring fit ----------

export interface MemberFit { readonly personId: number; readonly fit: number }
export interface InterviewResult {
  /** 0 to 1: how well the answers fit the panel, lead counted double. 0.5 when nothing was answered. */
  readonly fit: number;
  readonly byMember: readonly MemberFit[];
  /** Per question: the option given and each member's read of it (0 to 1). Stored for the screen and the record. */
  readonly notes: readonly { readonly questionId: string; readonly option: string | null; readonly reads: readonly number[] }[];
}

/** One member's read of one answer: 1 when it is his own view, 0 at the far end. */
export const readOf = (at: number, want: number): number => 1 - Math.abs(at - want) / 2;

/**
 * Score answers against a panel. Each member weighs each question by how much he cares about its stance.
 * Unanswered questions are skipped (a candidate may decline one).
 */
export function scoreInterview(qs: readonly Question[], answers: Answers, panel: readonly PanelMember[]): InterviewResult {
  const notes = qs.map((q) => {
    const opt = optionOf(q, answers[q.id]);
    return { questionId: q.id, option: opt?.key ?? null, reads: panel.map((m) => (opt === null ? Number.NaN : readOf(opt.at, m.wants[q.stance] ?? 0))) };
  });
  const byMember = panel.map((m, i) => {
    let w = 0; let s = 0;
    qs.forEach((q, j) => { const r = notes[j]!.reads[i]!; if (Number.isNaN(r)) return; const c = care(m.wants, q.stance); w += c; s += c * r; });
    return { personId: m.personId, fit: w === 0 ? 0.5 : s / w };
  });
  let w = 0; let s = 0;
  panel.forEach((m, i) => { const k = m.lead ? param('panel.leadWeight') : 1; w += k; s += k * byMember[i]!.fit; });
  return { fit: w === 0 ? 0.5 : s / w, byMember, notes: notes.map((n) => ({ ...n, reads: n.reads.map((r) => (Number.isNaN(r) ? 0 : r)) })) };
}

/**
 * Reverse questions (F-interview-0009): the candidate asks the lead interviewer; the lead answers from
 * his own wants; the candidate reads the answers against his beliefs. 0 to 1.
 */
export function candidateRead(op: Opening, panel: readonly PanelMember[], candidate: Beliefs): number {
  const lead = panel.find((m) => m.lead) ?? panel[0];
  if (!lead) return param('accept.fitNeutral');
  const qs = slate(op, panel, 'candidate');
  if (qs.length === 0) return param('accept.fitNeutral');
  let w = 0; let s = 0;
  for (const q of qs) { const c = care(candidate, q.stance); w += c; s += c * readOf(answerOf(q, lead.wants).at, candidate[q.stance] ?? 0); }
  return s / w;
}

/** Acceptance moved by the candidate's read of the job: added to the L4.2.3 accept chance, bounded 0 to 1. */
export function acceptWithFit(baseChance: number, read: number): number {
  return clamp(baseChance + param('accept.fitWeight') * (read - param('accept.fitNeutral')), 0, 1);
}

// ---------- referrals ----------

/** One coach vouching for a candidate. `regard` -1 to 1 is what he says; `tieToHirer` 0 to 100 is why the hirer listens. */
export interface Referral { readonly refereeId: number; readonly regard: number; readonly tieToHirer: number }

/** Strength of a candidate's referrals, 0 to 1 (0.5 with none): the best few, each counted by the hirer's tie to the referee. */
export function referralScore(refs: readonly Referral[]): number {
  if (refs.length === 0) return 0.5;
  const share = param('referral.strangerShare');
  const words = refs.map((r) => clamp(r.regard, -1, 1) * (share + (1 - share) * clamp(r.tieToHirer, 0, 100) / 100))
    .sort((a, b) => Math.abs(b) - Math.abs(a)).slice(0, param('referral.maxReferees'));
  return clamp(0.5 + 0.5 * words.reduce((s, x) => s + x, 0) / words.length, 0, 1);
}

// ---------- the search ----------

export interface Applicant {
  readonly personId: number;
  /** His beliefs. Null for the user's coach: then `answers` must be given (what he said in the room). */
  readonly beliefs: Beliefs | null;
  readonly answers?: Answers;
  /** Public record read 0 to 1 (0.5 with none). */
  readonly record: number;
  /** Tie to the lead interviewer 0 to 100. */
  readonly tie: number;
  readonly referrals: readonly Referral[];
  /** Hidden craft z (AI people, practical.ts drawCraft); null for the user. */
  readonly craft?: number | null;
  /** Graded task results 0..1 by task id (the user's, from the job's own tools). */
  readonly practical?: Readonly<Record<string, number>>;
}

export interface Interviewed {
  readonly personId: number;
  /** The fit questions: views, no right answers. */
  readonly result: InterviewResult;
  /** The graded work (S6.4.1, E2.4.3 segments 4 and 5): 0..1 and per task. */
  readonly practical: number;
  readonly grades: Readonly<Record<string, number>>;
  readonly score: number;
  readonly read: number;
}

export interface SearchOutcome {
  readonly shortlist: readonly number[];
  readonly slate: readonly string[];
  readonly interviewed: readonly Interviewed[];
  readonly offered: readonly number[];
  readonly declined: readonly number[];
  readonly hired: number | null;
}

function shortlistSize(group: RoleGroup): number {
  if (group === 'head') return param('shortlist.head');
  if (group === 'entry' || group === 'support') return param('shortlist.entry');
  return param('shortlist.assistant');
}

/** Pre-interview read: referrals, record and tie. No beliefs are known before the interview. */
export function shortlistScore(a: Applicant): number {
  return param('shortlist.referralWeight') * referralScore(a.referrals) + param('shortlist.recordWeight') * clamp(a.record, 0, 1)
    + param('shortlist.tieWeight') * clamp(a.tie, 0, 100) / 100;
}

/** Who gets interviewed: the best `shortlist.*` by shortlist score, ties by person id. */
export function shortlist(op: Opening, pool: readonly Applicant[]): readonly Applicant[] {
  return [...pool].sort((a, b) => shortlistScore(b) - shortlistScore(a) || a.personId - b.personId).slice(0, shortlistSize(op.group));
}

/** Fit stretched to spread like graded work (params fit.centre, fit.stretch), 0..1. */
export const fitScaled = (fit: number): number => clamp(0.5 + (fit - param('fit.centre')) * param('fit.stretch'), 0, 1);

/** After the interview: graded work and fit lead, then referrals, record and tie, plus a little noise (real searches are noisy). */
export function hireScore(practical: number, fit: number, a: Applicant, stream: RandomStream): number {
  return param('hire.practicalWeight') * clamp(practical, 0, 1) + param('hire.fitWeight') * fitScaled(fit) + param('hire.referralWeight') * referralScore(a.referrals) + param('hire.recordWeight') * clamp(a.record, 0, 1)
    + param('hire.tieWeight') * clamp(a.tie, 0, 100) / 100 + param('hire.noiseSd') * stream.normal();
}

export interface SearchInput {
  readonly opening: Opening;
  readonly panel: readonly PanelMember[];
  readonly pool: readonly Applicant[];
  /** Offer to one candidate; `read` is his read of the job (candidateRead). Returns whether he accepts. */
  readonly offer: (personId: number, read: number) => boolean;
  readonly stream: RandomStream;
}

/**
 * Run one search end to end. Interviews in shortlist order, noise drawn in that order, so a seed replays
 * exactly. An applicant with null beliefs and no answers (the user who did not sit the interview) is
 * scored on nothing and placed by referral, record and tie only.
 */
export function runSearch(input: SearchInput): SearchOutcome {
  const sl = shortlist(input.opening, input.pool);
  const qs = slate(input.opening, input.panel);
  const interviewed: Interviewed[] = sl.map((a) => {
    const answers = a.answers ?? (a.beliefs === null ? {} : answerAll(qs, a.beliefs));
    const result = scoreInterview(qs, answers, input.panel);
    const read = a.beliefs === null ? param('accept.fitNeutral') : candidateRead(input.opening, input.panel, a.beliefs);
    const work = practicalScore(input.opening.group, a.practical, a.craft ?? null, input.stream);
    return { personId: a.personId, result, practical: work.score, grades: work.grades, read, score: hireScore(work.score, result.fit, a, input.stream) };
  });
  const ranked = [...interviewed].sort((a, b) => b.score - a.score || a.personId - b.personId);
  const offered: number[] = []; const declined: number[] = [];
  for (const c of ranked) {
    offered.push(c.personId);
    if (input.offer(c.personId, c.read)) return { shortlist: sl.map((a) => a.personId), slate: qs.map((q) => q.id), interviewed, offered, declined, hired: c.personId };
    declined.push(c.personId);
  }
  return { shortlist: sl.map((a) => a.personId), slate: qs.map((q) => q.id), interviewed, offered, declined, hired: null };
}

