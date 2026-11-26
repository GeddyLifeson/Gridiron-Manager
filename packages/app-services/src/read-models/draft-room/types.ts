// The draft room read model (C7.3.1 draft screen, M4.5.1 the coach in the room, C7.5.1 offer cards, M1.4.1
// needs). Plain data a screen shows. Every value is public (the order, the picks, the wire), the club's own
// (its board order, its picks, its needs as words) or a grade the club's staff assigned (MA-48). No true
// rating, no board score or general manager valuation number, no approval chance.
import type { draft } from '@gm/league';
import type { AuthorityView } from './authority.ts';
import type { ObservedGrade } from './grade.ts';

export type NeedWord = 'high' | 'some' | 'low';

export interface ClockView {
  readonly overall: number;
  readonly round: number;
  readonly inRound: number;
  readonly kind: draft.PickKind;
  readonly clubId: number;
  readonly clubName: string;
  /** The user's club is on the clock. */
  readonly userOnClock: boolean;
  /** The clock always runs (C7.3.1 rule 5): seconds left at the state's time. */
  readonly secondsLeft: number;
  readonly limitSec: number;
  readonly day: number;
}

export interface TakenBy { readonly overall: number; readonly clubId: number; readonly clubName: string }

/** One board line (C7.3.1: the club's board with taken players struck out). Rank is the board's order only. */
export interface BoardLine {
  readonly rank: number;
  readonly personId: number;
  readonly name: string;
  readonly position: string;
  readonly school: string | null;
  readonly grade: ObservedGrade;
  /** Potential in words only, a text key; null when the staff has not projected him (MA-48). */
  readonly potential: string | null;
  readonly consensusRank: number;
  readonly taken: TakenBy | null;
}

export interface PickLine {
  readonly overall: number;
  readonly round: number;
  readonly inRound: number;
  readonly clubId: number;
  readonly clubName: string;
  readonly personId: number;
  readonly name: string;
  readonly position: string;
  /** Filed after the club's clock ran out (C7.3.1 rule 2). */
  readonly late: boolean;
  readonly mine: boolean;
}

/** A pick the user's club holds (C7.2.1 ledger), this year with its slot, or a future year's. */
export interface HeldPick {
  readonly pickId: string;
  readonly year: number;
  readonly round: number;
  /** Overall slot this year, or null for a future pick (slot not yet known). */
  readonly overall: number | null;
  readonly kind: draft.PickKind;
  readonly status: draft.PickStatus;
  /** Original club when it came by trade. */
  readonly fromClubName: string | null;
  /** Locked by a pending conditional transfer (C7.2.3 edge case). */
  readonly locked: boolean;
}

export interface NeedLine {
  readonly position: string;
  readonly word: NeedWord;
  readonly frame: 'now' | 'this_offseason' | 'next_year';
  /** The user named this position among his asks (K7.2.1 rule 2). */
  readonly coachAsked: boolean;
}

export interface PickLabel { readonly pickId: string; readonly year: number; readonly round: number; readonly overall: number | null }

/** C7.5.1 offer card: both sides' chart totals, and which way the personnel man leans by that chart. */
export interface OfferCard {
  readonly id: string;
  readonly withClubId: number;
  readonly withClubName: string;
  /** What the user's club gives. */
  readonly give: readonly PickLabel[];
  readonly get: readonly PickLabel[];
  readonly giveTotal: number;
  readonly getTotal: number;
  readonly personnelLean: 'take' | 'pass';
  /** The offer involves the pick on the clock: it must complete before that clock runs out (C7.2.3 rule 4). */
  readonly beforeClockEnds: boolean;
}

export interface TickerLine {
  readonly seq: number;
  readonly atSec: number;
  readonly kind: draft.DraftWire['kind'];
  readonly clubName: string | null;
  readonly overall: number | null;
  readonly personName: string | null;
  readonly withClubName: string | null;
}

export interface LogLine {
  readonly overall: number;
  readonly personName: string;
  readonly stance: draft.UserStance['kind'];
  readonly decidedBy: draft.DecidedBy;
  readonly late: boolean;
}

export interface DraftRoomView {
  readonly clubId: number;
  readonly year: number;
  readonly authority: AuthorityView;
  readonly clock: ClockView | null;
  /** The draft waits for this day to open, or null. */
  readonly waitingForDay: number | null;
  readonly complete: boolean;
  /** The user's club has an expired slot it may still fill (C7.3.1 rule 2). */
  readonly userExpired: boolean;
  readonly board: readonly BoardLine[];
  /** The personnel man's lean and the top of the board still available (M4.5.1: he speaks first). */
  readonly lean: readonly { readonly personId: number; readonly name: string; readonly position: string }[];
  readonly picks: readonly PickLine[];
  readonly held: readonly HeldPick[];
  readonly needs: readonly NeedLine[];
  readonly offers: readonly OfferCard[];
  readonly ticker: readonly TickerLine[];
  readonly log: readonly LogLine[];
  /** The stance the user has stated for the club's next pick (advise mode), or null (silence so far). */
  readonly stance: draft.UserStance | null;
  readonly insistsMade: number;
  /** M4.4.1 rule 4: insists weigh in full up to a count, then less. No cap. */
  readonly nextInsist: 'full' | 'reduced';
}
