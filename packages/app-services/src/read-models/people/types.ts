// The people read models (G-72; O4.1 player card, O4.2.1 roster table, O4.3.1 staff and coach card,
// O4.4.1 locker room, O4.5.1 owner and general manager). Plain data a screen shows. Every value here is
// public, the observer's own club's, or an estimate the club's staff made (D6, MA-48). No true rating,
// true injury course, hidden coach parameter, relationship strength or job-security number exists in
// these types: what the coach knows of a person arrives as words, a grade someone assigned, or a fact.

/** A word read with what it rests on (L1.1.1 display: words, never numbers or bands of a hidden value). */
export interface WordRead {
  /** Text key of the word ("trust.4", "morale.unsettled", "cannot tell yet"). */
  readonly textKey: string;
  /** Things the user or his staff saw or heard that moved it (O4.1.5 rule). Each names a real event. */
  readonly reasons: readonly ReadReason[];
  /** Trend arrow where the owning leaf gives one (O4.4.1, O4.5.1). */
  readonly trend: 'up' | 'steady' | 'down' | null;
}

export interface ReadReason {
  readonly textKey: string;
  /** The event or state in the save it maps to (O4.1.5 acceptance). */
  readonly eventId: number;
}

// ---------------------------------------------------------------------------------------------------
// O4.1 Player card

export const CARD_TABS = ['overview', 'grades', 'performance', 'knowledge', 'health', 'person', 'history', 'notes'] as const;
export type CardTab = (typeof CARD_TABS)[number];

export interface CardHeader {
  readonly personId: number;
  readonly name: string;
  readonly jersey: number | null;
  readonly position: string;
  readonly altPositions: readonly string[];
  /** Whole years at the world date, from the public birth date. */
  readonly age: number | null;
  readonly heightIn: number | null;
  readonly weightLb: number | null;
  /** Accrued pro seasons (C6), public. */
  readonly experience: number | null;
  /** League-rules list key of the club's roster slot, or null when he is on no roster the club can see. */
  readonly status: string | null;
  /** The contract line, own club only (C6, E3); null for other clubs' players or no contract. */
  readonly contract: ContractLine | null;
  /** D13 designed mark and A6 imported mark (O4.1.1 edge cases). */
  readonly designed: boolean;
  readonly imported: boolean;
}

export interface ContractLine {
  readonly years: number;
  readonly throughYear: number;
  /** This league year's base pay in cents, when the year is on the contract. */
  readonly thisYearCents: number | null;
}

/** A grade cell as the club's staff assigned it (G-19 `gradeCells`, MA-48). */
export type CardGrade =
  | {
    readonly state: 'graded'; readonly attribute: string; readonly text: string; readonly label: string; readonly confidence: string;
    readonly bandText: string; readonly grader: string; readonly n: number; readonly asOf: { readonly seasonYear: number; readonly dayIndex: number };
  }
  | { readonly state: 'unwatched'; readonly attribute: string; readonly text: string };

/** A measured value (height, weight, timed speed): a number with its unit and no band (O4.1.2 rule). */
export interface Measured { readonly key: string; readonly value: number; readonly unit: string }

/** The position coach's estimate of what he knows of one concept, in four words (O4.1.3, K6). */
export type KnowledgeWord = 'new' | 'learning' | 'knows' | 'masters';
export interface KnowledgeRead {
  readonly conceptId: string;
  readonly word: KnowledgeWord;
  readonly lastPractised: { readonly seasonYear: number; readonly dayIndex: number } | null;
  readonly mentalErrors: readonly { readonly gameId: number; readonly playIndex: number }[];
  readonly readyThisWeek: boolean;
}

export interface HealthRow {
  readonly injuryId: number;
  readonly typeId: string;
  readonly bodyRegion: string;
  readonly designation: string | null;
  /** The medical staff's stated return range in days: always two bounds, never one date (O4.1.4). */
  readonly returnDays: readonly [number, number] | null;
  readonly status: string;
  readonly occurred: { readonly seasonYear: number; readonly dayIndex: number };
}

