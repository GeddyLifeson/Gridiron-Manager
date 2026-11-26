// League-mode batch runner for calibration (J14.6.1, Q1.7.2). It runs a list of games through the game
// flow with the inputs a spec builds, turns each finished game into play-by-play rows and a summary with
// the statistics module, and splits the games into seed groups (Q2.3.1 ordering rows). Until the game
// flow (WP-06) and statistics (WP-07) land, tests drive it with fakes of the same interfaces.
import type { GameInput, GameDeps, GameFlow, StatsModule, GameSummary, PlayByPlayRow } from '@gm/schema';
import type { CalibrationSample } from './measures.ts';
import { mix32 } from './chart-caller.ts';

export interface BatchSpec {
  readonly games: number;
  readonly seedGroups: number;
  /** 16 hex digits; every game seed is derived from it and the game index, never from execution order. */
  readonly masterSeedHex: string;
  readonly input: (gameIndex: number, seedHex: string) => GameInput;
  readonly deps: (input: GameInput) => GameDeps;
  readonly flow: Pick<GameFlow, 'simulateGame'>;
  readonly stats: Pick<StatsModule, 'playByPlay' | 'summary'>;
}

export interface BatchResult {
  readonly groups: readonly CalibrationSample[];
  /** Seed of each game by index, so any game can be re-run in full detail (J14.6.1). */
  readonly seeds: readonly string[];
}

const hex8 = (n: number): string => (n >>> 0).toString(16).padStart(8, '0');

/** Game seed for one index of a batch: two 32-bit mixes of the master seed halves and the index. */
export function gameSeedHex(masterSeedHex: string, gameIndex: number): string {
  if (!/^[0-9a-f]{16}$/.test(masterSeedHex)) throw new Error(`master seed ${masterSeedHex}: need 16 lower-case hex digits`);
  const a = parseInt(masterSeedHex.slice(0, 8), 16), b = parseInt(masterSeedHex.slice(8), 16);
  return hex8(mix32(a, b, gameIndex, 1)) + hex8(mix32(b, a, gameIndex, 2));
}

export function runBatch(spec: BatchSpec): BatchResult {
  if (spec.seedGroups < 1 || spec.games < 0) throw new Error('batch: need at least one seed group and a non-negative game count');
  const groups = Array.from({ length: spec.seedGroups }, () => ({ summaries: [] as GameSummary[], plays: [] as PlayByPlayRow[] }));
  const seeds: string[] = [];
  for (let i = 0; i < spec.games; i++) {
    const seedHex = gameSeedHex(spec.masterSeedHex, i);
    seeds.push(seedHex);
    const input = spec.input(i, seedHex);
    const res = spec.flow.simulateGame(input, spec.deps(input));
    const group = groups[i % spec.seedGroups]!;
    res.records.forEach((rec, k) => group.plays.push(spec.stats.playByPlay(rec, res.records[k + 1] ?? null)));
    const finalEvent = [...res.events].reverse().find((e) => e.type === 'game_final');
    const score = res.final.score;
    const tie = finalEvent && finalEvent.type === 'game_final' ? finalEvent.tie : score[0] === score[1];
    const stateHash = res.records.length ? res.records[res.records.length - 1]!.stateHash : '';
    // Timeouts are game events, not play records: count the charged team timeouts for the summary.
    const timeoutsUsed: [number, number] = [0, 0];
    for (const e of res.events) if (e.type === 'timeout_charged' && e.kind === 'team' && e.side !== null) timeoutsUsed[e.side]++;
    // The contract type of `summary` does not list `timeoutsUsed` yet (change request to the integrator); the statistics module reads it.
    const final = { score, tie, stateHash, ruleSetId: input.ruleSetId, seedHex, timeoutsUsed };
    group.summaries.push(spec.stats.summary(res.records, res.drives, final));
  }
  return { groups, seeds };
}
