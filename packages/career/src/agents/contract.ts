// L7.2 contract years, holdouts, hold-ins and trade requests. None of these changes an attribute or a
// contest input (L7.2.1, L7.2.4 acceptance): they move needs, memories, readiness and money only. Dollar
// values come from the league's rule set through `DisciplineSchedule` (keys.ts), never from this file.
import { ap, clamp } from './params.ts';
import { mem, type MemoryWrite, type PromiseEntry } from './shared.ts';
import type { AgentStance } from './agents.ts';
import type { ContractClass, DisciplineSchedule, FinedClass } from './keys.ts';
import { EVENT, draft, type DraftMeta, type EventDraft } from './events.ts';

// ---- Contract year (L7.2.1) ----------------------------------------------------------------------------

export interface NeedWeights {
  readonly pay: number;
  readonly security: number;
  readonly playingTime: number;
}

/** Need-weight multipliers in the final contract year, until he signs. Ability is untouched. */
export function contractYearMultipliers(finalYear: boolean): NeedWeights {
  return finalYear
    ? { pay: ap('contractYear.payWeight'), security: ap('contractYear.securityWeight'), playingTime: ap('contractYear.playingTimeWeight') }
    : { pay: 1, security: 1, playingTime: 1 };
}

/** H5 injury-honesty chance raise (points) for a contract-year player with a healthy replacement behind him. */
export function injuryHidingRaise(finalYear: boolean, healthyReplacement: boolean): number {
  return finalYear && healthyReplacement ? ap('contractYear.injuryHidingPoints') : 0;
}

// ---- Holdout trigger and choice (L7.2.2, L7.2.3) --------------------------------------------------------

export interface HoldoutInputs {
  readonly contractClass: ContractClass;
  /** The L1.1.5 "holdout" breakpoint fired this week (stress and loyalty are owned by L1). */
  readonly breakpointFired: boolean;
  readonly payNeedUnmet: boolean;
  readonly agentStance: AgentStance | null;
  /** K7's estimate of what holding out gains him, in dollars. */
  readonly expectedGainUsd: number;
  /** K7's estimate of the holdout's rule cost (fines plus forfeiture), from `holdoutCost`. */
  readonly ruleCostUsd: number;
  readonly yearlyPayUsd: number;
}

export type Withholding = 'holdout' | 'holdin' | null;

/**
 * Whether a player withholds work and how. Only a player under contract with an unmet pay need, whose agent
 * is not favourable, and whose expected gain beats the rule cost; then a hold-in whenever the holdout's rule
 * cost is above 5 percent of his yearly pay (L7.2.3).
 */
export function withholdingChoice(i: HoldoutInputs): Withholding {
  if (i.contractClass === 'unsigned' || !i.breakpointFired || !i.payNeedUnmet) return null;
  if (i.agentStance === 'favourable') return null;
  if (i.expectedGainUsd <= i.ruleCostUsd) return null;
  return i.ruleCostUsd > ap('holdin.costShareOfPay') * i.yearlyPayUsd ? 'holdin' : 'holdout';
}

// ---- Camp fines (L7.2.2) -------------------------------------------------------------------------------

export interface CampFine {
  readonly dailyUsd: number;
  readonly salaryUsd: number;
  readonly totalUsd: number;
  readonly waivable: boolean;
}

export interface CampAbsence {
  readonly daysMissed: number;
  readonly preseasonGamesMissed: number;
  /** One week of regular-season (Paragraph 5) salary. */
  readonly weeklySalaryUsd: number;
}

/** The camp fine for an absence. No fine for an unsigned player or in a league without the rule. */
export function campFine(s: DisciplineSchedule, cls: ContractClass, a: CampAbsence): CampFine {
  if (cls === 'unsigned') return { dailyUsd: 0, salaryUsd: 0, totalUsd: 0, waivable: true };
  const perDay = s.campFineUsd[cls];
  if (perDay === undefined) return { dailyUsd: 0, salaryUsd: 0, totalUsd: 0, waivable: true };
  const dailyUsd = perDay * s.scale * Math.max(0, a.daysMissed);
  const salaryUsd = s.weekSalaryPerPreseasonGame[cls] ? a.weeklySalaryUsd * Math.max(0, a.preseasonGamesMissed) : 0;
  return { dailyUsd, salaryUsd, totalUsd: dailyUsd + salaryUsd, waivable: s.waivable[cls] ?? true };
}

/** The fine posted for camp day `day` (1-based) alone: the daily posting the cost line shows. */
export function campDayPosting(s: DisciplineSchedule, cls: ContractClass, day: number): number {
  if (day < 1 || cls === 'unsigned') return 0;
  return (s.campFineUsd[cls] ?? 0) * s.scale;
}

/** Maximum fine for mandatory minicamp day `day` (1-based); day 3 and after use the last value. */
export function minicampMaxFine(s: DisciplineSchedule, day: number): number {
  if (day < 1 || s.minicampMaxUsd.length === 0) return 0;
  return s.minicampMaxUsd[Math.min(day, s.minicampMaxUsd.length) - 1]! * s.scale;
}