/** What the medical and performance staff report this week (H5): a fact the coach cannot edit. */
export interface MedicalReport {
  readonly clearance: 'cleared' | 'cleared_with_limits' | 'not_cleared' | 'protocol';
  readonly limits: readonly string[];
  readonly practice: readonly ('full' | 'limited' | 'did_not_participate' | 'none_scheduled')[];
  /** Re-injury risk in words, the staff's read. */
  readonly reinjuryRiskKey: string;
  /** Weekly load band word from the performance staff (D10). */
  readonly loadBandKey: string;
}

export interface HealthTab {
  readonly current: readonly HealthRow[];
  readonly history: readonly HealthRow[];
  readonly medical: MedicalReport | null;
}

export interface PromiseRow {
  readonly promiseId: number;
  readonly subjectKey: string;
  readonly made: { readonly seasonYear: number; readonly dayIndex: number };
  readonly due: { readonly seasonYear: number; readonly dayIndex: number } | null;
}

/** The human side as the staff and coach read it (O4.1.5). Fields A6 forbids are absent for imported players. */
export interface PersonTab {
  readonly rolePromisedKey: string | null;
  readonly roleGivenKey: string | null;
  readonly morale: WordRead | null;
  readonly trust: WordRead | null;
  readonly respect: WordRead | null;
  readonly openPromises: readonly PromiseRow[];
  /** Personality as the staff reads it, with a confidence word (D5); absent for imported players. */
  readonly personality?: readonly { readonly traitKey: string; readonly readKey: string; readonly confidenceKey: string }[];
  readonly standingKey: string | null;
  readonly closestTeammates: readonly number[];
  readonly meetings: readonly { readonly date: { readonly seasonYear: number; readonly dayIndex: number }; readonly subjectKey: string; readonly outcomeKey: string }[];
  /** Off-field event log (O4.1.1): absent for imported real-roster players (A6). */
  readonly offField?: readonly { readonly eventId: number; readonly textKey: string }[];
}

export interface PlayerCardView {
  readonly personId: number;
  readonly clubId: number;
  readonly ownPlayer: boolean;
  readonly header: CardHeader;
  readonly grades: readonly CardGrade[];
  /** "college and camp evaluation only" for a rookie with no pro film (O4.1.2 edge case). */
  readonly gradesNoteKey: string | null;
  readonly measured: readonly Measured[];
  readonly knowledge: readonly KnowledgeRead[] | null;
  readonly health: HealthTab;
  readonly person: PersonTab | null;
  readonly notes: readonly { readonly date: { readonly seasonYear: number; readonly dayIndex: number }; readonly textKey: string; readonly byStaffId: number }[];
}

// ---------------------------------------------------------------------------------------------------
// O4.2.1 Roster table

export interface RosterLimit { readonly list: string; readonly limit: number | null; readonly count: number; readonly over: boolean }
export interface RosterRow {
  readonly personId: number; readonly name: string; readonly position: string; readonly list: string; readonly jersey: number | null;
  readonly age: number | null; readonly experience: number | null; readonly designation: string | null;
}
export interface PositionSubtotal { readonly position: string; readonly count: number; readonly planned: number | null }
export interface RosterRequestRow { readonly requestId: number; readonly moveKey: string; readonly personId: number | null; readonly state: 'requested' | 'done' | 'refused'; readonly reasonKey: string | null }
export interface RosterTableView {
  readonly clubId: number;
  readonly lists: readonly string[];
  readonly rows: readonly RosterRow[];
  readonly limits: readonly RosterLimit[];
  readonly subtotals: readonly PositionSubtotal[];
  /** Moves the general manager holds show as requests with their state (O4.2.1 edge case). */
  readonly requests: readonly RosterRequestRow[];
}

// ---------------------------------------------------------------------------------------------------
// O4.3.1 Staff list and coach card

