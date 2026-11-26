// Offers (E2.5.1), the signing gate (E2.3.1 rule 6), assistant offer cards (S6.5.1, S6.5.2) and coach
// trades (E2.5.3). Contract terms and negotiation belong to career/contract (E3); this file decides who
// gets an offer, when it may be signed, and what an employer is owed for a coach under contract.
import type { WorldDate } from '@gm/schema';
import type { LeverageInputs } from '../contract/negotiation.ts';
import type { CandidateWindow } from '../staff/window.ts';
import type { CoachTradeMode } from './keys.ts';
import { clamp, param } from './params.ts';
import { marketFactNumber } from './facts.ts';

export type OfferState = 'live' | 'accepted' | 'agreed_in_principle' | 'declined' | 'expired' | 'withdrawn' | 'backed_out';

export interface OfferRecord {
  readonly id: number;
  readonly openingId: number;
  readonly personId: number;
  readonly made: WorldDate;
  /** Day index (same season numbering as `made`) after which it lapses. */
  readonly deadlineDay: number;
  readonly state: OfferState;
  /** Log rows of the search that ranked him first (offers trace to log rows, G-80 acceptance). */
  readonly evidenceEventIds: readonly number[];
}

const dayNo = (d: WorldDate): number => d.seasonYear * 1000 + d.dayIndex;

/** E2.5.1: the first-ranked live candidate gets the offer, with a reply deadline. */
export function makeOffer(id: number, openingId: number, ranked: readonly number[], skip: ReadonlySet<number>, made: WorldDate, evidenceEventIds: readonly number[]): OfferRecord | null {
  const personId = ranked.find((p) => !skip.has(p));
  if (personId === undefined) return null;
  return { id, openingId, personId, made, deadlineDay: dayNo(made) + param('offer.deadlineDays'), state: 'live', evidenceEventIds };
}

/** E2.5.1: an offer still live past its deadline expires; the party moves to its next candidate. */
export function expireIfLate(o: OfferRecord, today: WorldDate): OfferRecord {
  return o.state === 'live' && dayNo(today) > o.deadlineDay ? { ...o, state: 'expired' } : o;
}

/**
 * E2.3.1 rule 6: no coach signs before his club's season is over. Accepting while his window forbids
 * signing makes the offer "agreed in principle, cannot be announced"; E3 may not create the contract.
 */
export function accept(o: OfferRecord, w: CandidateWindow): OfferRecord {
  if (o.state !== 'live') return o;
  return { ...o, state: w.signing ? 'accepted' : 'agreed_in_principle' };
}

/** The day after his club's last game the hold lifts; E3 may then create the contract. */
export function releaseHold(o: OfferRecord, w: CandidateWindow): OfferRecord {
  return o.state === 'agreed_in_principle' && w.signing ? { ...o, state: 'accepted' } : o;
}

/** May E3 create a contract from this offer today? (E2.3.1 acceptance 3) */
export const contractAllowed = (o: OfferRecord): boolean => o.state === 'accepted';

/** E2.5.1: backing out of an accepted or agreed offer is allowed, at a large regard cost with owners. */
export function backOut(o: OfferRecord): { offer: OfferRecord; ownerRegard: number } {
  if (o.state !== 'accepted' && o.state !== 'agreed_in_principle') return { offer: o, ownerRegard: 0 };
  return { offer: { ...o, state: 'backed_out' }, ownerRegard: param('offer.backOutOwnerRegard') };
}

/**
 * E2.5.1 "competing offers raise the terms": the leverage inputs E3's negotiation reads. Live offers from
 * other parties are counted; nothing else here changes, so terms with two live offers are never worse.
 */
export function leverageInputs(others: readonly OfferRecord[], personId: number, candidateGap: number, recordTerm: number, unemployed: boolean): LeverageInputs {
  const live = others.filter((o) => o.personId === personId && (o.state === 'live' || o.state === 'agreed_in_principle')).length;
  return { competingLiveOffers: live, candidateGap: clamp(candidateGap, 0, 1), recordTerm: clamp(recordTerm, -1, 1), unemployedWithNoOtherOffer: unemployed && live === 0 };
}

// ---------- the assistant's offer card (S6.5.1, S6.5.2) ----------

export interface OfferCard {
  readonly rung: number;
  readonly level: string;
  readonly programStrength: number;
  /** What his former assistants say and where they ended up (label keys), never the hidden teaching value. */
  readonly bossReportKeys: readonly string[];
  readonly salaryCents: number;
  readonly years: number;
  readonly callsPlays: boolean;
  /** The head coach's standing word as far as outsiders can tell (E4.4 signs seen in the news). */
  readonly staffSecurityKey: 'stable' | 'uncertain' | 'likely_purge';
  /** Cross-level card: the "what changes" list (S6.5.2). Empty at the same level. */
  readonly whatChanges: readonly string[];
  /** Offset language means a low-paid seat may add no income while a buyout runs (E2.7.2 edge). */
  readonly offsetNote: boolean;
}

