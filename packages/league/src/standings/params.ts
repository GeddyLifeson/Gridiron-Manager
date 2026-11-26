// Standings module numbers. Two sources only (plans/game-build-plan.md section 2): league-rule keys read
// from the league-rules file, and named tuning parameters. The league lint bans numeric literals in .ts
// files (P1.1.2), so parameter values live in params.json beside this file.
import type { ParamFile, RuleKeyDef, RuleKeyManifest } from '@gm/schema';
import paramsJson from './params.json' with { type: 'json' };
import type { RuleValues } from './types.ts';

export const STANDINGS_MODULE = 'league.standings';

/** Key names, so no string is typed twice. */
export const KEY = {
  tieWinValue: 'standings.tie_win_value',
  commonGamesMin: 'tiebreak.common_games_min',
  restarts: 'tiebreak.restarts',
  clubsPerConference: 'playoff.field_size',
} as const;

/** `tiebreak.restarts` options (C3.2.3). */
export const RESTART_ON_THREE = 'restart_on_three';
export const CONTINUE_ON_THREE = 'continue_on_three';

function def(key: string, type: RuleKeyDef['type'], meaning: string, ownerLeaf: string, extra: Partial<RuleKeyDef> = {}): RuleKeyDef {
  return { key, type, meaning, ownerLeaf, readBy: [STANDINGS_MODULE], ...extra };
}

export const RULE_KEYS: RuleKeyManifest = [
  def(KEY.tieWinValue, 'number', 'Share of a win a tied game counts as in winning percentage; the rest counts as a loss', 'C3.1.1', { unit: 'ratio' }),
  def(KEY.commonGamesMin, 'number', 'Fewest common games for the common-games step between clubs of different divisions or conferences', 'C3.2.2', { unit: 'count' }),
  def(KEY.restarts, 'option', 'What happens when a step removes clubs and leaves three tied: restart_on_three restarts at step 1 of the three-club division list or step 2 (head-to-head sweep) of the three-club wild-card list; continue_on_three goes on to the next step', 'C3.2.3', { options: [RESTART_ON_THREE, CONTINUE_ON_THREE] }),
  def(KEY.clubsPerConference, 'number', 'Playoff clubs per bracket group: per conference where playoff.grouping is conference, in all where it is national', 'C3.3.1', { unit: 'count' }),
];

export const PARAMS: ParamFile = paramsJson as ParamFile;

/** Reads one tuning value by name. Throws on an unknown name. */
export function param(name: string, file: ParamFile = PARAMS): number {
  const p = file.params.find((x) => x.name === name);
  if (!p) throw new Error(`${file.module}: no parameter ${name}`);
  return p.value;
}

export function num(rules: RuleValues, key: string): number {
  const v = rules[key];
  if (typeof v !== 'number') throw new Error(`rule ${key} must be a number, got ${String(v)}`);
  return v;
}
export function str(rules: RuleValues, key: string): string {
  const v = rules[key];
  if (typeof v !== 'string') throw new Error(`rule ${key} must be an option string, got ${String(v)}`);
  return v;
}
export function flag(rules: RuleValues, key: string): boolean {
  const v = rules[key];
  if (typeof v !== 'boolean') throw new Error(`rule ${key} must be a boolean, got ${String(v)}`);
  return v;
}

/** Problems with a rule-value set against a manifest: missing keys, wrong types, unknown options. */
export function ruleValueProblems(manifest: RuleKeyManifest, rules: RuleValues): string[] {
  const out: string[] = [];
  for (const k of manifest) {
    const v = rules[k.key];
    if (v === undefined) { out.push(`${k.key}: missing`); continue; }
    const want = k.type === 'option' ? 'string' : k.type;
    if (typeof v !== want) out.push(`${k.key}: expected ${want}, got ${typeof v}`);
    else if (k.type === 'option' && k.options && !k.options.includes(v as string)) out.push(`${k.key}: ${String(v)} is not one of ${k.options.join(', ')}`);
  }
  return out;
}
