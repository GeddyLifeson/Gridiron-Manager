// Records of the college program module (T9.1 to T9.4, T9.6, L5.4). Money is whole cents (integers).
// These are plain data; their zod twins with visibility classes are proposed for schema/src/world
// (CR-G38-1, test/college-program/proposed-schemas.ts). Visibility: AD and president dispositions,
// booster wealth and mood numbers are truth (the coach sees words and a history, never a bar, T9.1.1);
// budget lines and staff pay are own_team (W-14); facility grades are public as bands.

/** Program tier for budget and pay bands (T2.3.1 tiers, as content ids). Never a level word. */
export const PROGRAM_TIERS = ['power', 'other', 'second'] as const;
export type ProgramTier = (typeof PROGRAM_TIERS)[number];

/** Athletic director (T9.1.1, L5.4.1): an X1 person; these are its hidden dispositions, 0 to 1. */
export interface AthleticDirector {
  readonly personId: number;
  readonly patience: number;
  readonly footballKnowledge: number;
  readonly riskAppetite: number;
  readonly boosterCloseness: number;
  /** An interim AD defers every large request (T9.1.1 edge case). */
  readonly interim: boolean;
  /** False when he did not hire the current coach: E4.6 reads it as a patience reset (T9.1.1 rule 3). */
  readonly hiredCurrentCoach: boolean;
  readonly startYear: number;
  readonly plannedEndYear: number;
}

/** President and board, one body in v1 (L5.4.2). Weights 0 to 1. */
export interface PresidentBody {
  readonly personId: number;
  readonly academicStrictness: number;
  readonly footballPriority: number;
}

/** Who holds final say (L5.2.1 shape, T9.1.1 college default). */
export type Holder = 'head_coach' | 'athletic_director' | 'general_manager';
export interface PowerArrangement {
  readonly roster: Holder;
  /** School payments inside the football budget. */
  readonly contracts: Holder;
  readonly staff: Holder;
  /** Unused at a college (T9.1.1 rule 1). */
  readonly draft: null;
  readonly reports: 'athletic_director';
  /** The program general manager is staff who prepares, proposes and objects (L4.5.1). */
  readonly generalManagerReportsTo: 'head_coach' | 'athletic_director';
}

/** Budget lines of T9.2.1. The roster money pool is T7's and only passes through here. */
export const BUDGET_LINES = [
  'staff_pool', 'support_staff', 'recruiting_travel', 'nutrition', 'academic_support',
  'equipment_technology', 'facilities_projects', 'roster_money',
] as const;
export type BudgetLine = (typeof BUDGET_LINES)[number];

/** Lines the head coach may move money between (T9.2.1 rule 2). */
export const COACH_CONTROLLED: readonly BudgetLine[] = ['staff_pool', 'recruiting_travel'];

export interface Budget {
  readonly year: number;
  readonly totalCents: number;
  readonly lines: Readonly<Record<BudgetLine, number>>;
  /** Mid-year cut after a revenue shortfall freezes open seats (T9.2.1 edge case). */
  readonly seatsFrozen: boolean;
}

/** Requests the coach raises at the standing AD meeting (T9.1.1, L5.4.1). */
export type RequestKind =
  | 'budget_line' | 'staff_seat' | 'facility_project' | 'schedule_preference' | 'discipline_matter'
  /** Asking to set the budget total himself: always refused (T9.1.1 acceptance). */
  | 'set_budget_total';

export interface AdRequest {
  readonly kind: RequestKind;
  readonly line?: BudgetLine;
  readonly amountCents?: number;
  readonly note?: string;
}

export type RequestOutcome = 'granted' | 'deferred' | 'refused';
export type ReasonCode =
  | 'strong_results' | 'boosters_pleased' | 'money_available'
  | 'interim_ad' | 'needs_board' | 'no_money' | 'poor_results' | 'boosters_unhappy'
  | 'not_coach_decision' | 'no_amount';

/** One exchange; the relationship is shown as this history, not a bar (T9.1.1). */
export interface AdExchange {
  readonly year: number;
  readonly week: number;
  readonly request: AdRequest;
  readonly outcome: RequestOutcome;
  readonly reason: ReasonCode;
}

export const FACILITY_KINDS = [
  'stadium', 'weight_room', 'practice_fields', 'indoor_field', 'training_room', 'players_lounge_housing',
] as const;
export type FacilityKind = (typeof FACILITY_KINDS)[number];

export interface Facility {
  readonly kind: FacilityKind;
  /** False where the program has none (no indoor field: T9.2.2 edge case). */
  readonly exists: boolean;
  /** 0 to 100 from build year and spending (T9.2.2). */
  readonly grade: number;
  readonly lastBuiltYear: number;
}

export interface FacilityProject {
  readonly id: string;
  readonly kind: FacilityKind;
  readonly mode: 'build' | 'renovate';
  readonly costCents: number;
  readonly startYear: number;
  readonly buildYears: number;
  /** Funded by the AD and boosters (T9.2.2 decision). */
  readonly funded: boolean;
}

/** One booster group (T9.3.1, L5.4.3). Major donors are people; a group carries their pooled record. */
export interface BoosterGroup {
  readonly id: number;
  /** The person who leads the group (an X1 record): the actor when the group acts outside the rules. */
  readonly leaderPersonId: number;
  readonly wealthCents: number;
  readonly givingHistoryCents: readonly number[];
  /** 0 to 100 (`booster_mood`, L5.4.3). Truth: the coach sees words. */
  readonly mood: number;
  /** Closeness to the AD and president, 0 to 1 (T9.3.1 inputs). */
  readonly closeness: number;
  /** The coach signalled he will look away (T9.3.1 rule 4). */
  readonly toldCoachWillLookAway: boolean;
  /** Barred by a penalty order: its money leaves the budget (T9.3.1 edge case, T9.5.3). */
  readonly disassociated: boolean;
  /** Tie strength to other groups, 0 to 1 (embarrassment travels by ties, L5.4.3). */
  readonly ties: Readonly<Record<number, number>>;
}

/** Seat kinds that a rule key limits (S1.2.2). Other seats are counted only by money. */
export const LIMITED_SEATS = ['graduate_assistant', 'off_campus_recruiter', 'strength', 'student_assistant', 'headset'] as const;
export type LimitedSeat = (typeof LIMITED_SEATS)[number];

/** Role of a staff seat for pay bands (T9.6.1). */
export const PAY_ROLES = ['head_coach', 'coordinator', 'position_coach', 'general_manager', 'analyst', 'graduate_assistant'] as const;
export type PayRole = (typeof PAY_ROLES)[number];

export interface StaffSeat {
  readonly jobId: number;
  readonly personId: number;
  readonly payRole: PayRole | 'support';
  /** Limits this seat counts against (an assistant may also be an off-campus recruiter). */
  readonly counts: readonly LimitedSeat[];
  /** Paid from the staff pool (assistants) or the support staff pool. */
  readonly pool: 'staff_pool' | 'support_staff';
  readonly salaryCents: number;
}

export interface ProgramState {
  readonly teamId: number;
  readonly tier: ProgramTier;
  readonly ad: AthleticDirector;
  readonly president: PresidentBody;
  readonly power: PowerArrangement;
  readonly budget: Budget;
  readonly facilities: readonly Facility[];
  readonly projects: readonly FacilityProject[];
  readonly boosters: readonly BoosterGroup[];
  readonly staff: readonly StaffSeat[];
  readonly exchanges: readonly AdExchange[];
  /** Seat kinds already warned this season (warn once, T9.4.1 acceptance). */
  readonly warnedSeats: readonly LimitedSeat[];
}
