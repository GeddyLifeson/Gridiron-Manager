// Need definitions, class weight rows and need weights (X5.1.1, X5.1.2).
// The starting set below is X5.1.2 rule 2. Its numbers are starting values and Assumption (X5.1.2 rule 3,
// X5.1.1 rule 5); they are data, so the content pipeline (G-08) can move them to
// `content/people/needs/<id>.yaml` and `content/people/need_weights.yaml` with no code change.
import { np } from './params.ts';

export type NeedId = string;
/** Person kinds a need applies to (X5.1.2 `applies_to`). */
export type PersonKind = 'player' | 'coach' | 'staff' | 'owner';

export interface TraitModifier {
  /** `facet` reads X1.1.2 facets (0 to 100, mid 50); `value` reads X1.1.3 values (-50 to +50, mid 0). */
  readonly kind: 'facet' | 'value';
  readonly key: string;
  /** Change in weight share per full span from the middle: +0.4 means an extreme facet raises the weight by 40 percent. */
  readonly gain: number;
}

export interface NeedDef {
  readonly id: NeedId;
  readonly appliesTo: readonly PersonKind[];
  /** Points per week while fully unmet (X5.1.2 rule 1, 1 to 4 by rule 3). */
  readonly buildRate: number;
  /** Events and conditions that lower it, with sizes in need points. At least one (X5.1.2 acceptance). */
  readonly relief: readonly { readonly source: string; readonly size: number }[];
  readonly traitModifiers: readonly TraitModifier[];
  /** Modules that read it. A need with no reader fails the build (X5.1.2 rule 4). */
  readonly readers: readonly string[];
  /** Measured against the person's own best of the last seasons (X5.1.2 rule 5). */
  readonly movingReference: boolean;
}

export interface ClassWeightRow {
  readonly classId: string;
  /** Need id to weight 0 to 1 (X5.1.1 rule 5). */
  readonly weights: Readonly<Record<NeedId, number>>;
}

const f = (key: string, gain: number): TraitModifier => ({ kind: 'facet', key, gain });
const v = (key: string, gain: number): TraitModifier => ({ kind: 'value', key, gain });

/** X5.1.2 rule 2 starting set. Readers are the bible owners of the decisions the need feeds. Assumption. */
export const STARTING_NEEDS: readonly NeedDef[] = [
  { id: 'playing_time', appliesTo: ['player'], buildRate: 3, relief: [{ source: 'snaps_at_expected_share', size: 6 }, { source: 'named_starter', size: 30 }],
    traitModifiers: [f('competitiveness', 0.4), f('ego', 0.3), v('playing_time_or_role', 0.4)], readers: ['D12', 'L1', 'M2', 'T6'], movingReference: true },
  { id: 'role_and_respect', appliesTo: ['player', 'coach', 'staff'], buildRate: 2, relief: [{ source: 'role_conversation_kept', size: 15 }, { source: 'promoted', size: 25 }],
    traitModifiers: [f('ego', 0.6), v('playing_time_or_role', 0.3)], readers: ['D12', 'L1', 'L4'], movingReference: true },
  { id: 'pay', appliesTo: ['player', 'coach', 'staff'], buildRate: 2, relief: [{ source: 'contract_signed', size: 50 }, { source: 'raise_given', size: 25 }],
    traitModifiers: [v('money', 0.5)], readers: ['C6', 'L7', 'E3', 'T7'], movingReference: true },
  { id: 'winning', appliesTo: ['player', 'coach', 'staff', 'owner'], buildRate: 2, relief: [{ source: 'game_won', size: 4 }, { source: 'postseason_reached', size: 30 }],
    traitModifiers: [f('competitiveness', 0.5), v('winning', 0.5)], readers: ['D12', 'K8', 'E4'], movingReference: false },
  { id: 'security', appliesTo: ['player', 'coach', 'staff'], buildRate: 2, relief: [{ source: 'contract_extended', size: 40 }, { source: 'roster_spot_secured', size: 20 }],
    traitModifiers: [f('risk_tolerance', -0.4), v('stability', 0.5)], readers: ['C6', 'E3', 'E4', 'L7'], movingReference: false },
  { id: 'development', appliesTo: ['player', 'coach'], buildRate: 1, relief: [{ source: 'individual_coaching_session', size: 5 }, { source: 'position_coach_hired', size: 15 }],
    traitModifiers: [f('work_habits', 0.3), v('development', 0.4)], readers: ['D7', 'H3', 'L4'], movingReference: false },
  { id: 'home_and_family', appliesTo: ['player', 'coach', 'staff'], buildRate: 1, relief: [{ source: 'time_off_granted', size: 8 }, { source: 'moved_closer_to_home', size: 40 }],
    traitModifiers: [v('family_and_home', 0.6)], readers: ['D12', 'E8', 'L7'], movingReference: false },
  { id: 'autonomy', appliesTo: ['coach', 'staff', 'owner'], buildRate: 2, relief: [{ source: 'play_calling_delegated', size: 25 }, { source: 'staff_choice_granted', size: 20 }],
    traitModifiers: [f('ego', 0.3), v('independence', 0.5)], readers: ['L4', 'L5', 'K7'], movingReference: false },
  { id: 'recognition', appliesTo: ['player', 'coach', 'staff'], buildRate: 1, relief: [{ source: 'honor_received', size: 30 }, { source: 'public_credit_given', size: 8 }],
    traitModifiers: [f('ego', 0.4), v('legacy', 0.3)], readers: ['C9', 'E5', 'L6'], movingReference: true },
];

