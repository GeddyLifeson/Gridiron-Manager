// Shapes of the medical process between games (G-33; D11.3 to D11.6, H5). Every injury the engine (WP-22,
// J10) or practice (H3) creates becomes one MedicalCase. Fields under `truth` are truth-class (P1.1.4):
// the observer filter (G-27) strips them; `shownCase` gives the staff view. Days are absolute day numbers
// of the calendar (calendar.fromWorldDate), never wall-clock time.
//
// Persisted twin: schema/src/world InjuryRecord holds the long-lived part; the extra fields here
// (medical state, limits, protocol step, setback, hidden flag) are proposed to the integrator (CR-G33-1).
import type { RandomStream } from '@gm/schema';
import type { ProtocolState } from './concussion.ts';

/** The physician's three states (D11.3.1). The user can never set one. */
export const MEDICAL_STATES = ['not_cleared', 'cleared_with_limits', 'cleared'] as const;
export type MedicalState = (typeof MEDICAL_STATES)[number];

/** Practice participation ids; their report labels come from data/designations.json (W-13). */
export type Participation = 'full' | 'limited' | 'dnp';

/** Severity classes of the sideline read (D11.3.2). */
export const SEVERITY_CLASSES = ['minor', 'moderate', 'major', 'season_ending'] as const;
export type SeverityClass = (typeof SEVERITY_CLASSES)[number];

/** Limits that go with "cleared with limits" (D11.3.1). */
export interface Limits {
  /** Share of normal snaps, or null for no cap. */
  readonly snapCap: number | null;
  readonly noContactPractice: boolean;
  readonly maxPractice: Participation;
}

/** The club's medical staff as the process sees them (L4). Hidden parameters of generated people. */
export interface MedicalStaff {
  readonly physicianId: number;
  readonly trainerId: number;
  /** Independent consultants on call (concussion clearance). */
  readonly consultantIds: readonly number[];
  /** 0 to 1: how close estimates sit to the truth (D11.3.2 "skill"). */
  readonly diagnosticAccuracy: number;
  /** 0 to 1: a cautious physician clears later (D11.3.1). */
  readonly caution: number;
}

/** What the engine or practice hands over when a body breaks (D11.1.1 outputs). */
export interface InjuryEvent {
  readonly injuryId: number;
  readonly personId: number;
  readonly teamId: number;
  /** G-21 catalogue row id. */
  readonly typeId: string;
  /** Catalogue grade when the row has grades, else null. */
  readonly grade: number | null;
  readonly day: number;
  readonly mechanism: string;
  /** True when this region was already hurt and being played through (D11.1.1 multiplier). */
  readonly fromPlayingThrough: boolean;
  /** A minor injury the player may keep to himself (D11.6.2). Major ones are always seen. */
  readonly hideable: boolean;
}

export interface CaseTruth {
  /** True days from injury to the recovery point. */
  readonly totalDays: number;
  /** Days of recovery done so far. */
  readonly progressDays: number;
  /** Progress day at which a setback will strike, or null. */
  readonly setbackAt: number | null;
  readonly setbackDays: number;
  readonly setbackApplied: boolean;
  /** Imaging error factor in force (D11.3.2), drawn once and redrawn on a setback. */
  readonly imagingFactor: number;
  /** The player is hiding it; the staff does not know it exists (D11.6.2). */
  readonly hidden: boolean;
  /** A concussion the evaluation missed, still to be found at the follow-up (D11.4.1 rule 7). */
  readonly missedConcussion: boolean;
}

/** What the staff says. Never contains a truth value. */
export interface CaseShown {
  readonly known: boolean;
  readonly sidelineClass: SeverityClass | null;
  /** Day imaging is read; before it only the sideline class is shown. */
  readonly imagingDay: number;
  /** Shown expected return range in days from today, low and high; null before imaging. */
  readonly rangeDays: readonly [number, number] | null;
  readonly state: MedicalState;
  readonly limits: Limits | null;
}

export interface MedicalCase {
  readonly id: number;
  readonly personId: number;
  readonly teamId: number;
  readonly typeId: string;
  readonly grade: number | null;
  readonly occurredDay: number;
  readonly mechanism: string;
  readonly softTissue: boolean;
  readonly structural: boolean;
  readonly truth: CaseTruth;
  readonly shown: CaseShown;
  /** Concussion protocol state, null for other injuries. */
  readonly protocol: ProtocolState | null;
  /** Day the physician first gave "cleared with limits" or "cleared"; null while out. */
  readonly clearedDay: number | null;
  /** Returned before the true recovery point (D11.6.1 extra multiplier). */
  readonly earlyReturn: boolean;
  /** Times the coach leaned on doctors or player for this case (D11.3.3). Hidden log, never a shown counter. */
  readonly pressureUses: number;
  /** Doctors were pressed for an earlier "cleared with limits" (D11.3.3). */
  readonly doctorsPressed: boolean;
  readonly status: 'active' | 'recovered' | 'season_ending';
}

/** A stream per scope, so each draw has its own fixed place in the J13 stream tree. */
export type StreamFor = (scope: readonly (string | number)[]) => RandomStream;
