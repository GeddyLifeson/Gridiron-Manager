// FIXTURE rule sets for the legality tests. These are not rule data: WP-01 owns the real values and
// their fact rows, and the real-value cases of Q1.1.1 run after integration (engine build plan,
// section 2). The two fixtures differ so both branches of every key are exercised: one has a line
// minimum, number bands with reporting, and no separate backfield limit; the other has a backfield
// limit, a count of numbered linemen, and no reporting.
import type { RuleSet } from '@gm/schema';
import { PARAMS, RULE_KEYS, paramTableOf, type AlignedPlayer } from '../../src/legality/index.ts';

type Values = Record<string, number | boolean | string>;

export function fixtureRuleSet(id: string, values: Values): RuleSet {
  const get = (key: string): number | boolean | string => {
    const v = values[key];
    if (v === undefined) throw new Error(`fixture ${id}: missing key ${key}`);
    return v;
  };
  return {
    id, level: 'pro', seasonYear: 2026,
    num: (k) => get(k) as number, bool: (k) => get(k) as boolean, opt: (k) => get(k) as string,
    keys: () => Object.keys(values),
  };
}

export const FIXTURE_BANDS: Values = {
  'substitution.max_players': 11,
  'formation.line_min': 7,
  'formation.backfield_max': 0,
  'formation.numbered_linemen_min': 0,
  'formation.neither_behind_snapper_max': 1,
  'formation.t_quarterback_depth_yd': 1,
  'formation.motion_rule': 'one_back_not_forward',
  'formation.shift_set_seconds': 1,
  'numbering.eligible_low_max': 49,
  'numbering.eligible_high_min': 80,
  'numbering.eligible_high_max': 89,
  'numbering.scheme': 'position_bands',
  'numbering.report_eligible_allowed': true,
  'numbering.qb_under_center_eligible': false,
};

export const FIXTURE_FREE: Values = {
  ...FIXTURE_BANDS,
  'formation.line_min': 0,
  'formation.backfield_max': 4,
  'formation.numbered_linemen_min': 5,
  'numbering.eligible_high_max': 99,
  'numbering.scheme': 'free_0_99_five_50_79',
  'numbering.report_eligible_allowed': false,
  'numbering.qb_under_center_eligible': true,
};

export const BANDS = fixtureRuleSet('fixture_bands', FIXTURE_BANDS);
export const FREE = fixtureRuleSet('fixture_free', FIXTURE_FREE);
export const FIXTURES: readonly RuleSet[] = [BANDS, FREE];
export const P = paramTableOf([PARAMS]);

/** Every fixture defines exactly the keys of the manifest. */
export const MANIFEST_KEYS = RULE_KEYS.map((k) => k.key);

export function pl(role: string, px: number, py: number, onLine: boolean, jersey: number, more: Partial<AlignedPlayer> = {}): AlignedPlayer {
  return { role, px, py, onLine, jersey, inMotion: false, ...more };
}

/** A plain eleven-man set: seven on the line, a quarterback under center, legal under both fixtures. */
export function base(): AlignedPlayer[] {
  return [
    pl('LT', 0, 1.4, true, 77), pl('LG', 0, 0.7, true, 66), pl('C', 0, 0, true, 60), pl('RG', 0, -0.7, true, 65), pl('RT', 0, -1.4, true, 78),
    pl('X', 0, 18, true, 11), pl('Y', 0, -2.1, true, 88),
    pl('Z', -1, -16, false, 14), pl('H', -1, 8, false, 83), pl('Q', -0.6, 0, false, 9), pl('R', -7, 0, false, 26),
  ];
}

export function swap(players: AlignedPlayer[], role: string, change: Partial<AlignedPlayer>): AlignedPlayer[] {
  return players.map((p) => (p.role === role ? { ...p, ...change } : p));
}

export const illegalCodes = (fs: readonly { code: string; ruleKey: string | null; foul?: string | null }[]): string[] =>
  [...new Set(fs.filter((f) => f.ruleKey !== null || (f.foul ?? null) !== null).map((f) => f.code))].sort();

/** Small seeded generator for the test generators (mulberry32). Tests only: core code uses J13 streams. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
