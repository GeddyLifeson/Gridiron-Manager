// The four event types of the pipeline (L8.2.5 "Events") and their drafts. `violation_committed` is
// hidden: its witnesses are the actor and whoever ordered the act. The rest are public (X2). Labels
// follow from the public events only (X2.2). Every type is personal harm class (L9.1.2: an invented
// act that harms a reputation), so none may land on an imported person (X2.1.2 rule 3, W-28).
import { EventTypeDef, mayReceiveEvent, type PersonOrigin, type WorldDate, type WorldTier } from '@gm/schema';
import type { EventDraft, PartyRef } from './types.ts';
import { MODULE } from './params.ts';

export const EVENT = {
  committed: 'violation_committed',
  inquiry: 'inquiry_opened',
  detected: 'violation_detected',
  penalty: 'penalty_imposed',
  /** Not in L8.2.5's list: closes an inquiry that found nothing, so no label reads it as a penalty. */
  closed: 'inquiry_closed_no_finding',
} as const;

const base = { family: 'discipline', harmClass: 'personal', importedAllowed: false, minTier: 1, consumers: [MODULE, 'career.reputation', 'models.labels'], compactable: false } as const;

/** Content rows for the event-type table (X2.1.2), validated by the contract's own schema. */
export const COMPLIANCE_EVENT_TYPES: readonly EventTypeDef[] = [
  { ...base, id: EVENT.committed, payloadSchema: { classId: 'string', severity: 'string', gain: 'number', logId: 'id', knewCount: 'number' }, witnessRule: 'people', lineTemplate: 'compliance.line.committed', consumers: [MODULE] },
  { ...base, id: EVENT.inquiry, payloadSchema: { caseId: 'id', body: 'string', falseAccusation: 'boolean' }, witnessRule: 'public', lineTemplate: 'compliance.line.inquiry' },
  { ...base, id: EVENT.detected, payloadSchema: { caseId: 'id', classId: 'string', severity: 'string', logId: 'id' }, witnessRule: 'public', lineTemplate: 'compliance.line.detected' },
  { ...base, id: EVENT.penalty, payloadSchema: { caseId: 'id', orders: 'number' }, witnessRule: 'public', lineTemplate: 'compliance.line.penalty' },
  { ...base, id: EVENT.closed, payloadSchema: { caseId: 'id' }, witnessRule: 'public', lineTemplate: 'compliance.line.closed' },
].map((t) => EventTypeDef.parse(t));

const typeById = new Map(COMPLIANCE_EVENT_TYPES.map((t) => [t.id, t]));

/** The one protection check (W-28) for a compliance event landing on a person. */
export function mayCarry(origin: PersonOrigin, type: string): boolean {
  return mayReceiveEvent({ origin }, typeById.get(type));
}

export interface DraftMeta {
  readonly date: WorldDate;
  readonly competitionId: number | null;
  readonly teamId: number | null;
  readonly tier: WorldTier;
  readonly source: 'sim' | 'history_run' | 'user';
}

export function draft(
  type: string, meta: DraftMeta,
  actors: readonly { personId: number; role: string }[],
  subjects: EventDraft['subjects'],
  payload: EventDraft['payload'],
  witnesses: EventDraft['witnesses'],
  causeId: number | null,
): EventDraft {
  return {
    type,
    when: { date: meta.date, period: null, clockTenths: null },
    competitionId: meta.competitionId,
    where: { teamId: meta.teamId, venueId: null },
    actors: actors.map((a) => ({ personId: a.personId, role: a.role })),
    subjects,
    payload,
    witnesses,
    causeId,
    tier: meta.tier,
    source: meta.source,
  };
}

/** Persons a public event may name: imported people are left out (the club takes the institutional part). */
export function nameable(parties: readonly (PartyRef | null)[], type: string): PartyRef[] {
  const out: PartyRef[] = [];
  for (const p of parties) if (p && mayCarry(p.origin, type) && !out.some((q) => q.personId === p.personId)) out.push(p);
  return out;
}
