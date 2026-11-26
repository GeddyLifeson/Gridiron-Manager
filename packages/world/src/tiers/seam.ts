// X13.4.1 no visible seam, and the P6.4.1 and X13.3.2 acceptance checks. Under A3.1.1 row 20 the seam
// rule is exact, never statistical: the same game gives the same result at every tier, and watching a
// person changes nothing about him. These checks are what Q runs against the real engine port.
import { history } from '@gm/league';
import type { WorldTier } from '@gm/schema';
import type { GamePlayed, GamePort, GameRequest, GameResult, LiveWorld } from '../loop/types.ts';
import { TIERS } from './policy.ts';

const same = (a: GamePlayed, b: GamePlayed): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * P6.4.1 acceptance: one game run at each tier from the same input gives the same result. Any
 * difference means the port resolves games by tier, which is a lighter simulation and is ruled out.
 */
export function gamePortSeamProblems(play: GamePort, requests: readonly GameRequest[]): string[] {
  const out: string[] = [];
  for (const req of requests) {
    const base = play({ ...req, tier: 1 });
    for (const tier of TIERS) {
      const r = play({ ...req, tier });
      if (!same(base, r)) out.push(`game ${req.game.gameId}: tier ${tier} gave ${JSON.stringify(r)}, tier 1 gave ${JSON.stringify(base)}`);
    }
  }
  return out;
}

/** X13.3.2 acceptance: re-simulating a game from its stored inputs reproduces its saved result exactly. */
export function resimProblems(play: GamePort, req: GameRequest, saved: Pick<GameResult, 'homePoints' | 'awayPoints' | 'passPlays' | 'runPlays'>): string[] {
  const r = play(req);
  const out: string[] = [];
  for (const k of ['homePoints', 'awayPoints', 'passPlays', 'runPlays'] as const) {
    if (r[k] !== saved[k]) out.push(`game ${req.game.gameId}: ${k} re-simulated as ${r[k]}, saved as ${saved[k]}`);
  }
  return out;
}

/**
 * A hash of what happened in a world, leaving out the tier table and the event log (tier rows shift
 * event ids). Two worlds that differ only in who was watched must give the same value (X13.4.1 rules 2, 3).
 */
export function outcomeHash(world: LiveWorld): string {
  let h = history.chainHash(history.EMPTY_SEASON_HASH, {
    date: world.date, week: world.week, results: world.results, seasons: world.seasons, staffSeasons: world.staffSeasons,
    status: [...world.status].sort((a, b) => a[0] - b[0]), rosters: [...world.rosters].sort((a, b) => a[0] - b[0]),
    pools: [...world.pools].sort((a, b) => (a[0] < b[0] ? -1 : 1)), out: [...world.outOfFootballSince].sort((a, b) => a[0] - b[0]),
  });
  for (const id of [...world.people.keys()].sort((a, b) => a - b)) h = history.chainHash(h, world.people.get(id));
  for (const id of [...world.jobs.keys()].sort((a, b) => a - b)) h = history.chainHash(h, world.jobs.get(id));
  for (const t of world.teams) h = history.chainHash(h, t);
  for (const id of [...world.cultures.keys()].sort((a, b) => a - b)) h = history.chainHash(h, world.cultures.get(id));
  return h;
}

export interface PairedReport { readonly pairs: number; readonly differing: readonly string[] }

/**
 * X13.4.1 rule 3, the paired-world watch test: for each seed, run one world with the user action that
 * changes tiers and one without, and compare outcomes. The leaf asks for 500 pairs.
 */
export function pairedWatchTest(seedsHex: readonly string[], run: (seedHex: string, watched: boolean) => LiveWorld): PairedReport {
  const differing: string[] = [];
  for (const seed of seedsHex) if (outcomeHash(run(seed, true)) !== outcomeHash(run(seed, false))) differing.push(seed);
  return { pairs: seedsHex.length, differing };
}

export interface TierRates { readonly tier: WorldTier; readonly games: number; readonly pointsPerGame: number; readonly passShare: number }

/** X13.4.1 rule 1: league rates per tier, from the games as they were simulated. */
export function ratesByTier(results: readonly GameResult[], tierOfGame: (g: GameResult) => WorldTier): TierRates[] {
  return TIERS.map((tier) => {
    const gs = results.filter((g) => tierOfGame(g) === tier);
    let points = 0, pass = 0, plays = 0;
    for (const g of gs) { points += g.homePoints + g.awayPoints; pass += g.passPlays; plays += g.passPlays + g.runPlays; }
    return { tier, games: gs.length, pointsPerGame: gs.length ? points / gs.length : 0, passShare: plays ? pass / plays : 0 };
  });
}

/** Tolerances are an open question of X13.4.1 (Q writer, architect), so the caller states them. */
export function rateProblems(rates: readonly TierRates[], tolerance: { readonly pointsPerGame: number; readonly passShare: number }, minGames = 1): string[] {
  const out: string[] = [];
  const have = rates.filter((r) => r.games >= minGames);
  for (const a of have) for (const b of have) {
    if (a.tier >= b.tier) continue;
    if (Math.abs(a.pointsPerGame - b.pointsPerGame) > tolerance.pointsPerGame) out.push(`points per game: tier ${a.tier} ${a.pointsPerGame.toFixed(2)}, tier ${b.tier} ${b.pointsPerGame.toFixed(2)}`);
    if (Math.abs(a.passShare - b.passShare) > tolerance.passShare) out.push(`pass share: tier ${a.tier} ${a.passShare.toFixed(3)}, tier ${b.tier} ${b.passShare.toFixed(3)}`);
  }
  return out;
}
