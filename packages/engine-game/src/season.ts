// Dummy season: a round-robin of dummy games. Each game's seed derives from (season, week, home, away)
// and never from execution order (J13.4.1), so games may run in any order or on any number of
// workers and the season result is the same (J13.3.2, Q1.3.1).
import { deriveSeed, stateHash, stream, type RuleSet, type WorldSeed } from '@gm/engine-core';
import { playGame, type DummyTeam, type GameRecord } from './dummy-game.ts';
import params from '../data/dummy-params.json' with { type: 'json' };

export interface Fixture { readonly week: number; readonly gameId: number; readonly home: number; readonly away: number }

/** Circle-method round robin for an even number of teams. */
export function roundRobin(teamIds: readonly number[], firstGameId = 1): Fixture[] {
  if (teamIds.length % 2 !== 0) throw new Error('round robin needs an even number of teams');
  const ids = [...teamIds];
  const n = ids.length;
  const out: Fixture[] = [];
  let gameId = firstGameId;
  for (let week = 1; week < n; week++) {
    for (let i = 0; i < n / 2; i++) {
      const a = ids[i]!, b = ids[n - 1 - i]!;
      const homeFirst = (week + i) % 2 === 0;
      out.push({ week, gameId: gameId++, home: homeFirst ? a : b, away: homeFirst ? b : a });
    }
    ids.splice(1, 0, ids.pop()!);
  }
  return out;
}

export function dummyTeams(seed: WorldSeed, count: number): DummyTeam[] {
  const teams: DummyTeam[] = [];
  for (let i = 1; i <= count; i++) {
    const s = stream(seed, 'teamGen', [i]);
    teams.push({ teamId: i, strength: Math.round(s.normal() * params.strengthSd * 1000) / 1000 });
  }
  return teams;
}

export function gameSeed(seed: WorldSeed, seasonYear: number, f: Fixture): WorldSeed {
  return deriveSeed(seed, 'game', [seasonYear, f.week, f.home, f.away]);
}

export function playFixture(seed: WorldSeed, seasonYear: number, f: Fixture, teams: readonly DummyTeam[], rules: RuleSet): GameRecord {
  const home = teams.find((t) => t.teamId === f.home)!;
  const away = teams.find((t) => t.teamId === f.away)!;
  return playGame(f.gameId, home, away, rules, gameSeed(seed, seasonYear, f));
}

export interface SeasonSummary {
  readonly ruleSetId: string;
  readonly games: number;
  readonly plays: number;
  readonly standings: readonly { teamId: number; w: number; l: number; t: number; pf: number; pa: number }[];
  readonly gameHashes: readonly string[];
  readonly seasonHash: string;
}

/** Applies finished games in schedule order, whatever order they were computed in. */
export function summariseSeason(ruleSetId: string, fixtures: readonly Fixture[], records: readonly GameRecord[]): SeasonSummary {
  const byId = new Map(records.map((r) => [r.gameId, r] as const));
  const table = new Map<number, { teamId: number; w: number; l: number; t: number; pf: number; pa: number }>();
  const row = (id: number) => { let r = table.get(id); if (!r) { r = { teamId: id, w: 0, l: 0, t: 0, pf: 0, pa: 0 }; table.set(id, r); } return r; };
  const gameHashes: string[] = [];
  let plays = 0;
  for (const f of fixtures) {
    const g = byId.get(f.gameId);
    if (!g) throw new Error(`missing result for game ${f.gameId}`);
    gameHashes.push(g.chainHead);
    plays += g.plays.length;
    const [h, a] = g.finalState.teams;
    const H = row(h.teamId), A = row(a.teamId);
    H.pf += h.score; H.pa += a.score; A.pf += a.score; A.pa += h.score;
    if (h.score > a.score) { H.w++; A.l++; } else if (h.score < a.score) { A.w++; H.l++; } else { H.t++; A.t++; }
  }
  const standings = [...table.values()].sort((x, y) => x.teamId - y.teamId);
  return { ruleSetId, games: fixtures.length, plays, standings, gameHashes, seasonHash: stateHash({ ruleSetId, standings, gameHashes }) };
}
