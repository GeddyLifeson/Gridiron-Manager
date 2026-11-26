// C8.3.2 how a free agent chooses, with the coach's pitch (M5.2.1). Each offer gets a score: the money
// term plus non-money terms, weighted by the player's values (X1). A coach's call cannot close a large
// money gap (M5.2.1 rule 4). Every signing stores its top two reasons (C8.3.2 acceptance).
import { PROB_FLOOR, type RandomStream } from '@gm/schema';
import type { MarketDates } from './dates.ts';
import { P, PERCENT, REASONS_PER_SIGNING } from './params.ts';
import { compareInstant } from '../calendar/date.ts';
import { timeFactor } from './value.ts';
import type { Instant } from './types.ts';

export const TERMS = ['money', 'role', 'winning', 'relationships', 'scheme', 'location'] as const;
export type Term = (typeof TERMS)[number];
export type NonMoneyTerm = Exclude<Term, 'money'>;
export type Weights = Readonly<Record<Term, number>>;

/** C8.3.2 rule 1: starting weights of the median player. */
export function medianWeights(): Weights {
  return { money: P.weightMoney, role: P.weightRole, winning: P.weightWinning, relationships: P.weightRelationships, scheme: P.weightScheme, location: P.weightLocation };
}

/** Weights normalised to sum to one, and the C8.3.2 rule 1 ceilings checked (money up to 0.8, winning up to 0.4). */
export function checkWeights(w: Weights): { readonly weights: Weights; readonly problems: readonly string[] } {
  const sum = TERMS.reduce((s, t) => s + Math.max(0, w[t]), 0);
  const problems: string[] = [];
  if (sum <= 0) return { weights: medianWeights(), problems: ['weights sum to zero; median weights used'] };
  const weights = Object.fromEntries(TERMS.map((t) => [t, Math.max(0, w[t]) / sum])) as Weights;
  if (weights.money > P.weightMoneyMax) problems.push(`money weight ${weights.money} above ${P.weightMoneyMax}`);
  if (weights.winning > P.weightWinningMax) problems.push(`winning weight ${weights.winning} above ${P.weightWinningMax}`);
  return { weights, problems };
}

export interface Offer {
  readonly clubId: number;
  readonly madeAt: Instant;
  readonly guaranteedCents: number;
  /** State income tax rate of the club's state, percent (E6 tax table; C8.3.2 rule 2). */
  readonly stateTaxPct: number;
  /** Non-money terms in [0, 1]: role offered (M2), chance to win, relationships on the staff and roster (X7), scheme fit (M1.2.1), location (C1.4.1). */
  readonly terms: Readonly<Record<NonMoneyTerm, number>>;
  /** The player's prior club: how he was treated there, -1 to 1 (X6 memory; C8.3.2 rule 5), else null. */
  readonly oldClubTreatment: number | null;
}

export interface Chooser {
  readonly personId: number;
  readonly weights: Weights;
  /** C8.3.1 expected guarantee at the market opening (mid), before his self-belief. */
  readonly expectedGuaranteeCents: number;
  /** Self-belief multiplier on his expectation (1 = believes the market). */
  readonly selfBelief: number;
  /** Tax rate his expectation is stated at, percent (his home state, or the league median). */
  readonly referenceTaxPct: number;
}

const afterTax = (cents: number, pct: number) => cents * (1 - pct / PERCENT);

export interface Scored {
  readonly offer: Offer;
  readonly score: number;
  readonly parts: Readonly<Record<Term | 'old_club', number>>;
  /** Out of reach: its money gap to the richest offer is more than non-money terms may offset (M5.2.1 rule 4). */
  readonly outOfReach: boolean;
}

/** The player's expectation at `now`: C8.3.1 expectation times self-belief, falling with the time discount (C8.3.2 rule 3). */
export function expectationCents(c: Chooser, now: Instant, dates: MarketDates): number {
  return c.expectedGuaranteeCents * c.selfBelief * timeFactor(now, dates);
}

/** Scores every offer (C8.3.2 rules 1, 2 and 5). */
export function scoreOffers(c: Chooser, offers: readonly Offer[], now: Instant, dates: MarketDates): Scored[] {
  const expect = Math.max(1, afterTax(expectationCents(c, now, dates), c.referenceTaxPct));
  const net = offers.map((o) => afterTax(o.guaranteedCents, o.stateTaxPct));
  const richest = Math.max(0, ...net);
  // The allowed gap is stated for the median player; it scales with his non-money weight against the median's.
  const allowedGap = P.nonMoneyOffsetMaxShare * ((1 - c.weights.money) / (1 - P.weightMoney));
  return offers.map((o, i) => {
    const money = c.weights.money * (net[i]! / expect);
    const parts = { money } as Record<Term | 'old_club', number>;
    for (const t of TERMS) if (t !== 'money') parts[t] = c.weights[t] * Math.min(1, Math.max(0, o.terms[t]));
    parts.old_club = o.oldClubTreatment === null ? 0 : P.oldClubTermMax * Math.min(1, Math.max(-1, o.oldClubTreatment));
    const score = Object.values(parts).reduce((s, v) => s + v, 0);
    const outOfReach = richest > 0 && (richest - net[i]!) / richest > allowedGap;
    return { offer: o, score, parts, outOfReach };
  });
}