export interface StaffSeat {
  readonly jobId: number;
  readonly catalogueId: string;
  readonly rung: number;
  readonly side: string;
  readonly positionGroup: string;
  readonly reportsToJobId: number | null;
  readonly holderPersonId: number | null;
  readonly holderName: string | null;
  readonly holding: string;
  /** A vacant seat shows who is covering (the named deputy) and the cost (O4.3.1 edge case). */
  readonly coveringPersonId: number | null;
  readonly coverCostKey: string | null;
}
export interface StaffView { readonly clubId: number; readonly seats: readonly StaffSeat[] }

export interface DemonstratedLine {
  /** Record key (E9.5.2), e.g. "fourth_down". */
  readonly key: string;
  /** The events behind it: its sample size is their count. */
  readonly eventIds: readonly number[];
  /** Label from the label engine once the sample exists (N2.8), else null. */
  readonly labelKey: string | null;
}
export interface ProposalRow { readonly taskKey: string; readonly date: { readonly seasonYear: number; readonly dayIndex: number }; readonly resultKey: string; readonly eventId: number }
export interface CoachCardView {
  readonly personId: number;
  readonly name: string;
  readonly jobId: number | null;
  readonly catalogueId: string | null;
  readonly side: string | null;
  readonly positionGroupTaught: string | null;
  readonly systems: readonly { readonly familyId: string; readonly seasons: number }[];
  readonly background: readonly string[];
  /** The demonstrated record (E9.5.2); empty means "no book on him yet". */
  readonly record: readonly DemonstratedLine[];
  readonly noBook: boolean;
  readonly relationship: { readonly trust: WordRead | null; readonly loyalty: WordRead | null } | null;
  readonly ambitionKeys: readonly string[];
  readonly contract: ContractLine | null;
  readonly proposals: readonly ProposalRow[];
}

// ---------------------------------------------------------------------------------------------------
// O4.4.1 Locker room

export interface RoomGroup { readonly kind: 'leaders' | 'followers' | 'clique' | 'isolated'; readonly leaderId: number | null; readonly memberIds: readonly number[] }
export interface RoomIssue {
  readonly issueId: number;
  readonly kindKey: string;
  readonly personIds: readonly number[];
  /** Who told the coach (O4.4.1 acceptance: every issue has a source entity). */
  readonly sourcePersonId: number;
  readonly sourceKey: string;
  readonly reportedOn: { readonly seasonYear: number; readonly dayIndex: number };
  readonly responseLinks: readonly string[];
}
export interface LockerRoomView {
  readonly clubId: number;
  readonly groups: readonly RoomGroup[];
  readonly culture: WordRead | null;
  readonly buyIn: WordRead | null;
  readonly issues: readonly RoomIssue[];
  /** The rare lost-locker-room state, with its causes (O4.4.1 edge case). */
  readonly lostRoom: { readonly causeKeys: readonly string[] } | null;
}

// ---------------------------------------------------------------------------------------------------
// O4.5.1 Owner and general manager

export interface OwnerComment { readonly date: { readonly seasonYear: number; readonly dayIndex: number }; readonly textKey: string; readonly eventId: number }
export interface GmRequestRow {
  readonly requestId: number; readonly moveKey: string; readonly phaseKey: string; readonly state: 'requested' | 'approved' | 'refused' | 'done';
  /** The general manager's stated reason when refused (O4.5.1 rule). */
  readonly reasonKey: string | null;
}
export interface OwnerView {
  readonly clubId: number;
  readonly owner: {
    readonly personId: number | null; readonly name: string | null; readonly goalKeys: readonly string[];
    /** Confidence in words with trend. Job security is never a number (E4). */
    readonly confidence: WordRead | null;
    readonly comments: readonly OwnerComment[];
    readonly nextMeeting: { readonly seasonYear: number; readonly dayIndex: number } | null;
  };
  readonly gm: {
    readonly personId: number | null; readonly name: string | null;
    readonly relationship: WordRead | null;
    /** Who holds each roster move under the L5.2.1 arrangement and the coach's contract (E3). */
    readonly say: readonly { readonly moveKey: string; readonly holderKey: 'coach' | 'general_manager' | 'owner' | 'shared' }[];
    readonly requests: readonly GmRequestRow[];
    readonly upcoming: readonly { readonly decisionKey: string; readonly toldKey: string | null }[];
  };
}
