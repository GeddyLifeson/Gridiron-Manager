// Staff AI on the user's team (bible K6): the people, the duties they hold and the log rows they leave.
// The coaches on the user's staff are the same AI coaches defined in K2 to K5. Nothing here makes them
// better or worse for the user: one difficulty, the staff he hired or was given (K6 rulings).
import type { CoachProfile } from '../profile/index.ts';
import type { DecisionType } from './contract.ts';

/**
 * Duty ids (S3.1.1 duty records, L4.1.1 tasks). `calling.<side>` matches the task ids of the staff
 * chart (career positions, G-25), so the chart's owner map can be passed straight in.
 */
export const DUTY = {
  callOffense: 'calling.offense',
  callDefense: 'calling.defense',
  callSpecialTeams: 'calling.special_teams',
  gameManagement: 'game_management',
  /** S3.4.4: the analyst's line (I5.1.2). */
  gameManagementAdvice: 'game_management_advice',
  substitutions: 'substitutions',
  practiceScripting: 'practice_scripting',
  scoutingReport: 'scouting_report',
  selfScout: 'self_scout',
  playerGrades: 'player_grades',
  gamePlan: 'game_plan',
  callSheet: 'call_sheet',
  install: 'install',
  medicalReport: 'medical_report',
  evaluations: 'evaluations',
  meetings: 'meetings',
} as const;
export type Duty = (typeof DUTY)[keyof typeof DUTY] | (string & {});

/** Duties a game decision request can fall under (K2.6.1). */
export const GAME_DUTIES: readonly Duty[] = [DUTY.callOffense, DUTY.callDefense, DUTY.callSpecialTeams, DUTY.gameManagement];

/** Where he works on game day (L4.1.3): the booth sees coverage better, the sideline hears players. */
export type Seat = 'booth' | 'sideline';

/**
 * X1 facets K6 reads, each 0 to 100, and the K2.8.1 rule-respect z. Hidden truth: passed in by the
 * caller from the people module (coach-ai may not import people, P1.2.1) and never shown.
 */
export interface StaffFacets {
  readonly candor: number;
  readonly ego: number;
  readonly workHabits: number;
  readonly loyalty: number;
  readonly riskTolerance: number;
  readonly ruleRespectZ: number;
}

export interface StaffMember {
  readonly personId: number;
  readonly profile: CoachProfile;
  readonly facets: StaffFacets;
  readonly seat: Seat;
  /** False while ejected, ill or gone (K6.1.1 edge case): X8 succession passes his duties on. */
  readonly available: boolean;
  /** True for an imported real person: never commits or proposes a violation (X14, K6.6.1 edge case). */
  readonly imported: boolean;
}

/** L4.3.2 autonomy setting for one duty. */
export type Autonomy = 'decides' | 'proposes' | 'keeps';

export interface Assignment {
  /** Person holding the duty, or null when the head coach keeps it. */
  readonly holderId: number | null;
  readonly autonomy: Autonomy;
  /** K6.1.1 rule 2: a coordinator calling the head coach's sheet may add calls from his own system. */
  readonly mayAdd?: boolean;
}

/** The staff of one team as K6 reads it. Built by the caller from the staff chart (X8) and the duty records (S3.1.1). */
export interface StaffChart {
  readonly headCoachId: number;
  /** The user's person id when the user holds a seat on this staff, else null (an AI staff). */
  readonly userId: number | null;
  readonly members: readonly StaffMember[];
  readonly assignments: Readonly<Record<string, Assignment>>;
  /**
   * X8 succession order per duty: who takes it when the holder is absent. `*` is the order used for a
   * duty with no list of its own (assistant head coach, then senior coordinators).
   */
  readonly succession: Readonly<Record<string, readonly number[]>>;
}

export type OwnerBasis = 'assigned' | 'succession' | 'head_coach' | 'stand_in' | 'nobody';

/** K2.6.1 `decisionOwner` for one duty. */
export interface Owner {
  readonly duty: Duty;
  readonly personId: number | null;
  readonly isUser: boolean;
  readonly basis: OwnerBasis;
  /** The person who would hold it if he were present, when succession passed it on. */
  readonly absentId: number | null;
}

/** Why a decision came out as it did. The N3 feed (`decidedBy`, K6.1.1 outputs) with the reason beside it. */
export type DecisionBasis =
  | 'user'                    // the user answered a decision he owns
  | 'delegated'               // the duty holder decided (K6.1.1)
  | 'instruction'             // a standing instruction mandated the answer and the holder followed it (K6.1.2)
  | 'reserved_user'           // a reserved decision the user answered
  | 'reserved_timed_out'      // a reserved decision the user did not answer by its deadline: fell to the holder
  | 'user_timed_out'          // a decision the user owns and did not answer: fell to the staff member next in line (J11.6.1)
  | 'override'                // the user replaced or vetoed a delegated call (I2.6.4)
  | 'late'                    // the answer came after the deadline: the J11.6.1 default applied
  | 'default';                // nobody could decide: the conservative rule (J11.6.1)

export interface StaffDecisionRow {
  readonly gameId: number;
  readonly playNumber: number;
  readonly requestId: number;
  readonly type: DecisionType;
  readonly duty: Duty;
  readonly decidedBy: { readonly kind: 'user' | 'ai' | 'staff' | 'default'; readonly personId: number | null };
  readonly basis: DecisionBasis;
  /** Standing instructions that shaped the answer, most specific first. */
  readonly instructionIds: readonly string[];
  /** Set when succession gave the duty to someone else: the user is told (K6.1.1 edge case). */
  readonly absentId: number | null;
  /** K5.6.1 error tag from the game-management procedure, when one fired. */
  readonly errorId: string | null;
  /** Standing instructions dropped because no call could satisfy them all (the more specific one wins, K6.1.2). */
  readonly droppedInstructionIds: readonly string[];
}

/** An override of a delegated call (I2.6.4): its time cost and what it does to the coordinator's trust. */
export interface OverrideEvent {
  readonly gameId: number;
  readonly playNumber: number;
  readonly requestId: number;
  readonly coordinatorId: number;
  readonly kind: 'instruction' | 'replace';
  readonly costTenths: number;
  /** Override number in this game, from 1. */
  readonly count: number;
  /** Trust the coordinator loses (L4 applies it). Zero inside the free allowance. */
  readonly trustCost: number;
  /** True when the time cost pushed the call past its deadline (I2.1.3 late-call rules). */
  readonly late: boolean;
}
