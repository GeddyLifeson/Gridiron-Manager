// Rule keys the playbook and terminology module reads (G4 header: coach-to-player radio values are rule-set
// keys). The dictionary already holds them under comm.* (B13.13.1); only the equity rule is new and is
// requested from the integrator. A rule set without radio (comm.c2p_allowed false or absent) leaves signals,
// boards and wristbands as the only channels (G4.4).
import type { RuleKeyManifest, RuleSet } from '@gm/schema';

const READ_BY = ['content.playbook'];

export const RULE_KEYS: RuleKeyManifest = [
  { key: 'comm.c2p_allowed', type: 'boolean', meaning: 'Coach-to-player helmet radio is allowed', ownerLeaf: 'B13.13.1', readBy: READ_BY },
  { key: 'comm.c2p_cutoff_seconds', type: 'number', unit: 's', meaning: 'Play clock reading at which the helmet radio cuts off', ownerLeaf: 'B13.13.1', readBy: READ_BY },
  { key: 'comm.c2p_receivers_defense', type: 'number', unit: 'count', meaning: 'Defensive players on the field with a helmet radio on a scrimmage down', ownerLeaf: 'B13.13.1', readBy: READ_BY },
  { key: 'comm.c2p_equity_on_failure', type: 'boolean', meaning: 'On a total coach-to-player failure the opposing club also loses its equipment until restored (NEW: G4.4.3, pro true, Rulebook only).', ownerLeaf: 'G4.4.3', readBy: READ_BY },
];

export interface RadioRules {
  /** Null when the rule set has no coach-to-player radio. */
  readonly cutoffS: number | null;
  readonly defenseSpeakers: number;
  readonly equityOnFailure: boolean;
}

/** Read the radio values by key; absent keys mean no radio and no equity rule (no level is tested, P1.1.2). */
export function radioRules(rules: Pick<RuleSet, 'keys' | 'num' | 'bool'>): RadioRules {
  const present = new Set(rules.keys());
  const allowed = present.has('comm.c2p_allowed') && rules.bool('comm.c2p_allowed');
  return {
    cutoffS: allowed && present.has('comm.c2p_cutoff_seconds') ? rules.num('comm.c2p_cutoff_seconds') : null,
    defenseSpeakers: allowed && present.has('comm.c2p_receivers_defense') ? rules.num('comm.c2p_receivers_defense') : 0,
    equityOnFailure: present.has('comm.c2p_equity_on_failure') ? rules.bool('comm.c2p_equity_on_failure') : false,
  };
}
