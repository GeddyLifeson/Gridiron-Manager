// Ports of coach AI play calling (bible K4). coach-ai may import only engine-game, models and league
// (P1.2.1), so everything the caller reads arrives as plain data in these shapes: the sheet (G7, built
// by K3 preparation, G-74), the scouting rows (N2.3.1, G-66), the K5 constraint (G-59), availability
// and readiness (I6, G5.4.1). A schema RandomStream and DeterministicMath satisfy `Draws` and
// `CallMath` structurally. Nothing here can hold a field of the opponent's call, plan or sheet (K9.1.1).
import type { Draws } from '../profile/draws.ts';
import type { PersonnelKey } from '../profile/types.ts';

export type { Draws };

/** The deterministic functions the mix needs (engine dmath satisfies it). */
export interface CallMath {
  exp(x: number): number;
  pow(x: number, y: number): number;
}

export type CallSide = 'offense' | 'defense' | 'specialTeams';

/** K4.3.7 tag dimensions a call can carry. Absent means false. */
export interface CallTags {
  readonly pass?: boolean;
  readonly playAction?: boolean;
  readonly screen?: boolean;
  readonly rpo?: boolean;
  readonly deepShot?: boolean;
  readonly blitz?: boolean;
  readonly simulatedPressure?: boolean;
  readonly man?: boolean;
  readonly twoHigh?: boolean;
}

/** One call on a sheet (G7.1.1). `callId` is the content id the call object is built from. */
export interface SheetCall {
  readonly callId: string;
  /** What a charter would log this call as (N2.3.1 observable fields): the class self-scout counts. */
  readonly lookClass: string;
  readonly tags: CallTags;
  /** Offensive personnel grouping, or null for a defensive or kicking call. */
  readonly personnel: PersonnelKey | null;
  /** The coach's plan weight (G6). Above zero means he means to use it. */
  readonly planWeight: number;
  /** On the tempo menu (I2.4.3 for offense, K4.4.1 rule 5 for defense). */
  readonly tempoMenu: boolean;
}

/** A situation rule of a sheet box (G7.2.1), as plain bounds. A missing bound matches everything. */
export interface SituationRule {
  readonly downs?: readonly number[];
  readonly minDistanceYd?: number;
  readonly maxDistanceYd?: number;
  /** Yards from the ball to the goal line being attacked. */
  readonly minYardsToGoal?: number;
  readonly maxYardsToGoal?: number;
  /** True: only inside the two-minute period. False: only outside it. */
  readonly twoMinute?: boolean;
  /** Matches only when K5 hands this constraint id (K4.1.1 rule 5), for example 'go.short'. */
  readonly constraintId?: string;
}

/** A box on the sheet (G7.2.1) with the K3.3.2 payoff estimates and the K4.3.1 stored mix. */
export interface SheetBox {
  readonly bucketId: string;
  /** Fallback box when this one is empty (K4.1.1 rule 2). */
  readonly parentId: string | null;
  readonly rule: SituationRule;
  readonly callIds: readonly string[];
  /**
   * The coach's estimate per call against each opponent look class, in `sheet.looks` order: expected
   * points added, or win probability in a clock box (K4.3.1 rule 4). It is his estimate, not the truth.
   */
  readonly payoff: Readonly<Record<string, readonly number[]>>;
  /** K4.3.1 output at plan lock; absent before `lockSheet`. */
  readonly storedMix?: Readonly<Record<string, number>>;
  /** Clock situation (two-minute, four-minute, last play). */
  readonly clock: boolean;
  /** The opening script may be used here (K4.5.1: not third and long, backed up or red zone). */
  readonly scriptable: boolean;
}

/** K4.5.1 script entry with its condition (down and distance band). */
export interface ScriptEntry {
  readonly callId: string;
  readonly downs: readonly number[];
  readonly minDistanceYd: number;
  readonly maxDistanceYd: number;
}

/** K4.3.4 sequence package (G6.2.3). `trigger` is the opponent look class that sets it off. */
export interface SequencePackage {
  readonly baseId: string;
  readonly complementId: string | null;
  readonly constraintId: string | null;
  readonly trigger: string;
}

