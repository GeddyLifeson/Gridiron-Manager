// Event types the turnover steps emit (X2.1.2). `released` is the loop's own row (loop/events.ts).
import type { EventTypeDef } from '@gm/schema';

export const PLAYER_RETIRED = 'player_retired';
export const ELIGIBILITY_ENDED = 'eligibility_ended';
export const PLAYER_DRAFTED = 'player_drafted';
export const PLAYER_SIGNED = 'player_signed';
export const LEFT_UNSIGNED = 'left_unsigned';

const CONSUMERS = ['world.turnover', 'front-office.gm', 'league.history'];

export const TURNOVER_EVENT_TYPES: readonly EventTypeDef[] = [
  // D8.4.1 path 2: the player chooses to retire.
  { id: PLAYER_RETIRED, family: 'roster', payloadSchema: { age: 'number' }, witnessRule: 'public', lineTemplate: 'event.player_retired', harmClass: 'none', importedAllowed: true, minTier: 3, consumers: CONSUMERS, compactable: true },
  // T5: college eligibility used up; the player enters the pro entry pool (X11.1.1).
  { id: ELIGIBILITY_ENDED, family: 'roster', payloadSchema: { seasons: 'number' }, witnessRule: 'public', lineTemplate: 'event.eligibility_ended', harmClass: 'none', importedAllowed: true, minTier: 3, consumers: CONSUMERS, compactable: true },
  // C7: one selection.
  { id: PLAYER_DRAFTED, family: 'roster', payloadSchema: { round: 'number', overall: 'number', team: 'number' }, witnessRule: 'public', lineTemplate: 'event.player_drafted', harmClass: 'none', importedAllowed: true, minTier: 3, consumers: CONSUMERS, compactable: true },
  // C8, M4, T4: a signing. `kind` is undrafted, free_agent, recruit or walk_on.
  { id: PLAYER_SIGNED, family: 'roster', payloadSchema: { kind: 'string', team: 'number' }, witnessRule: 'public', lineTemplate: 'event.player_signed', harmClass: 'none', importedAllowed: true, minTier: 3, consumers: CONSUMERS, compactable: true },
  // X12.1.2: no team wanted him for the set number of cycles; he leaves football ("not wanted", D8.4.1 path 1).
  { id: LEFT_UNSIGNED, family: 'career', payloadSchema: { cycles: 'number' }, witnessRule: 'none', lineTemplate: 'event.left_unsigned', harmClass: 'none', importedAllowed: true, minTier: 3, consumers: CONSUMERS, compactable: false },
];
