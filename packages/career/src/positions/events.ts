// Event types the positions module writes (X8.3.1, X8.3.2, X8.4.1, X8.4.2) and their drafts. The X8 names
// `retained`, `released` and `followed` are prefixed `staff_` because the roster engine (G-15) already
// writes `released` for players. All are ordinary career events, open to imported people (X2.1.2 rule 3).
import { EventTypeDef, type WorldDate, type WorldEvent, type WorldTier } from '@gm/schema';
import { MODULE } from './params.ts';

export const EVENT = {
  interim: 'interim_named',
  retained: 'staff_retained',
  released: 'staff_released',
  followed: 'staff_followed',
  opened: 'job_opened',
  promoted: 'promoted_within',
  caller: 'duty_assigned',
} as const;

const base = { family: 'career', importedAllowed: true, minTier: 1, compactable: true } as const;

export const POSITION_EVENT_TYPES: readonly EventTypeDef[] = [
  { ...base, id: EVENT.interim, harmClass: 'none', payloadSchema: { seatId: 'id', holding: 'string', step: 'number' }, witnessRule: 'public', lineTemplate: 'positions.line.interim', consumers: [MODULE, 'career.reputation', 'front-office.gm'] },
  { ...base, id: EVENT.retained, harmClass: 'none', payloadSchema: { seatId: 'id', moved: 'boolean' }, witnessRule: 'team', lineTemplate: 'positions.line.retained', consumers: [MODULE, 'career.staff'] },
  { ...base, id: EVENT.released, harmClass: 'professional_negative', payloadSchema: { seatId: 'id' }, witnessRule: 'public', lineTemplate: 'positions.line.released', consumers: [MODULE, 'career.staff', 'career.market'] },
  { ...base, id: EVENT.followed, harmClass: 'none', payloadSchema: { fromTeamId: 'id', rung: 'number' }, witnessRule: 'public', lineTemplate: 'positions.line.followed', consumers: [MODULE, 'career.staff', 'career.market'] },
  { ...base, id: EVENT.opened, harmClass: 'none', payloadSchema: { seatId: 'id', rung: 'number', positionId: 'string' }, witnessRule: 'public', lineTemplate: 'positions.line.opened', consumers: [MODULE, 'front-office.gm', 'career.market'] },
  { ...base, id: EVENT.promoted, harmClass: 'none', payloadSchema: { seatId: 'id', fromSeatId: 'id' }, witnessRule: 'public', lineTemplate: 'positions.line.promoted', consumers: [MODULE, 'career.staff'] },
  { ...base, id: EVENT.caller, harmClass: 'none', payloadSchema: { side: 'string', reason: 'string', gameOnly: 'boolean' }, witnessRule: 'team', lineTemplate: 'positions.line.caller', consumers: [MODULE, 'coach-ai.staff'] },
].map((t) => EventTypeDef.parse(t));

export type EventDraft = Omit<WorldEvent, 'id' | 'notability'>;

export interface DraftMeta {
  readonly date: WorldDate;
  readonly competitionId: number | null;
  readonly tier: WorldTier;
  readonly source: 'sim' | 'history_run' | 'user';
}

const WITNESS: Readonly<Record<string, 'public' | 'team'>> = Object.fromEntries(POSITION_EVENT_TYPES.map((t) => [t.id, t.witnessRule as 'public' | 'team']));

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
