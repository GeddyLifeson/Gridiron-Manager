// Rule keys that only past formats use (T3.5.1 eras, B12 era settings). The 2026 league-rules file does
// not carry them yet, so a missing key reads as "off" (0 or false); the era files set them explicitly.
// They are kept out of the postseason RULE_KEYS manifest until the schema integrator adds them to the
// league key dictionaries (request in the PR notes).
import type { RuleKeyDef, RuleKeyManifest } from '@gm/schema';
import type { RuleValues } from '../standings/types.ts';
import { POSTSEASON_MODULE } from './params.ts';

export const ERA_KEY = {
  championAutoBids: 'cfp.champion_auto_bids',
  byesChampionsOnly: 'cfp.byes_champions_only',
} as const;

function def(key: string, type: RuleKeyDef['type'], meaning: string, ownerLeaf: string, extra: Partial<RuleKeyDef> = {}): RuleKeyDef {
  return { key, type, meaning, ownerLeaf, readBy: [POSTSEASON_MODULE], ...extra };
}

export const ERA_RULE_KEYS: RuleKeyManifest = [
  def(ERA_KEY.championAutoBids, 'number', 'Automatic places for the highest-ranked conference champions of any conference (2024 and 2025 format); 0 switches it off', 'T3.5.1', { unit: 'count' }),
  def(ERA_KEY.byesChampionsOnly, 'boolean', 'The bye seeds go only to the highest-ranked conference champions; the rest are seeded by ranking (2024 format)', 'T3.5.1'),
];

export function eraNum(rules: RuleValues, key: string): number {
  const v = rules[key];
  if (v === undefined) return 0;
  if (typeof v !== 'number') throw new Error(`rule ${key} must be a number, got ${String(v)}`);
  return v;
}

export function eraFlag(rules: RuleValues, key: string): boolean {
  const v = rules[key];
  if (v === undefined) return false;
  if (typeof v !== 'boolean') throw new Error(`rule ${key} must be a boolean, got ${String(v)}`);
  return v;
}
