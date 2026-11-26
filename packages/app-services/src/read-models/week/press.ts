// Press conference (O4.5.2 media screen; H7.2.1 the press conference; H7.2.2 hot topics). The questions
// come from the front-office generator, which gives every question a reporter could realistically ask a
// chance of being asked (Marlon 2026-11-26), one at a time so each answer shapes the next (follow-ups,
// gotchas). Answers are stances, never scripts, and show no numbers (H7.2.1). A stance from the H7.2.1
// table writes one Statement and its signed events through the week module's `answer`; sizes stay with
// the receiving categories. Reporter goodwill, edge and tone weights never reach the view.
import { calendar, week as wk } from '@gm/league';
import { press } from '@gm/front-office';
import type { RandomStream } from '@gm/schema';
import { weekParam } from './params.ts';
import type { PressAnsweredView, PressChoiceView, PressSessionRow, PressView } from './types.ts';

type RuleLookup = calendar.RuleLookup;

/** How each choice reads to the room (front-office AnswerKind): it decides follow-ups. */
const ANSWER_KIND: Readonly<Record<string, press.AnswerKind>> = {
  take_blame: 'direct', blame_player: 'direct', blame_unit_or_staff: 'direct', protect_player: 'evasive',
  bland: 'evasive', honest_plan_detail: 'direct', shot_at_opponent: 'combative', shot_at_front_office: 'combative',
  decline: 'decline', refer_to_report: 'evasive', honest_outlook: 'direct', criticise_officials: 'combative',
  answer_straight: 'direct', name_recruit: 'direct',
};

const STANCE_IDS: ReadonlySet<string> = new Set(wk.STANCE_ROWS.map((r) => r.id));

const FAULT = new Set(['result_overall', 'specific_play', 'decision_call', 'unit_performance', 'penalties', 'play_calling_role']);
const PLAYER = new Set(['player_performance', 'qb_performance', 'qb_change', 'depth_chart', 'discipline_conduct', 'off_field_player']);
const OPPONENT = new Set(['opponent_team', 'opponent_player', 'opponent_coach', 'rivalry_history']);
const PLAN = new Set(['game_plan', 'scheme_philosophy', 'practice_prep', 'analytics_stats']);
const FRONT = new Set(['job_security', 'contract', 'trade', 'roster_move', 'staff', 'draft_free_agency', 'coach_career_self', 'transfer_nil']);
const INJURY = new Set(['injury_status', 'player_safety_health']);

/**
 * The three or four answers offered for a question (H7.2.1), by its kind. Mental health is never an
 * offered answer (H7.2.3). A college question about recruiting offers naming the recruit, marked as a
 * violation when the association bans it (H7.4.1 rule 4).
 */
export function choicesFor(code: string, hasPerson: boolean, rules: RuleLookup, w: wk.Week): PressChoiceView[] {
  const c = (id: string, violation = false): PressChoiceView => ({ id, violation });
  if (INJURY.has(code)) return wk.injuryAnswers(rules).map((id) => c(id));
  if (FAULT.has(code)) return [c('take_blame'), c('blame_unit_or_staff'), ...(hasPerson ? [c('blame_player')] : []), c('bland')];
  if (PLAYER.has(code)) return [c('protect_player'), ...(hasPerson && code !== 'off_field_player' ? [c('blame_player')] : []), c('bland'), c('decline')];
  if (OPPONENT.has(code)) return [c('answer_straight'), c('shot_at_opponent'), c('bland')];
  if (PLAN.has(code)) return [c('honest_plan_detail'), c('bland'), c('decline')];
  if (FRONT.has(code)) return [c('bland'), c('take_blame'), c('shot_at_front_office'), c('decline')];
  if (code === 'officiating_rules') return [c('bland'), c('criticise_officials'), c('decline')];
  if (code === 'recruiting') {
    const r = wk.recruitComment(rules, w);
    return [c('bland'), c('name_recruit', r.violation), c('decline')];
  }
  return [c('answer_straight'), c('bland'), c('decline')];
}

/** A press session in progress: the generator state plus what the coach has said. */
export interface PressConference {
  readonly blockId: string;
  readonly state: press.SessionState;
  readonly current: press.PressQuestion | null;
  readonly answers: readonly { readonly n: number; readonly choice: string; readonly timedOut: boolean }[];
  readonly statements: readonly wk.Statement[];
  readonly events: readonly wk.WeekEvent[];
  /** Violation requests raised by an answer (college recruit comment). */
  readonly violations: readonly wk.ViolationRequest[];
}

/** Week media session to generator session kind (H7.1.1, H7.1.2, H7.3, H7.4.1). */
export function sessionKindFor(session: string | undefined): press.SessionKind {
  switch (session) {
    case 'post_game': return 'postgame';
    case 'day_after': return 'day_after';
    case 'weekly_conference': return 'weekly';
    case 'coordinator': return 'coordinator';
    case 'coach_show': return 'coach_show';
    case 'conference_call': return 'opponent_call';
    default: return 'midweek';
  }
}

