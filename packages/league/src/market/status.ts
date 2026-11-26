// C8.1.1 status at contract expiry: free agent classes, tenders, compensation and who may sign a player
// on a given date. Read from CBA 2020 Articles 8 and 9 directly. Status is a pure function of accrued
// seasons, expiry, tenders and the date (C8.1.1 acceptance).
import type { RuleSet } from '@gm/schema';
import levels from './data/tender-levels.json' with { type: 'json' };
import { minimumSalary } from '../cap/minimums.ts';
import { compareInstant } from '../calendar/date.ts';
import { need, type MarketRules } from './keys.ts';
import { atOrAfter, before, type MarketDates } from './dates.ts';
import { PERCENT } from './params.ts';
import { refuse, type ExpiringPlayer, type FaClass, type Instant, type Refusal, type RfaLevel, type Tender, type TenderLevel } from './types.ts';

export const RFA_LEVELS: readonly RfaLevel[] = ['rofr', 'original_round', 'second_round', 'first_round', 'first_round_waived'];
const isRfaLevel = (l: TenderLevel): l is RfaLevel => (RFA_LEVELS as readonly string[]).includes(l);

/** C8.1.1 rules 1 to 3. A league without the fa.* class keys has no restrictions: every expiring player is free. */
export function freeAgentClass(accruedSeasons: number, mr: MarketRules): FaClass {
  const c = mr.classes;
  if (!c) return 'free';
  if (accruedSeasons >= c.ufaMinAccrued) return 'unrestricted';
  if (accruedSeasons >= c.rfaAccrued) return 'restricted';
  if (accruedSeasons < c.erfaBelowAccrued) return 'exclusive_rights';
  return 'free';
}

/** Camp-fine class carried by a player who signs as an unrestricted free agent (C8.1.1 edge case; L3.1.2). */
export function signingFlags(cls: FaClass): readonly string[] {
  return cls === 'unrestricted' ? ['ufa_signee'] : [];
}

const pctOf = (cents: number, pct: number): number => Math.round((cents * pct) / PERCENT);

/**
 * Paragraph 5 salary of a tender in the league year (C8.1.1 rule 2; CBA Art. 8 s.2, Art. 9 s.1(b)(i), s.2(b)(i), s.2(f)(i)).
 * The upper restricted levels pay the table amount or 110 percent of prior P5, whichever is greater; the
 * right-of-first-refusal level pays the table amount only.
 */
export function tenderSalary(level: TenderLevel, p: ExpiringPlayer, mr: MarketRules, capRules: RuleSet): number {
  const year = mr.leagueYear;
  const floor = (): number => pctOf(p.priorParagraph5Cents, need(mr.rfaPriorSalaryPct, 'fa.rfa_prior_salary_pct'));
  const table = (lv: RfaLevel): number => {
    if (!mr.tenders) throw new Error(`league.market: no restricted tender table for ${year}`);
    return mr.tenders[lv];
  };
  switch (level) {
    case 'erfa': return minimumSalary(capRules, year, p.creditedSeasons);
    case 'june1': return Math.max(floor(), table('rofr'));
    case 'june15': return floor();
    case 'ufa': return pctOf(p.expiringIsRookieContract ? p.priorParagraph5Cents : p.priorYearSalaryCents, need(mr.ufaTenderPriorSalaryPct, 'fa.ufa_tender_prior_salary_pct'));
    default: {
      const row = levels.levels[level];
      return row.priorSalaryFloor ? Math.max(table(level), floor()) : table(level);
    }
  }
}

/**
 * CBA Art. 9 s.2(g): a player tendered at one of the upper three levels may take 110 percent of prior P5
 * with prior terms instead, even when it is less. Returns what he signs for when he accepts the tender.
 */
export function acceptedTenderSalary(t: Tender, p: ExpiringPlayer, mr: MarketRules, takesPriorTerms: boolean): number {
  const upper = isRfaLevel(t.level) && levels.levels[t.level].priorSalaryFloor;
  return upper && takesPriorTerms ? pctOf(p.priorParagraph5Cents, need(mr.rfaPriorSalaryPct, 'fa.rfa_prior_salary_pct')) : t.salaryCents;
}

export type TenderCheck = { readonly ok: true; readonly tender: Tender } | Refusal;

const live = (t: Tender | null | undefined, now: Instant): t is Tender => !!t && (t.withdrawnAt === null || before(now, t.withdrawnAt));

/**
 * Files a tender (C8.1.1, C8.2.1 rule 5). `current` is the player's live tender, if any (needed for the
 * June 1 and June 15 tenders, which replace the qualifying offer); `signed` is whether he has signed anywhere.
 */
