// The cap sheet view (team.cap, O4.2.2 contracts and cap, C6, T7). Plain JSON: no maps, every amount in
// integer cents, every rule value shown with the fact row it comes from so the screen can flag anything
// short of triple verification (Q6).
import type { cap } from '@gm/league';

/** Where a shown rule value comes from. Status is computed by the fact register, never typed (Q6). */
export interface Provenance {
  readonly key: string;
  readonly factId: string | null;
  readonly status: string | null;
}

/** The host's lookup from a rule key to its fact row and computed status. */
export type ProvenanceLookup = (key: string) => { readonly factId: string; readonly status: string } | null;

export interface ChargeParts {
  readonly baseCents: number;
  readonly prorationCents: number;
  readonly rosterBonusCents: number;
  readonly workoutBonusCents: number;
  readonly likelyIncentivesCents: number;
  readonly totalCents: number;
}

export type MoveKind = 'release' | 'release_june1' | 'trade';

/** What a move would do to this year's cap (C6.3.2). */
export interface MovePreview {
  readonly kind: MoveKind;
  /** Null when the move is legal; the rule's message when it is not. */
  readonly refused: string | null;
  readonly deadThisYearCents: number;
  readonly deadNextYearCents: number;
  readonly guaranteedOwedCents: number;
  readonly savingCents: number;
  /** Room this year after the move, with the offseason top-N recounted. */
  readonly roomAfterCents: number;
  /** A designated release keeps the full charge until June 2 (C6.3.2 rule 3). */
  readonly chargeUntilJune2Cents: number | null;
}

export interface TrancheRow {
  readonly source: cap.BonusTranche['source'];
  readonly amountCents: number;
  readonly paidLeagueYear: number;
  /** League year to the prorated amount charged in it. */
  readonly byYear: readonly { readonly leagueYear: number; readonly cents: number }[];
}

export interface RookieRow {
  readonly round: number | null;
  readonly length: number;
  readonly lengthSource: Provenance;
  /** First year whose raise breaks the annual increase limit, or null (C6.4.2 rule 2). */
  readonly increaseBreachYear: number | null;
}

export interface ContractRow {
  readonly contractId: number;
  readonly personId: number;
  readonly name: string;
  readonly position: string;
  readonly form: string;
  readonly thisYear: ChargeParts;
  /** Offseason: counted in full (top N) or at the reduced charge. Always true in season. */
  readonly countedInFull: boolean;
  /** The charge that counts against the cap now (reduced in the offseason outside the top N). */
  readonly countsCents: number;
  readonly byYear: readonly { readonly leagueYear: number; readonly chargeCents: number }[];
  readonly lastLeagueYear: number;
  readonly remainingProrationCents: number;
  readonly tranches: readonly TrancheRow[];
  readonly rookie: RookieRow | null;
  readonly minimumSalaryCents: number;
  readonly moves: readonly MovePreview[];
}

export interface YearColumn {
  readonly leagueYear: number;
  /** Null when the league has not set the cap for that year (no fact row, never estimated). */
  readonly capCents: number | null;
  readonly capSource: Provenance;
  readonly committedCents: number;
  readonly deadCents: number;
  readonly roomCents: number | null;
}

export interface OtherRow { readonly label: string; readonly amountCents: number; readonly kind: cap.OtherCharge['kind'] }

export interface ProCapView {
  readonly level: 'pro';
  readonly clubId: number;
  readonly leagueYear: number;
  readonly phase: cap.CapPhase;
  readonly timing: cap.LeaveTiming;
  readonly capCents: number;
  readonly capSource: Provenance;
  readonly adjustmentCents: number;
  readonly teamSalaryCents: number;
  readonly roomCents: number;
  readonly countedInFull: number;
  readonly topN: number;
  readonly topNSource: Provenance;
  readonly june1: { readonly allowed: number; readonly used: number; readonly source: Provenance };
  readonly prorationMaxYears: number;
  readonly prorationSource: Provenance;
  readonly years: readonly YearColumn[];
  readonly rows: readonly ContractRow[];
  readonly other: readonly OtherRow[];
}

export interface PayLineRow {
  readonly personId: number;
  readonly name: string;
  readonly position: string;
  readonly amountCents: number;
}

/** College player pay (T7): the revenue share cap, football's budget and the sheet. */
export interface CollegeBudgetView {
  readonly level: 'college';
  readonly clubId: number;
  readonly academicYear: number;
  readonly tier: string;
  readonly capCents: number;
  readonly capSource: Provenance;
  readonly scholarshipCreditCents: number;
  readonly creditSource: Provenance;
  readonly paymentRoomCents: number;
  readonly schoolPoolCents: number;
  readonly footballCents: number;
  readonly reserveCents: number;
  readonly reserveReleasedCents: number;
  readonly aidLimit: number;
  readonly aidSource: Provenance;
  readonly reportThresholdCents: number;
  readonly reportSource: Provenance;
  readonly lines: readonly PayLineRow[];
  readonly totalCents: number;
  /** Left to spend, or null when the sheet is refused. */
  readonly leftCents: number | null;
  readonly refused: 'over_budget' | 'negative_amount' | 'over_aid_limit' | null;
  readonly paidPlayers: number;
  readonly byPosition: readonly { readonly position: string; readonly cents: number }[];
  readonly quarterbackShare: number;
}

export type CapSheetView = ProCapView | CollegeBudgetView;
