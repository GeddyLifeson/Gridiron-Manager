// Event types the health step emits (X2.1.2). One row per injury the staff know of when it happens; the
// medical timeline stays in the step's own state (league.medical cases), never in the log.
import type { EventTypeDef } from '@gm/schema';

export const PLAYER_INJURED = 'player_injured';

const CONSUMERS = ['world.health', 'world.turnover', 'league.history'];

export const HEALTH_EVENT_TYPES: readonly EventTypeDef[] = [
  // D11.1.1 output: an injury from play. Payload is what the staff say (catalogue row, sideline class), never
  // the true days. Real people imported into the world get no injury rows (X2.1.2 rule 3, project ruling).
  {
    id: PLAYER_INJURED, family: 'health', payloadSchema: { injury: 'string', mechanism: 'string', severity: 'string' },
    witnessRule: 'public', lineTemplate: 'event.player_injured', harmClass: 'professional_negative', importedAllowed: false,
    minTier: 3, consumers: CONSUMERS, compactable: true,
  },
];
