// Rule keys the positions module reads (S1.2.2). Every staff limit is read here and nowhere else. A key
// absent from a level's rule set means "no limit at this level" (the pro league has none read, S1.2.2),
// so no code tests the level (P1.1.2). These keys are not yet in the dictionary: they are requested from
// the league-values research thread and the integrator (PR body), each with the S1.2.2 value and status.
import type { RuleKeyManifest, RuleSet } from '@gm/schema';

const READ_BY = ['career.positions'];
const k = (key: string, meaning: string) => ({ key, type: 'number' as const, unit: 'count', meaning, ownerLeaf: 'S1.2.2', readBy: READ_BY });

export const RULE_KEYS: RuleKeyManifest = [
  k('staff.grad_assistants_max', 'Graduate assistants a staff may hold (NEW: S1.2.2, top college 4, Verified per S1.1.2).'),
  k('staff.offcampus_recruiters_max', 'Coaches who may recruit off campus, head coach included (NEW: S1.2.2, top college 11, second subdivision 13, 2 of 3).'),
  k('staff.strength_staff_max', 'Strength and conditioning staff (NEW: S1.2.2, top college 5, 2 of 3).'),
  k('staff.student_assistants_max', 'Student assistant coaches, capped at the off-campus recruiter number (NEW: S1.2.2, 11, 1 of 3).'),
  k('staff.headsets_max', 'Headsets in use on game day (NEW: S1.2.2, 23, playing rules 1-4-12-b, Rulebook only).'),
];

/** Limits by key; a key the level's rule set does not hold is no limit. */
export interface StaffLimits {
  readonly byKey: ReadonlyMap<string, number>;
  get(key: string | null): number | null;
}

export function staffLimits(rules: Pick<RuleSet, 'keys' | 'num'>): StaffLimits {
  const present = new Set(rules.keys());
  const byKey = new Map<string, number>();
  for (const def of RULE_KEYS) if (present.has(def.key)) byKey.set(def.key, rules.num(def.key));
  return { byKey, get: (key) => (key === null ? null : byKey.get(key) ?? null) };
}

/** Limits from a plain map (tests, tools, a world preset before rule files carry the keys). */
export function limitsFrom(values: Readonly<Record<string, number>>): StaffLimits {
  const byKey = new Map(Object.entries(values));
  return { byKey, get: (key) => (key === null ? null : byKey.get(key) ?? null) };
}
