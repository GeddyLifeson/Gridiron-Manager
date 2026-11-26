// Offer sheets and the right of first refusal (C8.1.1 rule 4; CBA Art. 9 s.2(j), s.3). A restricted player
// on a qualifying offer may sign one offer sheet at a time with another club; the prior club has five days,
// and no later than the day before the draft, to match. No restricted player moves without that window
// passing (C8.1.1 acceptance).
import { addMinutes, civil, compareInstant, dayNumber, daysInMonth } from '../calendar/date.ts';
import { need, type MarketRules } from './keys.ts';
import { addDays, atOrAfter, startOfDay, type MarketDates } from './dates.ts';
import { PERCENT } from './params.ts';
import { compensationFor, freeAgentClass, RFA_LEVELS, rightsAt, type Compensation } from './status.ts';
import { refuse, type ExpiringPlayer, type Instant, type Refusal, type RfaLevel, type Tender } from './types.ts';

/** The Principal Terms of an offer sheet that matter to the league office (CBA Art. 9 s.3(e)). */
export interface OfferSheetTerms {
  /** Salary in the Principal Terms: signing bonus, Paragraph 5 salaries, reporting and roster bonuses, all years. */
  readonly salaryCents: number;
  /** Incentives on the new club's performance tagged likely to be earned. */
  readonly ltbeClubIncentivesCents: number;
  /** A term that would bind the old club differently from the new one (a poison pill, CBA Art. 9 s.3(e)(iii)). */
  readonly bindsOldClubDifferently: boolean;
  /** Property or investments offered beside salary (CBA Art. 9 s.3(f)). */
  readonly includesPropertyOrInvestments: boolean;
}

export interface OfferSheet {
  readonly personId: number;
  readonly priorClubId: number;
  readonly newClubId: number;
  readonly terms: OfferSheetTerms;
  readonly receivedAt: Instant;
  /** Last instant the prior club may give its First Refusal Exercise Notice. */
  readonly matchDeadline: Instant;
  readonly compensation: Compensation;
  /** Draft season the compensation pick comes from (CBA Art. 9 s.2(j)). */
  readonly compensationSeason: number | null;
  readonly withdrawn: boolean;
}

export interface OfferSheetContext {
  readonly player: ExpiringPlayer;
  readonly tender: Tender | null;
  /** All the prior club's live restricted tenders with each player's draft round (upgraded-tender rule). */
  readonly priorClubTenders: readonly { readonly tender: Tender; readonly draftRound: number | null }[];
  /** An offer sheet already outstanding for this player (only one at a time, CBA Art. 9 s.3(d)). */
  readonly outstanding: OfferSheet | null;
  /** The new club holds its own or a better pick in `round` of the `season` draft (CBA Art. 9 s.3(c)). From the G-34 ledger. */
  readonly newClubHoldsPick: (round: number, season: number) => boolean;
  readonly dates: MarketDates;
  readonly mr: MarketRules;
}

export type OfferSheetResult = { readonly ok: true; readonly sheet: OfferSheet } | Refusal;

/** End of the day `days` before the draft opens. */
const dayBeforeDraft = (dates: MarketDates, days: number): Instant => addMinutes(addDays(startOfDay(dates.draftStart), 1 - days), -1);

export function signOfferSheet(newClubId: number, terms: OfferSheetTerms, now: Instant, ctx: OfferSheetContext): OfferSheetResult {
  const { player: p, tender: t, dates, mr } = ctx;
  if (freeAgentClass(p.accruedSeasons, mr) !== 'restricted') return refuse('C8.1.1', 'eligibility', `player ${p.personId} is not a restricted free agent`, 'make a plain offer');
  if (newClubId === p.priorClubId) return refuse('C8.1.1', 'eligibility', 'the prior club does not sign an offer sheet with its own player', 'sign him to a contract');
  const view = rightsAt(p, t, now, dates, mr);
  if (view.rights === 'under_contract') return refuse('C8.2.1', 'phase', 'the signing period opens with the league year', 'wait for the league year');
  if (view.rights === 'any_club') return refuse('C8.1.1', 'precondition', 'he carries no qualifying offer: sign him outright', 'make a plain offer');
  if (view.rights !== 'offer_sheet') return refuse('C8.1.1', 'deadline', `offer sheets may no longer be signed: ${view.reason}`, 'none');
  if (ctx.outstanding && !ctx.outstanding.withdrawn) return refuse('C8.1.1', 'limit', 'he already has an offer sheet outstanding (CBA Art. 9 s.3(d))', 'wait for the prior club to answer');
  if (terms.bindsOldClubDifferently) return refuse('C8.1.1', 'precondition', 'an offer sheet may not bind the old club differently (no poison pills, CBA Art. 9 s.3(e)(iii))', 'remove the term');
  if (terms.includesPropertyOrInvestments) return refuse('C8.1.1', 'precondition', 'an offer sheet may hold only salary, no property or investments (CBA Art. 9 s.3(f))', 'remove the item');
  const ltbeMax = Math.floor((terms.salaryCents * need(mr.offerSheetLtbeMaxPct, 'fa.offer_sheet_ltbe_max_pct')) / PERCENT);
  if (terms.ltbeClubIncentivesCents > ltbeMax) return refuse('C8.1.1', 'limit', `likely club-performance incentives exceed ${mr.offerSheetLtbeMaxPct} percent of salary (CBA Art. 9 s.3(e)(i))`, 'lower the incentives');
  const compensation = compensationFor(t!, p, ctx.priorClubTenders, mr);
  const lateCut = dayBeforeDraft(dates, need(mr.compNextDraftWithinDays, 'fa.comp_next_draft_within_days'));
  const compensationSeason = compensation.round === null ? null : compareInstant(now, lateCut) > 0 ? dates.season + 1 : dates.season;
  if (compensation.round !== null && !ctx.newClubHoldsPick(compensation.round, compensationSeason!)) {
    return refuse('C8.1.1', 'precondition', `the club holds no pick in round ${compensation.round} or better of the ${compensationSeason} draft to give as compensation (CBA Art. 9 s.3(c))`, 'acquire the pick first');
  }
  const byDays = addDays(now, need(mr.offerSheetMatchDays, 'fa.offer_sheet_match_days'));
  const cutoff = dayBeforeDraft(dates, need(mr.matchCutoffDaysBeforeDraft, 'fa.match_cutoff_days_before_draft'));
  const matchDeadline = compareInstant(byDays, cutoff) <= 0 ? byDays : cutoff;
  return {
    ok: true,
    sheet: { personId: p.personId, priorClubId: p.priorClubId, newClubId, terms, receivedAt: now, matchDeadline, compensation, compensationSeason, withdrawn: false },
  };
}

