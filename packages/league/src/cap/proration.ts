// Signing bonus proration (C6.2.2; CBA Art. 13 s.6(b)(i)). Straight line over the counted contract years
// from the tranche's first year, at most `cap.proration_max_years`. A year the player alone can void is
// not counted. Cents that do not divide evenly go one each to the earliest years (assumption: the CBA
// works in whole dollars and gives no rounding rule; this keeps every schedule summing to its amount).
import type { RuleSet } from '@gm/schema';
import type { BonusTranche, CapContract } from './contract.ts';

export type ProrationSchedule = ReadonlyMap<number, number>;

/** League years one tranche is spread over. */
export function prorationYears(c: CapContract, t: BonusTranche, rules: RuleSet): number[] {
  const max = rules.num('cap.proration_max_years');
  const counted = c.years.filter((y) => y.leagueYear >= t.firstLeagueYear && !y.playerVoidable).map((y) => y.leagueYear);
  // No counted year (every later year is the player's to void): the whole amount falls in the first year.
  return counted.length === 0 ? [t.firstLeagueYear] : counted.slice(0, max);
}

export function prorateTranche(c: CapContract, t: BonusTranche, rules: RuleSet): ProrationSchedule {
  const years = prorationYears(c, t, rules);
  const share = Math.floor(t.amountCents / years.length);
  let left = t.amountCents - share * years.length;
  const out = new Map<number, number>();
  for (const y of years) {
    const extra = left > 0 ? 1 : 0;
    left -= extra;
    out.set(y, share + extra);
  }
  return out;
}

/** Proration of every tranche, summed by league year. */
export function prorationSchedule(c: CapContract, rules: RuleSet): ProrationSchedule {
  const out = new Map<number, number>();
  for (const t of c.tranches) for (const [y, v] of prorateTranche(c, t, rules)) out.set(y, (out.get(y) ?? 0) + v);
  return out;
}

export function prorationFor(c: CapContract, leagueYear: number, rules: RuleSet): number {
  return prorationSchedule(c, rules).get(leagueYear) ?? 0;
}

/** Proration still to be charged from `fromYear` on (the amount that accelerates on a release). */
export function remainingProration(c: CapContract, fromYear: number, rules: RuleSet): number {
  let s = 0;
  for (const [y, v] of prorationSchedule(c, rules)) if (y >= fromYear) s += v;
  return s;
}
