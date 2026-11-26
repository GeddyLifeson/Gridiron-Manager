// G5 install plan: install units with computed prerequisites (G5.1.1), the daily size limit and the camp
// cycle (G5.2.1), the weekly plan with carry-over and new items, rep allocation and a projection from the
// staff's estimates and nominal yields (G5.3.1), the standing menu and fading list (G5.3.2), and the backup
// and newcomer rules (G5.5.1). Projections never read true knowledge or hidden learning rates.
import type { DeterministicMath } from '@gm/schema';
import { AVERAGE_LEARNER, gainFrom, modeCap, unitRate, type TeachMode } from './gain.ts';
import type { ItemCatalogue } from './items.ts';
import { num, type KnowledgeNumbers } from './params.ts';

/** G5.1.1 install unit: what each position group must learn to reach "installed". */
export interface InstallUnit {
  readonly id: string;
  /** Items to learn, by position group. */
  readonly items: Readonly<Record<string, readonly string[]>>;
  /** Other units this one needs first (formation, protection and concept for a play; base call for a check). */
  readonly requires: readonly string[];
}

/** Units in an order that respects every prerequisite; throws on a cycle or a missing unit. Ties by id. */
export function installOrder(units: readonly InstallUnit[]): string[] {
  const byId = new Map(units.map((u) => [u.id, u]));
  for (const u of units) for (const r of u.requires) if (!byId.has(r)) throw new Error(`unit ${u.id} needs ${r}, which is not in the plan`);
  const done = new Set<string>();
  const out: string[] = [];
  const ids = [...byId.keys()].sort();
  while (out.length < ids.length) {
    const next = ids.find((id) => !done.has(id) && byId.get(id)!.requires.every((r) => done.has(r)));
    if (next === undefined) throw new Error(`prerequisite cycle among ${ids.filter((id) => !done.has(id)).join(', ')}`);
    done.add(next);
    out.push(next);
  }
  return out;
}

/** Whether a unit may be scheduled on a day, given the days its prerequisites are scheduled. */
export function canSchedule(unit: InstallUnit, day: number, scheduled: ReadonlyMap<string, number>): boolean {
  return unit.requires.every((r) => { const d = scheduled.get(r); return d !== undefined && d <= day; });
}

/** G5.1.1: installed when every listed player in each group has estimated knowledge at the threshold. */
export function isInstalled(n: KnowledgeNumbers, unit: InstallUnit, groupPlayers: Readonly<Record<string, readonly number[]>>, est: (player: number, items: readonly string[]) => number): boolean {
  const t = num(n, 'install.threshold');
  for (const [group, items] of Object.entries(unit.items)) {
    for (const pl of groupPlayers[group] ?? []) if (est(pl, items) < t) return false;
  }
  return true;
}

/**
 * G5.2.1 daily size limit: the units planned for one group on one day, split into those inside the limit
 * and the spill. Over-limit units are taught at reduced yield when kept (`install.overLimitYield`), or moved
 * to the next day with a warning by the weekly planner (G5.3.1).
 */
export function dailyLimitSplit(n: KnowledgeNumbers, planned: readonly string[]): { readonly within: string[]; readonly over: string[] } {
  const lim = num(n, 'install.dailyLimit');
  return { within: planned.slice(0, lim), over: planned.slice(lim) };
}

/** One day of the default camp cycle (G5.2.1). */
export interface CampDay {
  readonly pass: number;
  readonly kind: 'install' | 'situational';
  /** Install number within the base system, from 1; null on a situational day. */
  readonly install: number | null;
}

/**
 * G5.2.1 default fill: the base system split into about three installs, each over about three days,
 * then a situational day, the whole cycle repeated about three times.
 */
export function defaultCampCycle(n: KnowledgeNumbers): CampDay[] {
  const out: CampDay[] = [];
  const passes = num(n, 'install.camp.passes');
  const installs = num(n, 'install.camp.installs');
  const days = num(n, 'install.camp.daysPerInstall');
  for (let p = 1; p <= passes; p++) {
    for (let i = 1; i <= installs; i++) for (let d = 0; d < days; d++) out.push({ pass: p, kind: 'install', install: i });
    out.push({ pass: p, kind: 'situational', install: null });
  }
  return out;
}

/** G5.3.1 default weekly template in the sourced order (H1 sets the actual days). */
export const WEEKLY_TEMPLATE = [
  { day: 'planning', installs: [] as readonly string[], special: [] as readonly string[] },
  { day: 'practice1', installs: ['first_and_second_down', 'pressure'], special: ['punt'] },
  { day: 'practice2', installs: ['third_down', 'sub_package_pressure'], special: ['kickoff'] },
  { day: 'practice3', installs: ['red_zone', 'goal_line', 'two_minute', 'backed_up', 'gadget'], special: ['field_goal', 'try', 'hands'] },
  { day: 'walkthrough', installs: ['whole_plan'], special: ['all_units'] },
] as const;

/** A sheet call as the weekly planner sees it. */
export interface PlanCall {
  readonly call: string;
  readonly items: readonly string[];
  /** Players slated, each with position and current estimated knowledge of each item. */
  readonly players: readonly { readonly player: number; readonly position: string; readonly estimates: Readonly<Record<string, number>> }[];
}

export interface PlannedCall {
  readonly call: string;
  readonly kind: 'carry' | 'new';
  readonly reps: number;
  readonly projected: number;
  readonly belowThreshold: boolean;
}

