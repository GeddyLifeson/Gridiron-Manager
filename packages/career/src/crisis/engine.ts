// L9.1.1 the crisis engine: one object for every crisis, triggers with causes, the guard on every
// subject, merging, the pacing queue, stages on clocks, and closing into the record (L9.3.2).
//
// State is a plain object the caller owns (saved by the world); the functions update it in place and
// return the orders and events the owning systems apply. Every draw comes from a keyed stream, so the
// same world seed and the same inputs give the same crises (J13).
import type { WorldDate, WorldTier } from '@gm/schema';
import { compliance } from '@gm/league';
import { crisisType, type CrisisCatalogue, type CrisisType } from './catalogue.ts';
import { guardCheck, type Denial, type GuardPerson } from './guard.ts';
import { CRISIS_EVENT, draft, openedType, stageType, type EventDraft, type EventSink, type StreamFor } from './events.ts';
import type { Order } from './orders.ts';
import { param } from './params.ts';

/** A proposed crisis, from an owning system's event (breakpoint, injury, streak, case) or an outside draw. */
export interface Trigger {
  readonly typeId: string;
  readonly teamId: number;
  readonly subjectIds: readonly number[];
  /** Ids of history events that already exist and caused it. Empty only for the two outside classes. */
  readonly causeEventIds: readonly number[];
  readonly date: WorldDate;
  readonly severity?: number;
}

export interface CrisisLogEntry {
  readonly date: WorldDate;
  readonly kind: 'opened' | 'stage' | 'act' | 'merged' | 'closed' | 'outcome';
  readonly detail: string;
  readonly eventId: number | null;
}

export interface Crisis {
  readonly id: number;
  typeId: string;
  readonly teamId: number;
  subjectIds: number[];
  causeEventIds: number[];
  severity: number;
  stageIndex: number;
  stageId: string;
  stageEnds: WorldDate | null;
  knownTo: string[];
  public: boolean;
  readonly opened: WorldDate;
  closed: WorldDate | null;
  /** Audiences the coach told himself before the stage reached them (L9.3.1 timing). */
  told: string[];
  /** Statements the truth record contradicts; written as "lied to and found out" when the truth is known. */
  lies: { readonly audience: string; readonly actId: string }[];
  actIds: string[];
  upstairsToldAtOnce: boolean;
  log: CrisisLogEntry[];
  /** The trigger that opened it, kept so the close can ask whether the cause still holds (L9.3.2). */
  readonly trigger: Trigger;
}

export interface QueuedTrigger {
  readonly seq: number;
  trigger: Trigger;
  severity: number;
  readonly queuedOn: WorldDate;
}

/** L9.3.2 history entry: what happened, what he did, what followed. No grade. */
export interface CrisisHistoryEntry {
  readonly crisisId: number;
  readonly typeId: string;
  readonly teamId: number;
  readonly subjectIds: readonly number[];
  readonly opened: WorldDate;
  readonly closed: WorldDate;
  readonly timeline: readonly CrisisLogEntry[];
  readonly acts: readonly string[];
  readonly causeUnresolved: boolean;
  /** Later linked events (a transfer, a grievance result, a leaked account), appended by `linkOutcome`. */
  readonly linkedOutcomes: number[];
}

export interface Rejection {
  readonly trigger: Trigger;
  readonly reason: 'unknown_type' | 'level' | 'no_cause' | 'missing_cause' | 'guard' | 'no_subject';
  readonly denials?: readonly Denial[];
}

export interface CrisisState {
  open: Crisis[];
  queue: QueuedTrigger[];
  closed: Crisis[];
  history: CrisisHistoryEntry[];
  /** L9.1.2 denial log, kept for tests and the import tool's report. */
  denials: Denial[];
  rejections: Rejection[];
  nextId: number;
  nextSeq: number;
}

export function emptyCrisisState(): CrisisState {
  return { open: [], queue: [], closed: [], history: [], denials: [], rejections: [], nextId: 1, nextSeq: 1 };
}

