// An arm of a paired test on the real game: one game on the pair's seed under a set of parameter
// overrides, reduced to one number by a measure over the play-by-play rows and the game summary.
// Policies that are not a parameter (a call, a protection, an install level) need their own arm; this
// one covers the ones a parameter file can express.
import { field } from '@gm/engine-core';
import { stats } from '@gm/engine-game';
import type { GameSummary, PlayByPlayRow } from '@gm/schema';
import { createRealGame } from '../../real-game/index.ts';
import type { Arm } from './paired.ts';

export type GameMeasure = (rows: readonly PlayByPlayRow[], summary: GameSummary) => number | null;

export interface RealArmOptions {
  readonly label: string;
  readonly paramOverrides?: Readonly<Record<string, number>>;
  readonly measure: GameMeasure;
}

export function realGameArm(o: RealArmOptions): Arm {
  const games = new Map<string, { game: ReturnType<typeof createRealGame>; stats: ReturnType<typeof stats.createStatsModule> }>();
  const forRules = (ruleSetId: string) => {
    let g = games.get(ruleSetId);
    if (!g) {
      const game = createRealGame(ruleSetId, o.paramOverrides ? { paramOverrides: o.paramOverrides } : {});
      g = { game, stats: stats.createStatsModule({ geometry: field.fieldGeometry(game.rules), params: game.params }) };
      games.set(ruleSetId, g);
    }
    return g;
  };
  return {
    label: o.label,
    run(seedHex, ruleSetId) {
      const g = forRules(ruleSetId);
      const input = g.game.input(0, seedHex);
      const res = g.game.simulate(input);
      const rows = res.records.map((rec, k) => g.stats.playByPlay(rec, res.records[k + 1] ?? null));
      const score = res.final.score;
      const stateHash = res.records.length ? res.records[res.records.length - 1]!.stateHash : '';
      return o.measure(rows, g.stats.summary(res.records, res.drives, { score, tie: score[0] === score[1], stateHash, ruleSetId, seedHex }));
    },
  };
}

/** Yards gained per scrimmage play by both offenses. A plain engine measure for harness self-tests; no item is judged on it. */
export const yardsPerScrimmagePlay: GameMeasure = (rows) => {
  const plays = rows.filter((r) => r.offenseKind !== null && !r.noPlay);
  return plays.length === 0 ? null : plays.reduce((s, r) => s + r.yardsGained, 0) / plays.length;
};
