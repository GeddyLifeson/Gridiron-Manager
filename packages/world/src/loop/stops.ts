// X12.3.1: the simulation stops only for the user's decisions. Stops come from his duties and from
// items addressed to him; world news never stops anything. Advancing by day or by week gives the same
// world, because weekly passes run on fixed days whichever way he moves.
import { DEADLINE_LAPSED } from './events.ts';
import { runSeasonPoint, runWeek, type PassOptions } from './order.ts';
import { param } from './params.ts';
import type { LiveWorld, SchedulePort, WorldSystems } from './types.ts';
import type { WorldDate } from '@gm/schema';

export const STOP_KINDS = ['duty', 'meeting', 'offer', 'deadline', 'game'] as const;
export type StopKind = (typeof STOP_KINDS)[number];

/** Something waiting on the user. It must carry a link to him: an addressee, or a duty his seat owns. */
export interface PendingItem {
  readonly id: number;
  readonly kind: StopKind;
  /** The person it is addressed to (an offer, a meeting request). Null for a duty item. */
  readonly addresseePersonId: number | null;
  /** S3 duty id it belongs to. Null for an addressed item. */
  readonly dutyId: string | null;
  /** The day the simulation stops for it. */
  readonly stopOn: WorldDate;
  /** The last day it can be answered. After it, the default of a real absence applies (rule 2). */
  readonly dueOn: WorldDate;
  /** What happens if he does not answer: "the offer lapses", "the boss decides without him". */
  readonly defaultResolution: string;
  resolved: boolean;
}

export interface StopPoint { readonly itemId: number; readonly kind: StopKind; readonly on: WorldDate }

const cmp = (a: WorldDate, b: WorldDate): number => (a.seasonYear !== b.seasonYear ? a.seasonYear - b.seasonYear : a.dayIndex - b.dayIndex);

/** Duty ids of the seats the user holds. */
export function userDutyIds(world: LiveWorld): Set<string> {
  const out = new Set<string>();
  if (world.userPersonId === null) return out;
  for (const j of world.jobs.values()) if (j.holderPersonId === world.userPersonId) for (const d of j.dutyIds) out.add(d);
  return out;
}

/** Rule 1: an item is the user's when it is addressed to him or belongs to a duty of his seat. */
export function isUsers(world: LiveWorld, item: PendingItem, duties: ReadonlySet<string> = userDutyIds(world)): boolean {
  if (world.userPersonId === null) return false;
  return item.addresseePersonId === world.userPersonId || (item.dutyId !== null && duties.has(item.dutyId));
}

/** Open stops on or before `through`, earliest first. Items with no link to the user never appear. */
export function stopsThrough(world: LiveWorld, pending: readonly PendingItem[], through: WorldDate): StopPoint[] {
  const duties = userDutyIds(world);
  return pending
    .filter((i) => !i.resolved && isUsers(world, i, duties) && cmp(i.stopOn, through) <= 0)
    .sort((a, b) => cmp(a.stopOn, b.stopOn) || a.id - b.id)
    .map((i) => ({ itemId: i.id, kind: i.kind, on: i.stopOn }));
}

/** The X12.3.1 acceptance check: every stop has a duty or addressee link to the user. */
export function stopProblems(world: LiveWorld, stops: readonly StopPoint[], pending: readonly PendingItem[]): string[] {
  const byId = new Map(pending.map((p) => [p.id, p]));
  return stops.filter((s) => { const i = byId.get(s.itemId); return !i || !isUsers(world, i); }).map((s) => `stop ${s.itemId} has no duty or addressee link to the user`);
}

export type AdvanceMode = 'day' | 'week' | 'next_stop';
export interface AdvanceResult { readonly daysAdvanced: number; readonly stoppedFor: StopPoint | null; readonly lapsed: readonly number[] }

/**
 * Move the calendar. The world's weekly pass runs when a week of days has gone by since the last one,
 * so the log is the same whether the user steps a day at a time or a week at a time (rule 4). The
 * calendar stops at the first open item of his; passing an item's last day resolves it by its default
 * and logs that as his (rule 2).
 */
export function advance(world: LiveWorld, systems: WorldSystems, schedule: SchedulePort, pending: PendingItem[], mode: AdvanceMode, opts: PassOptions = {}, maxDays = 366): AdvanceResult {
  const weekDays = param('week.days');
  const limit = mode === 'day' ? 1 : mode === 'week' ? weekDays : maxDays;
  const lapsed: number[] = [];
  let days = 0;
  while (days < limit) {
    const today: WorldDate = { seasonYear: world.date.seasonYear, dayIndex: world.date.dayIndex + world.dayInWeek };
    const stop = stopsThrough(world, pending, today)[0];
    // An open item of his stops the calendar. He may step on by hand (the first day of a call); it stops again each day.
    if (stop && (days > 0 || mode === 'next_stop')) return { daysAdvanced: days, stoppedFor: stop, lapsed };
    // The day passes. Anything of his due today and unanswered resolves by its default, logged as his.
    for (const item of pending.filter((i) => !i.resolved && isUsers(world, i) && cmp(i.dueOn, today) <= 0).sort((x, y) => x.id - y.id)) {
      item.resolved = true;
      lapsed.push(item.id);
      const r = world.log.emit({
        type: DEADLINE_LAPSED, date: world.date, actors: [{ personId: world.userPersonId!, role: 'decider' }],
        payload: { item: item.id, kind: item.kind, resolution: item.defaultResolution }, witnesses: { kind: 'people', personIds: [world.userPersonId!] }, tier: 1, source: 'user',
      });
      if (!r.ok) throw new Error(`deadline_lapsed refused: ${r.reason}`);
    }
    world.dayInWeek++;
    days++;
    if (world.dayInWeek === weekDays) {
      world.dayInWeek = 0;
      const weeks = schedule.weeksInSeason(world);
      if (world.week < weeks) runWeek(world, systems, opts); else runSeasonPoint(world, systems, { ...opts, weeksInSeason: weeks });
    }
  }
  return { daysAdvanced: days, stoppedFor: null, lapsed };
}