export type Reason = Term | 'old_club';
export type Choice =
  | { readonly kind: 'signs'; readonly clubId: number; readonly reasons: readonly Reason[]; readonly scored: readonly Scored[] }
  | { readonly kind: 'waits'; readonly bestClubId: number | null; readonly reason: string; readonly scored: readonly Scored[] };

/** The score of a neutral offer at exactly his expectation: below it he waits (C8.3.2 rule 3). */
export function reservationScore(c: Chooser): number {
  return c.weights.money + (1 - c.weights.money) * P.neutralTerm;
}

/**
 * C8.3.2: the player picks the best score among offers within reach, or waits when the best is below his
 * reservation score. Equal scores: the earlier offer wins, then the lower club id (deterministic).
 */
export function choose(c: Chooser, offers: readonly Offer[], now: Instant, dates: MarketDates, surprise?: RandomStream): Choice {
  const scored = scoreOffers(c, offers, now, dates);
  const ranked = scored.filter((s) => !s.outOfReach).sort((a, b) => b.score - a.score || compareInstant(a.offer.madeAt, b.offer.madeAt) || a.offer.clubId - b.offer.clubId);
  if (surprise) {
    // A3.1 ruling 22: every other outcome (any other offer, out of reach or not, or waiting) keeps the
    // floor chance. One uniform draw; the expected choice takes the rest.
    const usual = choose(c, offers, now, dates);
    const usualClub = usual.kind === 'signs' ? usual.clubId : null;
    const others: (Scored | null)[] = [...scored.filter((s) => s.offer.clubId !== usualClub), ...(usual.kind === 'signs' ? [null] : [])];
    const u = surprise.uniform();
    const i = Math.floor(u / PROB_FLOOR);
    if (i < others.length) {
      const pick = others[i]!;
      if (pick === null) return { kind: 'waits', bestClubId: usualClub, reason: 'waited against expectation', scored };
      return { kind: 'signs', clubId: pick.offer.clubId, reasons: topReasons(pick, null), scored };
    }
    return usual;
  }
  const best = ranked[0];
  if (!best) return { kind: 'waits', bestClubId: null, reason: 'no offers', scored };
  if (best.score < reservationScore(c)) return { kind: 'waits', bestClubId: best.offer.clubId, reason: 'best offer below his expectation', scored };
  return { kind: 'signs', clubId: best.offer.clubId, reasons: topReasons(best, ranked[1] ?? null), scored };
}

/** The two parts that most favour the chosen offer over the runner-up (or over a neutral offer when alone). */
export function topReasons(best: Scored, runnerUp: Scored | null): Reason[] {
  const keys = Object.keys(best.parts) as Reason[];
  const edge = keys.map((k) => ({ k, d: best.parts[k] - (runnerUp ? runnerUp.parts[k] : 0) })).sort((a, b) => b.d - a.d || (a.k < b.k ? -1 : 1));
  return edge.slice(0, REASONS_PER_SIGNING).map((e) => e.k);
}

/** A pitch from the coach's call or visit (M5.2.1). */
export interface Pitch {
  readonly emphasis: NonMoneyTerm;
  /** A specific promise ("you start at the nickel spot") rather than general talk (M5.2.1 rule 2). */
  readonly specificPromise: boolean;
  /** Film shown from the playbook: actual fit of the plays to his job profile in [0, 1], or null (M5.2.1 rule 3). */
  readonly filmFit: number | null;
}

/** The player's top non-money value: the term his weights put first (ties: the order of TERMS). */
export function topValue(w: Weights): NonMoneyTerm {
  let best: NonMoneyTerm = 'role';
  for (const t of TERMS) if (t !== 'money' && w[t] > w[best]) best = t;
  return best;
}

/**
 * M5.2.1 rules 1 to 3: a pitch whose emphasis matches the player's top value raises that term of the
 * club's offer; one that does not match moves nothing. Film raises the scheme term by actual fit.
 */
export function applyPitch(o: Offer, w: Weights, pitch: Pitch): Offer {
  const terms = { ...o.terms };
  if (pitch.emphasis === topValue(w)) {
    const gain = pitch.specificPromise ? P.pitchSpecificPromiseGain : P.pitchGeneralGain;
    terms[pitch.emphasis] = Math.min(1, terms[pitch.emphasis] + gain);
  }
  if (pitch.filmFit !== null && pitch.emphasis === 'scheme' && topValue(w) === 'scheme') {
    terms.scheme = Math.min(1, terms.scheme + P.pitchFilmGain * Math.min(1, Math.max(0, pitch.filmFit)));
  }
  return { ...o, terms };
}
