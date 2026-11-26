// Event types the portal emits (X2.1.2). A signing is the turnover row `player_signed` with kind `transfer`,
// so every consumer of signings sees transfers without a second row type.
import type { EventTypeDef } from '@gm/schema';

export const TRANSFER_ENTERED = 'transfer_entered';
export const TRANSFER_UNPLACED = 'transfer_unplaced';

const CONSUMERS = ['world.portal', 'world.turnover', 'front-office.gm', 'league.history'];

export const PORTAL_EVENT_TYPES: readonly EventTypeDef[] = [
  // T6.1.1, T6.2.1: a player entered the transfer database (public: entries are announced). `via` is window,
  // postseason or coach_change; `day` is the calendar day he entered (P3.1.2).
  { id: TRANSFER_ENTERED, family: 'roster', payloadSchema: { team: 'number', via: 'string', day: 'number' }, witnessRule: 'public', lineTemplate: 'event.transfer_entered', harmClass: 'none', importedAllowed: true, minTier: 3, consumers: CONSUMERS, compactable: true },
  // T6.2.1: no program signed him before the next season began; he leaves the world's football (PT-09).
  { id: TRANSFER_UNPLACED, family: 'career', payloadSchema: { team: 'number', day: 'number' }, witnessRule: 'none', lineTemplate: 'event.transfer_unplaced', harmClass: 'none', importedAllowed: true, minTier: 3, consumers: CONSUMERS, compactable: false },
];
