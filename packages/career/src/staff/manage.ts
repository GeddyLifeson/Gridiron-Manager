// Managing the staff (L4.3.2 to L4.3.6, L4.4.3). Autonomy is computed from settings and edits, never set
// (L4.3.2 acceptance); hours buy work with diminishing returns and wear people down (L4.3.5); delegated
// areas leave the head coach less to see at the game (L4.3.6); what reaches him is a derived propensity,
// never a stored loyalty (L4.4.3). Good staff means less work for the head coach (Marlon's ruling): every
// task a held chair owns is one he does not do, at the price of `coach_prep` in that area.
import { clamp, param } from './params.ts';
import type { RelationRecord } from './record.ts';

// ---------- autonomy (L4.3.2) ----------

export type AutonomySetting = 'he_decides' | 'he_proposes' | 'i_do_it';

export interface TaskAutonomy {
  readonly task: string;
  readonly setting: AutonomySetting;
  /** Proposals he made on this task in the window, and how many the head coach changed. */
  readonly proposals: number;
  readonly changed: number;
}

/** `autonomy_given` 0 to 100: decided tasks count fully, proposed tasks by the share left unchanged. */
export function autonomyGiven(tasks: readonly TaskAutonomy[]): number {
  if (tasks.length === 0) return 0;
  let s = 0;
  for (const t of tasks) {
    if (t.setting === 'he_decides') s += 1;
    else if (t.setting === 'he_proposes') s += t.proposals > 0 ? 0.5 * (1 - clamp(t.changed / t.proposals, 0, 1)) : 0.5;
  }
  return (100 * s) / tasks.length;
}

/** L4.3.2: the autonomy need is unmet when what he is given is 30 or more below what he needs (need 0 to 100). */
export const autonomyUnmet = (need: number, given: number): boolean => need - given >= param('autonomy.unmetGap');

export interface RoomState {
  /** Room `coach_bond` with its position coach (L2.1.2). */
  readonly coachBond: number;
  /** Players' average buy_in toward the head coach. */
  readonly buyInToHeadCoach: number;
  /** Consecutive weeks coach_bond has been under the tuned-out line. */
  readonly weeksBondLow: number;
}

/** A room that follows its position coach hears the head coach at half weight (L4.3.2). */
export function headCoachMessageWeight(r: RoomState): number {
  return r.coachBond > param('room.followBondAbove') && r.buyInToHeadCoach < param('room.followBuyInBelow') ? param('room.followMessageWeight') : 1;
}

/** Advance the tuned-out counter one week. */
export function roomWeek(r: RoomState, coachBond: number, buyInToHeadCoach: number): RoomState {
  return { coachBond, buyInToHeadCoach, weeksBondLow: coachBond < param('room.tunedOutBondBelow') ? r.weeksBondLow + 1 : 0 };
}

/** The room has tuned out its own coach: bond under 30 for four straight weeks (L4.3.2). */
export const roomTunedOut = (r: RoomState): boolean => r.weeksBondLow >= param('room.tunedOutWeeks');

// ---------- disagreement (L4.3.3) ----------

export interface ObjectionHistory {
  /** Outcomes of his objections, oldest first. */
  readonly outcomes: readonly ('accepted' | 'overruled_reason' | 'overruled_no_reason' | 'more_asked')[];
  readonly weeksSinceAnyObjection: number;
}

/**
 * Gap (0 to 1) between his evaluation and the plan above which he speaks up. Falls with trust, rises after three
 * dismissals. With `respect` (his respect for the head coach's football knowledge, L1.1.1) it also rises as the
 * head coach's calls prove out: a coordinator gives a proven head coach the benefit of the doubt on close calls,
 * and pushes back sooner on one he does not yet believe in (plans/head-coach-nuance.md item 5).
 */
export function objectionThreshold(trust: number, h: ObjectionHistory, respect?: number): number {
  const run = param('object.dismissedRun');
  const last = h.outcomes.slice(-run);
  const dismissed = last.length === run && last.every((o) => o === 'overruled_no_reason');
  const proven = respect === undefined ? 0 : param('object.respectSlope') * (clamp(respect, 0, 100) - 50) / 50;
  return clamp(param('object.baseThreshold') - param('object.trustSlope') * (clamp(trust, 0, 100) - 50) / 50 + proven + (dismissed ? param('object.dismissedRaise') : 0), 0, 1);
}

export const raisesObjection = (gap: number, trust: number, h: ObjectionHistory, respect?: number): boolean => gap > objectionThreshold(trust, h, respect);

export type ObjectionAnswer = 'accept' | 'overrule_reason' | 'overrule_no_reason' | 'more_asked';

export interface ObjectionEffect { readonly trustDelta: number; readonly heardMet: boolean }

export function answerObjection(a: ObjectionAnswer): ObjectionEffect {
  if (a === 'overrule_no_reason') return { trustDelta: param('object.overruleNoReasonTrust'), heardMet: false };
  return { trustDelta: 0, heardMet: a === 'accept' };
}

/**
 * When the evidence settles it (N3): his respect for the head coach moves by 2 in the direction of who was
 * right on a decision the head coach made against him (or with him).
 */
