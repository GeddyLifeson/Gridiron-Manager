// Fact rows behind every real-world number in this module (Q6). Status is computed, never typed. The rows
// stay beside the module until the fact register lint reads module-local files (integrator note).
import { FactFile, RuleValue, computeStatus, type FactRow, type FactStatus } from '@gm/schema';
import factsJson from './facts.json' with { type: 'json' };
import proposedJson from './rule-values.json' with { type: 'json' };
import type { RuleValues } from './params.ts';

export const HONOURS_FACTS: readonly FactRow[] = FactFile.parse(factsJson).rows;
const BY_ID = new Map(HONOURS_FACTS.map((r) => [r.id, r] as const));

export function fact(id: string): FactRow {
  const r = BY_ID.get(id);
  if (!r) throw new Error(`awards: unknown fact ${id}`);
  return r;
}

export function factStatus(id: string): FactStatus { return computeStatus(fact(id)); }

/** Anything short of Verified prints PROVISIONAL (Q6.3.1). */
export function isProvisional(id: string): boolean { return factStatus(id) !== 'Verified'; }

/**
 * Proposed league-rule values per rule set, each citing a fact row. They belong in
 * packages/rules-data/data/league once the integrator copies them; until then tests read them here.
 */
export interface ProposedRuleSet { readonly id: string; readonly note: string; readonly values: readonly RuleValue[] }
export const PROPOSED_RULE_SETS: readonly ProposedRuleSet[] = (proposedJson.sets as ProposedRuleSet[]).map((s) => ({
  ...s, values: s.values.map((v) => RuleValue.parse(v)),
}));

export function proposedRules(id: string): RuleValues {
  const s = PROPOSED_RULE_SETS.find((x) => x.id === id);
  if (!s) throw new Error(`awards: no proposed rule set ${id}`);
  return Object.fromEntries(s.values.map((v) => [v.key, v.value]));
}
