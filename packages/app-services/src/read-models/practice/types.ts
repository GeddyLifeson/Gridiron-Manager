// The practice desk read model (H3.1.1 the week's practices, H3.3.2 participation, H3.5.2 the practice report;
// G-65 over the career's practice desk). Plain data only: plan values, counts, labels, and the period leaders'
// report as they wrote it. The report can miss an error or blame the wrong player (D6); the film is the true
// record and never reaches this view (K9.1, MA-48).

/** A person named in the view: the world person id (as practice keys it) and the name the club knows. */
export interface PersonRef { readonly personId: string; readonly name: string | null }

/** A shape problem with a plan (validatePractice): the plan cannot run until it is fixed. */
export interface PlanProblemRow { readonly code: string; readonly period: number | null; readonly plain: string }

/** A rule finding on a plan (checkPractice): a hard one blocks the plan unless the user goes ahead. */
export interface PlanFindingRow {
  readonly hard: boolean; readonly plain: string; readonly penalty: string; readonly leaf: string;
  readonly period: number | null;
  /** Fact status of the rule key (Q6); null when the rule has no register row. */
  readonly status: string | null;
}

/** One practice of the coming week (H3.1.1): the user's plan, or the staff's standard week. */
export interface PlanRow {
  readonly practiceId: string;
  readonly by: 'user' | 'staff';
  /** Calendar day index of the practice. */
  readonly day: number;
  readonly pads: string;
  readonly mockGame: boolean;
  readonly periods: number;
  readonly minutes: { readonly planned: number; readonly block: number; readonly remaining: number };
  readonly expectedReps: number;
  /** Plan calls with zero, one, or more scripted reps this week (H3.2.1 counter). */
  readonly coverage: { readonly zero: number; readonly one: number; readonly more: number };
  readonly ok: boolean;
  readonly problems: readonly PlanProblemRow[];
  readonly findings: readonly PlanFindingRow[];
}

export interface ErrorRow { readonly period: number; readonly rep: number; readonly person: PersonRef }
export interface CompetitionRow { readonly person: PersonRef; readonly position: string; readonly wins: number; readonly reps: number }
export interface InjuryRow { readonly period: number; readonly rep: number; readonly person: PersonRef }
export interface ParticipationRow { readonly person: PersonRef; readonly label: string }
export interface RepsRow { readonly person: PersonRef; readonly reps: number; readonly fullSpeed: number }

/** One resolved practice as the office keeps it (H3.5.2 report). */
export interface ReportRow {
  readonly seasonYear: number;
  readonly week: number;
  readonly practiceId: string;
  readonly by: 'user' | 'staff';
  readonly padded: boolean;
  readonly repsCompleted: number;
  /** Mental errors as the period leaders noted them (may differ from the film, D6). */
  readonly errors: readonly ErrorRow[];
  readonly standouts: readonly PersonRef[];
  readonly poor: readonly PersonRef[];
  readonly competition: readonly CompetitionRow[];
  readonly injuries: readonly InjuryRow[];
  readonly participation: readonly ParticipationRow[];
  /** Reps per player, most first (all tempos; full speed is live plus thud). */
  readonly reps: readonly RepsRow[];
}

export interface PracticeDeskView {
  readonly teamId: number;
  readonly seasonYear: number;
  readonly week: number;
  /** Who plans the coming week: the user's plans, or the staff week when he has set none (CY-08). */
  readonly plannedBy: 'user' | 'staff';
  readonly plans: readonly PlanRow[];
  /** Padded practices used this season, and left under the rule set (null when it has no padded budget). */
  readonly padded: { readonly used: number; readonly left: number | null };
  /** The shown season's reports, newest first. */
  readonly reportSeason: number;
  readonly reports: readonly ReportRow[];
  /** Seasons with kept reports, newest first, for the season picker. */
  readonly seasons: readonly number[];
}
