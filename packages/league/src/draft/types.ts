// Shared draft types (G-34, bible C7). Clubs are numeric ids, as in the roster and standings modules.
export type ClubId = number;
export type PersonId = number;
export type PickId = string;

/**
 * regular: one per club per round. compensatory: awarded under C7.2.2 rules 1 to 5, placed at the end of a round.
 * equal_count: the CBA App. V para 5 pick (equal losses and gains, lost value well above gained), after the last
 * round's compensatory picks. supplemental: fills the compensatory total up to the number of clubs (CBA Art. 6 s.2(a)).
 */
export type PickKind = 'regular' | 'compensatory' | 'equal_count' | 'supplemental';

export type PickStatus = 'open' | 'used' | 'forfeited';

export interface Pick {
  readonly id: PickId;
  readonly year: number;
  readonly round: number;
  /** The club whose slot the pick takes (C7.2.1 edge case: a pick keeps its original club's slot). */
  readonly originalClubId: ClubId;
  readonly ownerClubId: ClubId;
  readonly kind: PickKind;
  readonly status: PickStatus;
  /** Id of the pending conditional transfer that holds this pick, or null. A locked pick cannot be traded or used. */
  readonly lockedBy: string | null;
  /** Orders compensatory picks inside their round: the lost player's final value, higher first. 0 otherwise. */
  readonly compValue: number;
}

/**
 * A conditional pick (C7.2.3 edge case): the giver hands over one of two picks, decided by a condition resolved at
 * season end. Both picks stay with the giver and are locked until then.
 */
export interface ConditionalTransfer {
  readonly id: string;
  readonly fromClubId: ClubId;
  readonly toClubId: ClubId;
  readonly ifMet: PickId;
  readonly ifNotMet: PickId;
  /** Text key describing the condition (for example a share of snaps), shown on the ledger page. */
  readonly condition: string;
  readonly status: 'pending' | 'met' | 'not_met';
}

export type LedgerEvent =
  | { readonly kind: 'created'; readonly year: number }
  | { readonly kind: 'traded'; readonly tradeId: string; readonly pickId: PickId; readonly fromClubId: ClubId; readonly toClubId: ClubId }
  | { readonly kind: 'conditional'; readonly conditionId: string }
  | { readonly kind: 'condition_resolved'; readonly conditionId: string; readonly met: boolean; readonly pickId: PickId }
  | { readonly kind: 'forfeited'; readonly pickId: PickId; readonly reason: string }
  | { readonly kind: 'awarded'; readonly pickId: PickId }
  | { readonly kind: 'used'; readonly pickId: PickId; readonly personId: PersonId };

export interface PickLedger {
  /** The next draft to be held. */
  readonly currentYear: number;
  readonly clubIds: readonly ClubId[];
  /** Last draft year held in the ledger (current year plus the horizon). */
  readonly lastYear: number;
  readonly picks: readonly Pick[];
  readonly conditions: readonly ConditionalTransfer[];
  readonly history: readonly LedgerEvent[];
}

/** One selection of this year's draft, in order. */
export interface Selection {
  /** 1-based overall pick number. */
  readonly overall: number;
  readonly round: number;
  /** 1-based number inside the round, compensatory picks included. */
  readonly inRound: number;
  readonly pickId: PickId;
  readonly kind: PickKind;
  readonly originalClubId: ClubId;
  readonly ownerClubId: ClubId;
}

/** A refused request: the rule leaf and what would fix it, as the roster engine reports (C5.7.1). */
export interface DraftRefusal {
  readonly ok: false;
  readonly rule: string;
  readonly message: string;
  readonly fix: string;
}

export const refuse = (rule: string, message: string, fix: string): DraftRefusal => ({ ok: false, rule, message, fix });

/** A uniform draw in [0, 1), injected so the league stays free of platform random (P1.1.1). */
export interface UnitDraw { unit(label: string): number }
