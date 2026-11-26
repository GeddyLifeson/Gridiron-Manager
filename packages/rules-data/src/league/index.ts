// League-rules resolver (C5, C6, T5; P4.7.1): the league files in data/league, by the league-rules id a
// competition names (`LEAGUE_RULES_IDS`). One id joins its files (the league file and its schedule and
// staff file), checks every value against that file's key dictionary, and answers values by key. The
// files keep their own ruleset ids; the joined object takes the competition-facing id.
import { RuleKeyDef, RuleSetFile } from '@gm/schema';
import proLeague from '../../data/league/proleague_2026.json' with { type: 'json' };
import proSchedStaff from '../../data/league/proleague_schedule_staff_2026.json' with { type: 'json' };
import collegeLeague from '../../data/league/collegeleague_2026.json' with { type: 'json' };
import collegeSchedStaff from '../../data/league/collegeleague_schedule_staff_2026.json' with { type: 'json' };
import keysPro from '../../data/league/keys_pro.json' with { type: 'json' };
import keysProSchedStaff from '../../data/league/keys_pro_schedule_staff.json' with { type: 'json' };
import keysCollege from '../../data/league/keys_college.json' with { type: 'json' };
import keysCollegeSchedStaff from '../../data/league/keys_college_schedule_staff.json' with { type: 'json' };

export class LeagueRulesError extends Error {}

/** One league file with the key dictionary it is checked against. */
export interface LeagueFilePart { readonly file: RuleSetFile; readonly keys: readonly RuleKeyDef[] }

const part = (file: unknown, keys: { keys: unknown[] }): LeagueFilePart => ({ file: RuleSetFile.parse(file), keys: keys.keys.map((k) => RuleKeyDef.parse(k)) });

/** The files behind each league-rules id. */
export const LEAGUE_FILES: Readonly<Record<string, readonly LeagueFilePart[]>> = {
  pro_league_2026: [part(proLeague, keysPro), part(proSchedStaff, keysProSchedStaff)],
  college_league_2026: [part(collegeLeague, keysCollege), part(collegeSchedStaff, keysCollegeSchedStaff)],
};

export type LeagueValue = number | string | boolean;

/** A resolved league-rules set: read-only values by key, with the fact row each came from. */
export interface LeagueRules {
  readonly id: string;
  readonly level: RuleSetFile['level'];
  readonly seasonYear: number;
  has(key: string): boolean;
  get(key: string): LeagueValue;
  num(key: string): number;
  bool(key: string): boolean;
  opt(key: string): string;
  /** Fact register row behind a value (Q6). */
  factOf(key: string): string | null;
  keys(): readonly string[];
  /** A lookup that answers undefined for a missing key, the shape the league modules' fixtures read. */
  lookup(key: string): LeagueValue | undefined;
}

/** Every problem with one id's files: unknown or duplicate keys, missing keys, type or unit mismatch, files that disagree on level or year. */
export function validateLeagueFiles(parts: readonly LeagueFilePart[]): string[] {
  const errors: string[] = [];
  const seen = new Map<string, string>();
  const first = parts[0]?.file;
  for (const { file, keys } of parts) {
    if (first && (file.level !== first.level || file.season_year !== first.season_year)) {
      errors.push(`${file.ruleset_id}: level or season differs from ${first.ruleset_id}`);
    }
    const dict = new Map(keys.map((k) => [k.key, k]));
    const own = new Set<string>();
    for (const v of file.values) {
      const prev = seen.get(v.key);
      if (prev) errors.push(`${file.ruleset_id}: key ${v.key} also set by ${prev}`);
      seen.set(v.key, file.ruleset_id);
      own.add(v.key);
      const def = dict.get(v.key);
      if (!def) { errors.push(`${file.ruleset_id}: unknown key ${v.key}`); continue; }
      if (def.type === 'number' && typeof v.value !== 'number') errors.push(`${file.ruleset_id}: ${v.key} must be a number`);
      if (def.type === 'boolean' && typeof v.value !== 'boolean') errors.push(`${file.ruleset_id}: ${v.key} must be true or false`);
      if (def.type === 'option' && (typeof v.value !== 'string' || (def.options && !def.options.includes(v.value)))) errors.push(`${file.ruleset_id}: ${v.key} must be one of ${def.options?.join(', ')}`);
      if (def.unit && v.unit !== def.unit) errors.push(`${file.ruleset_id}: ${v.key} unit ${v.unit} differs from dictionary unit ${def.unit}`);
    }
    for (const k of dict.keys()) if (!own.has(k)) errors.push(`${file.ruleset_id}: missing key ${k}`);
  }
  return errors;
}

/** Resolves a league-rules id (`LEAGUE_RULES_IDS`). Throws on an unknown id or any file problem. */
export function resolveLeagueRules(id: string, files: Readonly<Record<string, readonly LeagueFilePart[]>> = LEAGUE_FILES): LeagueRules {
  const parts = files[id];
  if (!parts || !parts.length) throw new LeagueRulesError(`unknown league rules ${id}`);
  const errors = validateLeagueFiles(parts);
  if (errors.length) throw new LeagueRulesError(errors.join('\n'));
  const values = new Map<string, { value: LeagueValue; factId: string | null }>();
  for (const { file } of parts) {
    for (const v of file.values) values.set(v.key, { value: v.value as LeagueValue, factId: (v as { factId?: string }).factId ?? null });
  }
  const sorted = Object.freeze([...values.keys()].sort());
  const get = (key: string): LeagueValue => {
    const v = values.get(key);
    if (!v) throw new LeagueRulesError(`${id}: no league rule ${key}`);
    return v.value;
  };
  const head = parts[0]!.file;
  return Object.freeze({
    id, level: head.level, seasonYear: head.season_year,
    has: (key: string) => values.has(key),
    get,
    num(key: string) { const v = get(key); if (typeof v !== 'number') throw new LeagueRulesError(`${id}: ${key} is not a number`); return v; },
    bool(key: string) { const v = get(key); if (typeof v !== 'boolean') throw new LeagueRulesError(`${id}: ${key} is not a switch`); return v; },
    opt(key: string) { const v = get(key); if (typeof v !== 'string') throw new LeagueRulesError(`${id}: ${key} is not an option`); return v; },
    factOf: (key: string) => values.get(key)?.factId ?? null,
    keys: () => sorted,
    lookup: (key: string) => values.get(key)?.value,
  });
}

/** League-rules id of each level's 2026 season. */
const LEAGUE_ID_OF: Readonly<Record<'pro' | 'college', string>> = { pro: 'pro_league_2026', college: 'college_league_2026' };

/** Numeric league-rules values of a level ('pro' or 'college'), by key: the new-game content's lookup. */
export function leagueNumbers(level: 'pro' | 'college'): ReadonlyMap<string, number> {
  const r = resolveLeagueRules(LEAGUE_ID_OF[level]);
  const m = new Map<string, number>();
  for (const k of r.keys()) { const v = r.get(k); if (typeof v === 'number') m.set(k, v); }
  return m;
}
