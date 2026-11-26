// Rule keys of the market module (G-35, bible C8). Every free agency and trade rule value is read by key;
// a feature switches on when its keys are present, never on the level (P1.3.3). Keys G-10 has not entered
// yet are in data/market-keys.json with their CBA locator; the league-rules file wins when it has them.
import type { RuleKeyManifest, RuleSet } from '@gm/schema';
import fallback from './data/market-keys.json' with { type: 'json' };
import { CENTS_PER_USD } from '../cap/params.ts';

const READ_BY = ['league.market'];
const k = (key: string, unit: string, meaning: string, ownerLeaf: string) =>
  ({ key, type: 'number' as const, unit, meaning, ownerLeaf, readBy: READ_BY });

/** Keys read with a league-year suffix (`fa.rfa_tender_2026_rofr`) are listed once with `<year>` in the meaning. */
export const RULE_KEYS: RuleKeyManifest = [
  k('fa.ufa_min_accrued', 'seasons', 'Accrued seasons at which an expiring player is unrestricted (CBA Art. 9 s.1(a)).', 'C8.1.1'),
  k('fa.rfa_accrued', 'seasons', 'Accrued seasons at which an expiring player is restricted (CBA Art. 9 s.2(a)).', 'C8.1.1'),
  k('fa.erfa_below_accrued', 'seasons', 'Below this many accrued seasons an expiring player is an exclusive rights player if tendered (CBA Art. 8 s.2).', 'C8.1.1'),
  k('fa.rfa_tender_2026_rofr', 'USD', 'Restricted tender, right of first refusal only; read as fa.rfa_tender_<year>_rofr (CBA Art. 9 s.2(b)(i)(1)).', 'C8.1.1'),
  k('fa.rfa_tender_2026_original_round', 'USD', 'Restricted tender, original round; read as fa.rfa_tender_<year>_original_round.', 'C8.1.1'),
  k('fa.rfa_tender_2026_second_round', 'USD', 'Restricted tender, second round; read as fa.rfa_tender_<year>_second_round.', 'C8.1.1'),
  k('fa.rfa_tender_2026_first_round', 'USD', 'Restricted tender, first round; read as fa.rfa_tender_<year>_first_round.', 'C8.1.1'),
  k('fa.rfa_tender_2026_first_round_waived', 'USD', 'Restricted tender, first round with franchise and transition limits waived; read as fa.rfa_tender_<year>_first_round_waived (CBA Art. 9 s.2(k)).', 'C8.1.1'),
  k('fa.rfa_prior_salary_pct', 'percent', 'Upper three restricted tenders pay at least this percent of prior Paragraph 5 salary (CBA Art. 9 s.2(b)(i)(2)-(4)).', 'C8.1.1'),
  k('fa.ufa_tender_prior_salary_pct', 'percent', 'UFA tender: at least this percent of prior-year salary (CBA Art. 9 s.1(b)(i)).', 'C8.2.1'),
  k('fa.offer_sheet_match_days', 'days', 'Days the prior club has to match an offer sheet (CBA Art. 9 s.3(a)).', 'C8.1.1'),
  k('fa.match_cutoff_days_before_draft', 'days', 'A match must be given at least this many days before the draft (CBA Art. 9 s.3(b)).', 'C8.1.1'),
  k('fa.comp_next_draft_within_days', 'days', 'An offer sheet received later than this many days before the draft owes its pick in the next draft (CBA Art. 9 s.2(j)).', 'C8.1.1'),
  k('fa.unsigned_rights_end_after_week', 'weeks', 'An unsigned tendered player who has not signed by the Tuesday after this week sits out the season (CBA Art. 9 s.1(b)(ii), s.2(f)(ii)).', 'C8.2.1'),
  k('fa.offer_sheet_ltbe_max_pct', 'percent', 'Club-performance incentives likely to be earned may not exceed this percent of offer sheet salary (CBA Art. 9 s.3(e)(i)).', 'C8.1.1'),
  k('fa.matched_trade_back_block_years', 'years', 'A club that matches may not trade the player to the offering club for this long without his consent (CBA Art. 9 s.3(h)).', 'C8.4.1'),
  k('league_rules.free_agency.window_calls', 'count', 'Calls a club may hold in the negotiating window with prospective free agents (2026 resolution, C8.2.1 rule 1).', 'C8.2.1'),
  k('trade.deadline_after_week', 'weeks', 'Trades close on the Tuesday after this regular-season week (C5.5.2).', 'C8.4.1'),
];

