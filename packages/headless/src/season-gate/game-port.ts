// The season runner's game port backed by the real game (real-game/index.ts): the game flow, the
// officiating facade, the resolver and the statistics module. Teams are the placeholder rosters of the
// real game (every attribute at one value): the "league of average teams" of Q1.7.2. Generated rosters
// replace them when the roster feed lands (G-17, G-56); `issOf` is the seam.
import { field } from '@gm/engine-core';
import { stats } from '@gm/engine-game';
import type { season as seasons } from '@gm/world';
import { createRealGame, placeholderTeam, type RealGame } from '../real-game/index.ts';

export interface RealPortOptions {
  readonly ruleSetId: string;
  readonly paramOverrides?: Readonly<Record<string, number>>;
  /** Attribute level of a team's placeholder roster on the internal skill scale; the real game's default when left out. */
  readonly issOf?: (teamId: number) => number;
}

/** Season-wide player id of a placeholder roster slot: unique per team, stable across games. */
export function seasonPlayerId(teamId: number, enginePlayerId: number, slotsPerTeam: number): number {
  return teamId * slotsPerTeam + (enginePlayerId % slotsPerTeam);
}

const SLOTS = 1000;

export function realGamePort(o: RealPortOptions): { game: RealGame; playGame: seasons.SeasonPorts['playGame'] } {
  const game = createRealGame(o.ruleSetId, o.paramOverrides ? { paramOverrides: o.paramOverrides } : {});
  const statsModule = stats.createStatsModule({ geometry: field.fieldGeometry(game.rules), params: game.params });
  const playGame: seasons.SeasonPorts['playGame'] = (ctx) => {
    const f = ctx.fixture;
    const base = game.input(f.gameId - 1, ctx.seedHex);
    const input = {
      ...base, gameType: f.phase === 'postseason' ? 'postseason' as const : 'regular' as const,
      ...(o.issOf ? { teams: [placeholderTeam(0, o.issOf(f.home)), placeholderTeam(1, o.issOf(f.away))] as typeof base.teams } : {}),
    };
    const res = game.simulate(input);
    const score = res.final.score;
    const finalEvent = [...res.events].reverse().find((e) => e.type === 'game_final');
    const tie = finalEvent && finalEvent.type === 'game_final' ? finalEvent.tie : score[0] === score[1];
    const stateHash = res.records.length ? res.records[res.records.length - 1]!.stateHash : '';
    const summary = statsModule.summary(res.records, res.drives, { score, tie, stateHash, ruleSetId: input.ruleSetId, seedHex: ctx.seedHex });
    // Touchdowns of every kind (C3.1.1 net-touchdowns step), from how each drive ended.
    const touchdowns: [number, number] = [0, 0];
    for (const d of res.drives) {
      if (d.result === 'touchdown') touchdowns[d.side]++;
      else if (d.result === 'opponent_touchdown') touchdowns[d.side === 0 ? 1 : 0]++;
    }
    const totals = new Map<string, seasons.StatLine>();
    const teamOf = [f.home, f.away] as const;
    for (const rec of res.records) for (const c of statsModule.credits(rec)) {
      if (c.playerId === null) continue;
      const teamId = teamOf[c.side]!;
      const playerId = seasonPlayerId(teamId, c.playerId, SLOTS);
      const key = `${c.statId}|${playerId}`;
      totals.set(key, { playerId, teamId, statId: c.statId, value: (totals.get(key)?.value ?? 0) + c.value });
    }
    return { points: [score[0], score[1]], touchdowns, overtime: summary.overtime, stateHash, plays: res.records.length, lines: [...totals.values()] };
  };
  return { game, playGame };
}
