// Release, trade, dead money and June 1 (C6.3.2; CBA Art. 13 s.6(b)(ii), s.6(d)(iv)).
import type { RuleSet } from '@gm/schema';
import type { CapContract, ReleaseReason } from './contract.ts';
import { prorationFor, remainingProration } from './proration.ts';
import { yearCharge } from './charges.ts';

/** When in the league year the player leaves. "on_or_before_june1" includes the whole offseason from the league year start. */
export type LeaveTiming = 'on_or_before_june1' | 'after_june1';

export interface LeaveInput {
  readonly leagueYear: number;
  readonly timing: LeaveTiming;
  /** Paragraph 5 salary already paid this league year (game cheques; zero in the offseason). */
  readonly basePaidCents: number;
  /** Roster bonuses, workout bonuses and incentives already earned this league year. */
  readonly earnedThisYearCents: number;
}

export interface ReleaseInput extends LeaveInput {
  readonly reason: ReleaseReason;
  /** Treat a release on or before June 1 as made on June 2 (CBA Art. 13 s.6(b)(ii)(1)). */
  readonly june1Designation: boolean;
  /** Designations this club already made this league year. */
  readonly designationsUsed: number;
}

export interface DeadMoney {
  readonly ok: true;
  /** Dead money by league year, cents: what stays on this club's cap for the gone player. */
  readonly byYear: ReadonlyMap<number, number>;
  /** Proration that accelerated into or stays in each year. */
  readonly prorationCents: number;
  /** Guaranteed salary and bonuses still owed, charged at release (CBA Art. 13 s.6(d)(iv); nominal, no present-value discount). */
  readonly guaranteedOwedCents: number;
  /** Full charge this league year before the move. */
  readonly chargeBeforeCents: number;
  /** Charge this league year after the move (for a June 1 designation: after June 2). */
  readonly chargeAfterCents: number;
  /** Room gained this league year (negative when the move costs room). */
  readonly savingCents: number;
  /** Designated releases keep the full charge until June 2 (C6.3.2 rule 3). */
  readonly chargeUntilJune2Cents: number | null;
}
export type ReleaseResult = DeadMoney | { readonly ok: false; readonly reason: string };

function guaranteedOwed(c: CapContract, r: ReleaseInput): number {
  let owed = 0;
  for (const y of c.years) {
    if (y.leagueYear < r.leagueYear) continue;
    if (y.base.guarantee[r.reason]) owed += y.leagueYear === r.leagueYear ? Math.max(0, y.base.amountCents - r.basePaidCents) : y.base.amountCents;
    // Dated roster bonuses of the current year already earned are in earnedThisYearCents; later ones are owed only when guaranteed.
    if (y.leagueYear > r.leagueYear) for (const b of y.datedRosterBonuses) if (b.guarantee[r.reason]) owed += b.amountCents;
  }
  return owed;
}

function accelerate(c: CapContract, leagueYear: number, deferred: boolean, rules: RuleSet): { now: number; next: number } {
  return deferred
    ? { now: prorationFor(c, leagueYear, rules), next: remainingProration(c, leagueYear + 1, rules) }
    : { now: remainingProration(c, leagueYear, rules), next: 0 };
}

export function releaseCharges(c: CapContract, r: ReleaseInput, rules: RuleSet): ReleaseResult {
  for (const v of [r.basePaidCents, r.earnedThisYearCents]) if (!Number.isSafeInteger(v) || v < 0) return { ok: false, reason: 'amounts paid must be whole non-negative cents' };
  if (r.june1Designation) {
    if (r.timing !== 'on_or_before_june1') return { ok: false, reason: 'A June 1 designation applies only to releases made on or before June 1.' };
    if (r.designationsUsed >= rules.num('cap.june1_designations')) return { ok: false, reason: 'league rule: the club has used its June 1 designations this league year' };
  }
  const deferred = r.june1Designation || r.timing === 'after_june1';
  const { now, next } = accelerate(c, r.leagueYear, deferred, rules);
  const owed = guaranteedOwed(c, r);
  const before = yearCharge(c, r.leagueYear, rules).totalCents;
  const after = now + owed + r.basePaidCents + r.earnedThisYearCents;
  const byYear = new Map<number, number>([[r.leagueYear, after]]);
  if (next > 0) byYear.set(r.leagueYear + 1, next);
  return {
    ok: true, byYear, prorationCents: now + next, guaranteedOwedCents: owed,
    chargeBeforeCents: before, chargeAfterCents: after, savingCents: before - after,
    chargeUntilJune2Cents: r.june1Designation ? before : null,
  };
}

/**
 * Offset (C6.1.1 rule 4): guaranteed money still owed falls by what a new club pays him, when the contract
 * has offset language. Returned as a credit to the old club (assumption: credited in the league year the
 * new pay is earned; the CBA text read for G-16 does not state the timing).
 */
export function offsetCreditCents(c: CapContract, guaranteedOwedCents: number, newClubPayCents: number): number {
  return c.offset ? Math.min(guaranteedOwedCents, newClubPayCents) : 0;
}

export interface TradeResult {
  /** Dead money the old club keeps: proration only (the contract and its guarantees go to the new club). */
  readonly oldClub: DeadMoney;
  /** The contract as the new club carries it: remaining years, no old proration (CBA Art. 13 s.6(b)(ii)(3)). */
  readonly newClubContract: CapContract;
}

/** Trade (C6.3.2 rule 5). Trades cannot use the June 1 designation. */
export function tradeCharges(c: CapContract, t: LeaveInput, rules: RuleSet): TradeResult {
  const { now, next } = accelerate(c, t.leagueYear, t.timing === 'after_june1', rules);
  const before = yearCharge(c, t.leagueYear, rules).totalCents;
  const after = now + t.basePaidCents + t.earnedThisYearCents;
  const byYear = new Map<number, number>([[t.leagueYear, after]]);
  if (next > 0) byYear.set(t.leagueYear + 1, next);
  const years = c.years
    .filter((y) => y.leagueYear >= t.leagueYear)
    .map((y) => (y.leagueYear === t.leagueYear ? { ...y, base: { ...y.base, amountCents: Math.max(0, y.base.amountCents - t.basePaidCents) } } : y));
  return {
    oldClub: {
      ok: true, byYear, prorationCents: now + next, guaranteedOwedCents: 0,
      chargeBeforeCents: before, chargeAfterCents: after, savingCents: before - after, chargeUntilJune2Cents: null,
    },
    newClubContract: { ...c, years, tranches: [] },
  };
}
