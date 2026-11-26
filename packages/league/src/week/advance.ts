// Advancing time through the week (H1.1.3). One loop serves every control, so "next block", "next
// decision", "next day" and "to game day" reach the same state from the same choices. Blocks resolve
// in start order; league deadlines are fixed-time items the clock cannot pass without a recorded
// choice or a recorded default; resolved blocks are never edited again (rule 5).
import { compareInstant, instantValue, type Instant } from '../calendar/date.ts';
import type { WeeklyDeadline } from '../calendar/weekly.ts';
import { allBlocks } from './build.ts';
import type { Block, LeaderRole, Week } from './types.ts';

/** A pending item (H5 injury calls, H6 roster deadlines, H7, L1, L9, league deadlines). */
export interface PendingItem {
  readonly id: string;
  readonly at: Instant;
  /** True when the clock must stop for the user's choice in "next decision" mode. */
  readonly required: boolean;
  readonly defaultChoice: string;
  readonly source: 'league' | 'decision';
}

export interface AdvanceLogEntry {
  readonly kind: 'block' | 'choice' | 'default' | 'delegated';
  readonly id: string;
  readonly at: Instant;
  readonly value: string;
}

export interface WeekRun {
  readonly week: Week;
  readonly items: readonly PendingItem[];
  readonly choices: Readonly<Record<string, string>>;
  readonly log: readonly AdvanceLogEntry[];
  readonly reports: readonly unknown[];
}

export type Mode = 'block' | 'decision' | 'day' | 'game';

/** Runs one block and returns its report (H3, H4, H5, H7, H8 or E7 computes the effect). Must be pure. */
export type BlockResolver = (block: Block, info: { readonly delegated: boolean; readonly teamId: number }) => unknown;

export interface StepOptions {
  /** The user's role: blocks he leads are delegated in "to game day" (H1.1.3 decision). */
  readonly userRole: LeaderRole;
  /** Hand user-led blocks to staff in every mode (the same choice "to game day" makes). */
  readonly delegateUserBlocks?: boolean;
}

export interface StepResult {
  readonly run: WeekRun;
  /** Why the loop stopped. */
  readonly stop: 'block' | 'decision' | 'day' | 'game_day' | 'week_end';
  /** The item the clock stopped for, in "next decision" mode. */
  readonly item?: PendingItem;
}

/** League deadlines of the week as pending items (C4.5.1 via G-12 `weeklyDeadlines`). */
export function leagueItems(deadlines: readonly WeeklyDeadline[], required: readonly string[] = ['game_status', 'inactives', 'elevations']): PendingItem[] {
  return deadlines.map((d, i) => ({ id: `${d.id}#${i}`, at: d.at, required: required.includes(d.id), defaultChoice: 'staff_default', source: 'league' as const }));
}

