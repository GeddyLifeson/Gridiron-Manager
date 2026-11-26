// League hiring rules the staff module reads (E2.3.1 values, C11.6.1 permission check, L4.2.1). None is in
// the dictionary yet: requested from the integrator and the league-values research thread (README). A key
// absent from a level's rule set means the rule does not exist there, so the college record (no
// playoff-keyed windows, no permission system, E2.3.1 college paragraph) is simply a rule set without
// these keys. No code tests the level (P1.1.2) and no league timing or count is a literal here (L4.2.1
// acceptance).
import type { RuleKeyManifest, RuleSet } from '@gm/schema';

const READ_BY = ['career.staff'];
const num = (key: string, unit: string, ownerLeaf: string, meaning: string) => ({ key, type: 'number' as const, unit, meaning, ownerLeaf, readBy: READ_BY });
const bool = (key: string, ownerLeaf: string, meaning: string) => ({ key, type: 'boolean' as const, meaning, ownerLeaf, readBy: READ_BY });

export const K = {
  playoffWindows: 'hiring.playoff_windows',
  virtualAfterDays: 'hiring.virtual_interview_after_days',
  lateSeasonConsent: 'hiring.late_season_consent_interviews',
  consentWeeksLeft: 'hiring.consent_interview_weeks_left',
  playoffCapMinutes: 'hiring.playoff_candidate_interview_cap_minutes',
  permissionRequired: 'hiring.permission_required',
  promotionBlockForbidden: 'hiring.promotion_block_forbidden',
  headCoachBlockForbidden: 'hiring.head_coach_block_forbidden',
  lateralBlockAllowed: 'hiring.lateral_block_allowed',
  hcExternal: 'hiring.diverse_interview.head_coach_external_candidates',
  hcInPerson: 'hiring.diverse_interview.head_coach_in_person',
  coordExternal: 'hiring.diverse_interview.coordinator_external_candidates',
  qbCandidates: 'hiring.diverse_interview.quarterback_coach_candidates',
} as const;

export const RULE_KEYS: RuleKeyManifest = [
  bool(K.playoffWindows, 'E2.3.1', 'Interviews of employed coaches follow the playoff-keyed state machine (NEW: pro true; absent at college, E2.3.1).'),
  num(K.virtualAfterDays, 'days', 'E2.3.1', 'Days after the club\'s last game before a virtual interview is allowed (NEW: "third day", 2 of 3).'),
  bool(K.lateSeasonConsent, 'E2.3.1', 'Employer-consented interviews late in the regular season (NEW: default false, 1 of 3).'),
  num(K.consentWeeksLeft, 'weeks', 'E2.3.1', 'Regular-season weeks left (this one included) from which a consented interview is allowed (NEW: second-to-last week = 2, 1 of 3).'),
  num(K.playoffCapMinutes, 'min', 'E2.3.1', 'Interview minutes per hiring club with a candidate whose club is in the playoffs (NEW: 180, 2 of 3).'),
  bool(K.permissionRequired, 'C11.6.1', 'Talking to another club\'s coach needs that club\'s permission; without it, tampering (NEW: pro true; college absent, buyouts in place of permission).'),
  bool(K.promotionBlockForbidden, 'L4.2.1', 'A club may not block an interview for a promotion (NEW: true since 2020-05-19, Verified).'),
  bool(K.headCoachBlockForbidden, 'L4.2.1', 'A club may not block an interview for a head coach job (NEW: true, 1 of 3).'),
  bool(K.lateralBlockAllowed, 'L4.2.1', 'A club may refuse a lateral interview request (NEW: true, 2 of 3).'),
  num(K.hcExternal, 'count', 'E2.3.1', 'External diverse candidates a head coach search must interview (NEW: 2, 3 of 3).'),
  bool(K.hcInPerson, 'E2.3.1', 'The head coach diverse interviews must be in person (NEW: true, 2 of 3).'),
  num(K.coordExternal, 'count', 'E2.3.1', 'External diverse candidates a coordinator search must interview (NEW: 1, 3 of 3 with one weak source).'),
  num(K.qbCandidates, 'count', 'E2.3.1', 'Diverse candidates a quarterback coach search must interview (NEW: 1, 2 of 3).'),
];

/** Hiring rules resolved from a rule set; an absent key is "no such rule". */
export interface HiringRules {
  readonly playoffWindows: boolean;
  readonly virtualAfterDays: number | null;
  readonly lateSeasonConsent: boolean;
  readonly consentWeeksLeft: number | null;
  readonly playoffCapMinutes: number | null;
  readonly permissionRequired: boolean;
  readonly promotionBlockForbidden: boolean;
  readonly headCoachBlockForbidden: boolean;
  readonly lateralBlockAllowed: boolean;
  readonly hcExternal: number | null;
  readonly hcInPerson: boolean;
  readonly coordExternal: number | null;
  readonly qbCandidates: number | null;
}

export function hiringRules(rules: Pick<RuleSet, 'keys' | 'num' | 'bool'>): HiringRules {
  const has = new Set(rules.keys());
  const b = (k: string) => (has.has(k) ? rules.bool(k) : false);
  const n = (k: string) => (has.has(k) ? rules.num(k) : null);
  return {
    playoffWindows: b(K.playoffWindows), virtualAfterDays: n(K.virtualAfterDays), lateSeasonConsent: b(K.lateSeasonConsent),
    consentWeeksLeft: n(K.consentWeeksLeft), playoffCapMinutes: n(K.playoffCapMinutes), permissionRequired: b(K.permissionRequired),
    promotionBlockForbidden: b(K.promotionBlockForbidden), headCoachBlockForbidden: b(K.headCoachBlockForbidden),
    lateralBlockAllowed: b(K.lateralBlockAllowed), hcExternal: n(K.hcExternal), hcInPerson: b(K.hcInPerson),
    coordExternal: n(K.coordExternal), qbCandidates: n(K.qbCandidates),
  };
}

/** Rules from a plain map (tests, tools, presets before the rule files carry the keys). */
export function hiringRulesFrom(values: Readonly<Record<string, number | boolean>>): HiringRules {
  return hiringRules({
    keys: () => Object.keys(values),
    num: (k) => Number(values[k]),
    bool: (k) => Boolean(values[k]),
  });
}
