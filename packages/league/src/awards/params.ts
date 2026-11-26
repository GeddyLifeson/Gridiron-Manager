// Numbers for awards, records, halls and notability (G-43; C9, X4, E5.6). Two sources only
// (plans/game-build-plan.md section 2): league-rule keys, read from the league-rules file through
// RuleValues, and named tuning parameters in params.json. The league lint bans numeric literals in .ts.
import type { ParamFile, RuleKeyDef, RuleKeyManifest } from '@gm/schema';
import paramsJson from './params.json' with { type: 'json' };

export const MODULE = 'league.awards';

export type RuleValues = Readonly<Record<string, number | string | boolean>>;

export const PARAMS: ParamFile = paramsJson as ParamFile;
const BY_NAME = new Map(PARAMS.params.map((p) => [p.name, p.value] as const));

/** Reads one tuning value by name. Throws on an unknown name. */
export function param(name: string): number {
  const v = BY_NAME.get(name);
  if (v === undefined) throw new Error(`${MODULE}: no parameter ${name}`);
  return v;
}

/** League-rule keys this module reads (B12.1.2 naming). Values come per level from the rules data. */
export const KEY = {
  panelSize: 'awards.panel_size',
  ballotPoints: 'awards.ballot_points',
  voteTiming: 'awards.vote_timing',
  hallClassMin: 'hall.class_min',
  hallClassMax: 'hall.class_max',
  hallVoteShare: 'hall.vote_share',
  hallCommittee: 'hall.committee_voting',
  hallCandidates: 'hall.candidates_per_year',
  hallPlayerWait: 'hall.player_wait_seasons',
  hallCoachWait: 'hall.coach_wait_seasons',
  hallFirstTeam: 'hall.requires_first_team',
  hallPlayerWindow: 'hall.player_window_years',
  hallCoachMinGames: 'hall.coach_min_games',
  hallCoachMinPct: 'hall.coach_min_win_pct',
  hallCoachAgeAtOnce: 'hall.coach_age_at_once',
  hallCoachAgeActive: 'hall.coach_age_active',
} as const;

export const BALLOT_OPTIONS = ['10,5,3,2,1', '5,3,1'] as const;
export const BEFORE_POSTSEASON = 'before_postseason';
export const AFTER_POSTSEASON = 'after_postseason';

function def(key: string, type: RuleKeyDef['type'], meaning: string, ownerLeaf: string, extra: Partial<RuleKeyDef> = {}): RuleKeyDef {
  return { key, type, meaning, ownerLeaf, readBy: [MODULE], ...extra };
}

export const RULE_KEYS: RuleKeyManifest = [
  def(KEY.panelSize, 'number', 'Voters on the season awards panel', 'C9.1.2', { unit: 'count' }),
  def(KEY.ballotPoints, 'option', 'Points per ballot place, best first; the length is the ballot depth', 'C9.1.2', { options: [...BALLOT_OPTIONS] }),
  def(KEY.voteTiming, 'option', 'Whether season award ballots close before or after the postseason', 'E5.6.1', { options: [BEFORE_POSTSEASON, AFTER_POSTSEASON] }),
  def(KEY.hallClassMin, 'number', 'Fewest people a hall class may hold; 0 means no floor', 'C9.3.1', { unit: 'count' }),
  def(KEY.hallClassMax, 'number', 'Most people a hall class may hold', 'C9.3.1', { unit: 'count' }),
  def(KEY.hallVoteShare, 'number', 'Share of the full committee a candidate needs to be elected', 'C9.3.1', { unit: 'ratio' }),
  def(KEY.hallCommittee, 'number', 'Voting members of the hall committee', 'C9.3.1', { unit: 'count' }),
  def(KEY.hallCandidates, 'number', 'Final candidates put to the committee each year', 'C9.3.1', { unit: 'count' }),
  def(KEY.hallPlayerWait, 'number', 'Seasons after a player\'s last season before he is eligible', 'C9.3.1', { unit: 'seasons' }),
  def(KEY.hallCoachWait, 'number', 'Seasons out of the game before a coach is eligible', 'C9.3.1', { unit: 'seasons' }),
  def(KEY.hallFirstTeam, 'boolean', 'A player needs at least one first-team all-league (all-national) selection', 'C9.3.1'),
  def(KEY.hallPlayerWindow, 'number', 'A player\'s last season must fall within this many years of the ballot; 0 means no limit', 'C9.3.1', { unit: 'years' }),
  def(KEY.hallCoachMinGames, 'number', 'Fewest games coached for a coach to be eligible; 0 means none', 'C9.3.1', { unit: 'count' }),
  def(KEY.hallCoachMinPct, 'number', 'Lowest career winning share for a coach to be eligible; 0 means none', 'C9.3.1', { unit: 'ratio' }),
  def(KEY.hallCoachAgeAtOnce, 'number', 'A retired coach this old is eligible at once; 0 means the rule is off', 'C9.3.1', { unit: 'years' }),
  def(KEY.hallCoachAgeActive, 'number', 'An active coach this old is eligible; 0 means the rule is off', 'C9.3.1', { unit: 'years' }),
];

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

/** "10,5,3,2,1" to [10, 5, 3, 2, 1]. */
export function ballotPoints(rules: RuleValues): number[] {
  return str(rules, KEY.ballotPoints).split(',').map(Number);
}

/** Problems with a rule-value set: wrong types or unknown options on present keys, and missing required keys. An absent key means the rule is not in force at that level. */
export function ruleValueProblems(rules: RuleValues, required: readonly string[] = [], manifest: RuleKeyManifest = RULE_KEYS): string[] {
  const out: string[] = [];
  for (const k of Object.keys(rules)) if (!manifest.some((d) => d.key === k)) out.push(`unknown key ${k}`);
  for (const d of manifest) {
    const v = rules[d.key];
    if (v === undefined) { if (required.includes(d.key)) out.push(`missing ${d.key}`); continue; }
    if (d.type === 'number' && typeof v !== 'number') out.push(`${d.key} must be a number`);
    if (d.type === 'boolean' && typeof v !== 'boolean') out.push(`${d.key} must be a boolean`);
    if (d.type === 'option' && (typeof v !== 'string' || !(d.options ?? []).includes(v))) out.push(`${d.key} has unknown option ${String(v)}`);
  }
  return out;
}

/** Reads a number key, or `fallback` when the rule is not in force (key absent). */
export function numOr(rules: RuleValues, key: string, fallback: number): number {
  return rules[key] === undefined ? fallback : num(rules, key);
}