export interface CrisisContext {
  readonly catalogue: CrisisCatalogue;
  /** The rule-set tag of a team's competition, compared with `CrisisType.levels` as data (P1.1.2). */
  levelOf(teamId: number): string;
  person(id: number): GuardPerson | null;
  /** The history log holds this event id (L9.1.1 "a cause_event that already exists in state"). */
  eventExists(eventId: number): boolean;
  /** Does the trigger's cause still hold (queue expiry, L9.1.1; re-arming, L9.3.2). */
  causeHolds(t: Trigger): boolean;
  /** L2.5.2 room_lost. */
  roomLost(teamId: number): boolean;
  /** The head coach (or the user in his seat), who answers for the crisis. */
  coachOf(teamId: number): number | null;
  readonly stream: StreamFor;
  readonly sink: EventSink;
  readonly tier: WorldTier;
  readonly source: 'sim' | 'history_run' | 'user';
}

export interface StepResult {
  readonly orders: Order[];
  readonly opened: number[];
  readonly closedIds: number[];
}

/**
 * Types that queue ahead of every other (L9.5.1 acceptance: a boss-fired event always opens this
 * crisis for a lower-rung user). Still paced: it opens on the first week with room, so the L9.1.1 open
 * limit holds too (both acceptance lines are kept; see README).
 */
export const PRIORITY_TYPES: readonly string[] = ['boss_fired'];

const DAYS_PER_WEEK = (): number => compliance.daysBetween({ seasonYear: 0, dayIndex: 0 }, compliance.addWeeks({ seasonYear: 0, dayIndex: 0 }, 1));
const sameWeek = (a: WorldDate, b: WorldDate): boolean => Math.abs(compliance.daysBetween(a, b)) < DAYS_PER_WEEK();
const onOrAfter = (a: WorldDate, b: WorldDate): boolean => compliance.dayNumber(a) >= compliance.dayNumber(b);

function meta(ctx: CrisisContext, teamId: number, date: WorldDate) {
  return { date, competitionId: null, teamId, tier: ctx.tier, source: ctx.source } as const;
}

function guardTrigger(t: CrisisType, trig: Trigger, ctx: CrisisContext): Rejection | null {
  const people: { person: GuardPerson; role: 'subject' }[] = [];
  for (const id of trig.subjectIds) {
    const p = ctx.person(id);
    if (!p) return { trigger: trig, reason: 'no_subject' };
    people.push({ person: p, role: 'subject' });
  }
  const g = guardCheck(t.id, t.guard, people, { requiresFamily: t.subjects.requiresFamilyObject });
  if (!g.ok) return { trigger: trig, reason: 'guard', denials: g.denials };
  // Football rows that still demand adults (holdout, boss fired) refuse minors without logging a guard denial.
  if (t.subjects.adultOnly && people.some((x) => x.person.minor)) return { trigger: trig, reason: 'no_subject' };
  return null;
}

/** Validate one trigger: type, level, cause (L9.1.1), guard (L9.1.2). Null means it may queue. */
export function triggerProblem(trig: Trigger, ctx: CrisisContext): Rejection | null {
  const t = ctx.catalogue.crises.find((c) => c.id === trig.typeId);
  if (!t) return { trigger: trig, reason: 'unknown_type' };
  if (!t.levels.includes(ctx.levelOf(trig.teamId))) return { trigger: trig, reason: 'level' };
  if (!t.outsideClass) {
    if (trig.causeEventIds.length === 0) return { trigger: trig, reason: 'no_cause' };
    if (trig.causeEventIds.some((id) => !ctx.eventExists(id))) return { trigger: trig, reason: 'missing_cause' };
  }
  return guardTrigger(t, trig, ctx);
}

function drawSeverity(t: CrisisType, trig: Trigger, seq: number, ctx: CrisisContext): number {
  const { min, max } = t.severity.range;
  if (trig.severity !== undefined) return Math.max(min, Math.min(max, trig.severity));
  return ctx.stream(['crisis', 'severity', trig.teamId, seq]).int(min, max);
}

const shares = (a: readonly number[], b: readonly number[]): boolean => a.some((x) => b.includes(x));
const union = (a: readonly number[], b: readonly number[]): number[] => [...a, ...b.filter((x) => !a.includes(x))];

