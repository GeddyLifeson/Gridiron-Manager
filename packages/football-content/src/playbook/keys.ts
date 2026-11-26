// Rule keys the playbook and terminology module reads (G4 header: coach-to-player radio values are rule-set
// keys under `coach_to_player`). None is in the dictionary yet: they are requested from the integrator and
// the rule-values research thread (PR body), each with the bible's value and status. A key absent from a
// rule set means no radio (signals, boards and wristbands are then the only channels, G4.4).
import type { RuleKeyManifest, RuleSet } from '@gm/schema';

const READ_BY = ['content.playbook'];

export const RULE_KEYS: RuleKeyManifest = [
  { key: 'coach_to_player.cutoff_play_clock_s', type: 'number', unit: 's', meaning: 'Play-clock reading at which coach-to-player radio cuts off (NEW: G4.5.1, pro 15 Verified; college FBS 15 from 2024 Verified, area T owns it).', ownerLeaf: 'G4.5.1', readBy: READ_BY },
  { key: 'coach_to_player.defense_speakers_on_field', type: 'number', unit: 'count', meaning: 'Defensive players who may wear a live speaker helmet at once (NEW: G4.5.1, pro 1 Verified).', ownerLeaf: 'G4.5.1', readBy: READ_BY },
  { key: 'coach_to_player.equity_on_failure', type: 'boolean', meaning: 'On a total coach-to-player failure the opposing club also loses its equipment until restored (NEW: G4.4.3, pro yes, Rulebook only).', ownerLeaf: 'G4.4.3', readBy: READ_BY },
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
  return {
    cutoffS: present.has('coach_to_player.cutoff_play_clock_s') ? rules.num('coach_to_player.cutoff_play_clock_s') : null,
    defenseSpeakers: present.has('coach_to_player.defense_speakers_on_field') ? rules.num('coach_to_player.defense_speakers_on_field') : 0,
    equityOnFailure: present.has('coach_to_player.equity_on_failure') ? rules.bool('coach_to_player.equity_on_failure') : false,
  };
}
