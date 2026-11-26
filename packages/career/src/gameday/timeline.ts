// I1.1.1 the pregame clock and task list. One state object, advanced by pure functions. Time is minutes before
// kickoff (T minus), counting down. Completing a task spends its cost from the attention budget and moves the
// clock by the same minutes; "advance to next deadline" jumps. At each deadline an open task is done by the
// assigned assistant (delegated) or, with nobody assigned, by its default (missed and logged). A locking task
// cannot change after its deadline. Rule 4-2-1 (field presence) and Rule 18-1-4 (captain change after the
// report) are events here; the toss arrangement itself is toss.ts.
import TASKS from './pregame-tasks.json' with { type: 'json' };
import { gp } from './params.ts';
import type { GameDayRules } from './rules.ts';

export type TaskId =
  | 'conditions' | 'workouts' | 'inactives' | 'emergency_qb' | 'radio' | 'captains' | 'depth_card' | 'kicking_lines'
  | 'opponent_watch' | 'decision_book' | 'instructions' | 'crew_alert' | 'challenge_designee' | 'sheet_edits' | 'talk' | 'toss';

export type TaskState = 'open' | 'done' | 'delegated' | 'missed' | 'hidden';
type Switch = 'emergencyQb' | 'radioDesignation' | 'challengeDesignee';

interface TaskRow {
  readonly id: TaskId;
  readonly opens: string;
  readonly deadline: string;
  readonly cost: string;
  readonly locks: boolean;
  readonly leaf: string;
  readonly default: string;
  readonly perPlayer?: boolean;
  readonly needs?: Switch;
}

const ROWS = (TASKS as unknown as { tasks: TaskRow[] }).tasks;

export interface TaskDef {
  readonly id: TaskId;
  readonly opensAt: number;
  readonly deadline: number;
  readonly costMin: number;
  readonly locks: boolean;
  readonly leaf: string;
  readonly defaultAction: string;
  readonly perPlayer: boolean;
}

export interface TaskStatus {
  readonly state: TaskState;
  /** 'user', a staff id, or 'boss' for a task the user's rung does not own (S4). */
  readonly owner: string;
  readonly locked: boolean;
}

export type TimelineEvent =
  | { readonly t: number; readonly kind: 'done'; readonly task: TaskId; readonly by: string; readonly costMin: number }
  | { readonly t: number; readonly kind: 'delegated'; readonly task: TaskId; readonly by: string }
  | { readonly t: number; readonly kind: 'missed'; readonly task: TaskId; readonly defaultAction: string }
  | { readonly t: number; readonly kind: 'locked'; readonly task: TaskId }
  | { readonly t: number; readonly kind: 'delay'; readonly minutes: number }
  | { readonly t: number; readonly kind: 'late_to_field'; readonly team: 'own' | 'opponent'; readonly penaltyYd: number }
  | { readonly t: number; readonly kind: 'captain_change'; readonly note: string };

export interface PregameState {
  /** Minutes before kickoff now. */
  readonly now: number;
  /** Attention budget left (I1.1.1: 100 of the 180, a tuning knob). */
  readonly budgetLeft: number;
  /** Minutes kickoff has moved by delays; reported to J12 so the weather clock agrees (acceptance 3). */
  readonly kickoffDelayMin: number;
  readonly defs: Readonly<Record<string, TaskDef>>;
  readonly tasks: Readonly<Record<string, TaskStatus>>;
  /** Teams held off the field by a delay event (Rule 4-2-1). */
  readonly heldOffField: readonly ('own' | 'opponent')[];
  /** Teams that lost the toss option for both halves and overtime (Rule 4-2-1). */
  readonly tossOptionLost: readonly ('own' | 'opponent')[];
  /** Rule 4-2-1 values from the rule set (0 when the level has no such rule). */
  readonly fieldPresenceMin: number;
  readonly lateFieldPenaltyYd: number;
  readonly log: readonly TimelineEvent[];
}

export interface PregameSetup {
  readonly rules: GameDayRules;
  /** Whether a quarterback can be named the emergency quarterback (three on the 53, I1.2.3). */
  readonly emergencyQbPossible: boolean;
  /** Staff id assigned to each task (K6); missing means nobody is assigned. */
  readonly assigned?: Partial<Record<TaskId, string>>;
  /** Tasks the user owns at his rung (I1.1.1 "By level and rung"); missing means every task (head coach). */
  readonly ownTasks?: readonly TaskId[];
}