/** Would the merged subject list still pass the guard under the kept type. */
function mergeAllowed(typeId: string, subjects: readonly number[], ctx: CrisisContext): boolean {
  const t = crisisType(ctx.catalogue, typeId);
  return guardTrigger(t, { typeId, teamId: 0, subjectIds: subjects, causeEventIds: [], date: { seasonYear: 0, dayIndex: 0 } }, ctx) === null;
}

/**
 * Hand triggers to the engine. Rejected triggers go to `rejections` (and guard denials to `denials`).
 * Two triggers about the same person in one week merge into one crisis (L9.1.1 edge case): into a
 * queued entry of that week, or into a crisis that opened that week.
 */
export function proposeTriggers(state: CrisisState, triggers: readonly Trigger[], ctx: CrisisContext): void {
  for (const trig of triggers) {
    const bad = triggerProblem(trig, ctx);
    if (bad) {
      state.rejections.push(bad);
      if (bad.denials) state.denials.push(...bad.denials);
      continue;
    }
    const openSame = state.open.find((c) => c.teamId === trig.teamId && sameWeek(c.opened, trig.date) && shares(c.subjectIds, trig.subjectIds));
    if (openSame && mergeAllowed(openSame.typeId, union(openSame.subjectIds, trig.subjectIds), ctx)) {
      openSame.subjectIds = union(openSame.subjectIds, trig.subjectIds);
      openSame.causeEventIds = union(openSame.causeEventIds, trig.causeEventIds);
      openSame.log.push({ date: trig.date, kind: 'merged', detail: trig.typeId, eventId: null });
      continue;
    }
    const seq = state.nextSeq++;
    const t = crisisType(ctx.catalogue, trig.typeId);
    const severity = drawSeverity(t, trig, seq, ctx);
    const queuedSame = state.queue.find((q) => q.trigger.teamId === trig.teamId && sameWeek(q.queuedOn, trig.date) && shares(q.trigger.subjectIds, trig.subjectIds));
    if (queuedSame) {
      const keep = severity > queuedSame.severity ? trig.typeId : queuedSame.trigger.typeId;
      const subjects = union(queuedSame.trigger.subjectIds, trig.subjectIds);
      if (mergeAllowed(keep, subjects, ctx)) {
        queuedSame.trigger = { ...queuedSame.trigger, typeId: keep, subjectIds: subjects, causeEventIds: union(queuedSame.trigger.causeEventIds, trig.causeEventIds) };
        queuedSame.severity = Math.max(severity, queuedSame.severity);
        continue;
      }
    }
    state.queue.push({ seq, trigger: trig, severity, queuedOn: trig.date });
  }
}

function witnessesOf(c: Crisis): EventDraft['witnesses'] {
  return c.public ? { kind: 'public' } : { kind: 'team', teamId: c.teamId };
}

function subjectsOf(c: Crisis): EventDraft['subjects'] {
  return c.subjectIds.map((id) => ({ kind: 'person' as const, id }));
}

const AUDIENCE_OF_ROLE: Readonly<Record<string, string>> = { team: 'team', owner_or_ad: 'upstairs', public: 'public' };

/** Enter a stage: who knows widens, the clock is drawn, and audiences who learn it elsewhere remember that. */
function enterStage(state: CrisisState, c: Crisis, index: number, date: WorldDate, ctx: CrisisContext, orders: Order[], closedIds: number[]): void {
  const t = crisisType(ctx.catalogue, c.typeId);
  const stage = t.stages[index]!;
  const before = new Set(c.knownTo);
  c.stageIndex = index;
  c.stageId = stage.id;
  c.knownTo = [...c.knownTo, ...stage.knownTo.filter((k) => !before.has(k))];
  c.public = c.public || stage.knownTo.includes('public');
  const coach = ctx.coachOf(c.teamId);
  // L9.3.1 timing / L1.1.2: an audience that hears it from the stage, not from the coach, remembers.
  if (index > 0 && coach !== null) {
    for (const role of stage.knownTo) {
      const audience = AUDIENCE_OF_ROLE[role];
      if (!audience || before.has(role) || c.told.includes(audience)) continue;
      if (audience === 'public') continue;
      orders.push({ kind: 'group_memory', group: audience === 'team' ? 'team' : 'upstairs', teamId: c.teamId, aboutId: coach, memoryClass: 'found_out_elsewhere', amount: param('memory.foundOut'), sourceEventId: null });
    }
  }
  const ev = ctx.sink.append(draft(stageType(t.guard), meta(ctx, c.teamId, date), [], subjectsOf(c), { crisisId: c.id, stage: stage.id, public: c.public }, witnessesOf(c), c.causeEventIds[0] ?? null));
  c.log.push({ date, kind: 'stage', detail: stage.id, eventId: ev });
  const last = index === t.stages.length - 1;
  if (last) { closeCrisis(state, c.id, date, ctx, orders); closedIds.push(c.id); return; }
  if (stage.clock) {
    const days = ctx.stream(['crisis', 'clock', c.id, index]).int(stage.clock.min, stage.clock.max);
    c.stageEnds = compliance.addDays(date, days);
  } else c.stageEnds = null;
}

