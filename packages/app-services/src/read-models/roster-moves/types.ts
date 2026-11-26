// The roster moves read model (G-70; H6.1, H6.2, H6.3.1, M2.1.4). Plain data a screen shows. Every value
// here is public or the observer's own club's: list names, game-day status, injury report designations,
// depth chart order and league-office counts. No true rating, true injury course or approval chance.
import type { roster } from '@gm/league';

export type MarkerType = roster.MarkerType;
export type MarkerStatus = roster.MarkerStatus;
export type Decider = roster.Decider;
export type MoveButton = 'do_it' | 'ask';

/** Where a roster strip marker opens (H6.1.1: clicking a marker opens its screen). */
export type MarkerTarget = 'active_list' | 'elevations' | 'protections' | 'signings' | 'review' | 'none';

export interface MarkerRow {
  readonly type: MarkerType;
  readonly status: MarkerStatus;
  /** Absolute game hour (day index times hours a day plus hour), for ordering and display. */
  readonly opensAtHour: number;
  readonly deadlineHour: number;
  readonly hoursLeft: number;
  readonly target: MarkerTarget;
  /** Who decides the move behind the marker (H6.1.2); null for markers that are meetings only. */
  readonly decider: Decider | null;
  readonly button: MoveButton | null;
}

export interface PlayerRow {
  readonly personId: number;
  readonly name: string;
  /** Position code (F1 list), public. */
  readonly position: string;
  /** League-rules list key (C5.1.1). */
  readonly list: string;
  /** Elevated from the practice squad for this game (C5.3.2). */
  readonly elevated: boolean;
  /** Injury report designation (H5.2.2), a league-rules key, or null when not on the report. */
  readonly designation: string | null;
  /** Listed "out" on the report (H6.2.1 edge case: may still be dressed, warned and logged). */
  readonly out: boolean;
  readonly offensiveLineman: boolean;
  readonly quarterback: boolean;
  /** Depth chart jobs as `unit/role#rank`, rank from 1 (M2.1.1). */
  readonly jobs: readonly string[];
  /** Core special teams units he is first on (M2.4.1 rule 2). */
  readonly specialTeamsFirsts: number;
  /** May dress this game: on the 53 or elevated (C5.2.1). */
  readonly candidate: boolean;
  /** On the working active list. */
  readonly active: boolean;
}

export type CoverageLevel = 'ok' | 'amber' | 'red';

/** One row of the coverage board (H6.2.1 rule 2): a job in a package the plan uses. */
export interface CoverageRow {
  readonly unitId: string;
  readonly role: string;
  readonly starter: number | null;
  readonly backup: number | null;
  readonly emergency: number | null;
  readonly level: CoverageLevel;
}

/** A special teams unit (H6.2.1 rule 3): it needs a full side of named actives. */
export interface UnitRow {
  readonly unitId: string;
  readonly named: number;
  readonly needed: number;
  readonly level: CoverageLevel;
}

export interface ListRefusal { readonly rule: string; readonly message: string; readonly fix: string }

export interface ActiveListView {
  readonly actives: readonly number[];
  readonly emergencyQb: number | null;
  readonly count: number;
  readonly limit: number;
  readonly linemenActive: number;
  readonly minLinemen: number;
  readonly floor: number;
  readonly inactives: readonly number[];
  /** Null when the list passes the league check (C5.2.1, C5.2.2). */
  readonly refusal: ListRefusal | null;
  readonly locked: boolean;
  /** Minutes left until the list locks; 0 when locked. */
  readonly minutesToLock: number;
  /** Gaps that block locking without a confirmation that names them (H6.2.1 acceptance 2). */
  readonly redGaps: readonly string[];
  readonly amberGaps: readonly string[];
  /** Players listed "out" who are dressed (H6.2.1 edge case). */
  readonly outDressed: readonly number[];
  /** The staff's recommended list and one reason per player (H6.2.1, M2.1.4 rule 2). */
  readonly staffDraft: readonly number[];
  readonly staffReasons: Readonly<Record<string, string>>;
  /** Offered when three quarterbacks are on the roster (H6.2.1 rule 5). */
  readonly emergencyQbOffered: boolean;
}

export interface ElevationRow {
  readonly personId: number;
  readonly name: string;
  readonly position: string;
  readonly used: number;
  /** Elevations left this season; null when unlimited (postseason, C5.3.2). */
  readonly left: number | null;
  readonly elevated: boolean;
  /** Why he cannot be elevated now, a text key, or null. */
  readonly blocked: string | null;
}

export interface ElevationsView {
  readonly perGame: number;
  readonly usedThisGame: number;
  readonly rows: readonly ElevationRow[];
}

export interface RosterMovesView {
  readonly clubId: number;
  /** Pro clubs have markers, elevations and an active list; a level without those keys shows a dress list only (H6.6.1). */
  readonly hasGameDayLimit: boolean;
  readonly hasPracticeSquad: boolean;
  readonly nowHour: number;
  readonly markers: readonly MarkerRow[];
  readonly players: readonly PlayerRow[];
  readonly coverage: readonly CoverageRow[];
  readonly units: readonly UnitRow[];
  readonly active: ActiveListView | null;
  readonly elevations: ElevationsView | null;
  /** The button each move ends in for this job (H6.1.2 acceptance 4). */
  readonly buttons: Readonly<Record<string, MoveButton>>;
}
