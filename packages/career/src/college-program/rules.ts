// League-rule keys this module reads (RULE_KEYS; game build plan section 2). The values are rule data
// that G-10 and the rule-values research thread supply with fact rows. An absent key means no limit
// under that rule set: the module never branches on a level word (P1.3.3).
import type { RuleKeyDef, RuleKeyManifest, RuleSet } from '@gm/schema';
import { MODULE } from './params.ts';
import type { LimitedSeat } from './types.ts';

export const SEAT_KEY: Readonly<Record<LimitedSeat, string>> = {
  graduate_assistant: 'staff.graduate_assistant_limit',
  off_campus_recruiter: 'staff.off_campus_recruiter_limit',
  strength: 'staff.strength_staff_limit',
  student_assistant: 'staff.student_assistant_limit',
  headset: 'staff.headset_limit',
};

const MEANING: Readonly<Record<LimitedSeat, string>> = {
  graduate_assistant: 'graduate assistant (graduate student coach) seats per program (S1.2.2; bible value 4)',
  off_campus_recruiter: 'staff who may recruit off campus at one time, head coach included (S1.2.2; bible value 11)',
  strength: 'strength and conditioning staff per program (S1.2.2; bible value 5)',
  student_assistant: 'student assistant seats per program (S1.2.2; bible value 11, capped at the off-campus recruiter number)',
  headset: 'headsets in use on game day (S1.2.2; bible value 23)',
};

function def(seat: LimitedSeat): RuleKeyDef {
  return { key: SEAT_KEY[seat], type: 'number', unit: 'count', meaning: MEANING[seat], ownerLeaf: 'S1.2.2', readBy: [MODULE] };
}

/** Every rule key this module reads. */
export const RULE_KEYS: RuleKeyManifest = (Object.keys(SEAT_KEY) as LimitedSeat[]).map(def);

/** The seat limit under this rule set, or null where the set has none. */
export function seatLimit(rules: RuleSet, seat: LimitedSeat): number | null {
  const k = SEAT_KEY[seat];
  return rules.keys().includes(k) ? rules.num(k) : null;
}
