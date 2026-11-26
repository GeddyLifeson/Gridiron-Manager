// Player contracts held by the off-screen world (C6.1.1, P3.2.4). State lives in `LiveWorld.systemState`
// under `player_contracts`, so it is folded into `worldHash` and saved with the world. Rows are schema
// `ContractRecord`s with player terms; cap charges, proration and cash are computed by the cap package
// (league `cap`) from them, never stored (P3.1.1).
import type { ContractRecord } from '@gm/schema';
import type { LiveWorld } from '../loop/types.ts';

/** `LiveWorld.systemState` key of the world's player contracts. */
export const CONTRACTS_KEY = 'player_contracts';

export type PlayerTerms = Extract<ContractRecord['terms'], { kind: 'player' }>;
export type PlayerContract = ContractRecord & { readonly terms: PlayerTerms };

/** A floor period closed and checked (C6.2.3 rule 2): the log the acceptance criterion asks for. */
export interface FloorCheck {
  readonly teamId: number;
  readonly from: number;
  readonly to: number;
  /** League years of the period the world ran with player pay on the books (a world can start mid-period). */
  readonly yearsCounted: number;
  readonly requiredCents: number;
  readonly spentCents: number;
  readonly shortfallCents: number;
  /** League year the shortfall was paid (the year after the period, by September 15, CBA Art. 12 s.9(c)). */
  readonly paidYear: number;
  /** Players paid a share, and the cents each (PC-08: equal shares; the remainder goes to the lowest ids). */
  readonly recipients: readonly { readonly personId: number; readonly cents: number }[];
}

export interface ContractsState {
  readonly nextId: number;
  /** Active contracts, in id order. Ended ones leave the state; their cash is on the club's books already. */
  readonly active: readonly PlayerContract[];
  /** League years whose player pay has been charged. */
  readonly paidYears: readonly number[];
  /** Players paid by each club in the open floor period, the CBA's shortfall recipients (Art. 12 s.9(c)). Keyed `${teamId}`. */
  readonly periodRoster: Readonly<Record<string, readonly number[]>>;
  /** Floor periods already checked, by `${from}-${to}`. */
  readonly checkedPeriods: readonly string[];
  readonly floorChecks: readonly FloorCheck[];
  /** The latest league year's free agent signings at their market price (PC-11): the front office's going rate reads them (TO-07). */
  readonly lastMarket?: MarketYear;
}

/** One league year's free agent signings: who signed, with which club, at what average per year. */
export interface MarketYear {
  readonly seasonYear: number;
  readonly signings: readonly { readonly personId: number; readonly teamId: number; readonly apyCents: number }[];
}

const EMPTY: ContractsState = { nextId: 1, active: [], paidYears: [], periodRoster: {}, checkedPeriods: [], floorChecks: [] };

export function contractsOf(world: LiveWorld): ContractsState {
  return (world.systemState.get(CONTRACTS_KEY) as ContractsState | undefined) ?? EMPTY;
}

export function setContracts(world: LiveWorld, s: ContractsState): void {
  world.systemState.set(CONTRACTS_KEY, s);
}

/** A player's active contract, if he has one. */
export function contractOf(world: LiveWorld, personId: number): PlayerContract | undefined {
  return contractsOf(world).active.find((c) => c.personId === personId);
}

/** Active contracts of a club, in id order. */
export function clubContracts(world: LiveWorld, teamId: number): PlayerContract[] {
  return contractsOf(world).active.filter((c) => c.teamId === teamId);
}

/** Paragraph 5 salary a contract pays in a league year (0 outside its years). The world's contracts carry no bonuses yet (PC-05). */
export function salaryIn(c: PlayerContract, leagueYear: number): number {
  return c.terms.years.find((y) => y.leagueYear === leagueYear)?.baseSalary.amountCents ?? 0;
}

export function lastYear(c: PlayerContract): number {
  return c.terms.years[c.terms.years.length - 1]!.leagueYear;
}
