// History event types the crisis engine writes (X2.1.2 content rows) and its draft helper. Requested
// from the integrator (CR-G50-2) for the event-type table. A crisis event lands on its subjects, so its
// harm class follows the catalogue row's guard class: personal crises are `personal`, which the schema
// refuses for imported people (X2.1.2 rule 3); football crises are `professional_negative`.
import { EventTypeDef } from '@gm/schema';
import { compliance } from '@gm/league';
import type { GuardClass } from './catalogue.ts';
import { MODULE } from './params.ts';

export const CRISIS_EVENT = {
  openedFootball: 'crisis_opened',
  openedPersonal: 'crisis_opened_personal',
  stageFootball: 'crisis_stage',
  stagePersonal: 'crisis_stage_personal',
  act: 'crisis_act',
  closed: 'crisis_closed',
  witnessed: 'crisis_witnessed_item',
} as const;

const football = { family: 'career', harmClass: 'professional_negative', importedAllowed: true, minTier: 1, consumers: [MODULE, 'world.week', 'models.labels'], compactable: false } as const;
const personal = { ...football, family: 'personal', harmClass: 'personal', importedAllowed: false } as const;

export const CRISIS_EVENT_TYPES: readonly EventTypeDef[] = [
  { ...football, id: CRISIS_EVENT.openedFootball, payloadSchema: { crisisId: 'id', typeId: 'string', severity: 'number', stage: 'string' }, witnessRule: 'team', lineTemplate: 'crisis.line.opened' },
  { ...personal, id: CRISIS_EVENT.openedPersonal, payloadSchema: { crisisId: 'id', typeId: 'string', severity: 'number', stage: 'string' }, witnessRule: 'team', lineTemplate: 'crisis.line.opened' },
  { ...football, id: CRISIS_EVENT.stageFootball, payloadSchema: { crisisId: 'id', stage: 'string', public: 'boolean' }, witnessRule: 'team', lineTemplate: 'crisis.line.stage' },
  { ...personal, id: CRISIS_EVENT.stagePersonal, payloadSchema: { crisisId: 'id', stage: 'string', public: 'boolean' }, witnessRule: 'team', lineTemplate: 'crisis.line.stage' },
  // Acts and closings name the coach, not the subject: football class (the coach's own professional record).
  { ...football, id: CRISIS_EVENT.act, payloadSchema: { crisisId: 'id', actId: 'string', ask: 'boolean' }, witnessRule: 'team', lineTemplate: 'crisis.line.act' },
  { ...football, id: CRISIS_EVENT.closed, payloadSchema: { crisisId: 'id', typeId: 'string', acts: 'number', causeUnresolved: 'boolean' }, witnessRule: 'team', lineTemplate: 'crisis.line.closed' },
  // L9.5.2: only the user sees it.
  { ...personal, id: CRISIS_EVENT.witnessed, payloadSchema: { matter: 'string', confidence: 'number' }, witnessRule: 'people', lineTemplate: 'crisis.line.witnessed' },
].map((t) => EventTypeDef.parse(t));

export function openedType(g: GuardClass): string { return g === 'personal' ? CRISIS_EVENT.openedPersonal : CRISIS_EVENT.openedFootball; }
export function stageType(g: GuardClass): string { return g === 'personal' ? CRISIS_EVENT.stagePersonal : CRISIS_EVENT.stageFootball; }

export type EventDraft = compliance.EventDraft;
export type EventSink = compliance.EventSink;
export type StreamFor = compliance.StreamFor;
export type DraftMeta = compliance.DraftMeta;
export const draft = compliance.draft;
