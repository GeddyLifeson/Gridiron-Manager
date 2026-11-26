// Rule keys of the medical module (G-33; D11.3 to D11.5, H5). Every league value is read here by key and
// nowhere else. None of the medical.* keys is in the G-10 league files yet: they are requested from G-10
// and the integrator (PR body), with the bible leaf that names each one. A feature is on when its key
// says so (W-13), never by testing the level.
import type { RuleKeyManifest, RuleSet } from '@gm/schema';

const READ_BY = ['league.medical'];

const k = (key: string, type: 'number' | 'boolean' | 'option', unit: string | undefined, meaning: string, ownerLeaf: string, options?: string[]) =>
  ({ key, type, ...(unit ? { unit } : {}), ...(options ? { options } : {}), meaning, ownerLeaf, readBy: READ_BY });

export const REPORT_RULES = ['weekly_practice_and_status', 'none'] as const;
export type ReportRule = (typeof REPORT_RULES)[number];
export const CONCUSSION_PROTOCOLS = ['league_five_step'] as const;
export type ConcussionProtocol = (typeof CONCUSSION_PROTOCOLS)[number];

export const RULE_KEYS: RuleKeyManifest = [
  k('medical.independent_authority', 'boolean', undefined, 'The club physician alone clears a player; no coach control changes a clearance (NEW: H5.6.1 rule 1, D11.3.1 `medical_authority`; true at both levels; CBA Art. 39 sec. 1(d), Verified).', 'D11.3.1'),
  k('medical.concussion_protocol', 'option', undefined, 'Return-to-participation procedure (NEW: D11.4.1 `concussion_protocol`; pro five steps Verified; college Unverified, same steps as placeholder).', 'D11.4.2', [...CONCUSSION_PROTOCOLS]),
  k('medical.concussion_consultant_confirms', 'boolean', undefined, 'An independent neurological consultant must confirm a concussion clearance (NEW: D11.4.2, Verified for pro; college false until researched).', 'D11.4.2'),
  k('medical.injury_report_rule', 'option', undefined, 'Which injury report the league requires (NEW: D11.5.1 `injury_report_rule`; pro weekly practice and status report, college none).', 'D11.5.1', [...REPORT_RULES]),
  k('medical.report_practice_days', 'number', 'count', 'Practice days reported before each game, the last of which carries game status (NEW: H5.2.1 rule 1, 3, 2 of 3).', 'H5.2.1'),
  k('roster.ir_min_games', 'number', 'games', 'Least games missed on injured reserve (existing key; read for the D11.5.2 recommendation only).', 'C5.4.1'),
];

export interface MedicalRules {
  readonly independentAuthority: boolean;
  readonly concussionProtocol: ConcussionProtocol;
  readonly consultantConfirms: boolean;
  readonly reportRule: ReportRule;
  readonly reportPracticeDays: number;
  /** Null when the level has no injured reserve list (college). */
  readonly irMinGames: number | null;
}

function oneOf<T extends string>(v: string, allowed: readonly T[], key: string): T {
  if (!(allowed as readonly string[]).includes(v)) throw new Error(`league.medical: ${key} = ${v} is not one of ${allowed.join(', ')}`);
  return v as T;
}

/** Reads every medical key once. A missing key throws (the rule set is incomplete), except the IR key, whose absence means no list. */
export function medicalRules(rules: RuleSet): MedicalRules {
  const has = new Set(rules.keys());
  return {
    independentAuthority: rules.bool('medical.independent_authority'),
    concussionProtocol: oneOf(rules.opt('medical.concussion_protocol'), CONCUSSION_PROTOCOLS, 'medical.concussion_protocol'),
    consultantConfirms: rules.bool('medical.concussion_consultant_confirms'),
    reportRule: oneOf(rules.opt('medical.injury_report_rule'), REPORT_RULES, 'medical.injury_report_rule'),
    reportPracticeDays: rules.num('medical.report_practice_days'),
    irMinGames: has.has('roster.ir_min_games') ? rules.num('roster.ir_min_games') : null,
  };
}
