// Builds the office view (O1.2.1, O1.2.2, O1.2.3). The inbox is the world's own inbox rows for the coach
// (they are own-team data through the observer filter); the day plan is the week schedule (H1, G-69) and
// the hour budget (E7) the world side computed. The inbox never invents items and never decides.
import type { ObservedWorld } from '../../observer/index.ts';
import type { AdvanceOption, AdvanceTarget, BlockRow, DateLike, HomeView, InboxRow, InboxWeight, Moment, TodayView } from './types.ts';
import { ADVANCE_TARGETS } from './types.ts';

/** A schedule block as the week schedule holds it (H1). */
export interface BlockInput {
  readonly blockId: string;
  readonly labelKey: string;
  readonly date: DateLike;
  readonly startMinute: number;
  readonly minutes: number;
  /** The coach, or the delegate's person id. */
  readonly runBy: 'coach' | number;
  readonly delegateNoteKey?: string | null;
  readonly requiredByRule?: boolean;
  readonly screenId?: string | null;
}

/** The world side's plan for the coach's day and week. */
export interface DayPlan {
  readonly now: Moment;
  readonly phaseKey: string;
  readonly dayLabelKey: string | null;
  readonly nextGame: { readonly date: DateLike; readonly opponentTeamId: number; readonly kickoffMinute: number } | null;
  /** Blocks from now to the end of the week, in any order. */
  readonly blocks: readonly BlockInput[];
  readonly budgetMinutes: number;
  readonly spentMinutes: number;
  readonly energyKey: string | null;
  readonly nextEvent: { readonly date: DateLike; readonly labelKey: string } | null;
  /** Inbox kinds the coach delegated by standing rule (L4): they do not appear. */
  readonly delegatedKinds?: readonly string[];
  /** Minutes answering an item costs, by item id (E7). */
  readonly answerMinutes?: Readonly<Record<string, number>>;
  /** Conflicting items, by item id (O1.2.2 edge case). */
  readonly conflicts?: Readonly<Record<string, readonly number[]>>;
  /** Last minute of a working day (end-of-day target). */
  readonly endOfDayMinute: number;
}

const cmp = (a: DateLike, b: DateLike) => a.seasonYear - b.seasonYear || a.dayIndex - b.dayIndex;
const cmpMoment = (a: Moment, b: Moment) => cmp(a.date, b.date) || a.minute - b.minute;
const sameDay = (a: DateLike, b: DateLike) => cmp(a, b) === 0;

/** The O1.2.2 weight of an item from its owning system's fields. */
export function weightOf(item: { requiredCommand?: string | null; defaultCommand?: string | null }): InboxWeight {
  if (!item.requiredCommand) return 'note';
  return item.defaultCommand ? 'should' : 'must';
}

const WEIGHT_ORDER: Record<InboxWeight, number> = { must: 0, should: 1, note: 2 };

/** O1.2.2 order: must by deadline, then should by deadline, then notes by time received. */
export function orderInbox(rows: readonly InboxRow[]): InboxRow[] {
  return [...rows].sort((a, b) => {
    const w = WEIGHT_ORDER[a.weight] - WEIGHT_ORDER[b.weight];
    if (w !== 0) return w;
    if (a.weight !== 'note') {
      if (a.deadline && b.deadline) { const c = cmp(a.deadline, b.deadline); if (c !== 0) return c; }
      else if (a.deadline || b.deadline) return a.deadline ? -1 : 1;
    }
    return cmp(a.received, b.received) || a.itemId - b.itemId;
  });
}

type Row = Record<string, unknown>;
const asDate = (d: unknown): DateLike | null => (d && typeof (d as DateLike).seasonYear === 'number' ? { seasonYear: (d as DateLike).seasonYear, dayIndex: (d as DateLike).dayIndex } : null);

function names(world: ObservedWorld): (id: number | null) => string | null {
  const m = new Map<number, Row>();
  for (const p of world.table('people') as readonly Row[]) if (typeof p.id === 'number') m.set(p.id, p);
  return (id) => {
    if (id === null) return null;
    const n = m.get(id)?.name as { first?: string; last?: string } | undefined;
    return n?.last ? [n.first, n.last].filter(Boolean).join(' ') : null;
  };
}

export function inboxRows(world: ObservedWorld, personId: number, plan: Pick<DayPlan, 'delegatedKinds' | 'answerMinutes' | 'conflicts'>): InboxRow[] {
  const nameOf = names(world);
  const delegated = new Set(plan.delegatedKinds ?? []);
  const rows: InboxRow[] = [];
  for (const r of world.table('inbox') as readonly Row[]) {
    if (r.ownerPersonId !== personId || typeof r.id !== 'number') continue;
    if (r.state !== 'unread' && r.state !== 'read') continue;
    if (typeof r.kind === 'string' && delegated.has(r.kind)) continue;
    const received = asDate(r.received);
    if (!received) continue;
    const sender = typeof r.senderPersonId === 'number' ? r.senderPersonId : null;
    rows.push({
      itemId: r.id, weight: weightOf(r as { requiredCommand?: string | null; defaultCommand?: string | null }), kind: String(r.kind ?? ''),
      senderId: sender, senderName: nameOf(sender), subjectKey: String(r.subjectKey ?? ''), bodyKey: String(r.bodyKey ?? ''),
      params: (r.params ?? {}) as InboxRow['params'], received, deadline: asDate(r.deadline),
      answerCommand: typeof r.requiredCommand === 'string' ? r.requiredCommand : null, defaultCommand: typeof r.defaultCommand === 'string' ? r.defaultCommand : null,
      links: Array.isArray(r.links) ? (r.links as string[]) : [], unread: r.state === 'unread',
      answerMinutes: plan.answerMinutes?.[String(r.id)] ?? null, conflictsWith: [...(plan.conflicts?.[String(r.id)] ?? [])],
    });
  }
  return orderInbox(rows);
}