export interface WaiverResult {
  readonly allowed: true;
  /** A non-waivable fine waived or quietly repaid: warned, allowed, logged (L8.2.5, the same for AI clubs). */
  readonly violation: boolean;
  readonly warning: string | null;
}

/** A club reduces, waives or reimburses a camp fine. Always allowed; a mandatory one writes a violation. */
export function waiveCampFine(s: DisciplineSchedule, cls: FinedClass): WaiverResult {
  const waivable = s.waivable[cls] ?? true;
  return waivable
    ? { allowed: true, violation: false, warning: null }
    : { allowed: true, violation: true, warning: 'agents.warn.mandatory_fine' };
}

// ---- Forfeiture (CBA Art. 4 Sec. 9(a), read as maximums the club may take) ------------------------------

export interface ForfeitInputs {
  readonly campDaysMissed: number;
  /** He also missed the first regular-season game. */
  readonly missedFirstGame: boolean;
  /** Regular-season weeks missed in a row. */
  readonly regularWeeksMissed: number;
}

/**
 * Maximum share of the year's forfeitable allocations (signing, roster, option, reporting bonus) the club
 * may take. Camp: none for the free days, then 15 percent plus 1 percent a day, at most 25 percent. Into the
 * season: a further 25 percent of what remains on the first game, then one seventeenth of the year's
 * allocation per week after the fourth week (read as a share of the whole allocation, capped at all of it).
 */
export function forfeitureMaxShare(s: DisciplineSchedule, f: ForfeitInputs): number {
  const fs = s.forfeit;
  if (fs === null) return 0;
  let share = 0;
  if (f.campDaysMissed > fs.campFreeDays) {
    const extra = f.campDaysMissed - (fs.campFreeDays + 1);
    share = Math.min(fs.campMaxShare, fs.campInitialShare + fs.campDailyShare * extra);
  }
  if (f.missedFirstGame) share += fs.firstGameShare * (1 - share);
  const weekly = f.regularWeeksMissed - fs.weeklyAfterWeeks;
  if (f.missedFirstGame && weekly > 0) share += weekly / fs.weeklyDivisor;
  return clamp(share, 0, 1);
}

/** K7's rule-cost estimate for a planned holdout: fines plus maximum forfeiture. */
export function holdoutCost(s: DisciplineSchedule, cls: ContractClass, a: CampAbsence, f: ForfeitInputs, forfeitableUsd: number): number {
  return campFine(s, cls, a).totalUsd + forfeitureMaxShare(s, f) * forfeitableUsd;
}

/** Art. 8 Sec. 1(b): no accrued season for a player under contract who missed his reporting date, absent hardship. */
export function accruedSeasonLost(s: DisciplineSchedule, a: { underContract: boolean; reportedOnMandatoryDate: boolean; hardshipFound: boolean }): boolean {
  return s.noAccruedIfNotReported && a.underContract && !a.reportedOnMandatoryDate && !a.hardshipFound;
}

// ---- The room and the return (L7.2.2, L7.2.3) -----------------------------------------------------------

export interface Teammate {
  readonly personId: number;
  readonly hasPayNeed: boolean;
  /** In his position room, carrying his snaps. */
  readonly carriesHisSnaps: boolean;
  readonly sharesHisAgent: boolean;
}

/** Witness reactions to a holdout after `weeksAway`. Nobody resents a holdout by default. */
export function holdoutWitnessMemories(playerId: number, mates: readonly Teammate[], weeksAway: number): MemoryWrite[] {
  const out: MemoryWrite[] = [];
  for (const t of mates) {
    if (t.personId === playerId) continue;
    if (t.hasPayNeed) out.push(mem(t.personId, playerId, ap('holdout.roomPayNeed'), 'holdout_witness_pay_need'));
    else if (t.carriesHisSnaps && weeksAway > ap('holdout.roomCarryWeeks')) out.push(mem(t.personId, playerId, ap('holdout.roomCarryingSnaps'), 'holdout_witness_carrying'));
  }
  return out;
}

/** The coach criticises a holdout in public: -10 with him, -4 with teammates who share his agent. */
export function publicCriticismMemories(coachId: number, playerId: number, mates: readonly Teammate[]): MemoryWrite[] {
  const out = [mem(playerId, coachId, ap('holdout.publicCriticism'), 'coach_public_criticism')];
  for (const t of mates) if (t.personId !== playerId && t.sharesHisAgent) out.push(mem(t.personId, coachId, ap('holdout.publicCriticismSharedAgent'), 'coach_public_criticism_shared_agent'));
  return out;
}

/** First-day role talk on return halves the absence's negative memories (each row's strength halves). */
export function returnTalk(rows: readonly MemoryWrite[]): MemoryWrite[] {
  const keep = 1 - ap('holdout.returnTalkRemoval');
  return rows.map((r) => (r.delta < 0 ? { ...r, strength: r.strength * keep } : r));
}

