// The cap view of a pro player contract (C6.1.1). The world stores terms only (W-15); this module reads
// them into one normalised form and computes every charge from it. Money is integer cents.
//
// Bonus tranches: the world contract stores one signing bonus and per-year option bonuses. A restructure
// or extension adds a new prorated amount (C6.3.1), which the stored terms cannot hold yet. The cap form
// keeps a list of tranches; change request CR-G16-1 asks for the same list in PlayerContractTerms.
import type { ContractRecord } from '@gm/schema';

type Guarantee = { readonly skill: boolean; readonly cap: boolean; readonly injury: boolean };
type PlayerTerms = Extract<ContractRecord['terms'], { kind: 'player' }>;

/** Why a club ends a contract. A guarantee protects the player against the reasons it names (CBA Art. 13 s.6(d)(iv)). */
export type ReleaseReason = 'skill' | 'cap' | 'injury';

export interface CapItem { readonly amountCents: number; readonly guarantee: Guarantee }

export interface CapYear {
  readonly leagueYear: number;
  /** Paragraph 5 salary. */
  readonly base: CapItem;
  /** Roster bonuses earned on a set date, charged in full in the year earned (C6.1.1 rule 3). */
  readonly datedRosterBonuses: readonly CapItem[];
  /** Per-game active roster bonus at its full-season amount. Counted in full until year-end settlement (assumption, see charges.ts). */
  readonly perGameRosterCents: number;
  readonly workoutBonusCents: number;
  /** Incentives tagged likely to be earned (C6.1.1 rule 5) and not likely. */
  readonly likelyIncentivesCents: number;
  readonly unlikelyIncentivesCents: number;
  /** A year the player alone can void does not count for proration (CBA Art. 13 s.6(b)(i)(1)). */
  readonly playerVoidable: boolean;
}

/** One prorated amount: the signing bonus, an option bonus, or a restructure or extension bonus. */
export interface BonusTranche {
  readonly amountCents: number;
  /** First league year the amount is prorated over. */
  readonly firstLeagueYear: number;
  /** League year the cash is paid (C6.2.3). */
  readonly paidLeagueYear: number;
  readonly source: 'signing' | 'option' | 'restructure' | 'extension';
  readonly guarantee: Guarantee;
}

export interface CapContract {
  readonly id: number;
  readonly form: PlayerTerms['form'];
  readonly years: readonly CapYear[];
  readonly tranches: readonly BonusTranche[];
  readonly offset: boolean;
}

const FULL: Guarantee = { skill: true, cap: true, injury: true };

/** Read stored terms into the cap form. Option bonuses prorate from the year exercised (C6.2.2 rule 4). */
export function fromTerms(id: number, terms: PlayerTerms): CapContract {
  const years: CapYear[] = terms.years.map((y) => ({
    leagueYear: y.leagueYear,
    base: { amountCents: y.baseSalary.amountCents, guarantee: y.baseSalary.guarantee },
    datedRosterBonuses: y.rosterBonuses.filter((b) => b.basis === 'dated').map((b) => ({ amountCents: b.amountCents, guarantee: b.guarantee })),
    perGameRosterCents: y.rosterBonuses.filter((b) => b.basis === 'per_game').reduce((s, b) => s + b.amountCents, 0),
    workoutBonusCents: y.workoutBonusCents,
    likelyIncentivesCents: y.incentives.filter((i) => i.likelyToBeEarned).reduce((s, i) => s + i.amountCents, 0),
    unlikelyIncentivesCents: y.incentives.filter((i) => !i.likelyToBeEarned).reduce((s, i) => s + i.amountCents, 0),
    playerVoidable: y.voidable,
  }));
  const tranches: BonusTranche[] = [];
  if (terms.signingBonusCents > 0) {
    tranches.push({
      amountCents: terms.signingBonusCents, firstLeagueYear: years[0]!.leagueYear,
      paidLeagueYear: terms.signingBonusPaidOn.seasonYear, source: 'signing', guarantee: FULL,
    });
  }
  for (const y of terms.years) {
    if (y.optionBonus && y.optionBonus.amountCents > 0) {
      tranches.push({ amountCents: y.optionBonus.amountCents, firstLeagueYear: y.leagueYear, paidLeagueYear: y.leagueYear, source: 'option', guarantee: y.optionBonus.guarantee });
    }
  }
  return { id, form: terms.form, years, tranches, offset: terms.offset };
}

/** A plain year with only a base salary, for builders and tests. */
export function plainYear(leagueYear: number, baseCents: number, guarantee: Guarantee = { skill: false, cap: false, injury: false }): CapYear {
  return {
    leagueYear, base: { amountCents: baseCents, guarantee }, datedRosterBonuses: [], perGameRosterCents: 0,
    workoutBonusCents: 0, likelyIncentivesCents: 0, unlikelyIncentivesCents: 0, playerVoidable: false,
  };
}

export const FULLY_GUARANTEED: Guarantee = FULL;
export const NOT_GUARANTEED: Guarantee = { skill: false, cap: false, injury: false };

export function yearOf(c: CapContract, leagueYear: number): CapYear | undefined {
  return c.years.find((y) => y.leagueYear === leagueYear);
}

/** Total money the contract can pay: salary, bonuses, likely and unlikely incentives, tranches. */
export function totalValueCents(c: CapContract): number {
  return c.tranches.reduce((s, t) => s + t.amountCents, 0) + c.years.reduce((s, y) => s + yearCashCents(y) + y.unlikelyIncentivesCents, 0);
}

/** Cash a year pays if every likely item is earned (no tranche cash). */
export function yearCashCents(y: CapYear): number {
  return y.base.amountCents + y.datedRosterBonuses.reduce((s, b) => s + b.amountCents, 0) + y.perGameRosterCents + y.workoutBonusCents + y.likelyIncentivesCents;
}
