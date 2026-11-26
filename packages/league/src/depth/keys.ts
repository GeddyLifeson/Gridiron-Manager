// Rule keys the depth chart module reads (G-56). Game-day limits are read through the roster module's
// own keys (roster/keys.ts); the redshirt line through the college module's keys. A feature is on when
// its key is in the level's rule file, never by testing the level (P1.3.3).
import type { RuleKeyManifest, RuleSet } from '@gm/schema';

export const RULE_KEYS: RuleKeyManifest = [
  {
    key: 'substitution.max_players', type: 'number', unit: 'count',
    meaning: 'Players a side may have on the field: every unit and package chart must yield this many distinct players (M2.1.1 acceptance).',
    ownerLeaf: 'B2', readBy: ['league.depth'],
  },
  {
    key: 'eligibility.redshirt_max_games', type: 'number', unit: 'games',
    meaning: 'Redshirt tracker: appearances allowed without using the season (M2.3.2 rule 4; owned by T5.2.1).',
    ownerLeaf: 'T5.2.1', readBy: ['league.depth'],
  },
  {
    key: 'eligibility.postseason_counts', type: 'boolean',
    meaning: 'Whether postseason appearances count toward the redshirt line (M2.3.2 rule 4; owned by T5.2.1).',
    ownerLeaf: 'T5.2.1', readBy: ['league.depth'],
  },
];

export interface DepthRules {
  /** Players on the field per side (B2). */
  readonly onField: number;
  /** Redshirt line, or null where the level's file has no redshirt key. */
  readonly redshirt: { readonly maxGames: number; readonly postseasonCounts: boolean } | null;
}

export function depthRules(rs: RuleSet): DepthRules {
  const keys = new Set(rs.keys());
  return {
    onField: rs.num('substitution.max_players'),
    redshirt: keys.has('eligibility.redshirt_max_games')
      ? { maxGames: rs.num('eligibility.redshirt_max_games'), postseasonCounts: keys.has('eligibility.postseason_counts') ? rs.bool('eligibility.postseason_counts') : false }
      : null,
  };
}