export interface FallbackRow { readonly key: string; readonly value: number; readonly unit: string; readonly status: string; readonly leaf: string; readonly source: string }
export const FALLBACK_KEYS: readonly FallbackRow[] = fallback.keys;

/** A key read from the rule set, else from the module's fallback rows, else undefined. */
export type MarketLookup = (key: string) => number | undefined;

export function marketLookup(rules: RuleSet): MarketLookup {
  const present = new Set(rules.keys());
  const rows = new Map(FALLBACK_KEYS.map((r) => [r.key, r.value]));
  return (key) => (present.has(key) ? rules.num(key) : rows.get(key));
}

/** Free agency and trade values for one league year. Absent groups mean the league has no such feature. */
export interface MarketRules {
  readonly leagueYear: number;
  /** Null when the league has no veteran free agency classes (no fa.* keys): every expiring player is free. */
  readonly classes: { readonly ufaMinAccrued: number; readonly rfaAccrued: number; readonly erfaBelowAccrued: number } | null;
  /** Restricted tender amounts in cents for this league year, or null when the year has no table. */
  readonly tenders: Readonly<Record<'rofr' | 'original_round' | 'second_round' | 'first_round' | 'first_round_waived', number>> | null;
  readonly rfaPriorSalaryPct: number | null;
  readonly ufaTenderPriorSalaryPct: number | null;
  readonly offerSheetMatchDays: number | null;
  readonly matchCutoffDaysBeforeDraft: number | null;
  readonly compNextDraftWithinDays: number | null;
  readonly unsignedRightsEndAfterWeek: number | null;
  readonly offerSheetLtbeMaxPct: number | null;
  readonly matchedTradeBackBlockYears: number | null;
  readonly windowCalls: number | null;
  /** Null when the league has no trades. */
  readonly tradeDeadlineAfterWeek: number | null;
}

const TENDER_LEVELS = ['rofr', 'original_round', 'second_round', 'first_round', 'first_round_waived'] as const;

export function marketRules(rules: RuleSet, leagueYear: number): MarketRules {
  const look = marketLookup(rules);
  const n = (key: string): number | null => look(key) ?? null;
  const ufa = n('fa.ufa_min_accrued'), rfa = n('fa.rfa_accrued'), erfa = n('fa.erfa_below_accrued');
  const tenderCents = TENDER_LEVELS.map((lv) => n(`fa.rfa_tender_${leagueYear}_${lv}`));
  const tenders = tenderCents.every((v) => v !== null)
    ? Object.fromEntries(TENDER_LEVELS.map((lv, i) => [lv, Math.round(tenderCents[i]! * CENTS_PER_USD)])) as MarketRules['tenders']
    : null;
  return {
    leagueYear,
    classes: ufa !== null && rfa !== null && erfa !== null ? { ufaMinAccrued: ufa, rfaAccrued: rfa, erfaBelowAccrued: erfa } : null,
    tenders,
    rfaPriorSalaryPct: n('fa.rfa_prior_salary_pct'),
    ufaTenderPriorSalaryPct: n('fa.ufa_tender_prior_salary_pct'),
    offerSheetMatchDays: n('fa.offer_sheet_match_days'),
    matchCutoffDaysBeforeDraft: n('fa.match_cutoff_days_before_draft'),
    compNextDraftWithinDays: n('fa.comp_next_draft_within_days'),
    unsignedRightsEndAfterWeek: n('fa.unsigned_rights_end_after_week'),
    offerSheetLtbeMaxPct: n('fa.offer_sheet_ltbe_max_pct'),
    matchedTradeBackBlockYears: n('fa.matched_trade_back_block_years'),
    windowCalls: n('league_rules.free_agency.window_calls'),
    tradeDeadlineAfterWeek: n('trade.deadline_after_week'),
  };
}

/** A value the caller needs; throws with the key when the league lacks it. */
export function need(v: number | null, key: string): number {
  if (v === null) throw new Error(`league.market: rule set has no ${key}`);
  return v;
}
