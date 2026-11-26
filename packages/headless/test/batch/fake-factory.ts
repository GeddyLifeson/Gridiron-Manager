// FIXTURE game factory for the WP-24 tests. Nothing here is football: a fake resolver and a fake game
// flow with the real interfaces, so batches and diffs can be tested before the real game runs on main.
// The fake resolver reads two FIXTURE parameters: `fake.rushSpeed` changes only pass plays and
// `fake.runPower` only runs, which is the shape of the Q1.3.2 acceptance check.
import type {
  GameDeps, GameEvent, GameInput, GameResult, GameState, ParamTable, PlayInput, PlayRecord, PlayResult, PlayTruth,
  Resolver, RuleSet, SimTeam, TruthEvent,
} from '@gm/schema';
import { DMATH, seedFromHex, streamSource } from '@gm/engine-core';
import { hashOf } from '../../src/batch/run.ts';
import { row, summary } from '../calibration/fixtures.ts';
import type { CreateGameFactory, EngineVariant, GameFactory } from '../../src/batch/spec.ts';

export const FAKE_FACTORY_MODULE = new URL('./fake-factory.ts', import.meta.url).href;

const BASE_PARAMS: Record<string, number> = { 'fake.rushSpeed': 0.5, 'fake.runPower': 0.5, 'fake.streamShift': 0 };

export function fakeParams(over: Readonly<Record<string, number>> = {}): ParamTable {
  const m = new Map(Object.entries(BASE_PARAMS));
  for (const [k, v] of Object.entries(over)) { if (!m.has(k)) throw new Error(`unknown parameter ${k}`); m.set(k, v); }
  return { version: `fake@${hashOf([...m.entries()])}`, has: (n) => m.has(n), num: (n) => { const v = m.get(n); if (v === undefined) throw new Error(`unknown parameter ${n}`); return v; } };
}

const RULES: RuleSet = {
  id: 'fixture_2026', level: 'pro', seasonYear: 2026,
  num: (k) => { throw new Error(`fixture rule set has no number ${k}`); },
  bool: (k) => { throw new Error(`fixture rule set has no boolean ${k}`); },
  opt: (k) => { throw new Error(`fixture rule set has no option ${k}`); },
  keys: () => [],
};

/** FIXTURE resolver. Pass plays: a passBlock contest decided by `fake.rushSpeed`; runs: runBlock by `fake.runPower`. */
export function fakeResolver(id: Resolver['id'] = 'reference', version = 'fake-1', shiftStream = 0, impure = false): Resolver {
  let calls = 0;
  return {
    id, version, mayProduceSavedResults: false,
    simulatePlay(input: PlayInput): PlayResult {
      const shift = shiftStream + input.params.num('fake.streamShift') + (impure ? calls++ : 0);
      const s = input.streams('resolver', [input.situation.gameId, input.situation.playNumber + shift]);
      const kind = (input.calls.snapping as { kind?: string }).kind ?? 'run';
      const spot = { x: input.situation.ballX, y: input.situation.ballY };
      const pass = kind === 'dropback_pass';
      const p = input.params.num(pass ? 'fake.rushSpeed' : 'fake.runPower');
      const u = s.uniform(), v = s.uniform();
      const offWins = u >= p;
      const events: TruthEvent[] = [
        { type: 'snap', t: 0 } as unknown as TruthEvent,
        { type: 'contest', t: 1.2, contest: pass ? 'passBlock' : 'runBlock', winnerId: offWins ? 101 : 201, loserId: offWins ? 201 : 101, spot },
      ];
      if (pass && !offWins) events.push({ type: 'pressure', t: 2.1, kind: 'sack', rusherId: 201, passerId: 101, spot });
      const gain = Math.floor((offWins ? 3 + 10 * v : -2 * v) * 10) / 10;
      events.push({ type: 'dead_ball', t: 3.4, reason: 'runner_down', spot: { x: spot.x + gain, y: spot.y } } as unknown as TruthEvent);
      const truth: PlayTruth = {
        resolverId: id, resolverVersion: version, gameId: input.situation.gameId, playNumber: input.situation.playNumber,
        originX: spot.x, originY: spot.y, attackDir: 1, liveDurationTenths: 34, endZoneImpetus: null, events,
      };
      return { truth, deltas: [], liveDurationTenths: 34 as PlayResult['liveDurationTenths'], trajectory: null, explain: null };
    },
  };
}

const team = (side: 0 | 1): SimTeam => ({ teamId: side + 1, side, players: [], depth: {}, teamDiscipline: { defCoverage: 1, postPlay: 1 } });

