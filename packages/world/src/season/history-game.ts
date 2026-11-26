// The real game as the world loop's game port (X10.3.1 rule 3, A3.1.1 row 20): every game of a history run
// or of the off-screen week is played whole by the same engine the user's games use. Browser-safe, so the
// app's new-game screen runs the history with the same port the headless week pool runs in workers
// (headless week-pool/real-week.ts plays the identical function per job).
// PLACEHOLDER rosters, as in real-game.ts, until generated players (G-17) and depth charts feed real ones.
import { field } from '@gm/engine-core';
import { stats } from '@gm/engine-game';
import type { GamePlayed, GamePort, GameRequest } from '../loop/types.ts';
import { createRealGameCore, type RealGameCore, type RealGameOptions } from './real-game.ts';

/** One played game reduced to what the loop stores: score and the counted pass and run plays. */
export function playHistoryGame(core: RealGameCore, statsModule: ReturnType<typeof stats.createStatsModule>, gameId: number, seedHex: string): GamePlayed {
  const input = core.input(gameId - 1, seedHex);
  const result = core.simulate(input);
  let passPlays = 0, runPlays = 0;
  for (let k = 0; k < result.records.length; k++) {
    const row = statsModule.playByPlay(result.records[k]!, result.records[k + 1] ?? null);
    if (row.noPlay || row.offenseKind === null) continue;
    if (row.dropback) passPlays++; else runPlays++;
  }
  return { homePoints: result.final.score[0], awayPoints: result.final.score[1], passPlays, runPlays };
}

/** The loop's game port over the real game, one engine per rule set, built on first use. */
export function historyGamePort(opts: RealGameOptions = {}): GamePort {
  const cores = new Map<string, { core: RealGameCore; stats: ReturnType<typeof stats.createStatsModule> }>();
  return (req: GameRequest): GamePlayed => {
    let e = cores.get(req.ruleSetId);
    if (!e) {
      const core = createRealGameCore(req.ruleSetId, opts);
      e = { core, stats: stats.createStatsModule({ geometry: field.fieldGeometry(core.rules), params: core.params }) };
      cores.set(req.ruleSetId, e);
    }
    return playHistoryGame(e.core, e.stats, req.game.gameId, req.seedHex);
  };
}