/** S6.5.2: the "what changes" list when an offer crosses levels; the briefing is offered if he never coached there. */
export function whatChanges(fromLevel: string, toLevel: string, coachedAtTarget: boolean): readonly string[] {
  if (fromLevel === toLevel) return [];
  const list = ['market.change.rules', 'market.change.recruiting', 'market.change.player_ages', 'market.change.calendar', 'market.change.staff_size', 'market.change.pay'];
  return coachedAtTarget ? list.slice(1) : list;
}

// ---------- coach trades (E2.5.3) ----------

export interface TradeAsk {
  /** Pick points: 1 for a mid-round pick up to the cap (first plus second, F-market-0004). */
  readonly points: number;
  readonly capped: boolean;
}

/** The cap: a first-round and a second-round pick, the one fully reported case. In pick points: 3 + 2. */
export const FIRST_POINTS = 3;
export const SECOND_POINTS = 2;
export function tradeCapPoints(): number {
  return marketFactNumber('F-market-0004') === 2 ? FIRST_POINTS + SECOND_POINTS : FIRST_POINTS;
}

/**
 * E2.5.3 rule 3: the holder's asking price from four terms: market value (0..100), years left, whether
 * he is still coaching for the holder, and a premium against helping a rival.
 */
export function askingPrice(marketValue: number, yearsLeft: number, stillCoaching: boolean, pursuerIsRival: boolean): TradeAsk {
  const cap = tradeCapPoints();
  let p = (clamp(marketValue, 0, 100) / 100) * cap * clamp(yearsLeft / param('trade.yearsFull'), 0, 1);
  if (!stillCoaching) p *= param('trade.steppedAwayShare');
  if (pursuerIsRival) p *= param('trade.rivalPremium');
  p = Math.max(p, yearsLeft > 0 ? param('trade.minPoints') : 0);
  return { points: Math.min(p, cap), capped: p >= cap };
}

/** Pick points as picks: firsts, seconds, then a mid-round pick for any remainder. */
export function picksFor(points: number): readonly ('first' | 'second' | 'mid')[] {
  const out: ('first' | 'second' | 'mid')[] = [];
  let left = Math.round(points);
  if (left >= FIRST_POINTS) { out.push('first'); left -= FIRST_POINTS; }
  while (left >= SECOND_POINTS) { out.push('second'); left -= SECOND_POINTS; }
  if (left > 0) out.push('mid');
  return out;
}

export type TradeRoute =
  | { readonly kind: 'free' }
  | { readonly kind: 'consent'; readonly ask: TradeAsk }
  | { readonly kind: 'buyout' }
  | { readonly kind: 'blocked' };

/**
 * E2.5.3 rules 1, 2, 8 and edge cases: how a coach can move. A fired coach (no rights) or one with no
 * years left is free. Otherwise the rule key decides: holder's consent for a price, or the contract buyout.
 * With no key there is no route but release.
 */
export function tradeRoute(mode: CoachTradeMode | null, yearsLeft: number, rightsHeld: boolean, marketValue: number, stillCoaching: boolean, pursuerIsRival: boolean): TradeRoute {
  if (!rightsHeld || yearsLeft <= 0) return { kind: 'free' };
  if (mode === 'contract_buyout') return { kind: 'buyout' };
  if (mode === 'club_consent') return { kind: 'consent', ask: askingPrice(marketValue, yearsLeft, stillCoaching, pursuerIsRival) };
  return { kind: 'blocked' };
}

/** E2.5.3 AI use: an AI club tries only for a top-tier coach and only with an aggressive owner. */
export function aiAttemptsTrade(valuePercentile: number, ownerAggression: number): boolean {
  return valuePercentile >= 1 - param('trade.topShare') && ownerAggression >= param('trade.aggressiveAbove');
}

/** E2.5.3 rule 5: the pursuer pays when the ask is below what he sees as the gap to his next candidate (in pick points). */
export function pursuerPays(ask: TradeAsk, gapToNextInPoints: number): boolean {
  return ask.points <= gapToNextInPoints;
}

/** E2.5.3 rule 6: a coach who asks to go and is refused loses owner confidence. */
export const refusedRequestConfidence = (): number => param('trade.refusedConfidence');

/** E2.5.3 output: "rights held by <club> through <year>" on the career screen after stepping away. */
export interface RightsHeld { readonly teamId: number; readonly throughSeason: number }
