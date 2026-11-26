// The offensive play object as the designer edits it (G1.1.1). Positions are stored as drawn, relative
// to the ball in yards: `at = [depth, lateral]`, depth negative behind the line, lateral POSITIVE TO
// THE OFFENSE'S RIGHT (G1.1.1). `toEngine.ts` converts once into the play frame, where lateral is
// positive to the left (contract decision D-11). A play holds no outcome numbers (G1.1.1).
import type { Condition, Action, OffensePlayKind } from '@gm/schema';

export type Arg = string | number | boolean;
export type Yd2 = readonly [depth: number, lateral: number];

/** A drawn waypoint. `kind` is J2.5.1's; `landmark` replaces the lateral value when set (J1.1.3). */
export interface DrawnPoint { readonly at: Yd2; readonly kind: 'through' | 'cut' | 'settle'; readonly landmark: string | null }

export interface DrawnClause { readonly when: Condition; readonly guard: Condition | null; readonly then: readonly Action[]; readonly text: string }

/**
 * One slot's assignment (G1.3). `behavior` is a J4 behaviour name (route, pass_block, run_block,
 * carry, mesh, qb_drop, ...); `path` is a route, a block track or a carrier track; `rules` are the
 * when clauses that change it after the snap (option routes, sight adjustments, RPO reads).
 */
export interface SlotAssignment {
  readonly behavior: string;
  readonly params: Readonly<Record<string, Arg>>;
  readonly path: readonly DrawnPoint[];
  readonly rules: readonly DrawnClause[];
  readonly keys: readonly string[];
  readonly gaze: string;
  readonly technique: Readonly<Record<string, string>>;
  /** Concept the assignment belongs to (F6, F4); '' when none. */
  readonly concept: string;
  /** Learning units (G1.7.1). */
  readonly load: number;
  readonly calls: readonly string[];
}

export interface DesignSlot {
  /** Stable slot id (G1.1.2), for example Q, LT, X. Never renamed. */
  readonly role: string;
  /** Letter shown on the marker; the user may rename it to match his system (G1.1.2, G4). */
  readonly letter: string;
  readonly at: Yd2;
  /** The designer forces an on or off choice (G1.5.1 edge case). */
  readonly onLine: boolean;
  readonly stance: string;
  /** G1.1.1 edge case: a sixth lineman stored in a skill slot, or an eligible-numbered player reporting. */
  readonly reportsEligible: boolean;
  readonly extraTackle: boolean;
  readonly assignment: SlotAssignment;
}

export type Strength = 'right' | 'left' | 'field' | 'boundary' | 'tight_end';

/** One pre-snap movement (F3, G1.2.3). A shift moves two or more; a motion moves one. */
export type PresnapStep =
  | { readonly kind: 'shift'; readonly moves: readonly { readonly role: string; readonly to: Yd2; readonly onLine: boolean }[]; readonly setAfterS: number }
  | {
    readonly kind: 'motion'; readonly role: string; readonly path: readonly DrawnPoint[]; readonly onLine: boolean;
    /** False: still moving at the next step, or at the snap when last. */
    readonly stops: boolean; readonly setAfterS: number;
    /** Velocity at the snap when he is still moving, drawn axes (depth toward the line positive, lateral right positive). */
    readonly speed: Yd2 | null;
  };

/** Quarterback rules (G1.3.4). `progression` is read order with the time his eyes arrive. */
export interface QbRules {
  readonly action: string;
  readonly dropSteps: number;
  readonly readType: string;
  readonly progression: readonly { readonly role: string; readonly eyesAtS: number }[];
  readonly hot: readonly { readonly role: string; readonly trigger: string }[];
  readonly throwAway: string;
}

export type IntentRole = 'base' | 'complement' | 'constraint' | 'shot' | 'situational';
export type PlayStatus = 'draft' | 'valid' | 'installed' | 'retired';

export interface CallName {
  readonly formation: string; readonly strength: string; readonly motion: string;
  readonly protection: string; readonly concept: string; readonly tags: readonly string[];
}

export interface RuleFailure { readonly ruleId: string; readonly role: string | null }
export interface DismissedWarning { readonly code: string; readonly role: string | null; readonly reason: string }

/** The G1.1.1 play object. Every field is editable through `applyEdit` (O3.1.1 acceptance 1). */
export interface PlayDraft {
  readonly id: string;
  readonly name: CallName;
  readonly kind: OffensePlayKind;
  /** Group code, backs then tight ends (G1.1.1). */
  readonly personnel: string;
  readonly formation: { readonly id: string | null; readonly strength: Strength };
  readonly slots: readonly DesignSlot[];
  readonly presnap: readonly PresnapStep[];
  readonly qb: QbRules;
  readonly protection: { readonly id: string; readonly redirects: readonly string[] } | null;
  readonly runDirection: 'left' | 'middle' | 'right' | null;
  readonly shotgun: boolean;
  readonly tagsAllowed: readonly string[];
  readonly intent: { readonly role: IntentRole; readonly beats: readonly string[]; readonly checkOutOf: readonly string[] };
  readonly coachingPoints: Readonly<Record<string, string>>;
  readonly source: { readonly author: string; readonly created: string; readonly parentId: string | null };
  readonly status: PlayStatus;
  readonly ruleFailures: readonly RuleFailure[];
  readonly dismissed: readonly DismissedWarning[];
  readonly notes: string;
  /** Published version number; 0 for a never-published draft (O3.7.1). */
  readonly version: number;
}
