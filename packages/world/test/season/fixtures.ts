// Season runner test fixtures. FIXTURE league shapes and a FAKE game port: no number here is a football
// fact. League-rule values come from the G-10 files in @gm/rules-data; the college keys G-10 does not
// carry yet are FIXTURE values copied from packages/league/test/postseason/postseason.test.ts.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { seedFromHex, stream } from '@gm/engine-core';
import type { Fixture, GameContext, GameOutcome, RuleValues, SeasonTeam } from '../../src/season/index.ts';

const leagueValues = (name: string): RuleValues => Object.fromEntries(
  (JSON.parse(readFileSync(fileURLToPath(new URL(`../../../rules-data/data/league/${name}`, import.meta.url)), 'utf8')).values as { key: string; value: number | string | boolean }[])
    .map((v) => [v.key, v.value]));

export const PRO_RULES = leagueValues('proleague_2026.json');
export const COLLEGE_RULES: RuleValues = {
  ...leagueValues('collegeleague_2026.json'),
  'standings.tie_win_value': 0.5, 'playoff.reseed': false, 'cfp.at_large_pool_rank': 0,
  'ranking.lower_division_wins_credited': 0, 'ranking.schedule_standard_games': 0,
};

/** Two conferences of four divisions of four: ids 1 to 32. */
export function proTeams(): SeasonTeam[] {
  return Array.from({ length: 32 }, (_, i) => {
    const id = i + 1, conf = id <= 16 ? 1 : 2;
    return { id, key: `club.${id}`, conferenceId: conf, divisionId: conf * 10 + Math.floor((i % 16) / 4) + 1 };
  });
}

/** Round robin by the circle method: `rounds` weeks, every team plays once a week (even team count). */
export function roundRobin(teamIds: readonly number[], rounds: number, opts: { firstGameId?: number; firstWeek?: number; conference?: (a: number, b: number) => boolean; skipWeekFor?: (week: number) => number | null } = {}): Fixture[] {
  const n = teamIds.length;
  const out: Fixture[] = [];
  let gameId = opts.firstGameId ?? 1;
  for (let r = 0; r < rounds; r++) {
    const week = (opts.firstWeek ?? 1) + r;
    const rot = [teamIds[0]!, ...Array.from({ length: n - 1 }, (_, k) => teamIds[1 + ((k + r) % (n - 1))]!)];
    const skip = opts.skipWeekFor?.(week) ?? null;
    for (let k = 0; k < n / 2; k++) {
      const a = rot[k]!, b = rot[n - 1 - k]!;
      if (a === skip || b === skip) continue;
      const [home, away] = (r + k) % 2 === 0 ? [a, b] : [b, a];
      out.push({ gameId: gameId++, week, phase: 'regular', home, away, neutralSite: false, conferenceGame: opts.conference?.(a, b) ?? false, dayIndex: null, postKey: null });
    }
  }
  return out;
}

export interface FakeOptions { readonly strength?: (teamId: number) => number; readonly allowTies?: boolean }

/** FAKE game: scores drawn from the game seed alone. A postseason game never ends tied. */
export function fakeGame(opts: FakeOptions = {}): (ctx: GameContext) => GameOutcome {
  return (ctx) => {
    const s = stream(seedFromHex(ctx.seedHex), 'fake.game', []);
    const tds = [ctx.fixture.home, ctx.fixture.away].map((t) => s.int(0, 4) + (opts.strength?.(t) ?? 0)) as [number, number];
    const fgs = [s.int(0, 3), s.int(0, 3)] as const;
    let points: [number, number] = [tds[0] * 7 + fgs[0] * 3, tds[1] * 7 + fgs[1] * 3];
    let overtime = false;
    if (points[0] === points[1] && (ctx.fixture.phase === 'postseason' || !opts.allowTies)) {
      overtime = true;
      points = s.chance(0.5) ? [points[0] + 3, points[1]] : [points[0], points[1] + 3];
    }
    const lines = [ctx.fixture.home, ctx.fixture.away].map((teamId, side) => ({ playerId: teamId * 100 + 1, teamId, statId: 'pass_touchdowns', value: tds[side]! }));
    return { points, touchdowns: tds, overtime, stateHash: `${ctx.seedHex}:${points[0]}-${points[1]}`, plays: 120 + s.int(0, 20), lines };
  };
}
