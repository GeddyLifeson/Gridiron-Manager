// Event types the ladder module writes (S3.1.1 outputs: events in the demonstrated record, S8.1.1, E9.1.2).
// All are ordinary career events, open to imported people (X2.1.2 rule 3). Nothing here raises any value on
// the coach; the record only describes the work done.
import { EventTypeDef, type WorldDate, type WorldEvent, type WorldTier } from '@gm/schema';
import { MODULE } from './params.ts';

export const EVENT = {
  performed: 'duty_performed',
  graded: 'duty_graded',
  pushedDown: 'duty_pushed_down',
  gaSeatEnded: 'ga_seat_ended',
  gaExtended: 'ga_seat_extended',
  gaHireWindow: 'ga_hired_outside_window',
} as const;

const base = { family: 'career', importedAllowed: true, minTier: 1, compactable: true } as const;
const record = [MODULE, 'career.record', 'coach-ai.boss'];

export const LADDER_EVENT_TYPES: readonly EventTypeDef[] = [
  { ...base, id: EVENT.performed, harmClass: 'none', payloadSchema: { dutyId: 'string', ownership: 'string', hours: 'number', used: 'boolean' }, witnessRule: 'team', lineTemplate: 'ladder.line.performed', consumers: record },
  { ...base, id: EVENT.graded, harmClass: 'none', payloadSchema: { dutyId: 'string', grader: 'string', grade: 'number' }, witnessRule: 'team', lineTemplate: 'ladder.line.graded', consumers: record },
  { ...base, id: EVENT.pushedDown, harmClass: 'none', payloadSchema: { dutyId: 'string', fromBand: 'string' }, witnessRule: 'team', lineTemplate: 'ladder.line.pushed_down', consumers: [MODULE, 'career.record'] },
  { ...base, id: EVENT.gaSeatEnded, harmClass: 'professional_negative', payloadSchema: { reason: 'string', termsServed: 'number' }, witnessRule: 'team', lineTemplate: 'ladder.line.ga_ended', consumers: [MODULE, 'career.positions', 'career.market'] },
  { ...base, id: EVENT.gaExtended, harmClass: 'none', payloadSchema: { yearsGranted: 'number' }, witnessRule: 'team', lineTemplate: 'ladder.line.ga_extended', consumers: [MODULE, 'career.positions'] },
  { ...base, id: EVENT.gaHireWindow, harmClass: 'professional_negative', payloadSchema: { yearsSinceDegree: 'number' }, witnessRule: 'none', lineTemplate: 'ladder.line.ga_window', consumers: [MODULE, 'league.compliance'] },
].map((t) => EventTypeDef.parse(t));

export type EventDraft = Omit<WorldEvent, 'id' | 'notability'>;

export interface DraftMeta {
  readonly date: WorldDate;
  readonly competitionId: number | null;
  readonly tier: WorldTier;
  readonly source: 'sim' | 'history_run' | 'user';
}

const WITNESS: Readonly<Record<string, string>> = Object.fromEntries(LADDER_EVENT_TYPES.map((t) => [t.id, t.witnessRule]));

export function draft(type: string, meta: DraftMeta, teamId: number, personId: number | null, seatId: number | null, payload: EventDraft['payload']): EventDraft {
  const w = WITNESS[type];
  return {
    type,
    when: { date: meta.date, period: null, clockTenths: null },
    competitionId: meta.competitionId,
    where: { teamId, venueId: null },
    actors: personId === null ? [] : [{ personId, role: 'staff' }],
    subjects: seatId === null ? [] : [{ kind: 'job', id: seatId }],
    payload,
    witnesses: w === 'team' ? { kind: 'team', teamId } : w === 'none' ? { kind: 'none' } : { kind: 'public' },
    causeId: null,
    tier: meta.tier,
    source: meta.source,
  };
}
