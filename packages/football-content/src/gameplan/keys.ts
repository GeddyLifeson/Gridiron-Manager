// Rule keys the game plan and call sheet module reads (head coach card kneel-down table). Both exist in the
// dictionary already; no new key is requested.
import type { RuleKeyManifest } from '@gm/schema';

const READ_BY = ['content.gameplan'];

export const RULE_KEYS: RuleKeyManifest = [
  { key: 'clock.play_clock_s', type: 'number', unit: 's', meaning: 'Play clock length (kneel-down arithmetic on the head coach card)', ownerLeaf: 'B1', readBy: READ_BY },
  { key: 'timeout.per_half', type: 'number', unit: 'count', meaning: 'Team timeouts per half (rows of the kneel-down table)', ownerLeaf: 'B1', readBy: READ_BY },
];
