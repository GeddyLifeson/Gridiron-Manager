// Rule-set fixtures for the designer tests: the real 2026 rule sets, plus field.width_ft where main does
// not have it yet (it arrives with the field-keys research branch; 160 ft in both 2026 rule books).
import type { RuleSet } from '@gm/schema';
import { RULE_SET_FILES, resolveRuleSet } from '@gm/rules-data';

export function ruleSet(which: 'pro' | 'college'): Pick<RuleSet, 'keys' | 'num'> {
  const file = RULE_SET_FILES.find((f) => f.ruleset_id.startsWith(which === 'pro' ? 'pro' : 'college'));
  if (!file) throw new Error('no rule set');
  const rs = resolveRuleSet(file.ruleset_id);
  const keys = rs.keys();
  const extra: Record<string, number> = keys.includes('field.width_ft') ? {} : { 'field.width_ft': 160 };
  return { keys: () => [...keys, ...Object.keys(extra)], num: (k: string) => (k in extra ? extra[k]! : rs.num(k)) };
}
