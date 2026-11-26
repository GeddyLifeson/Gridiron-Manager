// The recruiting board read model (O7.5.1, T4). Every field is something the viewing staff can know: public
// facts, its own board (grades it set by watching, reads in words with their basis), its own offers, visits
// and logged violations, and the calendar. No true rating, true interest, firmness or commitment threshold
// reaches it: rows are built from league recruiting's `prospectPage`, the only door a screen uses (K9.1.1).

/** What the user may do with a verb in his job (S3, T4.6.1): do it, suggest it to whoever owns it, or neither. */
export type RightButton = 'do_it' | 'suggest' | 'none';
export type RecruitingVerb = 'evaluate' | 'contact' | 'visit' | 'offer' | 'plan';

/** Confidence in words (MA-48); the numeric band is shown only on request. */
export type ConfidenceWord = 'firm' | 'fair' | 'thin';

/** A grade the staff set after watching (MA-48: grader, date, amount watched, confidence in words). */
export interface GradeView {
  /** Board grade, rounded, on the staff's grade scale. Never shown for an unwatched prospect. */
  readonly value: number;
  readonly scaleMax: number;
  /** Who set it: the first-pass evaluator or the position coach (T4.3.1). */
  readonly grader: 'first_pass' | 'position_coach';
  /** Day of the latest look, or null when the board does not record it (grades set before it was kept). */
  readonly lastLookDay: number | null;
  /** Looks taken by kind (the amount watched). */
  readonly looks: readonly { readonly kind: string; readonly count: number }[];
  readonly confidence: ConfidenceWord;
  /** Half-width of the band by attribute family, for the "show band" tap. */
  readonly band: Readonly<Record<string, number>>;
  /** Measured at camp by our staff (T4.3.1), or null. */
  readonly measured: { readonly heightIn: number; readonly weightLb: number; readonly fortyS: number } | null;
  /** The user's own grade (S11.1.1), or null. */
  readonly userGrade: number | null;
}

export interface ReadView {
  /** Interest in words: the staff's read, which can be wrong (T4.4.1). */
  readonly standing: string;
  readonly basis: string | null;
  readonly asOf: number | null;
  readonly reasons: readonly { readonly key: string; readonly positive: boolean; readonly basis: string; readonly day: number }[];
  /** Schools the staff knows are in it, with how it knows. */
  readonly rivals: readonly { readonly team: string; readonly basis: string; readonly day: number }[];
}

export interface CircleView { readonly memberId: number; readonly name: string; readonly relation: string; readonly influence: string; readonly caresAbout: readonly string[]; readonly basis: string }

/** One act as the screen offers it. Nothing is disabled: a rule the act breaks is named in a warning (L8.2.5). */
export interface ActionView {
  readonly kind: string;
  readonly verb: RecruitingVerb;
  readonly hours: number;
  readonly button: Exclude<RightButton, 'none'>;
  /** Rules the act breaks today; empty when it breaks none. */
  readonly breaches: readonly string[];
  /** The L8.2.5 warning text key and body when it breaks one, else null. */
  readonly warning: { readonly classId: string; readonly ruleText: string; readonly body: string; readonly penaltyText: string } | null;
}

export interface BoardRow {
  readonly personId: number;
  readonly name: string;
  readonly classYear: number;
  readonly position: string;
  readonly region: string;
  readonly heightIn: number;
  readonly weightLb: number;
  readonly source: 'high_school' | 'juco';
  readonly publicStars: number;
  readonly publicRank: number | null;
  readonly status: { readonly kind: 'open' | 'committed' | 'signed'; readonly team: string | null; readonly ours: boolean };
  /** Null when no one on the staff has watched him: then only public facts are shown (MA-48). */
  readonly grade: GradeView | null;
  readonly read: ReadView | null;
  readonly circle: readonly CircleView[];
  readonly firmness: { readonly word: string; readonly basis: string; readonly day: number } | null;
  readonly academics: { readonly word: string; readonly basis: string; readonly day: number } | null;
  readonly ourOffer: { readonly day: number; readonly committable: boolean } | null;
  /** Other schools on his public offer list. */
  readonly otherOffers: readonly string[];
  /** Our visits with him (days). */
  readonly visits: { readonly official: readonly number[]; readonly unofficial: readonly number[] };
  readonly inQueue: boolean;
  /** First day an off-campus contact breaks no rule, counted from today; null when none within the scan window. */
  readonly nextContactDay: number | null;
  readonly actions: readonly ActionView[];
}

export interface NumbersRowView {
  readonly position: string; readonly returning: number; readonly target: number; readonly committed: number;
  readonly signed: number; readonly offersOut: number; readonly open: number; readonly heldForTransfer: number;
}
export interface NumbersView {
  readonly rows: readonly NumbersRowView[];
  readonly returning: number; readonly incoming: number; readonly total: number;
  readonly limit: number | null; readonly signeeCap: number | null; readonly placesOpen: number | null;
}

export interface CalendarStretch { readonly from: number; readonly to: number; readonly period: string | null }
export interface CalendarView {
  readonly from: number;
  readonly to: number;
  readonly stretches: readonly CalendarStretch[];
  readonly signing: { readonly earlyOpen: number | null; readonly earlyClose: number | null; readonly february: number | null };
  readonly visitsHosted: number;
  readonly visitCap: number | null;
}

export interface AreaRow { readonly region: string; readonly prospects: number; readonly graded: number; readonly offered: number; readonly committedToUs: number }

/** Our own logged rule-breaking acts (G-28): logged, and detectable by others. */
export interface ViolationRow { readonly logId: number; readonly day: number; readonly actor: string; readonly prospect: string | null; readonly rules: readonly string[] }

export interface PortalRow { readonly personId: number; readonly name: string; readonly position: string; readonly fromTeam: string; readonly enteredDay: number }
/** T6 transfer portal: window state and entries, when the world supplies them. */
export interface PortalView {
  readonly available: boolean;
  readonly window: { readonly open: number; readonly close: number } | null;
  readonly openNow: boolean;
  readonly rows: readonly PortalRow[];
}

export type BoardList = 'board' | 'pool' | 'offered' | 'queue';

export interface RecruitingBoardView {
  readonly teamId: number;
  readonly day: number;
  readonly classYear: number;
  readonly period: string | null;
  readonly model: string | null;
  readonly hoursLeft: number | null;
  readonly rights: Readonly<Record<RecruitingVerb, RightButton>>;
  readonly list: BoardList;
  readonly filter: { readonly position: string | null; readonly region: string | null; readonly source: string | null };
  readonly rows: readonly BoardRow[];
  /** Rows matching the list and filter before the row limit. */
  readonly total: number;
  readonly counts: { readonly onBoard: number; readonly watched: number; readonly offers: number; readonly committed: number; readonly signed: number };
  readonly numbers: NumbersView;
  readonly calendar: CalendarView;
  readonly area: readonly AreaRow[];
  readonly violations: readonly ViolationRow[];
  readonly portal: PortalView;
}
