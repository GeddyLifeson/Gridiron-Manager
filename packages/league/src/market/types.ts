// Shared shapes of the market module (G-35). Money is integer cents; instants are calendar instants.
import type { Instant } from '../calendar/date.ts';

export type { Instant };

/** A filing the league office refuses: the rule leaf and what would fix it (same shape as the roster engine's). */
export interface Refusal {
  readonly ok: false;
  readonly rule: string;
  readonly code: 'unknown' | 'phase' | 'eligibility' | 'limit' | 'deadline' | 'precondition' | 'cap' | 'consent';
  readonly message: string;
  readonly fix: string;
}

export const refuse = (rule: string, code: Refusal['code'], message: string, fix: string): Refusal => ({ ok: false, rule, code, message, fix });

/** A legal act that breaks a rule: allowed, warned, logged and sent to L8.2.5 for detection (C11.6.2), for AI clubs too. */
export interface BreakableAct { readonly rule: string; readonly act: string; readonly clubId: number; readonly personId: number }

/** Free agent class at contract expiry (C8.1.1). `free` is a league with no veteran classes. */
export type FaClass = 'exclusive_rights' | 'restricted' | 'unrestricted' | 'free';

export type RfaLevel = 'rofr' | 'original_round' | 'second_round' | 'first_round' | 'first_round_waived';
/** Every tender this module knows. Franchise and transition tags are C6.4.3 (cap module, checkTag). */
export type TenderLevel = 'erfa' | RfaLevel | 'june1' | 'june15' | 'ufa';

/** The player facts free agency reads (C5.1.2 accrued seasons, C6 prior salaries, C7 draft round). */
export interface ExpiringPlayer {
  readonly personId: number;
  readonly priorClubId: number;
  readonly accruedSeasons: number;
  /** Credited seasons set the minimum salary (CBA Art. 26). */
  readonly creditedSeasons: number;
  /** Draft round he was selected in, or null when undrafted. */
  readonly draftRound: number | null;
  /** Paragraph 5 salary of the expiring year. */
  readonly priorParagraph5Cents: number;
  /** "Prior Year Salary" of CBA Art. 9 s.1(b)(i): P5, roster and reporting bonuses, proration of the last year. */
  readonly priorYearSalaryCents: number;
  /** The expiring contract is his rookie contract, never renegotiated (UFA tender uses P5 then). */
  readonly expiringIsRookieContract: boolean;
}

export interface Tender {
  readonly personId: number;
  readonly clubId: number;
  readonly level: TenderLevel;
  readonly salaryCents: number;
  readonly madeAt: Instant;
  readonly withdrawnAt: Instant | null;
}

/** A draft pick as a trade asset. The ledger (C7.2.1) belongs to G-34; this module only names picks. */
export interface PickRef {
  readonly season: number;
  readonly round: number;
  readonly originalClubId: number;
  /** A conditional pick: its condition text key, settled by the ledger (C7.2.3). */
  readonly condition?: string;
}