export function makeTender(
  level: TenderLevel, p: ExpiringPlayer, clubId: number, now: Instant, dates: MarketDates, mr: MarketRules, capRules: RuleSet,
  current: Tender | null, signed: boolean,
): TenderCheck {
  if (clubId !== p.priorClubId) return refuse('C8.1.1', 'eligibility', 'only the prior club tenders its own expiring player', 'make an offer instead');
  if (signed) return refuse('C8.1.1', 'precondition', `player ${p.personId} has signed`, 'none');
  const cls = freeAgentClass(p.accruedSeasons, mr);
  const make = (): TenderCheck => ({ ok: true, tender: { personId: p.personId, clubId, level, salaryCents: tenderSalary(level, p, mr, capRules), madeAt: now, withdrawnAt: null } });
  if (level === 'erfa') {
    if (cls !== 'exclusive_rights') return refuse('C8.1.1', 'eligibility', `player ${p.personId} is not an exclusive rights player`, 'use the tender of his class');
    if (!before(now, dates.leagueYearStart)) return refuse('C8.1.1', 'deadline', 'the exclusive rights tender is due before the league year starts (CBA Art. 8 s.2)', 'none: he is free');
    return make();
  }
  if (isRfaLevel(level)) {
    if (cls !== 'restricted') return refuse('C8.1.1', 'eligibility', `player ${p.personId} is not a restricted free agent`, 'use the tender of his class');
    if (compareInstant(now, dates.leagueYearStart) > 0) return refuse('C8.1.1', 'deadline', 'qualifying offers are due on or before the first day of the signing period (CBA Art. 9 s.2(b)(i))', 'none: he is unrestricted in all but name');
    return make();
  }
  if (level === 'june1') {
    if (!live(current, now) || current.level !== 'rofr') return refuse('C8.1.1', 'precondition', 'the June 1 tender follows a right-of-first-refusal-only qualifying offer (CBA Art. 9 s.2(f)(i))', 'none');
    if (!atOrAfter(now, dates.offerSheetDeadline) || compareInstant(now, dates.rfaJune1) > 0) return refuse('C8.1.1', 'deadline', 'the June 1 tender is made after the signing period and by June 1', 'none');
    return make();
  }
  if (level === 'june15') {
    if (!live(current, now) || (!isRfaLevel(current.level) && current.level !== 'june1')) return refuse('C8.1.1', 'precondition', 'the June 15 tender replaces a live qualifying offer (CBA Art. 9 s.2(f)(i))', 'none');
    if (current.level === 'rofr') return refuse('C8.1.1', 'precondition', 'a right-of-first-refusal-only player needs the June 1 tender first', 'make the June 1 tender by June 1');
    if (now.day !== dates.rfaJune15.day) return refuse('C8.1.1', 'deadline', 'the qualifying offer may be withdrawn and replaced on June 15 only', 'wait for June 15');
    const floor = tenderSalary('june15', p, mr, capRules);
    if (current.salaryCents <= floor) return refuse('C8.1.1', 'precondition', 'the qualifying offer is not above 110 percent of prior salary, so there is nothing to lower', 'none');
    return make();
  }
  // UFA tender.
  if (cls !== 'unrestricted') return refuse('C8.2.1', 'eligibility', `player ${p.personId} is not an unrestricted free agent`, 'use the tender of his class');
  if (before(now, dates.leagueYearStart) || compareInstant(now, dates.ufaTenderBy) > 0) return refuse('C8.2.1', 'deadline', 'the UFA tender is made after the league year opens and by the Monday after the draft (CBA Art. 9 s.1(b)(i))', 'none: he stays free');
  return make();
}

/** Withdraws a tender: the player becomes completely free (CBA Art. 8 s.2, Art. 9 s.1(c), s.2(d), s.2(h)). */
export function withdrawTender(t: Tender, now: Instant): Tender {
  return { ...t, withdrawnAt: now };
}

export interface Compensation {
  /** Draft round owed by the signing club, or null for right of first refusal only (or an undrafted player on an original-round tender). */
  readonly round: number | null;
  readonly waivesTagLimits: boolean;
  readonly matchRight: boolean;
  readonly reason: string;
}

/**
 * Compensation a restricted tender carries (C8.1.1 rule 2), with the upgraded-tender rules of CBA Art. 9
 * s.2(c): when a club tenders a lower-round pick at a higher level, its own picks from that higher round
 * on lower tenders yield one round less. `clubTenders` are all the club's live restricted tenders this year
 * with each player's draft round and tender salary.
 */