/** FIXTURE flow: 24 plays alternating run and pass; each gain moves the ball, so a changed play changes the rest of the game. */
export function fakeSimulateGame(input: GameInput, deps: GameDeps, plays = 24): GameResult {
  let ballX = 35, score: [number, number] = [0, 0];
  const records: PlayRecord[] = [];
  const events: GameEvent[] = [];
  for (let k = 1; k <= plays; k++) {
    const kind = k % 2 ? 'run' : 'dropback_pass';
    const situation = { gameId: input.gameId, playNumber: k, playKind: 'scrimmage', ballX, ballY: 26.67 } as unknown as PlayInput['situation'];
    const calls = { snapping: { unit: 'offense', kind }, opposing: { unit: 'defense' } } as unknown as PlayInput['calls'];
    const r = deps.resolver.simulatePlay({
      situation, calls, teams: input.teams, environment: input.environment, geometry: deps.geometry, streams: deps.streams,
      math: deps.math, rules: deps.rules, params: deps.params, options: { detail: 'summary' },
    });
    const dead = r.truth.events.find((e) => e.type === 'dead_ball') as { spot: { x: number } };
    ballX = dead.spot.x;
    if (ballX >= 110) { score = [score[0] + 7, score[1]]; ballX = 35; }
    if (ballX <= 10) { score = [score[0], score[1] + 2]; ballX = 35; }
    events.push({ type: 'fake_play', playNumber: k, ballX } as unknown as GameEvent);
    records.push({ gameId: input.gameId, index: k, truth: r.truth, deltas: r.deltas, stateHash: hashOf([k, ballX, score]) } as unknown as PlayRecord);
  }
  return { final: { score } as unknown as GameState, events, records, drives: [] };
}

/** FIXTURE statistics: one run or pass row per play with the gain, one summary per game. */
export const FAKE_STATS: NonNullable<GameFactory['stats']> = {
  playByPlay(rec) {
    const ev = rec.truth.events;
    const sacked = ev.some((e) => e.type === 'pressure');
    const dead = ev.find((e) => e.type === 'dead_ball') as unknown as { spot: { x: number } };
    const gain = Math.round((dead.spot.x - rec.truth.originX) * 10) / 10;
    const pass = ev.some((e) => e.type === 'contest' && e.contest === 'passBlock');
    return pass
      ? row({ gameId: rec.gameId, playIndex: rec.index, offenseKind: 'dropback_pass', dropback: true, runLocation: null, resultType: sacked ? 'sack' : 'pass_complete', sack: sacked, yardsGained: gain, airYd: sacked ? null : 5, yardsAfterCatch: sacked ? null : Math.max(0, gain - 5) })
      : row({ gameId: rec.gameId, playIndex: rec.index, yardsGained: gain });
  },
  summary: (records, _drives, o) => summary(records[0]?.gameId ?? 1, [o.score[0], o.score[1]], { seedHex: o.seedHex, finalStateHash: o.stateHash, ruleSetId: o.ruleSetId }),
};

export const createGameFactory: CreateGameFactory = (raw) => {
  const o = (raw ?? {}) as { plays?: number; tickShift?: number; stats?: boolean; impure?: boolean };
  const resolvers: Partial<Record<Resolver['id'], Resolver>> = { reference: fakeResolver('reference', 'fake-1', 0, o.impure ?? false), tick: fakeResolver('tick', 'fake-tick-1', o.tickShift ?? 1000) };
  const f: GameFactory = {
    ruleSetId: 'fixture_2026',
    input: (i, seedHex) => ({
      gameId: i + 1, ruleSetId: 'fixture_2026', gameType: 'regular', teams: [team(0), team(1)],
      crew: {} as GameInput['crew'], environment: {} as GameInput['environment'], seedHex, fidelityTier: 'B',
    }),
    deps: (input, variant: EngineVariant, resolver) => ({
      rules: RULES, params: fakeParams(variant.paramOverrides), geometry: {} as GameDeps['geometry'],
      streams: streamSource(seedFromHex(input.seedHex)), math: DMATH, resolver,
      officiating: {} as GameDeps['officiating'], deciders: [] as unknown as GameDeps['deciders'],
    }),
    flow: { simulateGame: (input, deps) => fakeSimulateGame(input, deps, o.plays ?? 24) },
    resolver: (id) => resolvers[id],
    ...(o.stats ? { stats: FAKE_STATS } : {}),
  };
  return f;
};