function blockRow(b: BlockInput, nameOf: (id: number | null) => string | null): BlockRow {
  const delegateId = b.runBy === 'coach' ? null : b.runBy;
  return {
    blockId: b.blockId, labelKey: b.labelKey, startMinute: b.startMinute, minutes: b.minutes, runBy: b.runBy === 'coach' ? 'coach' : 'delegate',
    coachMinutes: b.runBy === 'coach' ? b.minutes : null, delegateId, delegateName: nameOf(delegateId),
    delegateNoteKey: delegateId === null ? null : b.delegateNoteKey ?? 'office.delegate.noBook', requiredByRule: !!b.requiredByRule, screenId: b.screenId ?? null,
  };
}

export function buildToday(world: ObservedWorld, plan: DayPlan): TodayView {
  const nameOf = names(world);
  const today = plan.now.date;
  const team = plan.nextGame ? (world.table('teams') as readonly Row[]).find((t) => t.id === plan.nextGame!.opponentTeamId) : undefined;
  const ident = team?.identity as { name?: string } | undefined;
  const isGameDay = !!plan.nextGame && sameDay(plan.nextGame.date, today);
  const todays = plan.blocks.filter((b) => sameDay(b.date, today)).sort((a, b) => a.startMinute - b.startMinute || (a.blockId < b.blockId ? -1 : 1));
  const shown = isGameDay && plan.nextGame ? todays.filter((b) => b.startMinute < plan.nextGame!.kickoffMinute) : todays;
  return {
    date: today, phaseKey: plan.phaseKey, dayLabelKey: plan.dayLabelKey,
    daysToGame: plan.nextGame ? (plan.nextGame.date.seasonYear === today.seasonYear ? plan.nextGame.date.dayIndex - today.dayIndex : null) : null,
    opponent: plan.nextGame ? { teamId: plan.nextGame.opponentTeamId, name: ident?.name ?? `#${plan.nextGame.opponentTeamId}` } : null,
    mode: isGameDay ? 'game_day' : todays.length === 0 ? 'empty' : 'normal',
    blocks: shown.map((b) => blockRow(b, nameOf)),
    nextEvent: todays.length === 0 ? plan.nextEvent : null,
    minutesLeftThisWeek: plan.budgetMinutes - plan.spentMinutes,
    energyKey: plan.energyKey,
  };
}

function targetMoment(target: AdvanceTarget, plan: DayPlan, inbox: readonly InboxRow[]): Moment | null {
  const now = plan.now;
  const later = plan.blocks.map((b) => ({ date: b.date, minute: b.startMinute })).filter((m) => cmpMoment(m, now) > 0).sort(cmpMoment);
  switch (target) {
    case 'next_block': return later[0] ?? null;
    case 'end_of_day': return { date: now.date, minute: plan.endOfDayMinute };
    case 'next_must': {
      const must = inbox.filter((i) => i.weight === 'must' && i.deadline).sort((a, b) => cmp(a.deadline!, b.deadline!))[0];
      return must?.deadline ? { date: must.deadline, minute: 0 } : null;
    }
    case 'game_day': return plan.nextGame ? { date: plan.nextGame.date, minute: 0 } : null;
  }
}

export function advanceOptions(world: ObservedWorld, plan: DayPlan, inbox: readonly InboxRow[]): AdvanceOption[] {
  const nameOf = names(world);
  return ADVANCE_TARGETS.map((target) => {
    const to = targetMoment(target, plan, inbox);
    if (!to) return { target, to: null, blockedBy: [], runsWithout: [] };
    const blockedBy = inbox.filter((i) => i.weight === 'must' && i.deadline && cmp(to.date, i.deadline) > 0).map((i) => i.itemId);
    const runsWithout = plan.blocks
      .filter((b) => b.runBy !== 'coach')
      .filter((b) => { const m = { date: b.date, minute: b.startMinute }; return cmpMoment(m, plan.now) >= 0 && cmpMoment(m, to) < 0; })
      .sort((a, b) => cmp(a.date, b.date) || a.startMinute - b.startMinute)
      .map((b) => ({ blockId: b.blockId, labelKey: b.labelKey, date: b.date, byName: nameOf(b.runBy === 'coach' ? null : b.runBy) }));
    return { target, to, blockedBy, runsWithout };
  });
}

export function buildHomeView(world: ObservedWorld, personId: number, plan: DayPlan): HomeView {
  const inbox = inboxRows(world, personId, plan);
  return { personId, today: buildToday(world, plan), inbox, advance: advanceOptions(world, plan, inbox) };
}
