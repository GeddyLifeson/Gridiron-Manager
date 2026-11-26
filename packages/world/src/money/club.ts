// C6.2.3 club cash: the owner's cash budget for each league year and the cash the club has committed
// against it. Money actually paid by the club goes here, one entry per payment, so the cash left is the
// budget minus the sum of the year's entries. Contracts are not held off-screen yet (TO-04), so today the
// only payments are fines (L8.2.5 orders, compliance/penalties.ts).
import { stream } from '@gm/engine-core';
import { bosses } from '@gm/career';
import type { LiveWorld } from '../loop/types.ts';
import { levelOfTeam, type RuleRead } from '../turnover/binding.ts';
import { param } from './params.ts';

/** `LiveWorld.systemState` key of club cash. */
export const CLUB_MONEY_KEY = 'club_money';
/** J13 stream of an owner's L5.1.1 profile, drawn once per club and owner. */
export const STREAM_OWNER = 'world.money.owner';

/** One payment by a club in a league year. Positive cents leave the club. */
export interface ClubPayment {
  readonly teamId: number;
  readonly seasonYear: number;
  readonly cents: number;
  /** What it paid for, for the books (for example `fine:case:3`). */
  readonly reason: string;
}

export interface ClubMoney { readonly payments: readonly ClubPayment[] }

export function clubMoneyOf(world: LiveWorld): ClubMoney {
  return (world.systemState.get(CLUB_MONEY_KEY) as ClubMoney | undefined) ?? { payments: [] };
}

/** C6.2.3 rule 1: record money the club actually paid in a league year. */
export function chargeClub(world: LiveWorld, p: ClubPayment): void {
  const m = clubMoneyOf(world);
  world.systemState.set(CLUB_MONEY_KEY, { payments: [...m.payments, p] });
}

/** Cash committed by a club in a league year: the sum of what it paid (C6.2.3 rule 1). */
export function cashCommitted(world: LiveWorld, teamId: number, seasonYear: number): number {
  return clubMoneyOf(world).payments.filter((p) => p.teamId === teamId && p.seasonYear === seasonYear).reduce((a, p) => a + p.cents, 0);
}

/** What the budget reads: the club's salary cap for the league year in cents, or undefined where its league has no cap. */
export type CapCents = (world: LiveWorld, teamId: number, seasonYear: number) => number | undefined;

/**
 * L5.1.1 owner profile of a club's owner (the boss chair `TeamRecord.ownerPersonId`), drawn once from the
 * world seed, the club and the owner. Null for a club with no owner (a school).
 */
export function ownerProfile(world: LiveWorld, teamId: number): bosses.BossProfile | null {
  const t = world.teams.find((x) => x.id === teamId);
  if (!t || t.ownerPersonId === null) return null;
  return bosses.generateProfile(t.ownerPersonId, 'owner', stream(world.seed, STREAM_OWNER, [teamId, t.ownerPersonId]));
}

/**
 * C6.2.3 rule 3: the owner's cash budget for a league year, from the low to the high share of the cap by his
 * `spending` weight (0 gives the low share, 1 the high). Null where the club has no owner or its league no cap.
 */
export function cashBudget(world: LiveWorld, teamId: number, seasonYear: number, cap: CapCents): number | null {
  const owner = ownerProfile(world, teamId);
  const capCents = cap(world, teamId, seasonYear);
  if (!owner || capCents === undefined) return null;
  const lo = param('budget.capShareLow'), hi = param('budget.capShareHigh');
  return Math.round(capCents * (lo + (hi - lo) * owner.weights.spending));
}

/** Cash the owner still funds this league year, or null where there is no budget. Can go below 0 (an overspend is the owner's to answer). */
export function cashLeft(world: LiveWorld, teamId: number, seasonYear: number, cap: CapCents): number | null {
  const b = cashBudget(world, teamId, seasonYear, cap);
  return b === null ? null : b - cashCommitted(world, teamId, seasonYear);
}

/** Rule values in USD are whole dollars (rules-data `unit: "USD"`); club books are in cents like the fine orders. */
export const CENTS_PER_DOLLAR = 100;

/**
 * MO-02: the cap read from the club's league rules, `cap.amount_<rulesYear>` (USD, whole dollars) in cents.
 * Every league year reads the same rules year: the past is played under today's rules (ruling 2026-11-26), so
 * the budget does not inflate or deflate with the calendar. A league with no such key has no cap.
 */
export function capFromRules(rule: RuleRead, rulesYear: number): CapCents {
  return (world, teamId) => {
    const v = rule(levelOfTeam(world, teamId), `cap.amount_${rulesYear}`);
    return v === undefined ? undefined : v * CENTS_PER_DOLLAR;
  };
}
