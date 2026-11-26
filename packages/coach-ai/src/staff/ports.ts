// What K6 asks of the procedures it runs (K6.1.1 rule 1, K6.2.2, K6.3.1 rule 1). Staff AI adds no
// football judgment of its own: a delegated caller runs K4 (G-58) with his own profile, a delegated
// game manager runs K5 (G-59) with his, a work product is the K3 procedure (G-74) with his
// parameters. Those modules implement these ports; the caller wires them in.
import type { Draws } from '../profile/index.ts';
import type { AnyCall, DecisionView, OpposingCall, SnappingCall } from './contract.ts';
import type { Duty, StaffMember } from './types.ts';

/** The sheet a caller calls from (K6.1.1 inputs). Ids are content ids (G7); null means the default sheet. */
export interface SheetRef {
  readonly sheetId: string | null;
  /** Who built it. A coordinator calling the head coach's sheet uses the head coach's sheet with his own judgment. */
  readonly builtById: number | null;
}

export interface CallContext {
  readonly caller: StaffMember;
  readonly duty: Duty;
  readonly sheet: SheetRef;
  /** K6.1.1 rule 2: false means he may not add calls from his own system to someone else's sheet. */
  readonly mayAdd: boolean;
  /** Standing instructions in force as one test (K6.1.2): a call that fails it must not be returned. */
  permits(call: AnyCall): boolean;
  /** Stream `coachAI`, keyed by game, request and person (J13.2.1). */
  readonly draws: Draws;
}

export interface CallAnswer<C> {
  readonly call: C;
  /** K4.1.2: play-clock value at which the call is made, tenths. Null for a fixed-window request. */
  readonly acceptedAtPlayClockTenths: number | null;
}

/** One line of a suggestion (K6.2.1 rule 1): a call from his own K4 mix, computed as if he were calling. */
export interface CallSuggestion {
  readonly call: AnyCall;
  /** His K4 weight for it, for ordering only. Never shown as a number. */
  readonly weight: number;
}

/** K4 as K6 runs it (G-58 implements). */
export interface CallerPort {
  snappingCall(view: DecisionView, ctx: CallContext): CallAnswer<SnappingCall> | null;
  opposingCall(view: DecisionView, ctx: CallContext): CallAnswer<OpposingCall> | null;
  /** The top calls of his mix for the situation, best first. */
  suggest(view: DecisionView, ctx: CallContext, max: number): readonly CallSuggestion[];
}

export interface ManageContext {
  readonly decider: StaffMember;
  /** The staff member holding the game-management advice duty, or null (K5.1.1 rules 4 and 5). */
  readonly advisor: StaffMember | null;
  /** Options left after the standing instructions (K6.1.2). */
  readonly allowed: readonly string[];
  readonly draws: Draws;
}

export interface ManageAnswer {
  readonly optionId: string;
  /** K5.1.1 rule 7 thinking time, as the play-clock value at which he answers. Null for a fixed window. */
  readonly acceptedAtPlayClockTenths: number | null;
  /** K5.6.1 error tag, when the error draw replaced the sound decision. */
  readonly errorId: string | null;
}

/** The unit sent out on the last down of a series: the fourth-down decision (J11.6.1). */
export type LastDownChoice = 'go' | 'punt' | 'field_goal';
export const LAST_DOWN_CHOICES: readonly LastDownChoice[] = ['go', 'punt', 'field_goal'];

/** The advisor's line (I5.1.2, K6.2.2): the model's best option by the analyst's estimates, with its margin. */
export interface AdvisorLine {
  readonly optionId: string;
  /** Win-probability margin over the conventional option, by the analyst's estimates. */
  readonly margin: number;
  readonly close: boolean;
}

/** K5 as K6 runs it (G-59 implements). */
export interface ManagerPort {
  choose(view: DecisionView, ctx: ManageContext): ManageAnswer | null;
  lastDown(view: DecisionView, ctx: ManageContext & { readonly allowedUnits: readonly LastDownChoice[] }): { readonly choice: LastDownChoice; readonly errorId: string | null } | null;
  /** K5.1.1 steps 1 and 2 with this analyst's estimates. */
  advise(view: DecisionView, analyst: StaffMember, draws: Draws): AdvisorLine | null;
  /** The generic decision-book cell (I5.1.2 edge case): no opponent or matchup adjustment. */
  genericLine(view: DecisionView): AdvisorLine | null;
}

/** A K3 work product request (K6.3.1 rule 1). `order` carries this staff member's parameters. */
export interface PreparationPort {
  build(kind: string, order: unknown, draws: Draws): unknown;
}