export type Refusal = { readonly ok: false; readonly reason: 'unknown_task' | 'not_owner' | 'not_open_yet' | 'locked' | 'past_deadline' | 'no_budget' | 'already_done' };
export type Result<T> = { readonly ok: true; readonly state: T } | Refusal;

function resolveMark(mark: string, rules: GameDayRules): number {
  if (mark === 'window') return gp('pregame.windowMin');
  if (mark === 'kickoff') return 0;
  if (mark === 'report') return rules.reportDeadlineMin ?? 0;
  if (mark === 'toss') return rules.tossMinutesBefore;
  return gp(mark);
}

function switchOn(s: Switch | undefined, setup: PregameSetup): boolean {
  if (s === undefined) return true;
  if (s === 'emergencyQb') return setup.rules.emergencyQbActiveQbs > 0 && setup.emergencyQbPossible;
  if (s === 'radioDesignation') return setup.rules.radioAllowed && setup.rules.radioDesignatedDefense > 0;
  return setup.rules.challengeDesigneeAllowed;
}

/** The task list for this game: rows whose rule switch is on, with marks resolved to minutes. */
export function taskDefs(setup: PregameSetup): Record<string, TaskDef> {
  const out: Record<string, TaskDef> = {};
  for (const r of ROWS) {
    if (!switchOn(r.needs, setup)) continue;
    out[r.id] = {
      id: r.id, opensAt: resolveMark(r.opens, setup.rules), deadline: resolveMark(r.deadline, setup.rules),
      costMin: gp(r.cost), locks: r.locks, leaf: r.leaf, defaultAction: r.default, perPlayer: r.perPlayer === true,
    };
  }
  return out;
}

export function startPregame(setup: PregameSetup): PregameState {
  const defs = taskDefs(setup);
  const tasks: Record<string, TaskStatus> = {};
  for (const d of Object.values(defs)) {
    const mine = setup.ownTasks === undefined || setup.ownTasks.includes(d.id);
    tasks[d.id] = { state: mine ? 'open' : 'hidden', owner: mine ? setup.assigned?.[d.id] ?? 'user' : 'boss', locked: false };
  }
  return {
    now: gp('pregame.windowMin'), budgetLeft: gp('pregame.attentionBudgetMin'), kickoffDelayMin: 0, defs, tasks,
    heldOffField: [], tossOptionLost: [], fieldPresenceMin: setup.rules.fieldPresenceMin, lateFieldPenaltyYd: setup.rules.lateFieldPenaltyYd, log: [],
  };
}

/** Whether a task can still be acted on now (open, not locked, inside its window). */
export function canAct(s: PregameState, id: TaskId): Refusal | { ok: true } {
  const d = s.defs[id], st = s.tasks[id];
  if (!d || !st) return { ok: false, reason: 'unknown_task' };
  if (st.state === 'hidden') return { ok: false, reason: 'not_owner' };
  if (st.locked) return { ok: false, reason: 'locked' };
  if (s.now > d.opensAt) return { ok: false, reason: 'not_open_yet' };
  if (s.now < d.deadline) return { ok: false, reason: 'past_deadline' };
  return { ok: true };
}

/**
 * The user does a task himself. `costMin` overrides the row cost (for example 10 to build the inactive list by
 * hand instead of 2 to review the staff's). A per-player task (workouts) may be done more than once.
 */
export function doTask(s: PregameState, id: TaskId, costMin?: number): Result<PregameState> {
  const ok = canAct(s, id);
  if (!ok.ok) return ok;
  const d = s.defs[id]!, st = s.tasks[id]!;
  if (st.state === 'done' && !d.perPlayer && !d.locks) return { ok: false, reason: 'already_done' };
  const cost = costMin ?? d.costMin;
  if (cost > s.budgetLeft) return { ok: false, reason: 'no_budget' };
  if (s.now - cost < d.deadline) return { ok: false, reason: 'past_deadline' };
  const done: PregameState = {
    ...s,
    budgetLeft: s.budgetLeft - cost,
    tasks: { ...s.tasks, [id]: { ...st, state: 'done', owner: 'user' } },
    log: [...s.log, { t: s.now - cost, kind: 'done', task: id, by: 'user', costMin: cost }],
  };
  return { ok: true, state: advanceTo(done, s.now - cost) };
}