/** The outcome of an offer sheet: who signs him, and what moves between clubs. */
export interface OfferSheetOutcome {
  readonly ok: true;
  readonly signsWithClubId: number;
  readonly matched: boolean;
  /** Pick owed by the new club to the prior club when it did not match. */
  readonly compensation: { readonly round: number; readonly season: number; readonly fromClubId: number; readonly toClubId: number } | null;
  /** Matched: the prior club may not trade him to the offering club before this instant without his consent (CBA Art. 9 s.3(h)). */
  readonly tradeBackBlock: { readonly offeringClubId: number; readonly until: Instant } | null;
  /** Not matched: the new contract's salary may not be cut, nor a reducing option used, until after its first regular season (CBA Art. 9 s.3(c)). */
  readonly noSalaryCutThroughFirstSeason: boolean;
}

/** The prior club gives its First Refusal Exercise Notice (CBA Art. 9 s.3(b)). */
export function matchOfferSheet(sheet: OfferSheet, now: Instant, mr: MarketRules): OfferSheetOutcome | Refusal {
  if (sheet.withdrawn) return refuse('C8.1.1', 'precondition', 'the offer sheet was withdrawn', 'none');
  if (compareInstant(now, sheet.matchDeadline) > 0) return refuse('C8.1.1', 'deadline', 'the match period has passed', 'none: he signs with the new club');
  const years = need(mr.matchedTradeBackBlockYears, 'fa.matched_trade_back_block_years');
  // A calendar year of days: the same calendar date `years` later.
  const until = { day: addYears(now.day, years), minute: now.minute };
  return { ok: true, signsWithClubId: sheet.priorClubId, matched: true, compensation: null, tradeBackBlock: { offeringClubId: sheet.newClubId, until }, noSalaryCutThroughFirstSeason: false };
}

/** The match period ends without a notice (or the prior club declines): he signs with the new club and the pick moves (CBA Art. 9 s.3(c)). */
export function settleOfferSheet(sheet: OfferSheet, now: Instant, declined: boolean): OfferSheetOutcome | Refusal {
  if (sheet.withdrawn) return refuse('C8.1.1', 'precondition', 'the offer sheet was withdrawn', 'none');
  if (!declined && !atOrAfter(now, sheet.matchDeadline)) return refuse('C8.1.1', 'deadline', 'the prior club still has time to match', 'wait for the match deadline');
  const c = sheet.compensation;
  return {
    ok: true, signsWithClubId: sheet.newClubId, matched: false,
    compensation: c.round === null ? null : { round: c.round, season: sheet.compensationSeason!, fromClubId: sheet.newClubId, toClubId: sheet.priorClubId },
    tradeBackBlock: null, noSalaryCutThroughFirstSeason: true,
  };
}

/** The two clubs withdraw a sheet with the player's written consent (CBA Art. 9 s.3(d)); the prior club keeps its rights. */
export function withdrawOfferSheet(sheet: OfferSheet, playerConsents: boolean): OfferSheet | Refusal {
  if (!playerConsents) return refuse('C8.1.1', 'consent', 'an offer sheet is withdrawn only with the player\'s written consent', 'ask the player');
  return { ...sheet, withdrawn: true };
}

export const isRfaTender = (t: Tender | null): t is Tender & { level: RfaLevel } => !!t && (RFA_LEVELS as readonly string[]).includes(t.level);


// Calendar date `years` later (Feb 29 maps to Feb 28).
function addYears(day: number, years: number): number {
  const c = civil(day);
  const y = c.y + years;
  return dayNumber({ y, m: c.m, d: Math.min(c.d, daysInMonth(y, c.m)) });
}
