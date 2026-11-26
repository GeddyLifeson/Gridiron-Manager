// The one event type this module emits (X13.1.1 outputs). Internal: witness rule `none`, never shown.
import type { EventTypeDef } from '@gm/schema';

export const TIER_CHANGED = 'tier_changed';

export const TIER_EVENT_TYPES: readonly EventTypeDef[] = [
  { id: TIER_CHANGED, family: 'world', payloadSchema: { kind: 'string', from: 'number', to: 'number', reason: 'string', at: 'string' }, witnessRule: 'none', lineTemplate: 'event.tier_changed', harmClass: 'none', importedAllowed: true, minTier: 3, consumers: ['world.tiers'], compactable: false },
];
