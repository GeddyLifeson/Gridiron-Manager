// Event types the staff module writes (L4.2 to L4.4, L4.6.1), all ordinary career events open to imported
// people (football events only, L9.1.2). Departures, interims and promotions reuse the positions module's
// types (staff_released, interim_named, promoted_within).
import { EventTypeDef, type WorldDate, type WorldEvent, type WorldTier } from '@gm/schema';
import { MODULE } from './params.ts';

export const EVENT = {
  interviewed: 'staff_interviewed',
  hired: 'staff_hired',
  declined: 'staff_offer_declined',
  requested: 'staff_permission_requested',
  refused: 'staff_permission_refused',
  fired: 'staff_fired',
  objection: 'staff_objection',
  development: 'staff_development',
  searchClosed: 'staff_search_closed',
  chaplain: 'chaplain_named',
} as const;

const base = { family: 'career', importedAllowed: true, minTier: 1, compactable: true } as const;

export const STAFF_EVENT_TYPES: readonly EventTypeDef[] = [
  { ...base, id: EVENT.interviewed, harmClass: 'none', payloadSchema: { openingId: 'id', minutes: 'number', inPerson: 'boolean' }, witnessRule: 'team', lineTemplate: 'staff.line.interviewed', consumers: [MODULE, 'career.market'] },
  { ...base, id: EVENT.hired, harmClass: 'none', payloadSchema: { seatId: 'id', years: 'number' }, witnessRule: 'public', lineTemplate: 'staff.line.hired', consumers: [MODULE, 'career.reputation', 'career.market'] },
  { ...base, id: EVENT.declined, harmClass: 'none', payloadSchema: { seatId: 'id' }, witnessRule: 'team', lineTemplate: 'staff.line.declined', consumers: [MODULE] },
  { ...base, id: EVENT.requested, harmClass: 'none', payloadSchema: { kind: 'string', fromTeamId: 'id' }, witnessRule: 'team', lineTemplate: 'staff.line.requested', consumers: [MODULE] },
  { ...base, id: EVENT.refused, harmClass: 'professional_negative', payloadSchema: { kind: 'string', violation: 'boolean' }, witnessRule: 'team', lineTemplate: 'staff.line.refused', consumers: [MODULE, 'league.compliance'] },
  { ...base, id: EVENT.fired, harmClass: 'professional_negative', payloadSchema: { seatId: 'id', midSeason: 'boolean', ownerDemanded: 'boolean' }, witnessRule: 'public', lineTemplate: 'staff.line.fired', consumers: [MODULE, 'career.market', 'career.media'] },
  { ...base, id: EVENT.objection, harmClass: 'none', payloadSchema: { where: 'string', answer: 'string' }, witnessRule: 'team', lineTemplate: 'staff.line.objection', consumers: [MODULE, 'models.decision_log'] },
  { ...base, id: EVENT.development, harmClass: 'none', payloadSchema: { act: 'string' }, witnessRule: 'team', lineTemplate: 'staff.line.development', consumers: [MODULE, 'career.market'] },
  { ...base, id: EVENT.searchClosed, harmClass: 'none', payloadSchema: { openingId: 'id', diverseRequired: 'number', diverseCounted: 'number' }, witnessRule: 'public', lineTemplate: 'staff.line.search_closed', consumers: [MODULE, 'league.compliance'] },
  { ...base, id: EVENT.chaplain, harmClass: 'none', payloadSchema: { access: 'string' }, witnessRule: 'team', lineTemplate: 'staff.line.chaplain', consumers: [MODULE] },
].map((t) => EventTypeDef.parse(t));

export type EventDraft = Omit<WorldEvent, 'id' | 'notability'>;

export interface DraftMeta {
  readonly date: WorldDate;
  readonly competitionId: number | null;
  readonly tier: WorldTier;
  readonly source: 'sim' | 'history_run' | 'user';
}

const WITNESS: Readonly<Record<string, string>> = Object.fromEntries(STAFF_EVENT_TYPES.map((t) => [t.id, t.witnessRule]));

export function draft(type: string, meta: DraftMeta, teamId: number, personId: number | null, role: string, subjectSeatId: number | null, payload: EventDraft['payload']): EventDraft {
  return {
    type,
    when: { date: meta.date, period: null, clockTenths: null },
    competitionId: meta.competitionId,
    where: { teamId, venueId: null },
    actors: personId === null ? [] : [{ personId, role }],
    subjects: subjectSeatId === null ? [] : [{ kind: 'job', id: subjectSeatId }],
    payload,
    witnesses: WITNESS[type] === 'team' ? { kind: 'team', teamId } : { kind: 'public' },
    causeId: null,
    tier: meta.tier,
    source: meta.source,
  };
}
