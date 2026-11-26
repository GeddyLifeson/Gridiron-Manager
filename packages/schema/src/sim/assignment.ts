// Simulation contract, part 14: the assignment rule language as data (J4.1, J4.2, J4.3, J4.6.1) and
// the legality validator's surface (B4.6.1, P4.2.2, Q1.1.3). Content holds no executable code
// (P1.1.2): an assignment is a data tree that @gm/football-lang interprets. The vocabulary of
// conditions and actions is a data file owned by WP-10 (J4.1.2: "The vocabulary is a data file"); this
// file fixes only the tree shape, so content authors, the compiler and the tick loop agree.
import { z } from 'zod';
import { pub } from '../field.ts';
import type { Slot } from './primitives.ts';
import type { Behavior, Intent, PerceivedView } from './tick.ts';
import type { RuleSet } from '../rules.ts';

const Arg = z.union([z.string(), z.number(), z.boolean()]);

/** A condition tree over perceived state only (J4.1.2). No loops, no arithmetic beyond comparison. */
export type Condition =
  | { op: 'all'; of: Condition[] }
  | { op: 'any'; of: Condition[] }
  | { op: 'not'; of: Condition }
  | { op: 'test'; name: string; args: Record<string, string | number | boolean> };

// The union is built once and the lazy wrapper returns that one object, so schema walkers terminate.
export const Condition: z.ZodType<Condition> = z.lazy(() => conditionUnion);
const conditionUnion: z.ZodType<Condition> = z.union([
  z.object({ op: pub(z.literal('all')), of: pub(z.array(Condition)) }).strict(),
  z.object({ op: pub(z.literal('any')), of: pub(z.array(Condition)) }).strict(),
  z.object({ op: pub(z.literal('not')), of: pub(Condition) }).strict(),
  z.object({ op: pub(z.literal('test')), name: pub(z.string()), args: pub(z.record(z.string(), Arg), 'ratio') }).strict(),
]);

/** An action from the fixed vocabulary (J4.1.3). Each maps to exactly one implementation in the engine. */
export const Action = z.object({
  name: pub(z.string()),
  args: pub(z.record(z.string(), Arg), 'ratio'),
}).strict();
export type Action = z.infer<typeof Action>;

/** One `when` clause: a trigger, an optional guard, an action. First match wins within a tick (J4.1.1). */
export const WhenClause = z.object({
  when: pub(Condition),
  guard: pub(Condition).nullable(),
  then: pub(z.array(Action).min(1)),
  /** Readable form shown by the designer and in the explain record (J4.6.2). */
  text: pub(z.string()),
}).strict();
export type WhenClause = z.infer<typeof WhenClause>;

/**
 * A waypoint in play-frame yards (J1.1.2): px is depth past the line of scrimmage, py is lateral to
 * the offense's LEFT. G1.1.1 stores authored plays with lateral positive to the offense's RIGHT; the
 * content loader negates it once on load (contract decision D-11). Kinds are J2.5.1's.
 */
export const PathPoint = z.object({
  px: pub(z.number(), 'yd'),
  py: pub(z.number(), 'yd'),
  kind: pub(z.enum(['through', 'cut', 'settle'])),
  /** Landmark name (J1.1.3) that replaces the fixed lateral value when present. */
  landmark: pub(z.string()).nullable(),
}).strict();

/** The assignment of one role on one play (J4.1.1). */
export const Assignment = z.object({
  role: pub(z.string()),
  behavior: pub(z.object({ type: pub(z.string()), params: pub(z.record(z.string(), Arg), 'ratio'), path: pub(z.array(PathPoint)) })),
  preSnap: pub(z.object({
    /** Alignment rule: a fixed play-frame spot, or a rule name relative to offensive players (G2.1.1). */
    align: pub(z.object({ px: pub(z.number(), 'yd'), py: pub(z.number(), 'yd'), rule: pub(z.string()).nullable() })),
    onLine: pub(z.boolean()),
    stance: pub(z.string()),
    motion: pub(z.array(PathPoint)),
  })),
  rules: pub(z.array(WhenClause)),
  /** Who he watches, in priority order (J3.1.2), and his gaze rule (J3.4.1). */
  keys: pub(z.array(z.string())),
  gaze: pub(z.string()),
  /** Technique choices for contests (J6): free-form names validated against the vocabulary file. */
  technique: pub(z.record(z.string(), z.string())),
  conceptId: pub(z.string()),
  teachingLoad: pub(z.number().min(0), 'ratio'),
  calls: pub(z.array(z.string())),
}).strict();
export type Assignment = z.infer<typeof Assignment>;

/** A problem found by static validation (J4.6.1) or by the legality checker (B4.6.1). */
export interface ValidationFinding {
  /** 'error': the engine cannot run the play. 'warning': it can be saved, called and flagged (J4.6.1). Illegal is a warning. */
  readonly severity: 'error' | 'warning';
  /** Stable code, for example `formation.line_min` (the rule key broken) or `vocabulary.unknown_action`. */
  readonly code: string;
  /** Rule key the finding rests on, when it is a legality finding. */
  readonly ruleKey: string | null;
  readonly role: string | null;
  readonly messageKey: string;
}

/** What one player's compiled assignment returns for a tick (J4.4.1 outputs). */
export interface DecideOutput {
  readonly intent: Intent;
  readonly behavior: Behavior;
  readonly behaviorState: number;
  /** Index of the rule that fired this tick, or -1 (J4.6.2 explain record). */
  readonly firedRule: number;
  readonly calls: readonly string[];
  readonly technique: Readonly<Record<string, string>>;
}

/** An assignment compiled once per play into closures (P6.3.1), cached by content hash. */
export interface CompiledAssignment {
  readonly role: string;
  /** Entities the rules read, derived from the conditions (J4.1.2): the attention set of J3.1.2. */
  readonly attention: readonly string[];
  decide(slot: Slot, view: PerceivedView): DecideOutput;
}

/** The surface of @gm/football-lang (WP-10). The engine and the designers use the same checker (B4.6.1). */
export interface FootballLang {
  /** Rejects unknown vocabulary and any reference to true state (J3.1.1, J4.1.2). */
  compile(a: Assignment): { compiled: CompiledAssignment | null; findings: ValidationFinding[] };
  /** Static validation of a whole side's assignments (J4.6.1). */
  validateAssignments(assignments: readonly Assignment[]): ValidationFinding[];
  /**
   * Formation and motion legality under the active rule set (B4, G1.5.1). Positions are play frame.
   * An illegal alignment is reported, never repaired or refused: illegal plays still run and draw flags.
   */
  checkAlignment(players: readonly { role: string; px: number; py: number; onLine: boolean; jersey: number; inMotion: boolean }[], rules: RuleSet): ValidationFinding[];
}
