// Special cases (L1.4) and the college contribution (L1.5.1): the quarterback's shared language with his
// caller, injury reporting, cut-day delivery, late-season incentives, and L1's share of transfer risk.
import type { WorldDate } from '@gm/schema';
import { clamp, weeksBetween } from './math.ts';
import { pp } from './params.ts';
import type { LedgerPromise } from './promises.ts';
import type { RelationshipRecord } from './record.ts';

// L1.4.1 the quarterback

/** `shared_language` per caller and quarterback pair, 0 to 100 (L1.4.1). Survives a benching and return. */
export interface SharedLanguage {
  readonly callerId: number;
  readonly quarterbackId: number;
  readonly value: number;
  /** Consecutive weeks his input was ignored (H4 hook). */
  readonly ignoredWeeks: number;
}

export function newSharedLanguage(callerId: number, quarterbackId: number): SharedLanguage {
  return { callerId, quarterbackId, value: 0, ignoredWeeks: 0 };
}

export interface QbWeek {
  readonly meetingHeld: boolean;
  readonly gamesTogether: number;
  /** His input was taken in the meeting (a sheet edit from him, G7). */
  readonly inputTaken: boolean;
}

/**
 * One week (L1.4.1): +2 per meeting held, +1 per game together. Ignoring his input three weeks running
 * writes a -10 trust memory (returned as `ignoredMemory`) and restarts the count.
 */
export function qbWeek(s: SharedLanguage, w: QbWeek): { state: SharedLanguage; ignoredMemory: boolean } {
  const gain = (w.meetingHeld ? pp('qb.perMeeting') : 0) + w.gamesTogether * pp('qb.perGame');
  let ignored = w.meetingHeld && !w.inputTaken ? s.ignoredWeeks + 1 : w.inputTaken ? 0 : s.ignoredWeeks;
  const fire = ignored >= pp('qb.ignoredWeeks');
  if (fire) ignored = 0;
  return { state: { ...s, value: clamp(s.value + gain, 0, pp('record.scaleMax')), ignoredWeeks: ignored }, ignoredMemory: fire };
}

/** A change of caller or system: -10 (L1.4.1). */
export function callerOrSystemChange(s: SharedLanguage): SharedLanguage {
  return { ...s, value: clamp(s.value - pp('qb.changeDrop'), 0, pp('record.scaleMax')) };
}

/** Readiness bonus on plays he asked for (L1.4.1, read by D9). */
export function askedPlayReadiness(asked: boolean): number {
  return asked ? pp('qb.askedReadiness') : 0;
}

// L1.4.2 injured players

export interface ReportInputs {
  /** Base from his injury-honesty trait (D5). */
  readonly base: number;
  readonly trust: number;
  /** A teammate was pressured to play hurt in the last 8 weeks and he remembers it. */
  readonly teammatePressuredDates: readonly WorldDate[];
  readonly today: WorldDate;
  readonly contractYear: boolean;
}

/** report_propensity = base + 0.3 * (trust - 50) - 15 if a teammate was pressured within 8 weeks - 10 in a contract year (L1.4.2). */
export function reportPropensity(i: ReportInputs): number {
  const recent = i.teammatePressuredDates.some((d) => { const w = weeksBetween(d, i.today); return w >= 0 && w < pp('injury.pressuredWindowWeeks'); });
  return clamp(i.base + pp('injury.trustWeight') * (i.trust - 50) + (recent ? pp('injury.teammatePressured') : 0) + (i.contractYear ? pp('injury.contractYear') : 0), 0, pp('record.scaleMax'));
}

export type ReturnChoice = 'hold_out' | 'limited' | 'full' | 'play_through';

export interface ReturnDecision {
  /** Memories: for him and, when he is pressured, for witnesses. */
  readonly playerMemory: string | null;
  readonly witnessMemory: string | null;
  /** A flag to L8 when the medical staff objected in writing (L1.4.2). */
  readonly flagToLeague: boolean;
  /** Returning a player the concussion protocol has not cleared: offered with a warning, logged once as a violation and sent to L8.2.5 (L1.4.2 acceptance). */
  readonly protocolViolation: boolean;
  readonly warningKey: string | null;
}

/** The choice at return time (L1.4.2, H5.3). Nothing is blocked: a breach warns and is sent on. */
export function returnDecision(choice: ReturnChoice, againstMedicalAdvice: boolean, medicalObjectedInWriting: boolean, concussionUncleared: boolean): ReturnDecision {
  const pressing = choice === 'play_through' || ((choice === 'full' || choice === 'limited') && againstMedicalAdvice);
  const violation = concussionUncleared && choice !== 'hold_out';
  return {
    playerMemory: pressing ? 'pressured_play_hurt' : null,
    witnessMemory: pressing ? 'teammate_pressured_hurt' : null,
    flagToLeague: pressing && medicalObjectedInWriting,
    protocolViolation: violation,
    warningKey: violation ? 'players.injury.concussion_protocol_warning' : pressing ? 'players.injury.against_advice_warning' : null,
  };
}

