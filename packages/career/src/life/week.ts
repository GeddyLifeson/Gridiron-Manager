// E7.1.1 the week as 168 hours and E7.1.2 the dry run. `runWeek` is the one function behind both the
// preview and the real advance: it is pure, so a preview writes nothing (E7.1.2 rule 1) and equals the
// committed week to the quarter hour when nothing unplanned happens (acceptance 1).
import { param, toQ, fromQ, Q } from './params.ts';
import { nightDebt, fixedNeedsHours, sleepBand, type Night } from './sleep.ts';
import type { LedgerCategory } from './costs.ts';

/** One piece of work on a day: a block attended, a self-directed task at table cost, or an obligation. */
export interface WorkItem {
  readonly taskId: string;
  readonly category: LedgerCategory;
  /** Hours at table cost (costs.ts) or the block length. */
  readonly hours: number;
  /** Higher keeps its hours first when the day is over-full (rule 6). */
  readonly priority: number;
  /** Person id of the delegate, or null when the coach does it himself (E7.3.1). */
  readonly delegateId: number | null;
  /** A required block set by the boss (E7.7.2); it is never dropped automatically, only skipped by choice. */
  readonly required?: boolean;
  /** Demand that arrived during the week and was not in the plan (E7.1.2 rule 2). */
  readonly unplanned?: boolean;
}

/** What the user chose to give when the day is over-full (rule 6). Missing means the default order. */
export type Give = 'home' | 'sleep' | 'task';

export interface DayPlan {
  readonly work: readonly WorkItem[];
  /** Travel he must make this day (H8), hours. */
  readonly travelHours: number;
  /** Planned sleep tonight (default 7, minimum 0; the game does not stop him). */
  readonly sleepHours: number;
  /** Planned waking hours at home with the household (E8.3.1). */
  readonly homeHours: number;
  /** Sleeps at the facility tonight: no commute and zero home hours (rules 1, 4). */
  readonly facilityNight: boolean;
  /** Cap on home hours from living apart or the road (E8.4.1 rule 2), hours. */
  readonly homeCapHours?: number;
  readonly night?: Omit<Night, 'sleptHours'>;
  /** The user's own order of what gives (rule 6). */
  readonly gives?: readonly Give[];
}

export interface WeekPlan { readonly days: readonly DayPlan[] }

/** `coach_week` for one day. The six fields add to 24 h; bible E7.1.1 names five and folds fixed needs
 *  into the day's 24 before the split, so `needs` is carried as its own field (decisions list D-2). */
export interface CoachDay {
  readonly work: number;
  readonly sleep: number;
  readonly home: number;
  readonly travel: number;
  readonly free: number;
  readonly needs: number;
  /** Sleep band at the start of the day (drives E7.4.2 rule 3). */
  readonly bandAtStart: ReturnType<typeof sleepBand>;
}

export interface CoachWeek {
  readonly days: readonly CoachDay[];
  readonly totals: { readonly work: number; readonly sleep: number; readonly home: number; readonly travel: number; readonly free: number; readonly needs: number };
}

export interface DayOutcome {
  readonly kept: readonly WorkItem[];
  /** Self tasks dropped for lack of hours (rule 6), reported to the user. */
  readonly dropped: readonly WorkItem[];
  readonly delegated: readonly WorkItem[];
  /** Hours the day took from home and from sleep to fit the work, before any task was dropped. */
  readonly tookFromHome: number;
  readonly tookFromSleep: number;
}

export interface WeekResult {
  readonly week: CoachWeek;
  readonly outcomes: readonly DayOutcome[];
  readonly debtStart: number;
  readonly debtEnd: number;
  /** Debt after each night. */
  readonly debtByNight: readonly number[];
  /** E7.4.2 `unplanned_slack_h`: hours lost to slow work on exhausted days. */
  readonly slowWorkHours: number;
}

const DAY_Q = (): number => toQ(param('hoursPerDay'));