export interface WeekPlanInput {
  readonly calls: readonly PlanCall[];
  /** Full-speed reps the week's practice has for these calls. */
  readonly repBudget: number;
  /** Walk-through reps per call the week's plan includes. */
  readonly walkthroughRepsPerCall: number;
  /** Meeting minutes per new item. */
  readonly meetingMinutesPerItem: number;
  /** Short week: full-speed periods are removed (G5.3.1). */
  readonly shortWeek: boolean;
}

export interface WeekPlan {
  readonly calls: readonly PlannedCall[];
  readonly newItemCount: number;
  readonly repsUsed: number;
  readonly repShortfall: number;
  readonly averageProjected: number;
}

/**
 * G5.3.1 weekly plan. A call is new when any slated player's estimate of any item is under the installed
 * threshold, else carry-over. Every call gets the minimum carry reps and new calls the new minimum; the
 * remaining budget goes one rep at a time to the lowest projected call. Projection runs the D9.2.1 model on
 * the estimates with an average learner and teacher (never truth, never hidden rates).
 */
export function planWeek(n: KnowledgeNumbers, math: DeterministicMath, cat: ItemCatalogue, w: WeekPlanInput): WeekPlan {
  const t = num(n, 'install.threshold');
  const newItems = new Set<string>();
  const kind = new Map<string, 'carry' | 'new'>();
  for (const c of w.calls) {
    let isNew = false;
    for (const p of c.players) for (const i of c.items) if ((p.estimates[i] ?? 0) < t) { isNew = true; newItems.add(i); }
    kind.set(c.call, isNew ? 'new' : 'carry');
  }
  const learner = { ...AVERAGE_LEARNER, newItemsThisWeek: newItems.size };
  const project = (c: PlanCall, reps: number): number => {
    let lo = num(n, 'scale.max');
    for (const p of c.players) {
      for (const i of c.items) {
        let k = p.estimates[i] ?? 0;
        const d = cat.get(i) ? cat.difficulty(i, p.position) : num(n, 'items.difficultyMax');
        const step = (mode: TeachMode, amount: number): void => {
          const ev = { player: p.player, position: p.position, item: i, mode, amount, day: 0 };
          const u = mode === 'meeting' ? amount / num(n, 'gain.minutesPerUnit') : amount;
          k = gainFrom(n, math, k, unitRate(n, ev, learner, d, 1), u, Math.max(k, modeCap(n, mode)));
        };
        if (newItems.has(i)) step('meeting', w.meetingMinutesPerItem);
        step('walkthrough', w.walkthroughRepsPerCall);
        if (!w.shortWeek) step('fullSpeed', reps);
        lo = Math.min(lo, k);
      }
    }
    return lo;
  };
  const reps = new Map<string, number>();
  let used = 0;
  let shortfall = 0;
  const budget = w.shortWeek ? 0 : w.repBudget;
  for (const c of w.calls) {
    const want = kind.get(c.call) === 'new' ? num(n, 'install.minRepsNew') : num(n, 'install.minRepsCarry');
    const give = Math.max(0, Math.min(want, budget - used));
    reps.set(c.call, give);
    used += give;
    shortfall += want - give;
  }
  while (used < budget && w.calls.length) {
    let worst = w.calls[0]!;
    let worstK = Infinity;
    for (const c of w.calls) { const k = project(c, reps.get(c.call)!); if (k < worstK) { worstK = k; worst = c; } }
    reps.set(worst.call, reps.get(worst.call)! + 1);
    used++;
  }
  const calls = w.calls.map((c) => {
    const r = reps.get(c.call)!;
    const projected = project(c, r);
    return { call: c.call, kind: kind.get(c.call)!, reps: r, projected, belowThreshold: projected < t };
  });
  const avg = calls.length ? calls.reduce((s, c) => s + c.projected, 0) / calls.length : 0;
  return { calls, newItemCount: newItems.size, repsUsed: used, repShortfall: shortfall, averageProjected: avg };
}

/** G5.3.2 fading: units outside the always-up set whose estimate fell the leaf's drop below the threshold. */
export function isFading(n: KnowledgeNumbers, estimate: number, alwaysUp: boolean): boolean {
  return !alwaysUp && estimate < num(n, 'install.threshold') - num(n, 'install.fadingDrop');
}

/** G5.3.2 reps reserved for the always-up set out of a weekly budget. */
export function alwaysUpReps(n: KnowledgeNumbers, weeklyReps: number): number {
  return Math.floor(weeklyReps * num(n, 'install.alwaysUpShare'));
}

/** G5.5.1 split of first-team reps between starter and backup QB; the share is clamped to 0 to the max. */
export function backupQbSplit(n: KnowledgeNumbers, firstTeamReps: number, share = num(n, 'install.backupQbShare')): { readonly starter: number; readonly backup: number } {
  const s = Math.min(num(n, 'install.backupQbShareMax'), Math.max(0, share));
  const backup = Math.round(firstTeamReps * s);
  return { starter: firstTeamReps - backup, backup };
}

/** G5.5.1 a newly signed player's first-week package: his position's calls on tier 1 situations, capped. */
export function catchUpPackage(n: KnowledgeNumbers, tierOneCalls: readonly string[]): string[] {
  return tierOneCalls.slice(0, num(n, 'install.catchUpCap'));
}

/** G5.5.1 position coach minutes for a number of extra meetings. */
export function extraMeetingCost(n: KnowledgeNumbers, meetings: number): number {
  return meetings * num(n, 'install.extraMeetingMinutes');
}
