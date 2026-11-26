// Practice records (H3.1.1, H3.2.1, H3.2.2, H3.3.1, H3.3.2). A practice is the one-page grid a real staff
// prints: numbered, timed periods that fill one practice block of the week (H1.1.1).
import type { Rung } from '../week/edit.ts';

export type Pads = 'none' | 'shells' | 'full';
export type Tempo = 'walk' | 'jog' | 'thud' | 'live';
export type PeriodKind = 'warmup' | 'walkthrough' | 'individual' | 'group' | 'team' | 'conditioning';
export type Side = 'offense' | 'defense' | 'special_teams';
export type Hash = 'left' | 'middle' | 'right';
export type Unit = 'first' | 'second' | 'third';
export const UNITS: readonly Unit[] = ['first', 'second', 'third'];

/** One row of the period palette (H3.1.2, data/periods.json). Weights run 0 to 3. */
export interface PeriodType {
  readonly id: string;
  readonly plain: string;
  readonly knowledge: number;
  readonly technique: number;
  readonly load: number;
  readonly injury: number;
  readonly kind: PeriodKind;
  /** Run-game or line-of-scrimmage work: technique halves without full pads (H3.1.3). */
  readonly line: boolean;
  readonly needsScript: boolean;
  readonly levels: readonly string[];
}

export interface Drill {
  readonly id: string;
  readonly plain: string;
  /** Shown with the rule in the palette; the G-12 checker is the authority. */
  readonly prohibitedInRules: boolean;
  /** D3 techniques the drill trains (H3.6.2 rule 2). */
  readonly techniques: readonly string[];
}

/** Who runs a period (H3.6.2). `user` when the user leads it himself. */
export interface PeriodLeader {
  readonly staffId: string;
  readonly role: Rung;
  readonly user: boolean;
}

export interface Period {
  readonly number: number;
  readonly minutes: number;
  readonly type: string;
  readonly tempo: Tempo;
  /** Position groups or units in the period (offense, defense, specialists, or position codes). */
  readonly groups: readonly string[];
  readonly leader: PeriodLeader;
  readonly scriptRef?: string;
  /** Individual and group periods: drills from the drill list (H3.6.2). */
  readonly drills?: readonly string[];
  /** Players a position coach flags for correction after the period (H3.6.2, at most the parameter). */
  readonly corrections?: readonly string[];
  /** The period moves groups to another field: one transition is charged before it (H3.1.1 rule 3). */
  readonly moveField?: boolean;
  /** Two-minute situational period: the two-minute rep rate applies (H3.2.1 rule 1). */
  readonly twoMinute?: boolean;
}

/** H3.4.1 options for one practice. */
export interface PracticeEnvironment {
  readonly indoors: boolean;
  readonly noise: boolean;
  readonly wetBall: boolean;
  readonly silentCount: boolean;
  /** Outdoors in bad weather: more load and exposure, plus the weather familiarity flag. */
  readonly badWeather: boolean;
}

export const NO_ENVIRONMENT: PracticeEnvironment = { indoors: false, noise: false, wetBall: false, silentCount: false, badWeather: false };

/** `Practice` (H3.1.1 outputs). */
export interface Practice {
  readonly id: string;
  readonly blockId: string;
  readonly blockMinutes: number;
  readonly day: number;
  readonly pads: Pads;
  readonly periods: readonly Period[];
  readonly environment: PracticeEnvironment;
  /** Day-before format (H3.4.2). */
  readonly mockGame?: boolean;
  readonly headCoachPresent: boolean;
}

/** A look the scout team shows: a play or defensive call family and the object id. */
export interface Look {
  readonly ref: string;
  /** Run family or coverage family (H3.2.2 near-match rule). */
  readonly family: string;
}

/** `ScoutCard` (H3.2.2). Linked to the tags it came from, or marked as the coach's own. */
export interface ScoutCard {
  readonly id: string;
  readonly side: Side;
  readonly look: Look;
  readonly sourceTags: readonly string[];
  readonly coachsOwn: boolean;
  /** Cut-up count shown on the card. */
  readonly count: number;
}

/** One scripted rep (H3.2.1). */
export interface Rep {
  readonly index: number;
  /** Our call: a play (offense), a defensive call, or a special teams unit call. */
  readonly callId: string;
  readonly cardId: string;
  readonly hash: Hash;
  readonly down: number;
  readonly distance: number;
  readonly unit: Unit;
}

export interface Script {
  readonly id: string;
  readonly side: Side;
  readonly reps: readonly Rep[];
  readonly approved: boolean;
  /** Drafted by the coordinator (H3.2.1 rule 5). */
  readonly drafted: boolean;
}

/** Rep split for a team period (H3.3.1), in percent, plus per-position overrides. */
export interface RepSplit {
  readonly first: number;
  readonly second: number;
  readonly third: number;
  /** position -> player -> percent of that position's reps; the rest follow the split. */
  readonly overrides: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

export type ParticipationLabel = 'full' | 'limited' | 'did_not_participate';
export type ParticipationReason = 'injury' | 'not_injury_related' | 'none';

/** Participation sheet row (H3.3.2). */
export interface Participation {
  readonly personId: string;
  readonly label: ParticipationLabel;
  /** Percent of scripted reps when Limited (default the parameter). */
  readonly share?: number;
  readonly reason: ParticipationReason;
  readonly bodyPart?: string;
  /** Medical recommendation and clearance (H5). */
  readonly medical?: { readonly recommend: ParticipationLabel; readonly cleared: boolean; readonly protocol: boolean };
}

/** Depth chart as practice reads it (M2): position -> ordered player ids. */
export type DepthChart = Readonly<Record<string, readonly string[]>>;

/** The lineup each side's unit puts on the field for team reps: position slots in order. */
export type UnitShape = readonly string[];