/** Share of a full absence's D9 install and timing loss per missed rep. A hold-in attends meetings. */
export function readinessLossShare(kind: 'holdout' | 'holdin'): number {
  return kind === 'holdout' ? ap('holdout.readinessShare') : ap('holdin.readinessShare');
}

/** Hold-in: no camp fine ever posts for a player who is present (L7.2.3 acceptance). */
export function holdinFine(): number {
  return 0;
}

/** Hold-in room reaction: neutral until the first regular-season game is missed, then -2 a week for his room. */
export function holdinRoomMemories(playerId: number, positionRoom: readonly number[], regularGamesMissed: number): MemoryWrite[] {
  if (regularGamesMissed < 1) return [];
  return positionRoom.filter((id) => id !== playerId).map((id) => mem(id, playerId, ap('holdin.roomWeekly'), 'holdin_room'));
}

// ---- Trade requests (L7.2.4) ---------------------------------------------------------------------------

export interface TradeRequestInputs {
  readonly stress: number;
  readonly loyalty: number;
}

/** Fires only past the stress breakpoint with low loyalty (L1.1.5); never below the breakpoint. */
export function tradeRequestFires(i: TradeRequestInputs): boolean {
  return i.stress > ap('trade.stressBreakpoint') && i.loyalty < ap('trade.loyaltyLow');
}

/** Public if his trust in the coach is under 30, or his agent is combative and hostile; else private. */
export function tradeRequestVenue(trustInCoach: number, agentStyle: number | null, stance: AgentStance | null): 'public' | 'private' {
  if (trustInCoach < ap('trade.publicTrustBelow')) return 'public';
  if (agentStyle !== null && agentStyle >= ap('style.combative') && stance === 'hostile') return 'public';
  return 'private';
}

export type TradeAnswer = 'promise_role' | 'pass_to_gm' | 'refuse_with_reason' | 'say_nothing';

export interface TradeAnswerOutcome {
  readonly trustDelta: number;
  readonly promise: PromiseEntry | null;
  /** Trust cost written later if the promise breaks (L1.3.1 judges the break). */
  readonly brokenCost: number;
}

export function answerTradeRequest(kind: TradeAnswer, coachId: number, playerId: number, statedRole: string | null = null, byWeek: number | null = null): TradeAnswerOutcome {
  const p = (about: PromiseEntry['about'], keptAtOnce: boolean): PromiseEntry =>
    ({ promiserId: coachId, holderId: playerId, about, statedRole, byWeek, strength: 1, keptAtOnce, unfunded: false, cause: 'trade_request_answer' });
  switch (kind) {
    case 'promise_role': return { trustDelta: 0, promise: p('role', false), brokenCost: ap('trade.hopefulBrokenCost') };
    case 'pass_to_gm': return { trustDelta: 0, promise: p('pass_to_gm', true), brokenCost: 0 };
    case 'refuse_with_reason': return { trustDelta: ap('trade.refuseCost'), promise: null, brokenCost: 0 };
    case 'say_nothing': return { trustDelta: 0, promise: null, brokenCost: 0 };
  }
}

export interface TradeRequestState {
  readonly playerId: number;
  readonly venue: 'public' | 'private';
  readonly open: boolean;
  readonly weeksNeedMet: number;
}

export interface TradeWeek {
  readonly state: TradeRequestState;
  readonly withdrawn: boolean;
  readonly stressInflow: number;
  readonly memories: readonly MemoryWrite[];
}

/**
 * One week of an open request: withdrawn with a positive memory once his need has been met six weeks in a
 * row; after the trade deadline an unresolved one stays to the offseason and adds 1 a week to stress inflow.
 */
export function tradeRequestWeek(s: TradeRequestState, coachId: number, needMetThisWeek: boolean, afterDeadline: boolean): TradeWeek {
  if (!s.open) return { state: s, withdrawn: false, stressInflow: 0, memories: [] };
  const weeksNeedMet = needMetThisWeek ? s.weeksNeedMet + 1 : 0;
  if (weeksNeedMet >= ap('trade.resolvedWeeks')) {
    return { state: { ...s, open: false, weeksNeedMet }, withdrawn: true, stressInflow: 0, memories: [mem(s.playerId, coachId, ap('trade.resolvedMemory'), 'trade_request_resolved')] };
  }
  return { state: { ...s, weeksNeedMet }, withdrawn: false, stressInflow: afterDeadline ? ap('trade.postDeadlineStress') : 0, memories: [] };
}

/** Events for a new request: a public one always makes one media story and one L2.5.1 room event (L7.2.4). */
export function tradeRequestEvents(venue: 'public' | 'private', via: 'agent' | 'player', meta: DraftMeta, teamId: number, playerId: number, coachId: number): EventDraft[] {
  return venue === 'public'
    ? [draft(EVENT.tradeRequestPublic, meta, teamId, [{ personId: playerId, role: 'requester' }], null, { via })]
    : [draft(EVENT.tradeRequestPrivate, meta, teamId, [{ personId: playerId, role: 'requester' }, { personId: coachId, role: 'coach' }], null, { via })];
}