function openFrom(state: CrisisState, q: QueuedTrigger, date: WorldDate, ctx: CrisisContext, orders: Order[], closedIds: number[]): Crisis {
  const t = crisisType(ctx.catalogue, q.trigger.typeId);
  const c: Crisis = {
    id: state.nextId++, typeId: t.id, teamId: q.trigger.teamId, subjectIds: [...q.trigger.subjectIds],
    causeEventIds: [...q.trigger.causeEventIds], severity: q.severity, stageIndex: 0, stageId: t.stages[0]!.id,
    stageEnds: null, knownTo: [], public: false, opened: date, closed: null, told: [], lies: [], actIds: [],
    upstairsToldAtOnce: q.severity >= param('severity.upstairsAtOnce'), log: [], trigger: q.trigger,
  };
  if (c.upstairsToldAtOnce) c.knownTo.push('owner_or_ad');
  state.open.push(c);
  const ev = ctx.sink.append(draft(openedType(t.guard), meta(ctx, c.teamId, date), [], subjectsOf(c), { crisisId: c.id, typeId: t.id, severity: c.severity, stage: c.stageId }, { kind: 'team', teamId: c.teamId }, c.causeEventIds[0] ?? null));
  c.log.push({ date, kind: 'opened', detail: t.id, eventId: ev });
  enterStage(state, c, 0, date, ctx, orders, closedIds);
  return c;
}

function queueOrder(a: QueuedTrigger, b: QueuedTrigger): number {
  const pa = PRIORITY_TYPES.includes(a.trigger.typeId) ? 1 : 0;
  const pb = PRIORITY_TYPES.includes(b.trigger.typeId) ? 1 : 0;
  if (pa !== pb) return pb - pa;
  if (a.severity !== b.severity) return b.severity - a.severity;
  const d = compliance.dayNumber(a.queuedOn) - compliance.dayNumber(b.queuedOn);
  return d !== 0 ? d : a.seq - b.seq;
}

/** How many crises a team may hold open now (L9.1.1, raised when the room is lost). */
export function openLimit(cat: CrisisCatalogue, roomLost: boolean): number {
  return roomLost ? cat.pacing.maxOpenWhenRoomLost.value : cat.pacing.maxOpen.value;
}

/**
 * One week for one team: expire stale queue entries, advance clocks, then open at most the weekly
 * number of new crises while the open limit allows, priority types first, then by severity.
 */
export function crisisWeek(state: CrisisState, teamId: number, date: WorldDate, ctx: CrisisContext): StepResult {
  const orders: Order[] = [];
  const opened: number[] = [];
  const closedIds: number[] = [];
  const cat = ctx.catalogue;
  const maxAgeDays = cat.pacing.queueWeeks.value * DAYS_PER_WEEK();
  state.queue = state.queue.filter((q) => q.trigger.teamId !== teamId
    || compliance.daysBetween(q.queuedOn, date) <= maxAgeDays
    || ctx.causeHolds(q.trigger));
  for (const c of [...state.open]) {
    if (c.teamId !== teamId) continue;
    while (c.closed === null && c.stageEnds !== null && onOrAfter(date, c.stageEnds)) enterStage(state, c, c.stageIndex + 1, c.stageEnds, ctx, orders, closedIds);
  }
  const limit = openLimit(cat, ctx.roomLost(teamId));
  let newThisWeek = 0;
  const mine = state.queue.filter((q) => q.trigger.teamId === teamId && onOrAfter(date, q.queuedOn)).sort(queueOrder);
  for (const q of mine) {
    if (newThisWeek >= cat.pacing.newPerTeamPerWeek.value) break;
    if (state.open.filter((c) => c.teamId === teamId).length >= limit) break;
    state.queue = state.queue.filter((x) => x.seq !== q.seq);
    const c = openFrom(state, q, date, ctx, orders, closedIds);
    opened.push(c.id);
    newThisWeek += 1;
  }
  return { orders, opened, closedIds };
}