export function compensationFor(
  t: Tender, p: ExpiringPlayer, clubTenders: readonly { readonly tender: Tender; readonly draftRound: number | null }[], mr: MarketRules,
): Compensation {
  const lv: RfaLevel = isRfaLevel(t.level) ? t.level : 'rofr';
  if (!isRfaLevel(t.level) && t.level !== 'june1' && t.level !== 'june15') return { round: null, waivesTagLimits: false, matchRight: false, reason: 'this tender gives exclusive or prior-club rights, not compensation' };
  const row = levels.levels[lv];
  const base: number | null = row.compensationRound === 'draft_round' ? p.draftRound : (row.compensationRound as number | null);
  if (base === null) return { round: null, waivesTagLimits: row.waivesTagLimits, matchRight: row.matchRight, reason: p.draftRound === null && lv === 'original_round' ? 'undrafted: an original-round tender yields no pick' : 'right of first refusal only' };
  for (const up of levels.upgrades) {
    if (base !== up.protectedDraftRound || p.draftRound !== up.protectedDraftRound) continue;
    const upgradedAmount = mr.tenders ? mr.tenders[up.upgradedLevel as RfaLevel] : null;
    if (upgradedAmount === null || t.salaryCents >= upgradedAmount) continue;
    const triggered = clubTenders.some((o) => o.tender.personId !== t.personId && o.tender.level === up.upgradedLevel && o.draftRound !== null && o.draftRound > up.drawnBelowRound);
    if (triggered) return { round: up.fallbackRound, waivesTagLimits: row.waivesTagLimits, matchRight: true, reason: `${up.source}: the club tendered a lower-round pick at the ${up.upgradedLevel} level` };
  }
  return { round: base, waivesTagLimits: row.waivesTagLimits, matchRight: row.matchRight, reason: `${lv} tender` };
}

export type Rights =
  | 'under_contract'
  /** Any club may negotiate and sign him. */
  | 'any_club'
  /** Any club may sign him to an offer sheet; the prior club may match (restricted, signing period). */
  | 'offer_sheet'
  | 'prior_club_only'
  /** Sits out the rest of the league year; free when the next one opens (CBA Art. 9 s.1(b)(ii)-(iii), s.2(f)(ii)-(iii)). */
  | 'no_club';

export interface RightsView { readonly rights: Rights; readonly cls: FaClass; readonly reason: string }

/**
 * Who may sign an unsigned expiring player at `now` in the market year of `dates` (C8.1.1, C8.2.1 rule 5).
 * `tender` is the prior club's latest tender to him, live or withdrawn.
 */
export function rightsAt(p: ExpiringPlayer, tender: Tender | null, now: Instant, dates: MarketDates, mr: MarketRules): RightsView {
  const cls = freeAgentClass(p.accruedSeasons, mr);
  if (before(now, dates.leagueYearStart)) return { rights: 'under_contract', cls, reason: 'his contract runs until the league year opens' };
  const t = live(tender, now) ? tender : null;
  const lateEnd = atOrAfter(now, dates.unsignedRightsEnd);
  switch (cls) {
    case 'free': return { rights: 'any_club', cls, reason: 'this league has no veteran free agency classes' };
    case 'exclusive_rights':
      return t && t.level === 'erfa'
        ? { rights: lateEnd ? 'no_club' : 'prior_club_only', cls, reason: 'tendered exclusive rights player (CBA Art. 8 s.2)' }
        : { rights: 'any_club', cls, reason: 'not tendered: completely free (CBA Art. 8 s.2)' };
    case 'restricted': {
      if (!t) return { rights: 'any_club', cls, reason: 'no qualifying offer, or it was withdrawn (CBA Art. 9 s.2(d), s.2(h))' };
      if (lateEnd) return { rights: 'no_club', cls, reason: 'unsigned by the Tuesday after the unsigned-rights week (CBA Art. 9 s.2(f)(ii))' };
      if (compareInstant(now, dates.offerSheetDeadline) <= 0 && isRfaLevel(t.level)) return { rights: 'offer_sheet', cls, reason: `${t.level} qualifying offer; signing period open` };
      return { rights: 'prior_club_only', cls, reason: 'signing period over with the qualifying offer standing (CBA Art. 9 s.2(f)(i))' };
    }
    case 'unrestricted': {
      if (!t || t.level !== 'ufa') return { rights: 'any_club', cls, reason: 'unrestricted (CBA Art. 9 s.1(a))' };
      if (before(now, dates.ufaRightsRevert)) return { rights: 'any_club', cls, reason: 'UFA tender made; free until July 22 or the first camp day' };
      if (lateEnd) return { rights: 'no_club', cls, reason: 'unsigned by the Tuesday after the unsigned-rights week (CBA Art. 9 s.1(b)(ii))' };
      return { rights: 'prior_club_only', cls, reason: 'UFA tender: rights reverted to the prior club (CBA Art. 9 s.1(b)(i))' };
    }
  }
}

/** May `clubId` sign this player outright at `now` (not an offer sheet)? */
export function maySign(p: ExpiringPlayer, tender: Tender | null, clubId: number, now: Instant, dates: MarketDates, mr: MarketRules): boolean {
  const r = rightsAt(p, tender, now, dates, mr).rights;
  return r === 'any_club' || ((r === 'prior_club_only' || r === 'offer_sheet') && clubId === p.priorClubId);
}
