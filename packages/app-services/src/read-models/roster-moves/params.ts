// Tuning constants and rule keys of the roster moves screens (G-70). No real-world number lives here:
// limits, deadlines and counts come from the league rules through the roster engine (G-15), and the
// side size from the rule set. The values below are starting values a bible leaf states, or named
// assumptions.
import type { ParamFile, RuleKeyManifest } from '@gm/schema';

export const PARAMS: ParamFile = {
  module: 'app-services.roster-moves',
  version: 'g70.1',
  params: [
    {
      name: 'roster_moves.warmup_tags_max', value: 3, min: 0, max: 10, unit: 'count', belongsTo: 'H6.2.3',
      basis: 'bible', leaf: 'H6.2.3', constrainedBy: 'test roster-moves/active-list: a fourth decide-at-warm-up tag is refused', status: 'starting',
    },
    {
      name: 'roster_moves.coverage_depth', value: 2, min: 1, max: 3, unit: 'count', belongsTo: 'H6.2.1',
      basis: 'bible', leaf: 'H6.2.1', constrainedBy: 'H6.2.1 rule 2: a starter and one backup among the actives for every job', status: 'starting',
    },
    {
      name: 'roster_moves.draft_special_teams_ranks', value: 2, min: 1, max: 3, unit: 'count', belongsTo: 'M2.1.4',
      basis: 'bible', leaf: 'M2.1.4', constrainedBy: 'M2.1.4 rule 2(e): remaining spots by special teams units first or second on', status: 'starting',
    },
  ],
};

export function param(name: string): number {
  const p = PARAMS.params.find((x) => x.name === name);
  if (!p) throw new Error(`roster-moves: unknown parameter ${name}`);
  return p.value;
}

/** Rule keys this module reads itself. Roster limits are read by the roster engine's own RULE_KEYS. */
export const RULE_KEYS: RuleKeyManifest = [
  {
    key: 'substitution.max_players', type: 'number', unit: 'count',
    meaning: 'Players a side may have on the field; a special teams unit needs this many named actives (H6.2.1 rule 3).',
    ownerLeaf: 'B2', readBy: ['app-services.roster-moves'],
  },
];

/**
 * Special teams units are the depth chart records whose unit content id is in this namespace
 * (Assumption W-G70-1: F12 unit ids are `st:<unit>`; G-56 confirms or the integrator maps it).
 */
export const SPECIAL_TEAMS_NAMESPACE = 'st';

/**
 * Report designations that mean the player will not play (H5.2.2). Designations are league-rules keys;
 * this list names the "out" class (Assumption W-G70-2 until H5's designation table lands in G-33).
 */
export const OUT_DESIGNATIONS: readonly string[] = ['out', 'injury.out'];

export const MINUTES_PER_HOUR = 60;