/** Move a crisis whose current stage has no clock to its next stage (the owning system says so). */
export function advanceCrisis(state: CrisisState, crisisId: number, date: WorldDate, ctx: CrisisContext): StepResult {
  const orders: Order[] = [];
  const closedIds: number[] = [];
  const c = state.open.find((x) => x.id === crisisId);
  if (!c) throw new Error(`crisis: ${crisisId} is not open`);
  enterStage(state, c, c.stageIndex + 1, date, ctx, orders, closedIds);
  return { orders, opened: [], closedIds };
}

/**
 * Close a crisis (L9.3.2): history entry with the acts and the timeline, culture precedent, notability,
 * lies coming to light, and the trigger left armed when the cause still holds. No grade is computed.
 */
export function closeCrisis(state: CrisisState, crisisId: number, date: WorldDate, ctx: CrisisContext, orders: Order[] = []): Order[] {
  const c = state.open.find((x) => x.id === crisisId);
  if (!c) throw new Error(`crisis: ${crisisId} is not open`);
  c.closed = date;
  state.open = state.open.filter((x) => x.id !== crisisId);
  state.closed.push(c);
  const coach = ctx.coachOf(c.teamId);
  const causeUnresolved = ctx.causeHolds(c.trigger);
  const ev = ctx.sink.append(draft(CRISIS_EVENT.closed, meta(ctx, c.teamId, date), coach !== null ? [{ personId: coach, role: 'head_coach' }] : [], [], { crisisId: c.id, typeId: c.typeId, acts: c.actIds.length, causeUnresolved }, witnessesOf(c), c.causeEventIds[0] ?? null));
  c.log.push({ date, kind: 'closed', detail: causeUnresolved ? 'cause_unresolved' : 'resolved', eventId: ev });
  state.history.push({ crisisId: c.id, typeId: c.typeId, teamId: c.teamId, subjectIds: [...c.subjectIds], opened: c.opened, closed: date, timeline: [...c.log], acts: [...c.actIds], causeUnresolved, linkedOutcomes: [] });
  orders.push({ kind: 'culture_precedent', teamId: c.teamId, crisisId: c.id, typeId: c.typeId, actIds: [...c.actIds] });
  orders.push({ kind: 'notability', personId: coach, teamId: c.teamId, what: `crisis:${c.typeId}`, score: c.severity * param('notability.perSeverity') });
  if (coach !== null) {
    for (const lie of c.lies) orders.push({ kind: 'group_memory', group: lie.audience === 'team' ? 'team' : lie.audience === 'upstairs' ? 'upstairs' : 'knowers', teamId: c.teamId, aboutId: coach, memoryClass: 'lied_to_found_out', amount: null, sourceEventId: ev });
  }
  if (causeUnresolved) orders.push({ kind: 'trigger_armed', crisisId: c.id, causeEventIds: [...c.causeEventIds] });
  return orders;
}

/** L9.3.2: attach a later consequence (a transfer, a grievance result) to a closed crisis's history entry. */
export function linkOutcome(state: CrisisState, crisisId: number, eventId: number): void {
  const h = state.history.find((x) => x.crisisId === crisisId);
  if (!h) throw new Error(`crisis: no history entry for ${crisisId}`);
  if (!h.linkedOutcomes.includes(eventId)) h.linkedOutcomes.push(eventId);
}

/** L9.3.2 edge case: the coach leaves; the successor inherits the open items (the record stays with the history). */
export function openFor(state: CrisisState, teamId: number): readonly Crisis[] {
  return state.open.filter((c) => c.teamId === teamId);
}