// L1.4.3 release and cut day

export type Deliverer = 'head_coach_in_person' | 'general_manager' | 'position_coach' | 'staffer_no_word' | 'media_first';

/** Exactly one delivery record per release (L1.4.3 acceptance). Kept on the person after he leaves. */
export interface DeliveryRecord {
  readonly playerId: number;
  readonly date: WorldDate;
  readonly deliverer: Deliverer;
  readonly memoryKind: string;
  /** Veterans with more than 4 accrued seasons weigh it 1.5 times. */
  readonly scale: number;
  /** Passed to L7 (agents) and E5 (reputation with players). */
  readonly agentEvent: boolean;
}

/**
 * Who told him (L1.4.3). A leak before the talk forces "media first" unless the user spoke to him the same
 * day. Strengths: head coach in person +10, GM or position coach in person 0, staffer -15, media -30.
 */
export function deliverRelease(playerId: number, date: WorldDate, chosen: Deliverer, accruedSeasons: number, leakedBeforeTalk: boolean, talkedSameDay: boolean): DeliveryRecord {
  const deliverer: Deliverer = leakedBeforeTalk && !talkedSameDay ? 'media_first' : chosen;
  const memoryKind = deliverer === 'head_coach_in_person' ? 'cut_head_coach_in_person'
    : deliverer === 'general_manager' || deliverer === 'position_coach' ? 'cut_staff_in_person'
      : deliverer === 'staffer_no_word' ? 'cut_staffer_no_word' : 'cut_media_first';
  return { playerId, date, deliverer, memoryKind, scale: accruedSeasons > pp('release.veteranSeasons') ? pp('release.veteranWeight') : 1, agentEvent: true };
}

// L1.4.4 contract incentives late in the year

export interface IncentiveState {
  readonly playerId: number;
  /** What he still needs ("needs 38 yards"), in the incentive's own unit. */
  readonly gap: number;
  /** His season rate per game in that unit. */
  readonly seasonRatePerGame: number;
  readonly gamesLeft: number;
  readonly weeksLeft: number;
}

/**
 * Flag a player within reach (L1.4.4): only in the final three weeks, only where players hold contracts,
 * and only when the gap is reachable at his season rate times 1.5 in the games left.
 */
export function incentiveFlag(s: IncentiveState, playerContracts: boolean): boolean {
  if (!playerContracts || s.gap <= 0 || s.weeksLeft > pp('incentive.finalWeeks')) return false;
  return s.gap <= s.seasonRatePerGame * pp('incentive.reachRate') * s.gamesLeft;
}

/**
 * The season-end memory (L1.4.4): reached with visible help +12 (usage in the final two games at or above
 * his season average), missed while healthy and benched late -15, otherwise nothing.
 */
export function incentiveMemory(reached: boolean, finalUsage: readonly number[], seasonAverageUsage: number, healthy: boolean): string | null {
  const last = finalUsage.slice(-pp('incentive.helpGames'));
  const helped = last.length === pp('incentive.helpGames') && last.every((u) => u >= seasonAverageUsage);
  if (reached && helped) return 'incentive_reached_helped';
  if (!reached && healthy && !helped) return 'incentive_missed_benched';
  return null;
}

// L1.5.1 the college player

/**
 * L1's contribution to transfer risk (L1.5.1): 0.4 * (60 - role_belief) + 0.3 * (50 - trust) + 20 per promise
 * broken in the last year, floored at 0. T6 owns the full formula.
 */
export function transferRiskContribution(r: RelationshipRecord, promises: readonly LedgerPromise[], brokenOn: ReadonlyMap<number, WorldDate>, today: WorldDate): number {
  let broken = 0;
  for (const p of promises) {
    if (p.toPersonId !== r.holderId || p.status !== 'broken') continue;
    const d = brokenOn.get(p.id);
    if (d && weeksBetween(d, today) < pp('transfer.brokenWindowWeeks')) broken++;
  }
  const v = pp('transfer.roleBeliefWeight') * (pp('transfer.roleBeliefMid') - r.roleBelief)
    + pp('transfer.trustWeight') * (pp('transfer.trustMid') - r.trust)
    + broken * pp('transfer.perBrokenPromise');
  return Math.max(0, v);
}
