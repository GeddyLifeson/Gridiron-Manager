// L8.1.1 community events. Requests cost hours and their only effects are relationship events: fan
// mood and a memory with whoever asked. No event writes an attribute, team culture or any contest
// input (acceptance); the orders below have no such kind. Every attended event charges its hours.
import type { WorldDate } from '@gm/schema';
import { compliance } from '@gm/league';
import type { Order } from '../crisis/orders.ts';
import type { StreamFor } from '../crisis/events.ts';
import { param } from './params.ts';

export type AskerKind = 'owner' | 'athletic_director' | 'booster' | 'player' | 'community_office';

export interface Asker { readonly kind: AskerKind; readonly personId: number }

export interface CommunityRequest {
  readonly id: string;
  readonly teamId: number;
  readonly asker: Asker;
  readonly date: WorldDate;
  readonly minutes: number;
  /** A player's own charity event (the L1.1.2 personal-kindness class when the head coach goes). */
  readonly playerCharity: boolean;
}

export interface RequestWeek {
  readonly inSeason: boolean;
  /** L8.1.1 edge case: a crisis week suppresses requests. */
  readonly crisisThisWeek: boolean;
  /** The next kickoff, if one is scheduled; no request lands inside the hours before it (H7.3.3 rule). */
  readonly nextKickoff: WorldDate | null;
}

/** The weekly chance of a request: the monthly frequency spread over the weeks of the year. */
export function weeklyRequestChance(inSeason: boolean): number {
  const perMonth = param(inSeason ? 'events.perMonthInSeason' : 'events.perMonthOffseason');
  return Math.min(1, (perMonth * param('events.monthsPerYear')) / compliance.weeksPerYear());
}

/** True when a request dated `date` would fall inside the no-request hours before kickoff. */
export function tooCloseToKickoff(date: WorldDate, kickoff: WorldDate | null): boolean {
  if (kickoff === null) return false;
  const daysBefore = compliance.daysBetween(date, kickoff);
  return daysBefore >= 0 && daysBefore * 24 < param('events.noRequestHoursBeforeKickoff') + 24;
}

/**
 * Draw this week's request for one team, or null. The asker is picked from the community office's
 * calendar and the people who may ask (owner or athletic director, boosters, players with their own events).
 */
export function drawRequest(teamId: number, date: WorldDate, week: RequestWeek, askers: readonly (Asker & { readonly ownEvent?: boolean })[], stream: StreamFor): CommunityRequest | null {
  if (week.crisisThisWeek || askers.length === 0) return null;
  const day = compliance.dayNumber(date);
  const s = stream(['community', 'request', teamId, day]);
  if (!s.chance(weeklyRequestChance(week.inSeason))) return null;
  const a = askers[s.int(0, askers.length - 1)]!;
  const reqDate = compliance.addDays(date, s.int(0, 6));
  if (tooCloseToKickoff(reqDate, week.nextKickoff)) return null;
  const minutes = s.int(param('events.minMinutes'), param('events.maxMinutes'));
  return { id: `${teamId}:${day}`, teamId, asker: { kind: a.kind, personId: a.personId }, date: reqDate, minutes, playerCharity: a.kind === 'player' && a.ownEvent === true };
}

export type CommunityDecision = 'attend' | 'stand_in' | 'move' | 'decline';

export interface DecisionContext {
  readonly coachId: number;
  readonly coachIsHeadCoach: boolean;
  readonly standInId: number | null;
  /** L5.1.1 / L5.4.1 profile: the owner or athletic director values public presence. */
  readonly ownerValuesPresence: boolean;
  /** Declines of the owner's own requests already this season, before this one. */
  readonly ownerDeclinesThisSeason: number;
}

export interface CommunityRecord {
  readonly requestId: string;
  readonly decision: CommunityDecision;
  readonly by: number | null;
}

/** Apply a decision: the record and the orders for the owning systems (E7 hours, L6.5.1 fan mood, L1 memory). */
export function decideRequest(req: CommunityRequest, decision: CommunityDecision, ctx: DecisionContext): { readonly record: CommunityRecord; readonly orders: Order[] } {
  const orders: Order[] = [];
  const asker = req.asker.personId;
  if (decision === 'attend') {
    orders.push({ kind: 'hours', personId: ctx.coachId, minutes: req.minutes, what: `community:${req.id}` });
    orders.push({ kind: 'fan_mood', teamId: req.teamId, delta: param('events.attendFanMood') });
    if (req.playerCharity && ctx.coachIsHeadCoach) {
      orders.push({ kind: 'memory', holderId: asker, aboutId: ctx.coachId, memoryClass: 'personal_kindness', amount: param('events.playerCharityMemory'), halfLifeWeeks: param('events.playerCharityHalfLifeWeeks'), sourceEventId: null });
    } else {
      orders.push({ kind: 'memory', holderId: asker, aboutId: ctx.coachId, memoryClass: 'showed_up', amount: param('events.attendMemory'), halfLifeWeeks: null, sourceEventId: null });
    }
    return { record: { requestId: req.id, decision, by: ctx.coachId }, orders };
  }
  if (decision === 'stand_in') {
    if (ctx.standInId === null) throw new Error('community: a stand-in needs a person');
    const share = param('events.standInShare');
    orders.push({ kind: 'hours', personId: ctx.standInId, minutes: req.minutes, what: `community:${req.id}` });
    orders.push({ kind: 'fan_mood', teamId: req.teamId, delta: param('events.attendFanMood') * share });
    // L8.5.1: the stand-in's appearance writes the half-strength memory in his own name.
    orders.push({ kind: 'memory', holderId: asker, aboutId: ctx.standInId, memoryClass: 'showed_up', amount: param('events.attendMemory') * share, halfLifeWeeks: null, sourceEventId: null });
    return { record: { requestId: req.id, decision, by: ctx.standInId }, orders };
  }
  if (decision === 'move') return { record: { requestId: req.id, decision, by: null }, orders };
  const ownerAsked = req.asker.kind === 'owner' || req.asker.kind === 'athletic_director';
  const hard = ownerAsked && ctx.ownerValuesPresence && ctx.ownerDeclinesThisSeason + 1 >= param('events.ownerDeclineCount');
  orders.push({ kind: 'memory', holderId: asker, aboutId: ctx.coachId, memoryClass: 'declined_request', amount: param(hard ? 'events.declineOwnerThirdMemory' : 'events.declineMemory'), halfLifeWeeks: null, sourceEventId: null });
  return { record: { requestId: req.id, decision, by: null }, orders };
}

/** L8.1.1 foundation: one positive notability event a year (E6 owns its money). */
export function foundationYear(coachId: number, teamId: number | null): Order {
  return { kind: 'notability', personId: coachId, teamId, what: 'foundation', score: param('foundation.notability') };
}
