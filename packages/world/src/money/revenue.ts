// The league's projected revenue (AR) and the salary cap it sets for every league year after the rules year
// (C6.2.1 rule 5, CBA Art. 12 s.6(c)). The CBA computes the cap in four steps from the three revenue buckets:
//   Player Cost Amount = 55% of League Media AR + 45% of NFL Ventures/Postseason AR + 40% of Local AR
//                        less 47.5% of the Joint Contribution Amount, held between 48% and 48.5% of AR;
//   Salary Cap = (Player Cost Amount less Projected Benefits) / clubs, adjusted by any True-Up.
// The percents are rule keys (cap.player_cost_*, F-cap rows of the integrator's G-10 load). What no source
// gives the world is read as follows (README MO-11 to MO-14):
// - revenue grows by a seeded yearly percentage, the C6.2.1 rule 5 draw (mean 7%, sd 3 points, bible
//   Assumption set from the Verified 2013 to 2026 cap history); the CBA itself has no growth limit;
// - the bucket mix is not public, so the three buckets are equal shares of AR (Assumption). The result
//   falls below the 48% floor, so the floor sets the Player Cost Amount, and any mix that does the same
//   gives the same cap; no mix can move it by more than the 0.5-point band;
// - benefits and the Joint Contribution Amount move with AR, and the number of clubs with league AR (AR is
//   earned per club), so the rules-year cap anchors the level and only revenue growth moves it;
// - the world's revenue has no surprise, so projected equals actual and the True-Up is 0.
import { stream } from '@gm/engine-core';
import type { LiveWorld } from '../loop/types.ts';
import { param } from './params.ts';

/** J13 stream of a league year's revenue growth draw. */
export const STREAM_REVENUE = 'world.money.revenue';

/** Rule keys of the CBA Art. 12 s.6(c) Player Cost Amount, in percent. */
export const PLAYER_COST_KEYS = {
  media: 'cap.player_cost_media_pct',
  ventures: 'cap.player_cost_ventures_pct',
  local: 'cap.player_cost_local_pct',
  floor: 'cap.player_cost_floor_pct_ar',
  ceiling: 'cap.player_cost_ceiling_pct_ar',
} as const;

const PERCENT = 100;

/** A rule value by key for the league, or undefined where it holds none. */
export type KeyRead = (key: string) => number | undefined;

/**
 * Art. 12 s.6(c)(i) and (ii)(B): the Player Cost Amount as a share of projected AR, from the bucket rates and
 * the band, with the buckets in the MO-12 mix. Undefined where the league holds no such keys.
 */
export function playerCostShare(read: KeyRead): number | undefined {
  const v = Object.fromEntries(Object.entries(PLAYER_COST_KEYS).map(([k, key]) => [k, read(key)])) as Record<keyof typeof PLAYER_COST_KEYS, number | undefined>;
  if (Object.values(v).some((x) => x === undefined)) return undefined;
  const media = param('revenue.mediaShare'), ventures = param('revenue.venturesShare');
  const local = 1 - media - ventures;
  const raw = (v.media! * media + v.ventures! * ventures + v.local! * local) / PERCENT;
  return Math.min(v.ceiling! / PERCENT, Math.max(v.floor! / PERCENT, raw));
}

/** One league year's revenue growth (C6.2.1 rule 5): a seeded draw, the same for every reader of the year. */
export function revenueGrowth(world: LiveWorld, leagueYear: number): number {
  return param('revenue.growthMean') + param('revenue.growthSd') * stream(world.seed, STREAM_REVENUE, [leagueYear]).normal();
}

/** Projected AR in a league year as a multiple of the rules year's (1 in the rules year and before it). */
export function revenueIndex(world: LiveWorld, rulesYear: number, leagueYear: number): number {
  let x = 1;
  for (let y = rulesYear + 1; y <= leagueYear; y++) x *= 1 + revenueGrowth(world, y);
  return x;
}

export interface CapProjection {
  readonly leagueYear: number;
  /** Projected AR as a multiple of the rules year's. */
  readonly revenueIndex: number;
  /** Player Cost Amount over projected AR (Art. 12 s.6(c)(i)-(ii)), or null where the league holds no such keys. */
  readonly playerCostShare: number | null;
  /** True-Up carried into the year (MO-14: 0, projected revenue equals actual off-screen). */
  readonly trueUpCents: number;
  readonly capCents: number;
}

/**
 * The cap of a league year after the rules year, in cents (C6.2.1 rule 5; pass it to league `cap.capAmount`
 * and `teamCapPosition` as `generatedCapCents`). `rulesCapCents` is the rules year's cap
 * (`cap.amount_<rulesYear>`), which anchors the level. Cap = (share x AR - benefits) / clubs + True-Up; with
 * benefits moving with AR, AR earned per club, and the same share every year (today's rules, MO-02), the
 * rules-year cap times the revenue index. Rounded to whole dollars. At or before the rules year: the rules cap.
 */
export function capProjection(world: LiveWorld, read: KeyRead, rulesYear: number, rulesCapCents: number, leagueYear: number): CapProjection {
  const share = playerCostShare(read) ?? null;
  if (leagueYear <= rulesYear) return { leagueYear, revenueIndex: 1, playerCostShare: share, trueUpCents: 0, capCents: rulesCapCents };
  const index = revenueIndex(world, rulesYear, leagueYear);
  const trueUpCents = 0;
  const capCents = Math.round((rulesCapCents * index) / CENTS_PER_DOLLAR) * CENTS_PER_DOLLAR + trueUpCents;
  return { leagueYear, revenueIndex: index, playerCostShare: share, trueUpCents, capCents };
}

/** The generated cap of a league year in cents: `capProjection(...).capCents`. */
export function generatedCapCents(world: LiveWorld, read: KeyRead, rulesYear: number, rulesCapCents: number, leagueYear: number): number {
  return capProjection(world, read, rulesYear, rulesCapCents, leagueYear).capCents;
}

/** Rule values in USD are whole dollars; caps are kept in cents rounded to the dollar. */
const CENTS_PER_DOLLAR = 100;
