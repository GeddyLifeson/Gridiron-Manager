// Cap charge of one contract in one league year, and team salary and room (C6.2.1; CBA Art. 13 s.6).
// Per-game roster bonuses are counted at their full-season amount and trued up at year end with the
// incentives (assumption: the CBA treats them by prior-year games active, which needs the D14 game log;
// G-16 counts the maximum so a club can never be short of room for them).
import type { RuleSet } from '@gm/schema';
import { yearOf, type CapContract } from './contract.ts';
import { prorationFor } from './proration.ts';
import { minimumSalary } from './minimums.ts';
import { usdKey } from './params.ts';

export interface ChargeBreakdown {
  readonly leagueYear: number;
  readonly baseCents: number;
  readonly prorationCents: number;
  readonly rosterBonusCents: number;
  readonly workoutBonusCents: number;
  readonly likelyIncentivesCents: number;
  readonly totalCents: number;
}

/** Full cap charge in a league year (the regular-season count, and the count for a top-51 contract). */
export function yearCharge(c: CapContract, leagueYear: number, rules: RuleSet): ChargeBreakdown {
  const y = yearOf(c, leagueYear);
  const prorationCents = prorationFor(c, leagueYear, rules);
  const baseCents = y?.base.amountCents ?? 0;
  const rosterBonusCents = y ? y.datedRosterBonuses.reduce((s, b) => s + b.amountCents, 0) + y.perGameRosterCents : 0;
  const workoutBonusCents = y?.workoutBonusCents ?? 0;
  const likelyIncentivesCents = y?.likelyIncentivesCents ?? 0;
  return {
    leagueYear, baseCents, prorationCents, rosterBonusCents, workoutBonusCents, likelyIncentivesCents,
    totalCents: baseCents + prorationCents + rosterBonusCents + workoutBonusCents + likelyIncentivesCents,
  };
}

/** What the cap module needs to know about the player behind a contract. */
export interface PlayerCapFacts {
  readonly creditedSeasons: number;
  /** An undrafted rookie free agent in his first league year (CBA Art. 13 s.6(a)(i)(1)). */
  readonly undraftedRookie: boolean;
}

/**
 * Offseason charge of a contract outside the top 51 (CBA Art. 13 s.6(a)(i)): of Paragraph 5 salary only the
 * part above the undrafted-rookie minimum (undrafted rookies) or above twice the player's own minimum
 * (everyone else) counts. Proration, bonuses and likely incentives count as usual.
 */
export function reducedOffseasonCharge(c: CapContract, leagueYear: number, player: PlayerCapFacts, rules: RuleSet): ChargeBreakdown {
  const full = yearCharge(c, leagueYear, rules);
  const threshold = player.undraftedRookie
    ? minimumSalary(rules, leagueYear, 0)
    : rules.num('cap.top51_excess_multiple') * minimumSalary(rules, leagueYear, player.creditedSeasons);
  const baseCents = Math.max(0, full.baseCents - threshold);
  return { ...full, baseCents, totalCents: full.totalCents - full.baseCents + baseCents };
}

/** The league-year phase that decides how contracts count (C6.2.1 rules 2 and 3; switch on the two dated events, C4). */
export type CapPhase = 'offseason' | 'season';

export interface TeamContract { readonly contract: CapContract; readonly player: PlayerCapFacts }
/** A charge that is not a live contract: dead money, a tender, an offer sheet, an elevation. */
export interface OtherCharge { readonly label: string; readonly amountCents: number; readonly kind: 'dead' | 'tender' | 'offer_sheet' | 'elevation' }

export interface TeamCapInput {
  readonly leagueYear: number;
  readonly phase: CapPhase;
  readonly contracts: readonly TeamContract[];
  readonly other: readonly OtherCharge[];
  /** Carryover credit and year-end settlement for this league year (C6.2.4), signed: credits positive. */
  readonly adjustmentCents: number;
  /** Cap for a generated year with no `cap.amount_<year>` key (C6.2.1 rule 5; the world loop draws it). */
  readonly generatedCapCents?: number;
}

export interface TeamCapLine {
  readonly contractId: number | null;
  readonly label: string;
  readonly chargeCents: number;
  readonly countedInFull: boolean;
}

export interface TeamCapPosition {
  readonly leagueYear: number;
  readonly capCents: number;
  readonly adjustmentCents: number;
  readonly teamSalaryCents: number;
  readonly roomCents: number;
  readonly lines: readonly TeamCapLine[];
  /** Contracts and tenders counted in full. */
  readonly countedInFull: number;
}

export function capAmount(rules: RuleSet, leagueYear: number, generatedCapCents?: number): number {
  const key = `cap.amount_${leagueYear}`;
  if (rules.keys().includes(key)) return usdKey(rules, key);
  if (generatedCapCents === undefined) throw new Error(`league.cap: no cap for ${leagueYear}; pass the generated cap`);
  return generatedCapCents;
}

/**
 * Team salary, cap and room (C6.2.1 rule 1). In the offseason only the `cap.top_n_contracts` highest-valued
 * contracts, tenders and offer sheets count in full; ties break on contract id so the result is deterministic.
 */
export function teamCapPosition(input: TeamCapInput, rules: RuleSet): TeamCapPosition {
  const { leagueYear } = input;
  type Valued = { line: Omit<TeamCapLine, 'countedInFull' | 'chargeCents'>; full: number; reduced: number; ranks: boolean };
  const valued: Valued[] = [];
  for (const tc of input.contracts) {
    const full = yearCharge(tc.contract, leagueYear, rules).totalCents;
    const reduced = input.phase === 'offseason' ? reducedOffseasonCharge(tc.contract, leagueYear, tc.player, rules).totalCents : full;
    valued.push({ line: { contractId: tc.contract.id, label: `contract ${tc.contract.id}` }, full, reduced, ranks: true });
  }
  for (const o of input.other) {
    const ranks = o.kind === 'tender' || o.kind === 'offer_sheet';
    valued.push({ line: { contractId: null, label: o.label }, full: o.amountCents, reduced: o.amountCents, ranks });
  }
  const topN = rules.num('cap.top_n_contracts');
  const ranked = valued.filter((v) => v.ranks).sort((a, b) => b.full - a.full || (a.line.contractId ?? 0) - (b.line.contractId ?? 0));
  const inFull = new Set<Valued>(input.phase === 'offseason' ? ranked.slice(0, topN) : ranked);
  const lines: TeamCapLine[] = valued.map((v) => {
    const counted = !v.ranks || inFull.has(v);
    return { ...v.line, chargeCents: counted ? v.full : v.reduced, countedInFull: counted };
  });
  const teamSalaryCents = lines.reduce((s, l) => s + l.chargeCents, 0);
  const capCents = capAmount(rules, leagueYear, input.generatedCapCents);
  return {
    leagueYear, capCents, adjustmentCents: input.adjustmentCents, teamSalaryCents,
    roomCents: capCents + input.adjustmentCents - teamSalaryCents,
    lines, countedInFull: valued.filter((v) => v.ranks && inFull.has(v)).length,
  };
}

/** C6.2.1 rule 4: a transaction that leaves the club over the cap is refused (blocked), outside the grace window. */
export function fitsUnderCap(position: TeamCapPosition, addedChargeCents: number): boolean {
  return position.roomCents - addedChargeCents >= 0;
}
