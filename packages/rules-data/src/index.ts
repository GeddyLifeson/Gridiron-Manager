// Rule-set files by level and season (B12.1.1, P4.7.1, P1.3.3). Files are data; this module loads,
// validates and resolves them. The engine asks for values by key and never tests the level or year.
import { RuleKeyDef, RuleSetFile, type RuleSet } from '@gm/schema';
import keyMapJson from '../data/key-map.json' with { type: 'json' };
import keysJson from '../data/keys.json' with { type: 'json' };
import pro2026 from '../data/pro_2026.json' with { type: 'json' };
import college2026 from '../data/college_2026.json' with { type: 'json' };

export const KEY_DICTIONARY: readonly RuleKeyDef[] = keysJson.keys.map((k) => RuleKeyDef.parse(k));

export const RULE_SET_FILES: readonly RuleSetFile[] = [RuleSetFile.parse(pro2026), RuleSetFile.parse(college2026)];

export class RuleSetError extends Error {}

/** Validates one file against the key dictionary: every key present once, types match, no unknown key. */
export function validateRuleSetFile(file: RuleSetFile, dict: readonly RuleKeyDef[] = KEY_DICTIONARY, files: readonly RuleSetFile[] = RULE_SET_FILES): string[] {
  const errors: string[] = [];
  const flat = flatten(file, files);
  for (const def of dict) {
    const v = flat.get(def.key);
    if (v === undefined) { errors.push(`${file.ruleset_id}: missing required key ${def.key}`); continue; }
    if (def.type === 'number' && typeof v.value !== 'number') errors.push(`${file.ruleset_id}: ${def.key} must be a number`);
    if (def.type === 'boolean' && typeof v.value !== 'boolean') errors.push(`${file.ruleset_id}: ${def.key} must be true or false`);
    if (def.type === 'option' && (typeof v.value !== 'string' || !def.options?.includes(v.value))) errors.push(`${file.ruleset_id}: ${def.key} must be one of ${def.options?.join(', ')}`);
    if (def.unit && v.unit !== def.unit) errors.push(`${file.ruleset_id}: ${def.key} unit ${v.unit} differs from dictionary unit ${def.unit}`);
  }
  const seen = new Set<string>();
  for (const v of file.values) {
    if (seen.has(v.key)) errors.push(`${file.ruleset_id}: key ${v.key} appears twice`);
    seen.add(v.key);
    if (!dict.some((d) => d.key === v.key)) errors.push(`${file.ruleset_id}: unknown key ${v.key} (add it to keys.json and to every level file)`);
  }
  return errors;
}

function flatten(file: RuleSetFile, files: readonly RuleSetFile[]): Map<string, RuleSetFile['values'][number]> {
  const chain: RuleSetFile[] = [];
  let cur: RuleSetFile | undefined = file;
  while (cur) {
    if (chain.includes(cur)) throw new RuleSetError(`rule set inheritance cycle at ${cur.ruleset_id}`);
    chain.unshift(cur);
    const parentId: string | undefined = cur.parent;
    cur = parentId ? files.find((f) => f.ruleset_id === parentId) : undefined;
    if (parentId && !cur) throw new RuleSetError(`${file.ruleset_id}: parent ${parentId} not found`);
  }
  const out = new Map<string, RuleSetFile['values'][number]>();
  for (const f of chain) for (const v of f.values) out.set(v.key, v);
  return out;
}

/** Resolves a rule-set id to the read-only object handed to officiating, the engine and the AI. */
export function resolveRuleSet(id: string, files: readonly RuleSetFile[] = RULE_SET_FILES): RuleSet {
  const file = files.find((f) => f.ruleset_id === id);
  if (!file) throw new RuleSetError(`unknown rule set ${id}`);
  const errors = validateRuleSetFile(file, KEY_DICTIONARY, files);
  if (errors.length) throw new RuleSetError(errors.join('\n'));
  const flat = flatten(file, files);
  const get = (key: string) => {
    const v = flat.get(key);
    if (v === undefined) throw new RuleSetError(`${id}: missing required key ${key}`);
    return v.value;
  };
  // Sorted once (G-97): callers ask for the key list inside the play loop. Frozen, so no caller can change it.
  const sortedKeys: readonly string[] = Object.freeze([...flat.keys()].sort());
  return Object.freeze({
    id: file.ruleset_id,
    level: file.level,
    seasonYear: file.season_year,
    num(key: string) { const v = get(key); if (typeof v !== 'number') throw new RuleSetError(`${id}: ${key} is not a number`); return v; },
    bool(key: string) { const v = get(key); if (typeof v !== 'boolean') throw new RuleSetError(`${id}: ${key} is not a switch`); return v; },
    opt(key: string) { const v = get(key); if (typeof v !== 'string') throw new RuleSetError(`${id}: ${key} is not an option`); return v; },
    keys() { return sortedKeys; },
  });
}

export function ruleSetValues(id: string): readonly RuleSetFile['values'][number][] {
  const file = RULE_SET_FILES.find((f) => f.ruleset_id === id);
  if (!file) throw new RuleSetError(`unknown rule set ${id}`);
  return [...flatten(file, RULE_SET_FILES).values()];
}

/** League-rules ids a competition may name; `resolveLeagueRules` joins and checks their files (data/league). */
export const LEAGUE_RULES_IDS = ['pro_league_2026', 'college_league_2026'] as const;

// League-rules resolver: LEAGUE_FILES, resolveLeagueRules, validateLeagueFiles.
export * from './league/index.ts';


// Foul catalogue loader (WP-01, D-06): FOUL_IDS, checkFoulCatalogue, foulRow, foulCatalogue.
export * from './catalogue/index.ts';

/** Name map (data/key-map.json): old module names for dictionary keys, and the stat-source labels for fouls. */
export interface FoulStatLabel { readonly ids: readonly string[]; readonly role?: 'offense' | 'defense' }
export const KEY_MAP: {
  readonly keys: readonly { readonly from: string; readonly to: string | null; readonly usedBy: readonly string[]; readonly note?: string }[];
  readonly foulIds: readonly { readonly from: string; readonly to: readonly string[]; readonly usedBy: readonly string[]; readonly note?: string }[];
  readonly statLabels: Readonly<Record<string, FoulStatLabel>>;
} = keyMapJson as never;
/** Catalogue foul ids (and the fouling role, when the label fixes one) behind a stat-source foul label. An unknown label is taken as a catalogue id. */
export function foulStatLabel(label: string): FoulStatLabel { return KEY_MAP.statLabels[label] ?? { ids: [label] }; }

// League-rules files by level (C5, C6, T5), read by the world setup in the app.
export * as league from './league/index.ts';
