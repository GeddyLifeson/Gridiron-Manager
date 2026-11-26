// Franchise and transition tags (C6.4.3; CBA Art. 10 s.1 to s.4, Appendix E).
// Tag values are computed from the game world's own salaries each year (C6.4.3 rule 9). "Salary" in
// Article 10 is Paragraph 5 salary plus roster and reporting bonuses plus signing bonus proration
// (s.2(e)); `article10Salary` gives it for one contract year.
import type { RuleSet } from '@gm/schema';
import type { CapContract } from './contract.ts';
import { yearCharge } from './charges.ts';
import { pctOf } from './params.ts';

/** Position categories for tag values (CBA Art. 10 s.7(a)). */
export const TAG_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'OL', 'DE', 'IDL', 'LB', 'CB', 'S', 'K/P'] as const;
export type TagPosition = (typeof TAG_POSITIONS)[number];

/** Article 10 salary of a contract year: everything but likely incentives and workout bonuses (s.2(e)). */
export function article10Salary(c: CapContract, leagueYear: number, rules: RuleSet): number {
  const ch = yearCharge(c, leagueYear, rules);
  return ch.baseCents + ch.rosterBonusCents + ch.prorationCents;
}

/** Average of the salaries ranked `from` to `to` (1 = largest), rounded to the cent. */
export function averageOfRanks(salariesCents: readonly number[], from: number, to: number): number {
  const sorted = [...salariesCents].sort((a, b) => b - a).slice(from - 1, to);
  if (sorted.length === 0) return 0;
  return Math.round(sorted.reduce((s, v) => s + v, 0) / sorted.length);
}

/** One prior league year for the cap percentage average: that year's tag (an average of salaries) and cap. */
export interface TagYear { readonly leagueYear: number; readonly tagCents: number; readonly capCents: number }

/**
 * Cap Percentage Average (CBA Art. 10 s.2(a)(i)(A)): the sum of the tags of the `tag.cap_average_years`
 * preceding league years, divided by the sum of their caps, times the upcoming cap.
 */
export function capPercentageAverage(history: readonly TagYear[], upcomingLeagueYear: number, upcomingCapCents: number, rules: RuleSet): number {
  const n = rules.num('tag.cap_average_years');
  const span = history.filter((h) => h.leagueYear < upcomingLeagueYear && h.leagueYear >= upcomingLeagueYear - n);
  if (span.length !== n) throw new Error(`league.cap: cap percentage average needs ${n} prior years, got ${span.length}`);
  const tags = span.reduce((s, h) => s + h.tagCents, 0);
  const caps = span.reduce((s, h) => s + h.capCents, 0);
  return Math.round((tags * upcomingCapCents) / caps);
}

export interface TenderInput {
  readonly upcomingLeagueYear: number;
  readonly upcomingCapCents: number;
  /** Franchise tags (top-five averages) for the preceding years at the player's position. */
  readonly franchiseHistory: readonly TagYear[];
  /** Transition tags (top-ten averages) for the preceding years at the player's position. */
  readonly transitionHistory: readonly TagYear[];
  /** The player's Article 10 salary in the last year of his most recent contract. */
  readonly priorYearSalaryCents: number;
}

/** Non-exclusive franchise tender (C6.4.3 rule 3): the greater of the cap percentage average and the prior-salary floor. */
export function nonExclusiveFranchiseTender(t: TenderInput, rules: RuleSet): number {
  return Math.max(
    capPercentageAverage(t.franchiseHistory, t.upcomingLeagueYear, t.upcomingCapCents, rules),
    pctOf(t.priorYearSalaryCents, rules.num('tag.prior_salary_pct')),
  );
}

/** Exclusive franchise tender (rule 4): the greater of the current top-five average and the non-exclusive amount. */
export function exclusiveFranchiseTender(t: TenderInput, currentSalariesAtPosition: readonly number[], rules: RuleSet): number {
  return Math.max(averageOfRanks(currentSalariesAtPosition, 1, rules.num('tag.franchise_top_n')), nonExclusiveFranchiseTender(t, rules));
}

/** Transition tender (rule 5): the greater of the top-ten cap percentage average and the prior-salary floor. */
export function transitionTender(t: TenderInput, rules: RuleSet): number {
  return Math.max(
    capPercentageAverage(t.transitionHistory, t.upcomingLeagueYear, t.upcomingCapCents, rules),
    pctOf(t.priorYearSalaryCents, rules.num('tag.prior_salary_pct')),
  );
}

/**
 * Third franchise designation (CBA Art. 10 s.2(b)): the greatest of the highest top-five prior-year average
 * at any position, a percent of the top-five average at his position, and a percent of his prior salary.
 * A second straight tag needs no rule of its own: the prior-salary floor of rule 3 applies to the first tag.
 */
export function thirdFranchiseTender(
  priorYearSalariesByPosition: Readonly<Record<TagPosition, readonly number[]>>, position: TagPosition, priorYearSalaryCents: number, rules: RuleSet,
): number {
  const n = rules.num('tag.franchise_top_n');
  const highest = Math.max(...TAG_POSITIONS.map((p) => averageOfRanks(priorYearSalariesByPosition[p], 1, n)));
  return Math.max(
    highest,
    pctOf(averageOfRanks(priorYearSalariesByPosition[position], 1, n), rules.num('tag.third_position_avg_pct')),
    pctOf(priorYearSalaryCents, rules.num('tag.third_prior_salary_pct')),
  );
}

export type TagKind = 'franchise_nonexclusive' | 'franchise_exclusive' | 'transition';

export interface TagRequest {
  readonly kind: TagKind;
  /** Day index of the request and of the first day of the new league year (C4 calendar). */
  readonly day: number;
  readonly leagueYearStartDay: number;
  /** Tags this club already holds for the upcoming league year. */
  readonly tagsUsed: number;
}

/** League checks on a tag (C6.4.3 rules 1 and 2): one per club per year, inside the window. Blocked, not breakable. */
export function checkTag(r: TagRequest, rules: RuleSet): { ok: true } | { ok: false; reason: string } {
  if (r.tagsUsed > 0) return { ok: false, reason: 'league rule: one franchise or transition tag per club per year' };
  const opens = r.leagueYearStartDay - rules.num('tag.window_opens_days_before');
  const closes = r.leagueYearStartDay - rules.num('tag.window_closes_days_before');
  if (r.day < opens || r.day > closes) return { ok: false, reason: 'league rule: outside the tag window' };
  return { ok: true };
}
