// Rule keys the ladder module reads (S3.3.4 graduate assistant rules, NCAA Bylaw 11.01.3 and later changes).
// Not yet in the dictionary: requested from the integrator and the college facts thread (PR body), each with
// the S3.3.4 value and source status. A key absent from a level's rule set means the rule does not apply
// there (the pro coaching assistant has no classes and no term limit), so no code tests the level (P1.1.2).
import type { RuleKeyManifest, RuleSet } from '@gm/schema';

const READ_BY = ['career.ladder'];
const k = (key: string, unit: string, meaning: string) => ({ key, type: 'number' as const, unit, meaning, ownerLeaf: 'S3.3.4', readBy: READ_BY });

export const RULE_KEYS: RuleKeyManifest = [
  k('staff.ga_degree_window_years', 'years', 'Years after the degree (or end of eligibility) a person may still be hired as a graduate assistant (NEW: S3.3.4 rule 1, 7, 2 of 3).'),
  k('staff.ga_min_load_share', 'ratio', 'Share of the school full-time graduate load a graduate assistant must carry each term (NEW: S3.3.4 rule 2, 0.5, 1 of 3).'),
  k('staff.ga_term_years', 'years', 'Years a graduate assistant seat lasts from appointment (NEW: S3.3.4 rule 3, 2, 2 of 3).'),
  k('staff.ga_extension_semester_hours', 'credit_hours', 'Semester hours completed in the first term that earn one extra year (NEW: S3.3.4 rule 3, 24, 2 of 3).'),
  k('staff.ga_max_years', 'years', 'Most years a person may hold the graduate assistant seat (NEW: S3.3.4 rule 3, 3, Verified).'),
];

/** The graduate assistant rules in force at a level; null when the level has none. */
export interface GaRules {
  readonly degreeWindowYears: number | null;
  readonly minLoadShare: number | null;
  readonly termYears: number | null;
  readonly extensionSemesterHours: number | null;
  readonly maxYears: number | null;
}

export function gaRulesFrom(values: Readonly<Record<string, number>>): GaRules {
  const g = (key: string) => (key in values ? values[key]! : null);
  return {
    degreeWindowYears: g('staff.ga_degree_window_years'),
    minLoadShare: g('staff.ga_min_load_share'),
    termYears: g('staff.ga_term_years'),
    extensionSemesterHours: g('staff.ga_extension_semester_hours'),
    maxYears: g('staff.ga_max_years'),
  };
}

export function gaRules(rules: Pick<RuleSet, 'keys' | 'num'>): GaRules {
  const present = new Set(rules.keys());
  const values: Record<string, number> = {};
  for (const def of RULE_KEYS) if (present.has(def.key)) values[def.key] = rules.num(def.key);
  return gaRulesFrom(values);
}
