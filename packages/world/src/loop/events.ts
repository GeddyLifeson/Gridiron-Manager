// Event types this module emits (X2.1.2 files, registered with the G-22 registry by the integrator).
import type { EventTypeDef } from '@gm/schema';

export const WORLD_FOUNDED = 'world_founded';
export const HISTORY_RUN_ENDED = 'history_run_ended';
export const WENT_INACTIVE = 'went_inactive';
export const RETURNED_ACTIVE = 'returned_active';
export const DIED = 'died';
export const DEADLINE_LAPSED = 'deadline_lapsed';
export const IMPORT_PLACED = 'import_placed';
export const RELEASED = 'released';
export const USER_BACKGROUND = 'user_background';

const CONSUMERS = ['world.loop'];

export const WORLD_EVENT_TYPES: readonly EventTypeDef[] = [
  { id: WORLD_FOUNDED, family: 'world', payloadSchema: { teams: 'number', people: 'number', setup_hash: 'string' }, witnessRule: 'public', lineTemplate: 'event.world_founded', harmClass: 'none', importedAllowed: true, minTier: 3, consumers: ['world.loop', 'league.history'], compactable: false },
  { id: HISTORY_RUN_ENDED, family: 'world', payloadSchema: { seasons: 'number', stopped_early: 'boolean', seed_step: 'number' }, witnessRule: 'none', lineTemplate: 'event.history_run_ended', harmClass: 'none', importedAllowed: true, minTier: 3, consumers: CONSUMERS, compactable: false },
  // X12.1.3: internal status changes. Football grounds only, so they may land on anyone.
  { id: WENT_INACTIVE, family: 'career', payloadSchema: { since_year: 'number' }, witnessRule: 'none', lineTemplate: 'event.went_inactive', harmClass: 'none', importedAllowed: true, minTier: 3, consumers: ['world.loop', 'front-office.gm'], compactable: false },
  { id: RETURNED_ACTIVE, family: 'career', payloadSchema: { reason: 'string' }, witnessRule: 'none', lineTemplate: 'event.returned_active', harmClass: 'none', importedAllowed: true, minTier: 3, consumers: ['world.loop', 'front-office.gm'], compactable: false },
  // X12.1.3 rule 2: years of life only. There is no cause field, and the type is closed to imported people.
  { id: DIED, family: 'personal', payloadSchema: { birth_year: 'number', year: 'number' }, witnessRule: 'public', lineTemplate: 'event.died', harmClass: 'personal', importedAllowed: false, minTier: 3, consumers: ['world.loop', 'people.memory', 'people.relationships'], compactable: false },
  // X12.3.1 rule 2: a deadline the user let pass, logged as his.
  { id: DEADLINE_LAPSED, family: 'career', payloadSchema: { item: 'number', kind: 'string', resolution: 'string' }, witnessRule: 'people', lineTemplate: 'event.deadline_lapsed', harmClass: 'none', importedAllowed: true, minTier: 1, consumers: ['world.loop', 'models.decisions'], compactable: false },
  // X10.4.1 rule 4: placements on the career start date.
  { id: IMPORT_PLACED, family: 'roster', payloadSchema: { kind: 'string', displaced: 'id' }, witnessRule: 'public', lineTemplate: 'event.import_placed', harmClass: 'none', importedAllowed: true, minTier: 3, consumers: CONSUMERS, compactable: false },
  // X10.4.2: plain facts of the user's background, no labels.
  { id: USER_BACKGROUND, family: 'career', payloadSchema: { kind: 'string', season: 'number', in_world: 'boolean' }, witnessRule: 'public', lineTemplate: 'event.user_background', harmClass: 'none', importedAllowed: true, minTier: 1, consumers: ['world.loop', 'people.relationships'], compactable: false },
];

/** `released` belongs to the roster events; this row is used only where a registry does not hold it yet. */
export const RELEASED_FALLBACK: EventTypeDef = {
  id: RELEASED, family: 'roster', payloadSchema: { reason: 'string' }, witnessRule: 'public', lineTemplate: 'event.released', harmClass: 'professional_negative', importedAllowed: true, minTier: 3, consumers: CONSUMERS, compactable: false,
};

/** This module's types, plus `released` when the given ids do not already hold it. */
export function worldEventTypes(registeredIds: readonly string[] = []): EventTypeDef[] {
  return registeredIds.includes(RELEASED) ? [...WORLD_EVENT_TYPES] : [...WORLD_EVENT_TYPES, RELEASED_FALLBACK];
}