/** Rule 6: resolve one day. All arithmetic in whole quarter hours. */
export function resolveDay(plan: DayPlan, debtAtStart: number): { day: CoachDay; outcome: DayOutcome; sleptHours: number } {
  const bandAtStart = sleepBand(debtAtStart);
  const needsQ = toQ(fixedNeedsHours(debtAtStart)) - (plan.facilityNight ? toQ(param('commuteHours')) : 0);
  const travelQ = toQ(plan.travelHours);
  const delegated = plan.work.filter((w) => w.delegateId !== null);
  let kept = plan.work.filter((w) => w.delegateId === null);
  const dropped: WorkItem[] = [];
  let sleepQ = Math.max(0, toQ(plan.sleepHours));
  const homeCap = plan.facilityNight ? 0 : toQ(plan.homeCapHours ?? param('hoursPerDay'));
  let homeQ = Math.max(0, Math.min(toQ(plan.homeHours), homeCap));
  const workQ = () => kept.reduce((s, w) => s + toQ(w.hours), 0);
  const over = () => workQ() + travelQ + sleepQ + homeQ + needsQ - DAY_Q();
  const floorQ = toQ(param('sleepFloorHours'));
  let tookFromHome = 0, tookFromSleep = 0;
  const order: readonly Give[] = plan.gives && plan.gives.length > 0 ? plan.gives : ['home', 'sleep', 'task'];
  for (const g of order) {
    if (over() <= 0) break;
    if (g === 'home') { const t = Math.min(homeQ, over()); homeQ -= t; tookFromHome += t; }
    // A user's own choice may cut sleep to zero; the default stops at the floor (rule 6).
    if (g === 'sleep') { const lo = plan.gives ? 0 : Math.min(floorQ, sleepQ); const t = Math.min(sleepQ - lo, over()); sleepQ -= t; tookFromSleep += t; }
    if (g === 'task') {
      // Lowest priority first; ties go to the later item. Required blocks are never dropped here.
      const droppable = kept.map((w, i) => ({ w, i })).filter((x) => !x.w.required).sort((a, b) => a.w.priority - b.w.priority || b.i - a.i);
      for (const { w } of droppable) {
        if (over() <= 0) break;
        kept = kept.filter((k) => k !== w);
        dropped.push(w);
      }
    }
  }
  // Anything still over (only required blocks and travel left) comes out of sleep, then home.
  if (over() > 0) { const t = Math.min(sleepQ, over()); sleepQ -= t; tookFromSleep += t; }
  if (over() > 0) { const t = Math.min(homeQ, over()); homeQ -= t; tookFromHome += t; }
  if (over() > 0) throw new Error('life: required work and travel exceed the day');
  const work = workQ();
  const freeQ = DAY_Q() - work - travelQ - sleepQ - homeQ - needsQ;
  return {
    day: { work: fromQ(work), sleep: fromQ(sleepQ), home: fromQ(homeQ), travel: fromQ(travelQ), free: fromQ(freeQ), needs: fromQ(needsQ), bandAtStart },
    outcome: { kept, dropped, delegated, tookFromHome: fromQ(tookFromHome), tookFromSleep: fromQ(tookFromSleep) },
    sleptHours: fromQ(sleepQ),
  };
}

/** Run a week of plans from a starting sleep debt. Pure: the dry run and the real advance both call it. */
export function runWeek(plan: WeekPlan, debtStart: number): WeekResult {
  const days: CoachDay[] = [];
  const outcomes: DayOutcome[] = [];
  const debtByNight: number[] = [];
  let debt = debtStart;
  let slow = 0;
  for (const d of plan.days) {
    const r = resolveDay(d, debt);
    if (r.day.bandAtStart === 'exhausted') slow += param('exhaustedFixedNeedsHours') - param('fixedNeedsHours');
    days.push(r.day);
    outcomes.push(r.outcome);
    debt = nightDebt(debt, { sleptHours: r.sleptHours, ...(d.night ?? {}) });
    debtByNight.push(debt);
  }
  return { week: { days, totals: sumDays(days) }, outcomes, debtStart, debtEnd: debt, debtByNight, slowWorkHours: slow };
}

export function sumDays(days: readonly CoachDay[]): CoachWeek['totals'] {
  const t = { work: 0, sleep: 0, home: 0, travel: 0, free: 0, needs: 0 };
  for (const d of days) { t.work += toQ(d.work); t.sleep += toQ(d.sleep); t.home += toQ(d.home); t.travel += toQ(d.travel); t.free += toQ(d.free); t.needs += toQ(d.needs); }
  return { work: fromQ(t.work), sleep: fromQ(t.sleep), home: fromQ(t.home), travel: fromQ(t.travel), free: fromQ(t.free), needs: fromQ(t.needs) };
}

/** Hours in the week (acceptance 1): seven days of 24. */
export function weekHours(nDays = 7): number { return nDays * param('hoursPerDay'); }

/** E7.7.3 rule 1 and E7.1.2 "AI use": a summary week for an AI coach from weekly totals, spread evenly
 *  over seven days in whole quarters (remainders on the first days). Sums to 168 exactly. */
export function summaryWeek(totals: { work: number; sleepPerNight: number; home: number; travel: number }): CoachWeek {
  const n = 7;
  const spread = (hours: number): number[] => {
    const q = toQ(hours);
    const base = Math.floor(q / n);
    return Array.from({ length: n }, (_, i) => base + (i < q - base * n ? 1 : 0));
  };
  const w = spread(totals.work), h = spread(totals.home), tr = spread(totals.travel);
  const s = toQ(totals.sleepPerNight);
  const needs = toQ(param('fixedNeedsHours'));
  const days: CoachDay[] = [];
  for (let i = 0; i < n; i++) {
    const used = w[i]! + h[i]! + tr[i]! + s + needs;
    if (used > DAY_Q()) throw new Error('life: summary week totals exceed the days');
    days.push({ work: fromQ(w[i]!), sleep: fromQ(s), home: fromQ(h[i]!), travel: fromQ(tr[i]!), needs: fromQ(needs), free: fromQ(DAY_Q() - used), bandAtStart: 'rested' });
  }
  return { days, totals: sumDays(days) };
}

/** Quarter hours per hour, exported for tests and screens. */
export const QUARTERS_PER_HOUR = Q;
