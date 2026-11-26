// The boss above the user (S4, K6.5): who he is, as the user-facing side reads him, and the record of
// graded work. The boss is an ordinary AI coach (K2 profile) plus the X1 facets S4.1.1 names. The facets
// are hidden truth passed in by the caller from the people module (coach-ai may not import people or
// career, P1.2.1) and are never shown; the user learns them only from events (brief.ts).
//
// Nothing here knows whether a junior is the user. K6.5.2: the same procedure judges every assistant,
// so the user competes with AI assistants on equal terms.
import type { CoachProfile, Draws } from '../profile/index.ts';

/** S4.1.1 facets, each 0 to 100. `detailFocus` weights report sections and duty families (default 1). */
export interface BossFacets {
  readonly standards: number;
  readonly delegation: number;
  readonly ego: number;
  readonly loyaltyToStaff: number;
  readonly hoursCulture: number;
  /** Section or family id to weight. Keys absent weigh 1. A weight of 0 means he ignores it. */
  readonly detailFocus: Readonly<Record<string, number>>;
}

/** His own view of opponents and players (S4.1.1 `beliefs`): tendency key to the share he believes. */
export type Beliefs = Readonly<Record<string, number>>;

export interface Boss {
  readonly personId: number;
  readonly profile: CoachProfile;
  readonly facets: BossFacets;
  readonly beliefs: Beliefs;
  /** True for a profile built from an imported real coach: personality facets read neutral (S4.1.1 edge case). */
  readonly imported: boolean;
}

/**
 * The parts of a duty the boss reads. Structurally a subset of the ladder's `DutyDef` (career, G-55), so
 * the ladder's records pass straight in without coach-ai importing career.
 */
export interface DutySeen {
  readonly id: string;
  readonly family: string;
  readonly kind: string;
  readonly grader: string;
}

/** A submitted product as the boss sees it: only what is on the page. A subset of the ladder's `Submission`. */
export interface SubmissionSeen { readonly kind: string }

/** The ladder's judge port (career `BossJudge`, S4.3). */
export interface Judge { rate(duty: DutySeen, submission: SubmissionSeen): number }

export type GraderKind = 'truth' | 'boss' | 'outcome' | 'mixed';
export type UsedAs = 'unchanged' | 'edited' | 'replaced' | 'not_used';

/** S4.3.1 grade record: one per completed duty. */
export interface GradeRecord {
  readonly workerId: number;
  readonly bossId: number;
  readonly dutyId: string;
  readonly family: string;
  /** Season day number (calendar owns dates; this module never reads a clock). */
  readonly day: number;
  readonly grader: GraderKind;
  /** What the game measured, or null when the duty has no truth part. */
  readonly truthScore: number | null;
  /** What the boss believes, or null when he did not grade it. */
  readonly bossScore: number | null;
  /** Outcome part, filled when play reports it. */
  readonly outcomeScore: number | null;
  /** The grade that counts now: the grader kind's score, or null while a part is pending. */
  readonly score: number | null;
  readonly onTime: boolean;
  /** True when nothing was handed in: the boss used a fallback (K6.5.1 rule 3). */
  readonly missing: boolean;
  readonly hoursSpent: number;
  readonly components: Readonly<Record<string, number>>;
  readonly usedAs: UsedAs;
  /** Link to what the product affected (a plan item id), or null. */
  readonly consequence: string | null;
}

export type { Draws };
