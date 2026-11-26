// The free agency read model (item 7; M5.1.1 target list, M5.2.1 the call, M5.3.1 keep, tender or tag,
// C8.1.1 rights, C8.2.1 the window, C8.3.1 the expected contract, C6.4.3 tags, L7 agents, L5.2.1 power).
// Plain data a screen shows. Every value is public (the player's class and rights, the agent's ask, linked
// clubs), the club's own (its cap room, roster count, offers) or a grade the club's staff assigned (MA-48).
// No true rating, no player weights, no general manager valuation, no acceptance chance.
import type { cap, market } from '@gm/league';
import type { AuthorityView } from '../draft-room/authority.ts';
import type { ObservedGrade } from '../draft-room/grade.ts';

export type MarketPhase =
  /** Before the negotiating window: no talks with other clubs' pending free agents (C8.2.1). */
  | 'before_window'
  /** The two-day window: front-office officials talk to agents; nothing may be executed (C8.2.1 rule 1). */
  | 'negotiating_window'
  /** League year open: contracts may be executed. */
  | 'open';

/** How the agent reads the club's offer against his ask (L7, C8.3.1 range). */
export type AgentRead = 'close' | 'talking' | 'far_apart';
export type AgentStance = 'favourable' | 'neutral' | 'wary' | 'hostile';

export interface CallView {
  /** A head coach's call to the player now is legal (C8.2.1, M5.2.1 rule 5). An illegal call is allowed, warned and logged. */
  readonly legal: boolean;
  readonly reason: string;
  readonly usesWindowCall: boolean;
  /** The agent will not put the call through until the money is close (M5.2.1 edge case, L7). */
  readonly blockedByAgent: boolean;
}

export interface OfferView {
  readonly years: number;
  readonly apyCents: number;
  readonly guaranteedCents: number;
  readonly status: 'open' | 'accepted' | 'declined' | 'request';
}

export interface MarketRow {
  readonly personId: number;
  readonly name: string;
  readonly position: string;
  readonly age: number;
  readonly priorClubName: string;
  readonly cls: market.FaClass;
  readonly rights: market.Rights;
  readonly rightsReason: string;
  /** The club may sign him outright now (C8.1.1). */
  readonly canSign: boolean;
  /** A restricted player: the club's offer is an offer sheet the prior club may match (C8.1.1 edge case). */
  readonly offerSheet: boolean;
  readonly tenderLevel: market.TenderLevel | null;
  readonly grade: ObservedGrade;
  /** The agent's ask: the market's expected contract line (C8.3.1), years and a per-year range. */
  readonly askYears: number;
  readonly askApyCents: market.Range;
  readonly askGuaranteeCents: market.Range;
  readonly publicSuitors: number;
  /** What he says he wants most, as far as known (M5.2.1), or null. */
  readonly saysHeWants: market.NonMoneyTerm | null;
  readonly agentName: string | null;
  readonly agentStance: AgentStance | null;
  readonly offer: OfferView | null;
  readonly agentRead: AgentRead | null;
  readonly call: CallView;
}

export interface TenderOption {
  readonly level: market.TenderLevel;
  /** Tender salary when it may be made now, else null. */
  readonly salaryCents: number | null;
  readonly ok: boolean;
  /** Why it may not be made now (league office text), or null. */
  readonly reason: string | null;
}

export interface TagOption { readonly kind: cap.TagKind; readonly ok: boolean; readonly reason: string | null }

/** The club's own expiring player (M5.3.1): keep, tender, tag or let go. */
export interface OwnRow {
  readonly personId: number;
  readonly name: string;
  readonly position: string;
  readonly age: number;
  readonly cls: market.FaClass;
  readonly grade: ObservedGrade;
  readonly tender: { readonly level: market.TenderLevel; readonly salaryCents: number } | null;
  readonly tenders: readonly TenderOption[];
  readonly tags: readonly TagOption[];
  readonly askYears: number;
  readonly askApyCents: market.Range;
}

export interface FreeAgencyView {
  readonly clubId: number;
  readonly authority: AuthorityView;
  readonly phase: MarketPhase;
  /** The first wave runs (C8.2.1 rule 4). */
  readonly firstWave: boolean;
  /** Contracts may be executed now (C8.2.1 rule 1). */
  readonly mayExecute: boolean;
  readonly capRoomCents: number;
  /** Per-year money of the club's open offers and accepted deals not yet on the books. */
  readonly committedCents: number;
  readonly roomAfterOffersCents: number;
  readonly rosterCount: number;
  readonly rosterLimit: number;
  readonly windowCallsUsed: number;
  readonly windowCalls: number | null;
  readonly market: readonly MarketRow[];
  readonly own: readonly OwnRow[];
  readonly tagsUsed: number;
}
