// Event types this module emits. A team's finished season is a fact (X2.1.1 rule 2: what happened, no
// judgment words): it is the evidence behind season labels and the coach lines of the X4.2.2 rollup.
// Label changes are the X2.2.2 outputs `label_formed` and `label_faded` (family media, public).
import type { EventTypeDef } from '@gm/schema';

export const TEAM_SEASON = 'team_season_finished';
export const LABEL_FORMED = 'label_formed';
export const LABEL_FADED = 'label_faded';

const CONSUMERS = ['world.records', 'league.history', 'app.legends'];

export const RECORDS_EVENT_TYPES: readonly EventTypeDef[] = [
  {
    id: TEAM_SEASON, family: 'game', witnessRule: 'public', lineTemplate: 'event.team_season_finished', harmClass: 'none', importedAllowed: true,
    minTier: 3, consumers: CONSUMERS, compactable: true,
    payloadSchema: {
      season: 'number', games: 'number', wins: 'number', losses: 'number', ties: 'number', points_for: 'number', points_against: 'number',
      winning: 'boolean', postseason: 'boolean', title: 'boolean',
    },
  },
  // `definition` names the label query (X2.2.1). X2.1.1 rule 2 bars label ids from payloads; these two rows
  // are X2.2.2's own outputs, so the id sits under a key the bar does not name (bible conflict reported).
  ...[LABEL_FORMED, LABEL_FADED].map((id): EventTypeDef => ({
    id, family: 'media', witnessRule: 'public', lineTemplate: `event.${id}`, harmClass: 'none', importedAllowed: true, minTier: 3,
    consumers: CONSUMERS, compactable: false, payloadSchema: { definition: 'string', sample: 'number', z: 'number' },
  })),
];
