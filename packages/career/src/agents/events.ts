// Event types the agents module writes (L7) and their drafts. Family contact is a personal-life type: it may
// never land on an imported person (X2.1.2 rule 3, L9.1.2), and the schema refuses the type otherwise.
import { EventTypeDef, type WitnessRule, type WorldDate, type WorldEvent, type WorldTier } from '@gm/schema';
import { MODULE } from './params.ts';

export const EVENT = {
  agentCall: 'agent_call',
  agentAdvice: 'agent_advice',
  agencyConflict: 'agency_conflict_flag',
  holdoutStarted: 'holdout_started',
  holdoutFine: 'holdout_fine_posted',
  holdoutEnded: 'holdout_ended',
  holdinStarted: 'holdin_started',
  fineWaiver: 'camp_fine_waived',
  tradeRequestPrivate: 'trade_request_private',
  tradeRequestPublic: 'trade_request_public',
  tradeRequestWithdrawn: 'trade_request_withdrawn',
  familyContact: 'family_contact',
  offerPulled: 'recruit_offer_pulled',
  unfundedPromise: 'promise_unfunded',
  representativeSignal: 'representative_signal',
} as const;

const base = { importedAllowed: true, minTier: 1, compactable: true } as const;
const line = (id: string) => `agents.line.${id}`;

export const AGENT_EVENT_TYPES: readonly EventTypeDef[] = [
  { ...base, id: EVENT.agentCall, family: 'relationship', harmClass: 'none', payloadSchema: { clientId: 'id', reason: 'string', routedTo: 'string' }, witnessRule: 'people', lineTemplate: line('call'), consumers: [MODULE, 'career.time', 'front-office.gm'] },
  { ...base, id: EVENT.agentAdvice, family: 'relationship', harmClass: 'none', payloadSchema: { clientId: 'id', advice: 'string', roleBeliefDelta: 'number' }, witnessRule: 'none', lineTemplate: line('advice'), consumers: [MODULE, 'people.needs'] },
  { ...base, id: EVENT.agencyConflict, family: 'career', harmClass: 'none', payloadSchema: { agencyId: 'id', hirerId: 'id', hiredId: 'id' }, witnessRule: 'public', lineTemplate: line('conflict'), consumers: [MODULE, 'front-office.media', 'career.market'] },
  { ...base, id: EVENT.holdoutStarted, family: 'roster', harmClass: 'professional_negative', payloadSchema: { contractClass: 'string', want: 'string' }, witnessRule: 'public', lineTemplate: line('holdout'), consumers: [MODULE, 'front-office.gm', 'front-office.media', 'league.roster'] },
  { ...base, id: EVENT.holdoutFine, family: 'discipline', harmClass: 'none', payloadSchema: { day: 'number', usd: 'number', waivable: 'boolean' }, witnessRule: 'team', lineTemplate: line('fine'), consumers: [MODULE, 'front-office.cap'] },
  { ...base, id: EVENT.holdoutEnded, family: 'roster', harmClass: 'none', payloadSchema: { days: 'number', how: 'string' }, witnessRule: 'public', lineTemplate: line('holdout_end'), consumers: [MODULE, 'front-office.gm', 'league.roster'] },
  { ...base, id: EVENT.holdinStarted, family: 'roster', harmClass: 'none', payloadSchema: { statedReason: 'string' }, witnessRule: 'team', lineTemplate: line('holdin'), consumers: [MODULE, 'league.practice'] },
  { ...base, id: EVENT.fineWaiver, family: 'discipline', harmClass: 'professional_negative', payloadSchema: { contractClass: 'string', usd: 'number', violation: 'boolean' }, witnessRule: 'none', lineTemplate: line('waiver'), consumers: [MODULE, 'league.compliance'] },
  { ...base, id: EVENT.tradeRequestPrivate, family: 'relationship', harmClass: 'none', payloadSchema: { via: 'string' }, witnessRule: 'people', lineTemplate: line('trade_private'), consumers: [MODULE, 'front-office.gm'] },
  { ...base, id: EVENT.tradeRequestPublic, family: 'media', harmClass: 'professional_negative', payloadSchema: { via: 'string' }, witnessRule: 'public', lineTemplate: line('trade_public'), consumers: [MODULE, 'front-office.gm', 'front-office.media', 'people.locker'] },
  { ...base, id: EVENT.tradeRequestWithdrawn, family: 'relationship', harmClass: 'none', payloadSchema: { weeksMet: 'number' }, witnessRule: 'people', lineTemplate: line('trade_withdrawn'), consumers: [MODULE, 'front-office.gm'] },
  { ...base, id: EVENT.familyContact, family: 'personal', harmClass: 'personal', importedAllowed: false, payloadSchema: { familyMemberId: 'id', act: 'string' }, witnessRule: 'people', lineTemplate: line('family'), consumers: [MODULE, 'career.time'] },
  { ...base, id: EVENT.offerPulled, family: 'career', harmClass: 'professional_negative', payloadSchema: { recruitId: 'id', schoolId: 'id' }, witnessRule: 'people', lineTemplate: line('offer_pulled'), consumers: [MODULE, 'league.recruiting'] },
  { ...base, id: EVENT.unfundedPromise, family: 'relationship', harmClass: 'none', payloadSchema: { promiseId: 'id', term: 'string' }, witnessRule: 'none', lineTemplate: line('unfunded'), consumers: [MODULE, 'league.payment'] },
  { ...base, id: EVENT.representativeSignal, family: 'relationship', harmClass: 'none', payloadSchema: { clientId: 'id', ask: 'string' }, witnessRule: 'people', lineTemplate: line('rep_signal'), consumers: [MODULE, 'league.transfer'] },
].map((t) => EventTypeDef.parse(t));

export const AGENT_EVENT_IDS: ReadonlySet<string> = new Set(AGENT_EVENT_TYPES.map((t) => t.id));

export type EventDraft = Omit<WorldEvent, 'id' | 'notability'>;

export interface DraftMeta {
  readonly date: WorldDate;
  readonly competitionId: number | null;
  readonly tier: WorldTier;
  readonly source: 'sim' | 'history_run' | 'user';
}

const RULE: Readonly<Record<string, EventTypeDef['witnessRule']>> = Object.fromEntries(AGENT_EVENT_TYPES.map((t) => [t.id, t.witnessRule]));

/** Who may see a draft: from the type's rule, filled with the team or the people named. */
function witnessFor(type: string, teamId: number | null, people: readonly number[]): WitnessRule {
  const rule = RULE[type];
  if (rule === undefined) throw new Error(`${MODULE}: unknown event type ${type}`);
  if (rule === 'public') return { kind: 'public' };
  if (rule === 'team' && teamId !== null) return { kind: 'team', teamId };
  if (rule === 'people') return { kind: 'people', personIds: [...people] };
  return { kind: 'none' };
}

export function draft(
  type: string, meta: DraftMeta, teamId: number | null, actors: readonly { personId: number; role: string }[],
  subjectPersonId: number | null, payload: EventDraft['payload'],
): EventDraft {
  return {
    type,
    when: { date: meta.date, period: null, clockTenths: null },
    competitionId: meta.competitionId,
    where: { teamId, venueId: null },
    actors: actors.map((a) => ({ ...a })),
    subjects: subjectPersonId === null ? [] : [{ kind: 'person', id: subjectPersonId }],
    payload,
    witnesses: witnessFor(type, teamId, actors.map((a) => a.personId).concat(subjectPersonId === null ? [] : [subjectPersonId])),
    causeId: null,
    tier: meta.tier,
    source: meta.source,
  };
}
