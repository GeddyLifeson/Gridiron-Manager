// Fines and the ladder (L3.2.2), labour agreement model only. The amount filled in never exceeds the step
// maximum, the schedule maximum or the daily cap. The coach may lower it, issue a warning letter in place
// of a first fine, or raise it past a limit: that is warned, allowed and logged (acts.ts), and the player's
// grievance is the detection step (L3.2.5).
import type { DisciplineRules, ScheduleGroup } from './keys.ts';
import { CAMP_WEEK_PAY_GROUPS } from './keys.ts';
import { offence, type TeamRuleRow } from './rules.ts';
import { clamp, lp } from './params.ts';

export type Phase = 'camp' | 'season';

/** Prior offences of the same offence this league year, counting warning letters (Art. 42 Sec. 1(a)). */
export interface OffenceHistory {
  readonly fines: number;
  readonly warningLetters: number;
}

/** 1 for a first offence, 2 second, 3 third and later. A warning letter counts as an offence for the next step. */
export function offenceStep(h: OffenceHistory): 1 | 2 | 3 {
  const n = h.fines + h.warningLetters + 1;
  return n >= 3 ? 3 : n === 2 ? 2 : 1;
}

export interface FineRequest {
  readonly offenceId: string;
  readonly history: OffenceHistory;
  readonly phase: Phase;
  /** Overweight: pounds over. */
  readonly pounds?: number;
  /** Camp or minicamp: which day (1 to 3 for minicamp) and preseason games missed (UFA and option year term). */
  readonly campDay?: number;
  readonly preseasonGamesMissed?: number;
  /** Camp groups differ by contract (veteran, UFA signee, rookie, option year). */
  readonly campGroup?: ScheduleGroup;
  readonly weeklySalaryUsd: number;
  /** Capped fines already issued to the player on this day (L3.2.2 daily cap). */
  readonly sameDayCappedUsd: number;
  /** The published row (penalty share of the maximum). */
  readonly row: TeamRuleRow | null;
}

export interface FineLimits {
  /** Schedule maximum for this occasion (pounds and camp terms included). */
  readonly scheduleMaxUsd: number;
  /** Step maximum: ladder share of the schedule maximum, or the schedule maximum where the ladder does not apply. */
  readonly stepMaxUsd: number;
  /** What is left under the daily cap, or Infinity where the cap does not apply. */
  readonly capRemainingUsd: number;
  /** Amount filled in: published share of the step maximum, never above any limit. */
  readonly filledUsd: number;
  readonly step: 1 | 2 | 3;
  readonly ladder: boolean;
}

function groupFor(req: FineRequest): ScheduleGroup | null {
  const o = offence(req.offenceId);
  if (o.id === 'camp_absence') return req.campGroup ?? 'camp_veteran_day';
  if (o.id === 'minicamp_absence') {
    const d = clamp(Math.round(req.campDay ?? 1), 1, 3);
    return d === 1 ? 'minicamp_day1' : d === 2 ? 'minicamp_day2' : 'minicamp_day3';
  }
  return o.group;
}

/** The limits of one fine (L3.2.2). Throws under the school code model, where there is no fine column. */
export function fineLimits(req: FineRequest, d: DisciplineRules): FineLimits {
  if (d.maxUsd === null || d.ladder === null || d.dailyCapCampUsd === null || d.dailyCapSeasonUsd === null) throw new Error('career.locker_room: no fine schedule under this discipline model (L3.5.1)');
  const o = offence(req.offenceId);
  const g = groupFor(req);
  if (g === null) throw new Error(`career.locker_room: ${o.id} is not a fineable offence (L3.1.1)`);
  let scheduleMax = d.maxUsd[g];
  if (g === 'overweight_per_lb_day') scheduleMax *= Math.max(0, req.pounds ?? 0);
  if (CAMP_WEEK_PAY_GROUPS.includes(g)) scheduleMax += Math.max(0, req.preseasonGamesMissed ?? 0) * req.weeklySalaryUsd;
  const step = offenceStep(req.history);
  const stepMax = o.ladder ? scheduleMax * d.ladder[step - 1]! : scheduleMax;
  const cap = req.phase === 'camp' ? d.dailyCapCampUsd : d.dailyCapSeasonUsd;
  const capRemaining = o.dailyCap ? Math.max(0, cap - req.sameDayCappedUsd) : Infinity;
  const share = clamp(req.row?.penaltyShare ?? 1, 0, 1);
  const filled = Math.min(stepMax * share, capRemaining);
  return { scheduleMaxUsd: scheduleMax, stepMaxUsd: stepMax, capRemainingUsd: capRemaining, filledUsd: Math.floor(filled), step, ladder: o.ladder };
}