/** Hand a task to an assistant before its deadline (K6). */
export function delegate(s: PregameState, id: TaskId, staffId: string): Result<PregameState> {
  const ok = canAct(s, id);
  if (!ok.ok) return ok;
  return { ok: true, state: { ...s, tasks: { ...s.tasks, [id]: { ...s.tasks[id]!, owner: staffId } } } };
}

/** The next deadline strictly after now (a smaller T minus), or 0 for kickoff. */
export function nextDeadline(s: PregameState): number {
  let best = 0;
  for (const d of Object.values(s.defs)) if (d.deadline < s.now && d.deadline > best) best = d.deadline;
  return best;
}

/**
 * Move the clock to `t` (minutes before kickoff, not after kickoff). Every deadline passed fires in order:
 * open tasks fall to their assistant or default, locking tasks lock, and at the field-presence mark a team held
 * off the field loses its toss option (Rule 4-2-1).
 */
export function advanceTo(s: PregameState, t: number): PregameState {
  const { fieldPresenceMin, lateFieldPenaltyYd } = s;
  const target = t < 0 ? 0 : t;
  if (target > s.now) return s;
  const due = Object.values(s.defs).filter((d) => d.deadline >= target && d.deadline <= s.now)
    .sort((a, b) => b.deadline - a.deadline || a.id.localeCompare(b.id));
  const tasks = { ...s.tasks };
  const log = [...s.log];
  for (const d of due) {
    const st = tasks[d.id]!;
    if (st.locked) continue;
    let next: TaskStatus = st;
    if (st.state === 'open') {
      if (st.owner !== 'user') { next = { ...st, state: 'delegated' }; log.push({ t: d.deadline, kind: 'delegated', task: d.id, by: st.owner }); }
      else { next = { ...st, state: 'missed' }; log.push({ t: d.deadline, kind: 'missed', task: d.id, defaultAction: d.defaultAction }); }
    }
    if (d.locks) { next = { ...next, locked: true }; log.push({ t: d.deadline, kind: 'locked', task: d.id }); }
    tasks[d.id] = next;
  }
  let lost = s.tossOptionLost;
  if (fieldPresenceMin > 0 && s.now > fieldPresenceMin && target <= fieldPresenceMin) {
    for (const team of s.heldOffField) {
      if (!lost.includes(team)) {
        lost = [...lost, team];
        log.push({ t: fieldPresenceMin, kind: 'late_to_field', team, penaltyYd: lateFieldPenaltyYd });
      }
    }
  }
  return { ...s, now: target, tasks, log, tossOptionLost: lost };
}

/** Jump to the next deadline (I1.1.1 "advance to next deadline"). */
export function advanceToNextDeadline(s: PregameState): PregameState {
  const marks = [nextDeadline(s)];
  if (s.fieldPresenceMin > 0 && s.fieldPresenceMin < s.now) marks.push(s.fieldPresenceMin);
  return advanceTo(s, Math.max(...marks));
}

/** Run the clock to kickoff: every remaining task falls to staff or default (acceptance 2). */
export function runToKickoff(s: PregameState): PregameState {
  return advanceTo(s, 0);
}

/**
 * A weather delay moves kickoff later (I1.1.1 edge case). Locked items stay locked; open items get the extra
 * time because the clock (minutes before kickoff) moves back by the delay.
 */
export function delayKickoff(s: PregameState, minutes: number): PregameState {
  return { ...s, now: s.now + minutes, kickoffDelayMin: s.kickoffDelayMin + minutes, log: [...s.log, { t: s.now, kind: 'delay', minutes }] };
}

/** A delay event keeps a team off the field (the only way an AI team misses Rule 4-2-1, acceptance 4). */
export function holdOffField(s: PregameState, team: 'own' | 'opponent'): PregameState {
  return s.heldOffField.includes(team) ? s : { ...s, heldOffField: [...s.heldOffField, team] };
}

/** After the report deadline a captain change is an event through the referee (Rule 18-1-4), never blocked. */
export function changeCaptainsAfterLock(s: PregameState, note: string): PregameState {
  return { ...s, log: [...s.log, { t: s.now, kind: 'captain_change', note }] };
}

/** The weather clock time for J12: minutes from the pregame screen opening, delays included. */
export function weatherClockMin(s: PregameState): number {
  return gp('pregame.windowMin') - s.now + s.kickoffDelayMin;
}