export function startRun(week: Week, items: readonly PendingItem[]): WeekRun {
  const sorted = [...items].sort((a, b) => compareInstant(a.at, b.at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { week, items: sorted, choices: {}, log: [], reports: [] };
}

/** Record the user's choice for a pending item (logged when the clock reaches it). */
export function choose(run: WeekRun, itemId: string, value: string): WeekRun {
  if (!run.items.some((i) => i.id === itemId)) throw new Error(`no pending item ${itemId}`);
  if (run.log.some((e) => e.id === itemId)) throw new Error(`item ${itemId} is already past`);
  return { ...run, choices: { ...run.choices, [itemId]: value } };
}

function pendingBlocks(run: WeekRun): Block[] {
  const done = new Set(run.week.completed);
  return allBlocks(run.week).filter((b) => !done.has(b.id));
}
function openItems(run: WeekRun): PendingItem[] {
  const past = new Set(run.log.filter((e) => e.kind === 'choice' || e.kind === 'default').map((e) => e.id));
  return run.items.filter((i) => !past.has(i.id));
}

function passItem(run: WeekRun, it: PendingItem): WeekRun {
  const c = run.choices[it.id];
  const entry: AdvanceLogEntry = c === undefined
    ? { kind: 'default', id: it.id, at: it.at, value: it.defaultChoice }
    : { kind: 'choice', id: it.id, at: it.at, value: c };
  return { ...run, log: [...run.log, entry] };
}

function resolveOne(run: WeekRun, b: Block, resolve: BlockResolver, delegated: boolean): WeekRun {
  const report = resolve(b, { delegated, teamId: run.week.teamId });
  const log: AdvanceLogEntry[] = [...run.log];
  if (delegated) log.push({ kind: 'delegated', id: b.id, at: b.start, value: b.leader });
  log.push({ kind: 'block', id: b.id, at: b.start, value: b.type });
  return { ...run, week: { ...run.week, completed: [...run.week.completed, b.id] }, log, reports: [...run.reports, report] };
}

/** Advance by one control (H1.1.3). */
export function step(run0: WeekRun, mode: Mode, resolve: BlockResolver, opts: StepOptions): StepResult {
  let run = run0;
  const delegateAll = mode === 'game' || opts.delegateUserBlocks === true;
  const firstBlock = pendingBlocks(run)[0];
  const today = firstBlock?.start.day;
  for (;;) {
    const next = pendingBlocks(run)[0];
    const item = openItems(run)[0];
    // Items due no later than the next block pass first (rule 3 and 4).
    if (item && (!next || instantValue(item.at) <= instantValue(next.start))) {
      if (mode === 'decision' && item.required && run.choices[item.id] === undefined) return { run, stop: 'decision', item };
      run = passItem(run, item);
      continue;
    }
    if (!next) return { run, stop: 'week_end' };
    if (mode === 'game' && next.type === 'game') return { run, stop: 'game_day' };
    if (mode === 'day' && next.start.day !== today) return { run, stop: 'day' };
    const delegated = delegateAll && next.leader === opts.userRole;
    run = resolveOne(run, next, resolve, delegated);
    if (mode === 'block') return { run, stop: 'block' };
  }
}

/** What "to game day" will hand to staff, for its confirmation (H1.1.3: lists what will be delegated). */
export function delegationPreview(run: WeekRun, userRole: LeaderRole): { blocks: readonly string[]; defaults: readonly string[] } {
  const blocks = pendingBlocks(run).filter((b) => b.type !== 'game' && b.leader === userRole).map((b) => b.id);
  const defaults = openItems(run).filter((i) => run.choices[i.id] === undefined).map((i) => i.id);
  return { blocks, defaults };
}

/**
 * League-wide order for one pass (H1.1.3 rule 1): every team's unresolved blocks on a day in start
 * order, ties by team then id, so news from other teams arrives in order.
 */
export function leagueOrder(weeks: readonly Week[], day: number): { teamId: number; block: Block }[] {
  const out: { teamId: number; block: Block }[] = [];
  for (const w of weeks) {
    const done = new Set(w.completed);
    for (const b of allBlocks(w)) if (b.start.day === day && !done.has(b.id)) out.push({ teamId: w.teamId, block: b });
  }
  return out.sort((a, b) => instantValue(a.block.start) - instantValue(b.block.start) || a.teamId - b.teamId || (a.block.id < b.block.id ? -1 : a.block.id > b.block.id ? 1 : 0));
}

/**
 * The user is double-booked by an event (H1.1.3 edge case): he attends one and the other runs with its
 * default leader. The choice is a decision-log record (N3).
 */
export function chooseAttendance(week: Week, attendId: string, otherId: string): { week: Week; record: { kind: 'double_booked'; attended: string; delegated: string } } {
  const blocks = allBlocks(week);
  if (!blocks.some((b) => b.id === attendId) || !blocks.some((b) => b.id === otherId)) throw new Error('both blocks must be in the week');
  if (week.completed.includes(otherId)) throw new Error(`block ${otherId} is resolved`);
  const days = week.days.map((d) => ({
    ...d,
    blocks: d.blocks.map((b) => (b.id === otherId ? { ...b, leader: 'staff_default' as const, attendees: b.attendees.filter((g) => g !== 'head_coach') } : b)),
  }));
  return { week: { ...week, days }, record: { kind: 'double_booked', attended: attendId, delegated: otherId } };
}