/** K4.3.4 rule 3: "if this gains N or more, go straight to X". */
export interface QueuedFollow {
  readonly afterCallId: string;
  readonly minGainYd: number;
  readonly thenCallId: string;
}

/** K4.5.3 prepared contingency (G6.5.2): a change to one box's candidate list. */
export interface Contingency {
  readonly id: string;
  readonly bucketId: string;
  readonly addCallIds: readonly string[];
  readonly removeCallIds: readonly string[];
  /** Practised in the weekly plan. Off-plan changes cost more understanding (K4.5.3 rule 3). */
  readonly inPlan: boolean;
}

/** The caller's sheet for one side of the ball. AI and user sheets share the format (K4 builder note). */
export interface CallingSheet {
  readonly side: CallSide;
  /** Opponent look classes, the matrix columns (K4.2.1): at most `mix.maxLooks`. */
  readonly looks: readonly string[];
  readonly calls: Readonly<Record<string, SheetCall>>;
  /** Boxes in the sheet's priority order: first match wins (K4.1.1 rule 1). */
  readonly boxes: readonly SheetBox[];
  /** Base box per down (K4.1.1 rules 2 and 4), keyed by the down as a string; '0' is the last resort. */
  readonly baseBoxByDown: Readonly<Record<string, string>>;
  readonly script: readonly ScriptEntry[];
  readonly sequences: readonly SequencePackage[];
  readonly follows: readonly QueuedFollow[];
  readonly contingencies: readonly Contingency[];
}

/** The public situation the caller sees. Every field is on the scoreboard or the field (J11.1.1). */
export interface CallSituation {
  readonly down: number;
  readonly distanceYd: number;
  readonly yardsToGoal: number;
  readonly period: number;
  readonly regulationPeriods: number;
  readonly overtime: boolean;
  readonly insideTwoMinute: boolean;
  /** The calling team's score minus the other team's. */
  readonly margin: number;
}

/** What K5 hands K4 (K4.1.1 rule 5, K5.4.1). */
export interface ManagementConstraint {
  /** Picks boxes whose rule names this id, for example 'go.short'. */
  readonly id?: string;
  /** The clock should run: stay in bounds, no hurry. */
  readonly keepClockRunning?: boolean;
  /** The clock must be saved: forced hurry. */
  readonly saveClock?: boolean;
  /** Extra filter from K5 (kneel, spike, in-bounds only). It wins over every lean (K4.3.7 rule 5). */
  readonly allows?: (call: SheetCall) => boolean;
}

/** One scouted tendency row (K3.1.1 report built from N2.3.1 rows, already degraded by the scout). */
export interface ScoutRow {
  readonly bucketId: string;
  readonly look: string;
  readonly count: number;
  /** 1 for this opponent's film; 0.25 for a new caller's previous team (K4.2.1 edge case). */
  readonly weight?: number;
}

/** What the caller's own booth reports after a play (K4.2.2). Observable fields only. */
export interface Observation {
  readonly bucketId: string;
  /** Down of the play: buckets that share it get the neighbour update (K4.2.2 rule 1). */
  readonly down: number;
  /** The look class the opponent truly showed, as film would settle it. The booth may mislabel it. */
  readonly look: string;
  /** The caller's own call on the play, or null when he did not call it. */
  readonly ownCallId: string | null;
  /** Expected points added for the caller's team by his own models (N2.2.1). */
  readonly epa: number;
  readonly gainYd: number;
  /** The look just produced a big play against him (rule 4). */
  readonly hurt: boolean;
  /** The report reaches him one play late (rule 5: no-huddle opponent). */
  readonly late?: boolean;
}

export type Tempo = 'huddle' | 'no_huddle' | 'hurry_up';

/** Which draw of the `coachAI` stream a step asks for (J13.2.1: keyed by game, play, team, decision type). */
export type DrawKind = 'call' | 'tempo' | 'script' | 'timing' | 'booth' | 'disguise' | 'adjust';
export type DrawSource = (kind: DrawKind) => Draws;
