// Rule keys the console reads (I2.1.1 radio window, I2.1.3 late call, O2.4.1 controls). All exist in the key
// dictionary. Absent keys mean "no radio" (comm.*) so no level word is tested (P1.1.2).
import type { RuleKeyManifest, RuleSet } from '@gm/schema';

const READ_BY = ['app-services.game-calling'];

export const RULE_KEYS: RuleKeyManifest = [
  { key: 'comm.c2p_allowed', type: 'boolean', meaning: 'Coach-to-player helmet radio is allowed', ownerLeaf: 'B13.13.1', readBy: READ_BY },
  { key: 'comm.c2p_cutoff_seconds', type: 'number', unit: 's', meaning: 'Play clock reading at which the helmet radio cuts off', ownerLeaf: 'B13.13.1', readBy: READ_BY },
  { key: 'timeout.per_half', type: 'number', unit: 'count', meaning: 'Charged timeouts per team per half (sideline panel count)', ownerLeaf: 'B1.4.1', readBy: READ_BY },
  { key: 'clock.play_clock_s', type: 'number', unit: 's', meaning: 'Play clock after a normal play (marker scale)', ownerLeaf: 'B1', readBy: READ_BY },
  { key: 'clock.play_clock_after_stoppage_s', type: 'number', unit: 's', meaning: 'Play clock after an administrative stoppage (marker scale)', ownerLeaf: 'B1', readBy: READ_BY },
];

/** Radio cutoff in tenths, or null when the rule set has no coach-to-player radio. */
export function radioCutoffTenths(rules: Pick<RuleSet, 'keys' | 'num' | 'bool'>): number | null {
  const present = new Set(rules.keys());
  if (!present.has('comm.c2p_allowed') || !rules.bool('comm.c2p_allowed') || !present.has('comm.c2p_cutoff_seconds')) return null;
  return Math.round(rules.num('comm.c2p_cutoff_seconds') * 10);
}
