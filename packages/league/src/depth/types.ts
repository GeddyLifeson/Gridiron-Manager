// Shapes of the depth chart module (G-56, M2). The chart is the coach's standing answer to "who is on
// the field for this unit, and who replaces him". Units and jobs are content (F1 personnel groups and
// packages, F12 special teams units); this module never names a job itself.

/**
 * Unit content ids are namespaced by side: `off:<group>` (offensive personnel group or package),
 * `def:<package>`, `st:<unit>` (special teams unit). Confirms W-G70-1 (G-70 roster screen).
 */
export type UnitSide = 'off' | 'def' | 'st';

/**
 * Position groups used for counts, default rotation shares and game-day minimums (M2.1.4 rule 3,
 * M2.3.1 rule 1). `front` is not a group: defensive line plus linebackers make the front seven.
 */
export type PositionGroup = 'qb' | 'rb' | 'wr' | 'te' | 'ol' | 'dl' | 'lb' | 'db' | 'k' | 'p' | 'ls';

/** One job in a unit (M2.1.1 rule 1: system jobs such as X, Z, LT, 3-technique, Mike, nickel). */
export interface JobDef {
  readonly job: string;
  /** Package job: the base job it replaces (M2.2.1 rule 2). Base units leave it out. */
  readonly mapsTo?: string;
  /** Position group the job belongs to, for counts and default shares. */
  readonly group: PositionGroup;
  /** The emergency card need that covers this job when its list runs dry (M2.1.3 rule 3). */
  readonly emergency?: EmergencyNeed;
  /** Special teams job outside the starter cap (returners, field goal unit linemen, M2.4.1 rule 4). */
  readonly stExempt?: boolean;
}

/** Automatic package trigger (M2.2.1 rule 3). Every field present must match. */
export interface PackageTrigger {
  /** Offensive personnel groups read by the defense's signal caller (J5). */
  readonly personnel?: readonly string[];
  readonly downs?: readonly number[];
  readonly minToGo?: number;
  readonly maxToGo?: number;
  /** Situation flags from F13, for example `two_minute`, `goal_line`. */
  readonly situation?: string;
}

/** A unit or package the installed system defines (F1, F12). */
export interface UnitDef {
  readonly unitId: string;
  readonly jobs: readonly JobDef[];
  /** Package: the base unit it inherits from (M2.2.1). */
  readonly base?: string;
  /** Special teams: one of the six core units (M2.4.1 rule 2). */
  readonly core?: boolean;
  /** Special teams: coverage unit (kickoff, punt) or kicking unit (field goal, extra point) for load (M2.4.1 rule 5). */
  readonly load?: 'coverage' | 'kicking' | 'other';
  readonly trigger?: PackageTrigger;
}

/** Job to ordered person ids: first, second, third (M2.1.1). */
export type JobLists = Readonly<Record<string, readonly number[]>>;

/** A cascade move (M2.1.3): when `job`'s player goes down, these players change jobs. */
export interface CascadeMove {
  /** Players moving: from job to job inside the same unit. */
  readonly slides: readonly { readonly from: string; readonly to: string }[];
  /** The job the entering player fills after the slides, and who enters. */
  readonly enters: { readonly job: string; readonly personId: number };
}

/** Emergency card (M2.1.3 rule 3): one name per rare need. */
export type EmergencyNeed = 'quarterback' | 'long_snapper' | 'holder' | 'kicker' | 'punter' | 'sixth_lineman' | 'seventh_lineman';

export interface DepthChart {
  readonly teamId: number;
  /** Week the chart is saved for (M2.1.1 rule 4). */
  readonly week: number;
  /** unitId to job lists. A package job left empty inherits from its base (M2.2.1). */
  readonly units: Readonly<Record<string, JobLists>>;
  /** `unitId/job` to ordered cascade moves; I6 applies the first legal one (M2.1.3). */
  readonly cascades: Readonly<Record<string, readonly CascadeMove[]>>;
  readonly emergency: Readonly<Partial<Record<EmergencyNeed, number>>>;
  /** Situational roles (M2.2.2): role id to named players. Empty means the base chart covers it. */
  readonly situational: Readonly<Record<string, readonly number[]>>;
}

/** What the module needs to know about a person on the roster. Staff estimates only, never truth (K9). */
export interface DepthPerson {
  readonly personId: number;
  readonly group: PositionGroup;
  /** Seasons of service (pro accrued seasons; college years in program). */
  readonly service: number;
  /** On the practice squad (scout team, M2.6.1). */
  readonly practiceSquad?: boolean;
  /** Ruled out by the medical report (H5): inactive first (M2.1.4 rule 2). */
  readonly out?: boolean;
  /** Can play offensive line in a pinch (M1.2.2 versatility), used by the line-capable count. */
  readonly lineCapable?: boolean;
  /** Practice reps per emergency need over the rep window (M2.1.3, H3). */
  readonly emergencyReps?: Readonly<Partial<Record<EmergencyNeed, number>>>;
}

export interface Problem {
  readonly leaf: string;
  readonly unitId: string;
  readonly message: string;
}