export function provenRight(assistantWasRight: boolean, headCoachFollowedHim: boolean): number {
  const p = param('object.provenRespect');
  if (headCoachFollowedHim) return assistantWasRight ? p : -p;
  return assistantWasRight ? -p : p;
}

/** "No objections raised in N weeks" (weekly staff summary warning). */
export const silentStaffWarning = (weeksSinceAnyObjection: number): boolean => weeksSinceAnyObjection >= param('object.silentWeeksWarning');

/** Headset: one push per series at most. */
export const mayPushOnHeadset = (pushesThisSeries: number): boolean => pushesThisSeries < param('object.headsetPushesPerSeries');

/** Disagreement goes public only under the trust floor and past a stress breakpoint (L4.3.3 acceptance). */
export const mayGoPublic = (trust: number, stressPastBreakpoint: boolean): boolean => trust < param('object.publicTrustBelow') && stressPastBreakpoint;

// ---------- developing assistants (L4.3.4) ----------

export type DevelopmentAct = 'preseason_calling' | 'present_situation' | 'own_package' | 'title' | 'recommend';

/** A caller with few games called makes more clock and personnel errors (I5 hazards) for his first 8. */
export const noviceCaller = (gamesCalled: number): boolean => gamesCalled < param('develop.noviceGamesCalled');

/**
 * Position coach effect on his room's weekly knowledge and technique gain (D9), from how his past rooms
 * progressed against the league (ratio, 1 = average). Clamped to 0.95 to 1.05, Assumption (0 sources).
 */
export function developmentFactor(pastRoomGainRatio: number | null): number {
  if (pastRoomGainRatio === null) return 1;
  return clamp(1 + param('develop.factorSlope') * (pastRoomGainRatio - 1), param('develop.factorMin'), param('develop.factorMax'));
}

// ---------- hours and burnout (L4.3.5) ----------

export type HoursSetting = 'standard' | 'long' | 'all_in';

export function hoursFor(setting: HoursSetting, override?: number, shortWeekCap?: number): number {
  const h = override ?? (setting === 'standard' ? param('hours.standard') : setting === 'long' ? param('hours.long') : param('hours.allIn'));
  return shortWeekCap === undefined ? h : Math.min(h, shortWeekCap);
}

/** Productive hours: past 80 each hour returns half as much. */
export function productiveHours(hours: number): number {
  const t = param('hours.diminishAbove');
  return hours <= t ? hours : t + param('hours.diminishFactor') * (hours - t);
}

/** Stress inflow for one coach for one week (fed to the L1.1.5 / X5 stress engine). */
export function hoursStress(hours: number, familyNeedUnmet: boolean): number {
  return Math.max(0, hours - param('hours.standard')) * param('hours.stressPerHourOverStandard') + (familyNeedUnmet ? param('hours.familyNeedStress') : 0);
}

export interface TaskLoad { readonly task: string; readonly ownerPersonId: number; readonly hours: number }

export interface TaskCoverage { readonly task: string; readonly done: number; readonly short: boolean }

/**
 * Spread each coach's productive hours over the tasks he owns in list order. A task without hours is done
 * thin (the report has fewer plays charted, the meeting is shorter); none completes without hours.
 */
export function coverTasks(loads: readonly TaskLoad[], hoursByPerson: ReadonlyMap<number, number>): readonly TaskCoverage[] {
  const left = new Map([...hoursByPerson].map(([p, h]) => [p, productiveHours(h)] as const));
  return loads.map((l) => {
    const have = left.get(l.ownerPersonId) ?? 0;
    const used = Math.min(have, l.hours);
    left.set(l.ownerPersonId, have - used);
    const done = l.hours <= 0 ? 1 : used / l.hours;
    return { task: l.task, done, short: done < 1 };
  });
}

// ---------- delegation has a cost (L4.3.6) ----------

/**
 * `coach_prep[area]`: share of the area's film and plan he did or reviewed himself this week. Reviewing a
 * delegated plan raises it by the reviewed share.
 */
export function coachPrep(ownShare: number, delegatedShare: number, reviewedShareOfDelegated: number): number {
  return clamp(ownShare + delegatedShare * clamp(reviewedShareOfDelegated, 0, 1), 0, 1);
}

/** I7 detail tier for an area: a fully delegated area shows only the summary (L4.3.6 acceptance). */
export function sidelineTier(prep: number): 'summary' | 'partial' | 'full' {
  if (prep <= 0) return 'summary';
  return prep < 1 ? 'partial' : 'full';
}

// ---------- leaks and loyalty (L4.4.3) ----------

/**
 * `report_up` per incident (0 to 1): base from his facets plus 0.4 x (trust - 50), clamped 5 to 95 percent.
 * A position coach protecting his room (bond high, trust in the head coach low) reports less.
 */
export function reportUp(basePercent: number, r: RelationRecord, room?: RoomState): number {
  let pct = basePercent + param('report.trustSlope') * (r.trust - 50);
  if (room && room.coachBond > param('room.followBondAbove') && r.trust < param('room.followBuyInBelow')) pct -= param('report.protectRoomCut');
  return clamp(pct, param('report.min'), param('report.max')) / 100;
}