export function startPress(blockId: string, session: press.PressSession, rng: RandomStream): PressConference {
  const first = press.ask(press.startSession(session), rng, null);
  return { blockId, state: first.state, current: first.question, answers: [], statements: [], events: [], violations: [] };
}

/**
 * Give an answer to the question in the room, then hear the next one. `timedOut` marks an answer the clock
 * gave (the bland default, O4.5.2 time limit).
 */
export function answerPress(pc: PressConference, choice: string, rng: RandomStream, at: calendar.Instant, rules: RuleLookup, w: wk.Week, timedOut = false): PressConference {
  const q = pc.current;
  if (!q) return pc;
  const offered = choicesFor(q.code, q.personId !== null, rules, w);
  if (!offered.some((c) => c.id === choice)) throw new Error(`choice ${choice} is not offered for this question`);
  const statements = [...pc.statements];
  const events = [...pc.events];
  const violations = [...pc.violations];
  if (STANCE_IDS.has(choice)) {
    const r = wk.answer(q.topicId, choice, at);
    statements.push(r.statement);
    events.push(...r.events);
  } else if (choice === 'criticise_officials') {
    events.push(...wk.criticiseOfficials(false));
  } else if (choice === 'name_recruit') {
    const r = wk.recruitComment(rules, w);
    if (r.request) violations.push(r.request);
  }
  const next = press.ask(pc.state, rng, ANSWER_KIND[choice] ?? 'direct');
  return {
    blockId: pc.blockId, state: next.state, current: next.question,
    answers: [...pc.answers, { n: q.n, choice, timedOut }], statements, events, violations,
  };
}

/** The one-click session default: answer everything blandly (H7.2.1 "standard coach-speak"). */
export function blandAll(pc: PressConference, rng: RandomStream, at: calendar.Instant, rules: RuleLookup, w: wk.Week): PressConference {
  let cur = pc;
  while (cur.current) {
    const offered = choicesFor(cur.current.code, cur.current.personId !== null, rules, w);
    const pick = offered.some((c) => c.id === 'bland') ? 'bland' : offered.some((c) => c.id === 'refer_to_report') ? 'refer_to_report' : 'decline';
    cur = answerPress(cur, pick, rng, at, rules, w);
  }
  return cur;
}

/** Order in which an answer makes the headline: the most pointed thing said leads (H7.2.1 digest). */
const HEADLINE_ORDER = [
  'shot_at_front_office', 'criticise_officials', 'shot_at_opponent', 'blame_player', 'name_recruit', 'blame_unit_or_staff',
  'take_blame', 'honest_plan_detail', 'protect_player', 'honest_outlook', 'answer_straight', 'decline', 'refer_to_report', 'bland',
];

function headline(pc: PressConference): { choice: string; topicId: string } | null {
  if (pc.answers.length === 0) return null;
  const byN = new Map(pc.state.asked.map((q) => [q.n, q]));
  let best: { choice: string; topicId: string; rank: number } | null = null;
  for (const a of pc.answers) {
    const rank = HEADLINE_ORDER.indexOf(a.choice);
    const q = byN.get(a.n);
    if (!q) continue;
    if (!best || rank < best.rank) best = { choice: a.choice, topicId: q.topicId, rank };
  }
  return best ? { choice: best.choice, topicId: best.topicId } : null;
}

/** This week's head-coach media sessions with times (O4.5.2, H7.1.1). */
export function weekSessions(w: wk.Week): PressSessionRow[] {
  const done = new Set(w.completed);
  return wk.allBlocks(w).filter((b) => b.type === 'media' && b.attendees.includes('head_coach')).map((b) => ({
    blockId: b.id, session: b.session ?? 'mid_week', date: calendar.iso(b.start.day), start: calendar.formatTime(b.start.minute),
    minutes: b.minutes, done: done.has(b.id),
  }));
}

export function buildPressView(w: wk.Week, pc: PressConference | null, rules: RuleLookup): PressView {
  const sessions = weekSessions(w);
  if (!pc) return { sessions, live: null };
  const s = pc.state.session;
  const byN = new Map(pc.state.asked.map((q) => [q.n, q]));
  const outlet = (reporterId: number): string => s.reporters.find((r) => r.id === reporterId)?.outlet ?? 'unknown';
  const history: PressAnsweredView[] = pc.answers.map((a) => {
    const q = byN.get(a.n)!;
    return { n: a.n, text: q.text, outlet: outlet(q.reporterId), choice: a.choice, timedOut: a.timedOut };
  });
  const q = pc.current;
  return {
    sessions,
    live: {
      kind: s.kind, speaker: s.speaker, asked: pc.state.asked.length, target: pc.state.target,
      current: q ? { n: q.n, text: q.text, outlet: outlet(q.reporterId), followUp: q.followUpOf !== null } : null,
      choices: q ? choicesFor(q.code, q.personId !== null, rules, w) : [],
      timeLimitSeconds: weekParam('press.answer_seconds'),
      history, done: q === null,
      headline: q === null ? headline(pc) : null,
    },
  };
}
