// The dated points of one free agency year (C4.2.4, C8.1.1, C8.2.1, C8.4.1), read from the calendar
// engine (G-12) so every window opens and closes on its calendar anchor and rule key, never on a
// constant. Instants are calendar instants: absolute day plus minutes after midnight Eastern.
import type { CalendarResolver } from '../calendar/resolve.ts';
import { addMinutes, compareInstant, DAYS_PER_WEEK, MINUTES_PER_DAY, onOrAfter, WEEKDAY, type Instant } from '../calendar/date.ts';
import { need, type MarketRules } from './keys.ts';

export interface MarketDates {
  readonly season: number;
  /** Two-day negotiating period opens (C8.2.1 rule 1; CBA Art. 9 s.1(b)(iv)). */
  readonly negotiatingOpen: Instant;
  readonly negotiatingClose: Instant;
  /** League year opens: contracts may be executed, trades reopen, the restricted signing period starts. */
  readonly leagueYearStart: Instant;
  /** Last day a restricted player may sign an offer sheet (C8.1.1 edge case; CBA Art. 9 s.2(e)). */
  readonly offerSheetDeadline: Instant;
  readonly draftStart: Instant;
  readonly draftEnd: Instant;
  /** UFA tender must be made by the Monday after the draft (CBA Art. 9 s.1(b)(i), s.1(c)). End of that day. */
  readonly ufaTenderBy: Instant;
  /** An unsigned tendered UFA may then sign only with his prior club: July 22 or the first camp day, the later (CBA Art. 9 s.1(b)(i)). */
  readonly ufaRightsRevert: Instant;
  /** A right-of-first-refusal-only restricted player must get the June 1 tender to stay under the June 15 rule (CBA Art. 9 s.2(f)(i)). */
  readonly rfaJune1: Instant;
  readonly rfaJune15: Instant;
  readonly tradeDeadline: Instant;
  /** Tuesday after the unsigned-rights week, 4 p.m.: an unsigned tendered player sits out the season (CBA Art. 9 s.1(b)(ii), s.2(f)(ii)). */
  readonly unsignedRightsEnd: Instant;
}

const at = (r: CalendarResolver, season: number, id: string): Instant => {
  const a = r.anchor(season, id);
  return { day: a.day, minute: a.minute ?? 0 };
};

/**
 * Builds the year's market dates from calendar anchors. Two readings are this module's: the UFA tender is
 * due by the end of the Monday after the draft (the CBA gives the day, not the hour), and "the first
 * scheduled day of the first NFL training camp" is the league's veteran report date (the calendar's
 * per-club report dates come later from club schedules).
 */
export function marketDates(r: CalendarResolver, season: number, rules: MarketRules): MarketDates {
  const draftEnd = at(r, season, 'draft_end');
  const mondayAfter = onOrAfter(draftEnd.day + 1, WEEKDAY.mon);
  const july22 = at(r, season, 'ufa_tender_deadline');
  const camp = at(r, season, 'veterans_report');
  const tradeDeadline = at(r, season, 'trade_deadline');
  const extraWeeks = need(rules.unsignedRightsEndAfterWeek, 'fa.unsigned_rights_end_after_week') - need(rules.tradeDeadlineAfterWeek, 'trade.deadline_after_week');
  return {
    season,
    negotiatingOpen: at(r, season, 'negotiating_open'),
    negotiatingClose: at(r, season, 'negotiating_close'),
    leagueYearStart: at(r, season, 'league_year_start'),
    offerSheetDeadline: at(r, season, 'rfa_offer_sheet_deadline'),
    draftStart: at(r, season, 'draft_start'),
    draftEnd,
    ufaTenderBy: { day: mondayAfter, minute: MINUTES_PER_DAY - 1 },
    ufaRightsRevert: compareInstant(july22, camp) >= 0 ? july22 : camp,
    rfaJune1: at(r, season, 'rfa_tender_june1'),
    rfaJune15: at(r, season, 'rfa_tender_june15'),
    tradeDeadline,
    unsignedRightsEnd: addMinutes(tradeDeadline, extraWeeks * DAYS_PER_WEEK * MINUTES_PER_DAY),
  };
}

export const before = (a: Instant, b: Instant): boolean => compareInstant(a, b) < 0;
export const atOrAfter = (a: Instant, b: Instant): boolean => compareInstant(a, b) >= 0;
export const addDays = (i: Instant, days: number): Instant => addMinutes(i, days * MINUTES_PER_DAY);
export const startOfDay = (i: Instant): Instant => ({ day: i.day, minute: 0 });
