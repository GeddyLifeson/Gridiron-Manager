// Restructure, extension and pay cut (C6.3.1; CBA Art. 13 s.6(b)(i)(4), s.6(b)(iii)(3)).
// Each returns a new cap contract; the caller logs the event (X2). Player acceptance (C8.3.1, D12) is
// not decided here: these functions only do the arithmetic and the legality checks.
import type { RuleSet } from '@gm/schema';
import { FULLY_GUARANTEED, totalValueCents, type CapContract, type CapYear } from './contract.ts';
import { minimumSalary } from './minimums.ts';

export type ChangeResult = { readonly ok: true; readonly contract: CapContract } | { readonly ok: false; readonly reason: string };

/** Money is whole non-negative cents (contract.ts); anything else is refused, never carried into the books. */
const cents = (n: number): boolean => Number.isSafeInteger(n) && n >= 0;
/** Credited seasons are a whole count from 0. */
const count = (n: number): boolean => Number.isSafeInteger(n) && n >= 0;

/**
 * Restructure (C6.3.1 rule 1): convert part of this year's base salary into a bonus paid now and prorated
 * over the remaining years, up to the proration limit. Base may not fall below the player's minimum.
 * Total money is unchanged.
 */
export function restructure(c: CapContract, leagueYear: number, convertCents: number, creditedSeasons: number, rules: RuleSet): ChangeResult {
  const y = c.years.find((x) => x.leagueYear === leagueYear);
  if (!y) return { ok: false, reason: `no contract year ${leagueYear}` };
  if (!cents(convertCents) || convertCents === 0) return { ok: false, reason: 'the converted amount must be whole positive cents' };
  if (!count(creditedSeasons)) return { ok: false, reason: 'credited seasons must be a whole number from 0' };
  const floor = minimumSalary(rules, leagueYear, creditedSeasons);
  if (y.base.amountCents - convertCents < floor) return { ok: false, reason: 'league rule: base salary would fall below the minimum' };
  const years = c.years.map((x) => (x === y ? { ...x, base: { ...x.base, amountCents: x.base.amountCents - convertCents } } : x));
  return {
    ok: true,
    contract: {
      ...c, years,
      // A converted amount is paid now; once paid it cannot be taken back, so it is treated as guaranteed.
      tranches: [...c.tranches, { amountCents: convertCents, firstLeagueYear: leagueYear, paidLeagueYear: leagueYear, source: 'restructure', guarantee: FULLY_GUARANTEED }],
    },
  };
}

/**
 * Extension (C6.3.1 rule 2): add years, with an optional bonus prorated over the remaining years of the
 * unexpired contract together with the new ones (CBA Art. 13 s.6(b)(i)(4)), up to the proration limit.
 */
export function extend(c: CapContract, signedLeagueYear: number, newYears: readonly CapYear[], bonusCents: number): ChangeResult {
  const last = c.years[c.years.length - 1]!.leagueYear;
  if (newYears.length === 0) return { ok: false, reason: 'an extension adds at least one year' };
  if (signedLeagueYear > last) return { ok: false, reason: 'the contract has ended: an extension is signed before its last year is over' };
  if (!cents(bonusCents) || newYears.some((y) => !cents(y.base.amountCents))) return { ok: false, reason: 'money must be whole non-negative cents' };
  if (newYears.some((y, i) => y.leagueYear !== last + 1 + i)) return { ok: false, reason: 'extension years must follow the last contract year in order' };
  const tranches = bonusCents > 0
    ? [...c.tranches, { amountCents: bonusCents, firstLeagueYear: signedLeagueYear, paidLeagueYear: signedLeagueYear, source: 'extension' as const, guarantee: FULLY_GUARANTEED }]
    : c.tranches;
  const out = { ...c, years: [...c.years, ...newYears], tranches };
  // Each amount may be whole cents and the total still too large to count exactly: refuse it, never round money.
  if (!Number.isSafeInteger(totalValueCents(out))) return { ok: false, reason: 'the contract total is too large to keep exactly' };
  return { ok: true, contract: out };
}

/** Pay cut (C6.3.1 rule 3): lower base salary in the named years. No year may go below the minimum. */
export function payCut(c: CapContract, leagueYear: number, newBaseByYear: ReadonlyMap<number, number>, creditedSeasons: number, rules: RuleSet): ChangeResult {
  if (!count(creditedSeasons)) return { ok: false, reason: 'credited seasons must be a whole number from 0' };
  for (const [year, base] of newBaseByYear) {
    const y = c.years.find((x) => x.leagueYear === year);
    if (!y) return { ok: false, reason: `no contract year ${year}` };
    if (!cents(base)) return { ok: false, reason: 'money must be whole non-negative cents' };
    if (base > y.base.amountCents) return { ok: false, reason: 'a pay cut cannot raise pay' };
    if (year < leagueYear) return { ok: false, reason: 'a past year cannot change' };
    // Assumes one credited season a year from now on, so later years test against a higher band.
    if (base < minimumSalary(rules, year, creditedSeasons + (year - leagueYear))) return { ok: false, reason: 'league rule: base salary would fall below the minimum' };
  }
  const years = c.years.map((y) => {
    const nb = newBaseByYear.get(y.leagueYear);
    return nb === undefined ? y : { ...y, base: { ...y.base, amountCents: nb } };
  });
  return { ok: true, contract: { ...c, years } };
}
