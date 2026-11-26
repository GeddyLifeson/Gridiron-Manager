// Minimum salaries and the veteran salary benefit (C6.4.1; CBA Art. 26 s.1(a), Art. 27).
// Rule keys: cap.min_salary_y<year>_cs<band>, bands read from the key names themselves (0, 1, 2, 3, 4_6,
// 7_plus), so a rule set with other bands needs no code change.
import type { ParamTable, RuleSet } from '@gm/schema';
import { CENTS_PER_USD, hasKey, paramTable, usdKey } from './params.ts';

const MIN_KEY = /^cap\.min_salary_y(\d+)_cs(\d+)(?:_(\d+|plus))?$/;

interface Band { readonly year: number; readonly from: number; readonly to: number; readonly key: string }

function bands(rules: RuleSet): Band[] {
  const out: Band[] = [];
  for (const key of rules.keys()) {
    const m = MIN_KEY.exec(key);
    if (!m) continue;
    const from = Number(m[1 + 1]);
    const hi = m[1 + 1 + 1];
    out.push({ year: Number(m[1]), from, to: hi === undefined ? from : hi === 'plus' ? Number.POSITIVE_INFINITY : Number(hi), key });
  }
  return out;
}

/**
 * Active/inactive list minimum for a player with `creditedSeasons` in `leagueYear`, in cents.
 * Years after the last rule-set year continue the C6.4.1 yearly step (assumption, the agreement ends 2030).
 */
export function minimumSalary(rules: RuleSet, leagueYear: number, creditedSeasons: number, params: ParamTable = paramTable()): number {
  if (!Number.isSafeInteger(creditedSeasons) || creditedSeasons < 0) throw new Error(`league.cap: credited seasons must be a whole number from 0, not ${creditedSeasons}`);
  const all = bands(rules);
  if (all.length === 0) throw new Error('league.cap: rule set has no minimum salary table');
  const years = [...new Set(all.map((b) => b.year))].sort((a, b) => a - b);
  const last = years[years.length - 1]!;
  // Years before the first table (the history run plays modern rules back to 1869) use the first table, unstepped
  // (assumption, as for years after the agreement; break test #6).
  const first = years[0]!;
  const year = leagueYear > last ? last : leagueYear < first ? first : leagueYear;
  const band = all.find((b) => b.year === year && creditedSeasons >= b.from && creditedSeasons <= b.to);
  if (!band) throw new Error(`league.cap: no minimum salary for ${leagueYear} with ${creditedSeasons} credited seasons`);
  const step = leagueYear > last ? (leagueYear - last) * Math.round(params.num('league.cap.minSalaryStepUsd') * CENTS_PER_USD) : 0;
  return usdKey(rules, band.key) + step;
}

export interface QualifyingContractCharge {
  readonly eligible: boolean;
  /** Paragraph 5 salary the player is paid: his own minimum. */
  readonly salaryCents: number;
  /** Cap count of that salary: the two-season minimum (CBA Art. 27 s.5). */
  readonly salaryCapCountCents: number;
  /** Additional compensation, capped at cap.veteran_benefit_<year>; counted as paid. */
  readonly additionalCents: number;
  readonly capChargeCents: number;
  /** Difference counted as a player benefit, not team salary (CBA Art. 27 s.6). */
  readonly benefitCents: number;
}

/**
 * Veteran salary benefit (C6.4.1 rule 3). The CBA text sets the cap count of the salary at the two-season
 * minimum; it does not say how additional compensation counts. This module counts it in full, as any
 * bonus would (interpretation, flagged in the PR).
 */
export function qualifyingContract(rules: RuleSet, leagueYear: number, creditedSeasons: number, additionalCents: number): QualifyingContractCharge {
  const key = `cap.veteran_benefit_${leagueYear}`;
  const capOnAdditional = hasKey(rules, key) ? usdKey(rules, key) : 0;
  const eligible = creditedSeasons >= rules.num('cap.veteran_benefit_min_seasons') && additionalCents <= capOnAdditional;
  const salaryCents = minimumSalary(rules, leagueYear, creditedSeasons);
  const salaryCapCountCents = eligible ? minimumSalary(rules, leagueYear, rules.num('cap.veteran_benefit_count_seasons')) : salaryCents;
  return {
    eligible, salaryCents, salaryCapCountCents, additionalCents,
    capChargeCents: salaryCapCountCents + additionalCents,
    benefitCents: salaryCents - salaryCapCountCents,
  };
}
