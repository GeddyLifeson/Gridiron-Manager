// Shared shapes of coach AI game management (K5). Everything a decision reads is either public game
// state, a rule value, or an estimate handed in by the caller from the staff's view (K3.2.1, K9): this
// module never sees a true rating or a true outcome chance. Truth values are added to the log row later
// by the game layer (K5.1.1 outputs).
import type { wp } from '@gm/models';
import type { Draws } from '../profile/draws.ts';
import type { BehaviorBlock, TendencyBlock } from '../profile/types.ts';
import type { ErrorId } from './params.ts';

export type WpModel = wp.WpModel;
export type WpState = wp.WpState;
export type OptionOutcome = wp.OptionOutcome;
/** The engine's deterministic math (structurally @gm/schema `DeterministicMath`). */
export type MgmtMath = Parameters<typeof wp.wp>[2];

/** Any rule set satisfies it. K5 reads values by key, never by level (K5.8.1). */
export interface RuleReader { num(key: string): number }

/** The game as the deciding coach's scoreboard shows it. All fields are public. */
export interface Situation {
  /** The deciding team has the ball (or is about to snap or kick). */
  readonly hasBall: boolean;
  readonly down: number;
  readonly distanceYd: number;
  /** Yards from the ball to the goal line the team in possession attacks. */
  readonly yardsToGoalYd: number;
  /** Deciding team's points minus the opponent's. */
  readonly scoreDiff: number;
  readonly gameSecondsLeft: number;
  readonly halfSecondsLeft: number;
  readonly firstHalf: boolean;
  readonly overtime: boolean;
  /** Period number from 1; overtime periods continue the count. */
  readonly period: number;
  readonly receivesSecondHalfKickoff: boolean;
  readonly timeoutsOwn: number;
  readonly timeoutsOpp: number;
  readonly home: boolean;
  /** Staff's strength gap in points, positive when the deciding team is stronger (N2.6.1). */
  readonly pregameGap: number;
  readonly clockRunning: boolean;
  /** The automatic late-half stop (two-minute warning or timeout) has not happened yet this half. */
  readonly autoStopPending: boolean;
  /** Seconds on the play clock now. */
  readonly playClockS: number;
}

/** The staff's estimates for this matchup today (N2.4.1 inputs; structurally models `ChartEstimates`). */
export interface StaffEstimates {
  convert(distanceYd: number, yardsToGoalYd: number): number;
  fieldGoal(yardsToGoalYd: number): number;
  missedFieldGoalSpot(yardsToGoalYd: number): number;
  punt(yardsToGoalYd: number): number | null;
  readonly kickTry: number;
  readonly twoPoint: number;
}

export interface ChartBase {
  readonly scoreDiff: number; readonly gameSecondsLeft: number; readonly halfSecondsLeft: number; readonly firstHalf: boolean;
  readonly receivesSecondHalfKickoff: boolean; readonly timeoutsOffense: number; readonly timeoutsDefense: number; readonly home: boolean; readonly pregameGap: number;
}
export interface ChartRuleValues {
  readonly touchdown: number; readonly fieldGoal: number; readonly kickTry: number; readonly twoPointTry: number;
  readonly yardsToGain: number; readonly fieldLength: number; readonly fgMissMinYardline: number;
}
export type FourthOption = 'go' | 'field_goal' | 'punt';

/**
 * The G-71 decision chart functions (models `strength`), passed in by the caller: that module is not in
 * the @gm/models barrel yet (CR-G71-2), and barrels are integrator-only. `strength` satisfies it as is.
 */
export interface ChartPort {
  fourthDownOutcomes(base: ChartBase, r: ChartRuleValues, e: StaffEstimates, yardsToGoal: number, distance: number): Partial<Record<FourthOption, OptionOutcome[]>>;
}

/** One cell of the weekly chart (N2.4.1), for a coach with no advisor (K5.1.1 rule 5). */
export interface WeeklyCell { readonly yardsToGoalYd: number; readonly distanceYd: number; readonly model: FourthOption; readonly margin: number }

/** What K5 reads from a profile (K2.1.3, K2.1.4). */
export interface CoachInputs {
  readonly tendencies: TendencyBlock;
  readonly behavior: Pick<BehaviorBlock, 'clockManagement' | 'evaluation'>;
  /** A staff member holds the game-management duty (K2.6.1). */
  readonly advisor: boolean;
}

export interface Env {
  readonly model: WpModel;
  readonly math: MgmtMath;
  readonly rules: RuleReader;
  /** `coachAI` stream scoped by game, play and decision type (K5.6.1 rule 3, J13.2.1). */
  readonly draws: Draws;
  /** False in a test build: no K5.6.1 error is drawn (K5.6.1 acceptance). */
  readonly errors: boolean;
}

export interface OptionEst { readonly id: string; readonly wp: number }

/** Decision-log row (N3) for one K5 decision. `wpTrue` is filled by the game layer, which holds the truth. */
export interface LogRow {
  readonly decisionType: string;
  readonly options: readonly OptionEst[];
  readonly chosen: string;
  readonly model: string;
  readonly habit: string;
  readonly marginPts: number;
  readonly offsetPts: number;
  readonly advice: string | null;
  readonly followedAdvice: boolean;
  readonly errorId: ErrorId | null;
  /** The choice came from the A3 ruling 22 floor, not from the method. */
  readonly floor: boolean;
  readonly wpTrue: null;
}