/** X5.1.1 rule 5 starting class rows (Assumption). A missing need reads as weight 0. */
export const STARTING_CLASS_WEIGHTS: readonly ClassWeightRow[] = [
  { classId: 'starter', weights: { playing_time: 0.5, role_and_respect: 0.6, pay: 0.6, winning: 0.7, security: 0.4, development: 0.3, home_and_family: 0.3, recognition: 0.5 } },
  { classId: 'backup', weights: { playing_time: 0.8, role_and_respect: 0.6, pay: 0.4, winning: 0.5, security: 0.7, development: 0.5, home_and_family: 0.3, recognition: 0.3 } },
  { classId: 'rookie', weights: { playing_time: 0.6, role_and_respect: 0.4, pay: 0.3, winning: 0.4, security: 0.6, development: 0.8, home_and_family: 0.4, recognition: 0.3 } },
  { classId: 'veteran', weights: { playing_time: 0.6, role_and_respect: 0.8, pay: 0.6, winning: 0.8, security: 0.6, development: 0.2, home_and_family: 0.5, recognition: 0.5 } },
  { classId: 'position_coach', weights: { role_and_respect: 0.5, pay: 0.5, winning: 0.6, security: 0.7, development: 0.5, home_and_family: 0.5, autonomy: 0.4, recognition: 0.4 } },
  { classId: 'coordinator', weights: { role_and_respect: 0.6, pay: 0.6, winning: 0.7, security: 0.6, development: 0.3, home_and_family: 0.4, autonomy: 0.7, recognition: 0.6 } },
  { classId: 'head_coach', weights: { role_and_respect: 0.6, pay: 0.6, winning: 0.9, security: 0.7, home_and_family: 0.4, autonomy: 0.8, recognition: 0.6 } },
  { classId: 'support_staff', weights: { role_and_respect: 0.5, pay: 0.6, winning: 0.4, security: 0.7, home_and_family: 0.6, autonomy: 0.3, recognition: 0.3 } },
  { classId: 'owner', weights: { winning: 0.9, autonomy: 0.8 } },
];

export interface RegistryProblem { readonly needId: NeedId; readonly message: string }

/** Content build checks for a need registry (X5.1.2 rules 3 and 4, acceptance). */
export function validateNeedRegistry(needs: readonly NeedDef[]): RegistryProblem[] {
  const out: RegistryProblem[] = [];
  const seen = new Set<string>();
  for (const n of needs) {
    if (seen.has(n.id)) out.push({ needId: n.id, message: 'duplicate need id' });
    seen.add(n.id);
    if (n.readers.length === 0) out.push({ needId: n.id, message: 'need has no reader (X5.1.2 rule 4)' });
    if (n.relief.length === 0) out.push({ needId: n.id, message: 'need has no relief source (X5.1.2 acceptance)' });
    if (n.buildRate < np('needs.buildRate.min') || n.buildRate > np('needs.buildRate.max')) out.push({ needId: n.id, message: `build rate ${n.buildRate} outside the X5.1.2 rule 3 range` });
    if (n.appliesTo.length === 0) out.push({ needId: n.id, message: 'need applies to no person kind' });
  }
  return out;
}

/** Class rows with one team's culture overrides applied (X5.1.1 rule 5, X9.1.1). Key format `classId.needId`. */
export function applyCultureOverrides(rows: readonly ClassWeightRow[], overrides: Readonly<Record<string, number>> | undefined): ClassWeightRow[] {
  if (!overrides) return rows.map((r) => ({ classId: r.classId, weights: { ...r.weights } }));
  return rows.map((r) => {
    const w: Record<string, number> = { ...r.weights };
    for (const [k, val] of Object.entries(overrides)) {
      const dot = k.indexOf('.');
      if (dot > 0 && k.slice(0, dot) === r.classId) w[k.slice(dot + 1)] = clamp01(val);
    }
    return { classId: r.classId, weights: w };
  });
}

export interface WeightSubject {
  readonly kind: PersonKind;
  /** Every class the person is in; a person in two classes takes the higher weight per need (X5.1.1 rule 5). */
  readonly classIds: readonly string[];
  /** X1 facets and values. Protected people carry the neutral block, so modifiers vanish (X5.5.1). */
  readonly facets: Readonly<Record<string, number>>;
  readonly values: Readonly<Record<string, number>>;
  /** The user's person has no need vector (X5.1.1 rule 4). */
  readonly isUser: boolean;
}

/** Need-weight vector of one person (X5.1.1 rule 3). Returns an empty vector for the user. */
export function needWeights(subject: WeightSubject, needs: readonly NeedDef[], rows: readonly ClassWeightRow[]): Record<NeedId, number> {
  const out: Record<NeedId, number> = {};
  if (subject.isUser) return out;
  const mid = np('needs.trait.facetMid');
  const fSpan = np('needs.trait.facetSpan');
  const vSpan = np('needs.trait.valueSpan');
  for (const n of needs) {
    if (!n.appliesTo.includes(subject.kind)) continue; // X5.1.2 edge case: not stored for him
    let base = 0;
    for (const c of subject.classIds) base = Math.max(base, rows.find((r) => r.classId === c)?.weights[n.id] ?? 0);
    let mult = 1;
    for (const m of n.traitModifiers) {
      const x = m.kind === 'facet' ? ((subject.facets[m.key] ?? mid) - mid) / fSpan : (subject.values[m.key] ?? 0) / vSpan;
      mult += m.gain * x;
    }
    out[n.id] = round3(clamp01(base * Math.max(0, mult)));
  }
  return out;
}

export function clamp01(x: number): number { return x < 0 ? 0 : x > 1 ? 1 : x; }
/** Rounds to 3 places, so weights compare the same on every platform. */
export function round3(x: number): number { return Math.round(x * 1000) / 1000; }
