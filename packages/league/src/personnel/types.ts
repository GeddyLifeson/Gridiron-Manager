// Shared shapes of the personnel module (G-57; bible M1, M3, M6, D6.3). Every grade here is a club's
// estimate (D6 graded values: ISS mean and variance), never a true value. The module cannot import
// @gm/people (P1.2.1: league may import only schema and rules-data), so callers pass estimates in the
// structural shape below; `scouting.roleGrade` and `scouting.project` from G-19 produce exactly it.

/** One graded value on the internal scouting scale (ISS, D6.1.1): mean and variance in ISS squared. */
export interface Graded { readonly mean: number; readonly variance: number }

/** A job in the installed system ("X receiver", "nickel", "3-technique"; M1.1.1). Ids come from F14 content. */
export type JobId = string;

/** Priority tiers (M1.1.1 rule 2). */
export type Tier = 'premium' | 'core' | 'replaceable';

/** Who set a value: the position coach's proposal, the staff, the user, an event (D6.3.1 output). */
export type SetBy = 'staff' | 'user' | 'event';

/** A player as personnel tools see him: estimates only, plus public facts. */
export interface PersonnelPlayer {
  readonly personId: number;
  readonly age: number;
  /** Primary job, then any others he is listed at (M1.4.1 edge case). */
  readonly jobs: readonly JobId[];
  /** Club estimates of attributes this module weighs, by attribute id (D2 to D4). */
  readonly grades: Readonly<Record<string, Graded>>;
  /** Knowledge of each job as the staff estimates it, 0 to 100 (D9); the readiness line is 70 (D9.6.1). */
  readonly jobKnowledge: Readonly<Record<JobId, number>>;
  /** Contract years left including this one (C6); null where the level has no contracts. */
  readonly contractYearsLeft: number | null;
  /** Eligibility seasons left including this one (T5); null where the level has none. */
  readonly eligibilityLeft: number | null;
  /** Unavailable now (D11 injury, suspension). */
  readonly unavailable: boolean;
  readonly realPerson: boolean;
}

/** A job's profile (M1.2.1): weights over graded attributes and optional minimums in ISS. */
export interface JobProfile {
  readonly job: JobId;
  readonly weights: Readonly<Record<string, number>>;
  readonly minimums: Readonly<Record<string, number>>;
  /** True when the coach left the job unset and the family default is in use (M1.2.1 edge case marker). */
  readonly familyDefault: boolean;
}

/** A fit score with its band (M1.2.1 rules 1 and 2). */
export interface Fit { readonly job: JobId; readonly mean: number; readonly variance: number; readonly minimumsMissed: readonly string[] }
