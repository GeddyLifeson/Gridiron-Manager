// Event types the market writes (X2). All are football career events open to imported people (L9.1.2);
// openings, interims and promotions reuse career/positions (job_opened, interim_named, promoted_within)
// and staff hires reuse career/staff.
import { EventTypeDef, type WorldEvent } from '@gm/schema';
import { MODULE } from './params.ts';
import type { DraftMeta } from '../staff/events.ts';

export const EVENT = {
  applied: 'market_applied',
  offer: 'market_offer_made',
  offerExpired: 'market_offer_expired',
  agreed: 'market_agreed_in_principle',
  accepted: 'market_offer_accepted',
  backedOut: 'market_backed_out',
  tradeAgreed: 'coach_trade_agreed',
  sign: 'hot_seat_sign',
  condition: 'job_condition_set',
  conditionResult: 'job_condition_result',
  sacrifice: 'staff_sacrifice',
  fired: 'coach_fired',
  resigned: 'coach_resigned',
  yearOut: 'year_out_activity',
  retired: 'coach_retired',
} as const;

const base = { family: 'career', importedAllowed: true, minTier: 1, compactable: true } as const;
const neg = 'professional_negative' as const;

export const MARKET_EVENT_TYPES: readonly EventTypeDef[] = [
  { ...base, id: EVENT.applied, harmClass: 'none', payloadSchema: { openingId: 'id', route: 'string' }, witnessRule: 'team', lineTemplate: 'market.line.applied', consumers: [MODULE] },
  { ...base, id: EVENT.offer, harmClass: 'none', payloadSchema: { openingId: 'id', offerId: 'id' }, witnessRule: 'team', lineTemplate: 'market.line.offer', consumers: [MODULE, 'career.contract'] },
  { ...base, id: EVENT.offerExpired, harmClass: 'none', payloadSchema: { offerId: 'id' }, witnessRule: 'team', lineTemplate: 'market.line.offer_expired', consumers: [MODULE] },
  { ...base, id: EVENT.agreed, harmClass: 'none', payloadSchema: { offerId: 'id' }, witnessRule: 'team', lineTemplate: 'market.line.agreed', consumers: [MODULE, 'career.media'] },
  { ...base, id: EVENT.accepted, harmClass: 'none', payloadSchema: { offerId: 'id' }, witnessRule: 'public', lineTemplate: 'market.line.accepted', consumers: [MODULE, 'career.contract', 'career.reputation'] },
  { ...base, id: EVENT.backedOut, harmClass: neg, payloadSchema: { offerId: 'id' }, witnessRule: 'public', lineTemplate: 'market.line.backed_out', consumers: [MODULE, 'career.reputation'] },
  { ...base, id: EVENT.tradeAgreed, harmClass: 'none', payloadSchema: { fromTeamId: 'id', toTeamId: 'id', points: 'number' }, witnessRule: 'public', lineTemplate: 'market.line.trade', consumers: [MODULE, 'league.draft', 'career.reputation'] },
  { ...base, id: EVENT.sign, harmClass: 'none', payloadSchema: { sign: 'string' }, witnessRule: 'team', lineTemplate: 'market.line.sign', consumers: [MODULE, 'career.media'] },
  { ...base, id: EVENT.condition, harmClass: 'none', payloadSchema: { kind: 'string', deadlineWeek: 'number' }, witnessRule: 'team', lineTemplate: 'market.line.condition', consumers: [MODULE] },
  { ...base, id: EVENT.conditionResult, harmClass: 'none', payloadSchema: { conditionId: 'id', result: 'string' }, witnessRule: 'team', lineTemplate: 'market.line.condition_result', consumers: [MODULE] },
  { ...base, id: EVENT.sacrifice, harmClass: neg, payloadSchema: { releasedId: 'id', ownerRequired: 'boolean' }, witnessRule: 'public', lineTemplate: 'market.line.sacrifice', consumers: [MODULE, 'career.staff'] },
  { ...base, id: EVENT.fired, harmClass: neg, payloadSchema: { seatId: 'id', forCause: 'boolean', midSeason: 'boolean' }, witnessRule: 'public', lineTemplate: 'market.line.fired', consumers: [MODULE, 'career.reputation', 'career.contract'] },
  { ...base, id: EVENT.resigned, harmClass: 'none', payloadSchema: { seatId: 'id', reason: 'string' }, witnessRule: 'public', lineTemplate: 'market.line.resigned', consumers: [MODULE, 'career.reputation', 'career.contract'] },
  { ...base, id: EVENT.yearOut, harmClass: 'none', payloadSchema: { activity: 'string' }, witnessRule: 'team', lineTemplate: 'market.line.year_out', consumers: [MODULE] },
  { ...base, id: EVENT.retired, harmClass: 'none', payloadSchema: { age: 'number' }, witnessRule: 'public', lineTemplate: 'market.line.retired', consumers: [MODULE, 'career.reputation'] },
].map((t) => EventTypeDef.parse(t));

export type EventDraft = Omit<WorldEvent, 'id' | 'notability'>;

const WITNESS: Readonly<Record<string, string>> = Object.fromEntries(MARKET_EVENT_TYPES.map((t) => [t.id, t.witnessRule]));

/** Build an event draft; `causeId` links an offer or firing to the log row that caused it. */
export function draft(type: string, meta: DraftMeta, teamId: number, personId: number | null, role: string, payload: EventDraft['payload'], causeId: number | null = null): EventDraft {
  return {
    type,
    when: { date: meta.date, period: null, clockTenths: null },
    competitionId: meta.competitionId,
    where: { teamId, venueId: null },
    actors: personId === null ? [] : [{ personId, role }],
    subjects: [],
    payload,
    witnesses: WITNESS[type] === 'team' ? { kind: 'team', teamId } : { kind: 'public' },
    causeId,
    tier: meta.tier,
    source: meta.source,
  };
}
