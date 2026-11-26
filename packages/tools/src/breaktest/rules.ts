// A rule set that holds the level's rule values and its league-rules file, the way the composition root will
// bind it. rules-data resolves only the play rule sets (pro_2026, college_2026); the league files (cap, roster
// limits) have no resolver yet, so this reads them by path, as the playtest's game frame does.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRuleSet } from '@gm/rules-data';
import type { RuleSet } from '@gm/schema';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

export function leagueRuleSet(level: 'pro' | 'college'): RuleSet {
  const base = resolveRuleSet(level === 'pro' ? 'pro_2026' : 'college_2026');
  const file = join(ROOT, 'packages/rules-data/data/league', level === 'pro' ? 'proleague_2026.json' : 'collegeleague_2026.json');
  const vals = new Map<string, unknown>((JSON.parse(readFileSync(file, 'utf8')) as { values: { key: string; value: unknown }[] }).values.map((v) => [v.key, v.value]));
  return {
    ...base,
    num: (k: string) => { const v = vals.get(k); return typeof v === 'number' ? v : base.num(k); },
    bool: (k: string) => { const v = vals.get(k); return typeof v === 'boolean' ? v : base.bool(k); },
    keys: () => [...new Set([...base.keys(), ...vals.keys()])],
  } as RuleSet;
}
