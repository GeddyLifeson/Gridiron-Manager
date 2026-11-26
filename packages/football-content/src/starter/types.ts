// Authored forms of the starter content. Authored lateral values are positive to the offense's RIGHT
// (G1.1.1); `toAssignment` negates them once into the play frame, where lateral is positive to the
// offense's LEFT (contract decision D-11, assignment.ts). Depth is yards past the line of scrimmage;
// backs are negative.
import type { CoverageFamily, OffensePlayKind, Condition, Action } from '@gm/schema';

export type Arg = string | number | boolean;
export interface Pt { readonly px: number; readonly py: number; readonly kind?: 'through' | 'cut' | 'settle'; readonly landmark?: string }
export interface Clause { readonly when: Condition; readonly guard?: Condition; readonly then: readonly Action[]; readonly text: string }

/** One role's assignment as authored. */
export interface Slot {
  readonly role: string;
  readonly behavior: string;
  readonly params?: Readonly<Record<string, Arg>>;
  readonly path?: readonly Pt[];
  /** Alignment: depth, lateral (right positive). */
  readonly at: readonly [px: number, py: number];
  readonly onLine?: boolean;
  readonly stance?: string;
  /** Alignment rule name for defenders (see ALIGNMENT_RULES in README). Null for a fixed spot. */
  readonly rule?: string;
  readonly motion?: readonly Pt[];
  readonly rules?: readonly Clause[];
  readonly keys?: readonly string[];
  readonly gaze?: string;
  readonly technique?: Readonly<Record<string, string>>;
  readonly concept: string;
  readonly load?: number;
  readonly calls?: readonly string[];
}

/** A claim the content rests on, with its status under A5.2.1 and the sources that support it. */
export interface Basis {
  readonly claim: string;
  readonly status: 'Verified' | '2 of 3' | '1 of 3' | 'Conflict' | 'Assumption' | 'Rulebook only';
  readonly sources: readonly string[];
}

export interface FormationPlayer { readonly role: string; readonly px: number; readonly py: number; readonly onLine: boolean }
export interface FormationDef {
  readonly id: string;
  readonly name: string;
  /** Personnel group code, backs then tight ends (G1.1.1). */
  readonly personnel: string;
  readonly shotgun: boolean;
  /** Receivers to the right, to the left (the call's strength and structure words). */
  readonly structure: string;
  readonly players: readonly FormationPlayer[];
  readonly basis: readonly Basis[];
}

export interface PlayDef {
  readonly id: string;
  readonly name: string;
  readonly kind: OffensePlayKind;
  readonly personnel: string;
  readonly formationId: string;
  readonly shotgun: boolean;
  readonly runDirection: 'left' | 'middle' | 'right' | null;
  readonly intent: 'base' | 'complement' | 'constraint' | 'shot' | 'situational';
  readonly slots: readonly Slot[];
  readonly coachingPoints: readonly string[];
  readonly basis: readonly Basis[];
  /** Always drawn to the right and mirrored by rule (G1.4.2). */
  readonly drawnTo: 'right';
}

export interface DefenseDef {
  readonly id: string;
  readonly name: string;
  readonly coverageFamily: CoverageFamily;
  /** Front or package the call is drawn from. */
  readonly package: string;
  readonly rushers: number;
  readonly boxCount: number;
  readonly drawnAgainst: string;
  readonly slots: readonly Slot[];
  readonly intent: string;
  readonly basis: readonly Basis[];
}