export type FineBreach = 'above_step' | 'above_schedule' | 'above_daily_cap' | 'off_list';

/** Which limits an amount the coach chose breaks (each breach is warned before the act, L3.2.2). */
export function fineBreaches(amountUsd: number, lim: FineLimits, offList: boolean): FineBreach[] {
  const out: FineBreach[] = [];
  if (offList) out.push('off_list');
  if (amountUsd > lim.stepMaxUsd && lim.ladder) out.push('above_step');
  if (amountUsd > lim.scheduleMaxUsd) out.push('above_schedule');
  if (amountUsd > lim.capRemainingUsd) out.push('above_daily_cap');
  return out;
}

/** The amount an arbitrator restores on a won grievance: everything above the CBA maximum (L3.2.2, Assumption). */
export function overLimitRefund(amountUsd: number, lim: FineLimits, offList: boolean): number {
  if (offList) return amountUsd;
  return Math.max(0, amountUsd - Math.min(lim.ladder ? lim.stepMaxUsd : lim.scheduleMaxUsd, lim.capRemainingUsd));
}

/**
 * Overweight fines: at most N a week and at least M days apart (L3.1.2). `priorDays` are the league-year
 * days of earlier overweight fines.
 */
export function overweightAllowed(day: number, priorDays: readonly number[], d: DisciplineRules): boolean {
  if (d.overweightWeeklyMax === null || d.overweightMinDaysApart === null) return true;
  const weekStart = day - (day % 7);
  const inWeek = priorDays.filter((p) => p >= weekStart && p <= day).length;
  const tooClose = priorDays.some((p) => Math.abs(day - p) < d.overweightMinDaysApart!);
  return inWeek < d.overweightWeeklyMax && !tooClose;
}

/** Deduction schedule: amounts per pay period, each at most the per-period limit (L3.2.2). Camp fines and suspensions are not limited. */
export function deductionSchedule(amountUsd: number, offenceId: string, d: DisciplineRules): number[] {
  const o = offence(offenceId);
  const lim = d.deductionPerPayPeriodUsd;
  if (!o.payPeriodLimit || lim === null || lim <= 0 || amountUsd <= lim) return amountUsd > 0 ? [amountUsd] : [];
  const out: number[] = [];
  let left = amountUsd;
  while (left > 0) { const take = Math.min(lim, left); out.push(take); left -= take; }
  return out;
}

/** Fine memory for the player: -3 to -8 by the fine as a share of weekly pay (L3.2.2). */
export function fineMemory(amountUsd: number, weeklySalaryUsd: number): number {
  if (amountUsd <= 0) return 0;
  const share = weeklySalaryUsd > 0 ? clamp(amountUsd / weeklySalaryUsd / lp('fine.memoryFullShareOfWeek'), 0, 1) : 1;
  return lp('fine.memoryMin') + (lp('fine.memoryMax') - lp('fine.memoryMin')) * share;
}

/** Whether waiving this camp fine is the L8.2.5 act "waiving a mandatory camp fine" (L3.1.2). Unknown groups count as mandatory. */
export function waiverIsViolation(group: ScheduleGroup, d: DisciplineRules): boolean {
  return d.waivable[group] !== true;
}

/** Year-end youth football line: the least amount that must go to youth football (L3.2.2). Shown, nothing more. */
export function youthFootballLine(collectedUsd: number, d: DisciplineRules): number {
  return d.youthShareMin === null ? 0 : Math.ceil(collectedUsd * d.youthShareMin);
}
