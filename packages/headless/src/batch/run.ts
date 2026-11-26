// WP-24 batch runner (J14.6.1, J14.2.1, J13.3.2). Runs a list of games for one engine variant, in this
// thread or on worker threads, and returns the outcomes in game-index order. Workers take indexes in a
// scrambled order on purpose: nothing in a result may depend on which worker ran a game or when.
import { Worker } from 'node:worker_threads';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isAbsolute } from 'node:path';
import type { GameDeps, GameInput, GameResult, PlayTruth, Resolver } from '@gm/schema';
import { canonicalBytes, hash64Hex } from '@gm/engine-core';
import { gameSeedHex } from '../calibration/batch.ts';
import { resolverFor } from './resolvers.ts';
import type {
  BatchReport, BatchRunSpec, CreateGameFactory, EngineVariant, FactoryRef, GameFactory, GameOutcome, GameRun,
} from './spec.ts';

/** 64-bit hash of a value's canonical bytes (P1.1.5 encoding). */
export function hashOf(v: unknown): string {
  return hash64Hex(canonicalBytes(v));
}

/** Hash of a play's truth with the resolver id and version left out, so two builds can be compared. */
export function truthHash(truth: PlayTruth): string {
  const { resolverId: _id, resolverVersion: _v, ...rest } = truth;
  return hashOf(rest);
}

const factoryCache = new Map<string, GameFactory>();

/** Imports a factory module and builds the factory. Cached per module and options. */
export async function loadFactory(ref: FactoryRef): Promise<GameFactory> {
  const key = `${ref.module}\u0000${JSON.stringify(ref.options)}`;
  const hit = factoryCache.get(key);
  if (hit) return hit;
  const url = ref.module.startsWith('file:') ? ref.module : isAbsolute(ref.module) ? pathToFileURL(ref.module).href : null;
  if (!url) throw new Error(`factory module ${ref.module}: give a file: URL or an absolute path`);
  const mod = (await import(url)) as { createGameFactory?: CreateGameFactory };
  if (typeof mod.createGameFactory !== 'function') throw new Error(`factory module ${ref.module} does not export createGameFactory`);
  const f = mod.createGameFactory(ref.options);
  factoryCache.set(key, f);
  return f;
}

export interface GameRunDetail {
  readonly run: GameRun;
  readonly input: GameInput;
  readonly deps: GameDeps;
  readonly result: GameResult;
}

/**
 * Runs one game of a batch in this thread. `wrapResolver` lets the diff runner record every play input
 * without the game flow knowing (the flow holds a `Resolver` and nothing more specific).
 */
export function runOneGame(
  factory: GameFactory, variant: EngineVariant, masterSeedHex: string, index: number,
  opts: { keepRows?: boolean; wrapResolver?: (r: Resolver) => Resolver } = {},
): GameRunDetail {
  const seedHex = gameSeedHex(masterSeedHex, index);
  const input = factory.input(index, seedHex);
  const base = resolverFor(variant.resolverId, factory);
  const deps = factory.deps(input, variant, opts.wrapResolver ? opts.wrapResolver(base) : base);
  const result = factory.flow.simulateGame(input, deps);
  const last = result.records[result.records.length - 1];
  const outcome: GameOutcome = {
    index, gameId: input.gameId, seedHex,
    score: [result.final.score[0], result.final.score[1]],
    plays: result.records.length,
    finalStateHash: last ? last.stateHash : '',
    eventsHash: hashOf(result.events),
    truthHashes: result.records.map((r) => truthHash(r.truth)),
  };
  let rows: GameRun['rows'] = null;
  let summary: GameRun['summary'] = null;
  if (opts.keepRows && factory.stats) {
    const stats = factory.stats;
    rows = result.records.map((rec, k) => stats.playByPlay(rec, result.records[k + 1] ?? null));
    const finalEvent = [...result.events].reverse().find((e) => e.type === 'game_final');
    const score = result.final.score;
    const tie = finalEvent && finalEvent.type === 'game_final' ? finalEvent.tie : score[0] === score[1];
    summary = stats.summary(result.records, result.drives, { score, tie, stateHash: outcome.finalStateHash, ruleSetId: input.ruleSetId, seedHex });
  }
  return { run: { outcome, rows, summary }, input, deps, result };
}

/** Runs the given indexes in this thread. Used by workers and by single-thread batches. */
export function runIndexes(factory: GameFactory, spec: Pick<BatchRunSpec, 'variant' | 'masterSeedHex' | 'seedGroups'>, indexes: readonly number[]): GameRun[] {
  const keepRows = (spec.seedGroups ?? 0) > 0;
  return indexes.map((i) => runOneGame(factory, spec.variant, spec.masterSeedHex, i, { keepRows }).run);
}

function indexesOf(spec: BatchRunSpec): number[] {
  if (spec.indexes) return [...spec.indexes];
  if (!Number.isInteger(spec.games) || spec.games < 0) throw new Error('batch: games must be a non-negative integer');
  return Array.from({ length: spec.games }, (_, i) => i);
}

/** Deterministic scramble of the work order (any permutation would do; results must not care). */
function scrambled(indexes: readonly number[]): number[] {
  return [...indexes].sort((a, b) => ((a * 7919) % 31) - ((b * 7919) % 31) || a - b);
}

const WORKER_URL = new URL('./worker.ts', import.meta.url);

function runOnWorker(spec: BatchRunSpec, indexes: readonly number[]): Promise<GameRun[]> {
  return new Promise<GameRun[]>((res, rej) => {
    const w = new Worker(fileURLToPath(WORKER_URL), { workerData: { spec, indexes }, execArgv: ['--import', 'tsx'] });
    let done = false;
    w.once('message', (m: { ok: true; runs: GameRun[] } | { ok: false; error: string }) => {
      done = true;
      if (m.ok) res(m.runs); else rej(new Error(`batch worker: ${m.error}`));
    });
    w.once('error', (e) => { done = true; rej(e); });
    w.once('exit', (code) => { if (!done) rej(new Error(`batch worker exited with code ${code} before answering`)); });
  });
}

/** Assembles worker output into a report: index order, one batch hash, calibration groups. */
export function assemble(spec: BatchRunSpec, runs: readonly GameRun[], meta: { resolverVersion: string; paramVersion: string; ruleSetId: string; workers: number }): BatchReport {
  const sorted = [...runs].sort((a, b) => a.outcome.index - b.outcome.index);
  for (let k = 1; k < sorted.length; k++) {
    if (sorted[k]!.outcome.index === sorted[k - 1]!.outcome.index) throw new Error(`batch: game ${sorted[k]!.outcome.index} ran twice`);
  }
  const g = spec.seedGroups ?? 0;
  let groups: BatchReport['groups'] = null;
  if (g > 0) {
    const gs = Array.from({ length: g }, () => ({ summaries: [] as NonNullable<GameRun['summary']>[], plays: [] as NonNullable<GameRun['rows']>[number][] }));
    sorted.forEach((r) => {
      if (!r.rows || !r.summary) throw new Error('batch: seed groups asked for but the factory has no statistics module');
      const grp = gs[r.outcome.index % g]!;
      grp.plays.push(...r.rows);
      grp.summaries.push(r.summary);
    });
    groups = gs;
  }
  const outcomes = sorted.map((r) => r.outcome);
  return {
    ruleSetId: meta.ruleSetId, variant: spec.variant, resolverVersion: meta.resolverVersion, paramVersion: meta.paramVersion,
    masterSeedHex: spec.masterSeedHex, outcomes, batchHash: hashOf(outcomes), groups, workers: meta.workers,
  };
}

/** Engine build labels recorded with every batch (J14.6.1: build, parameter file, seeds). */
export function variantMeta(factory: GameFactory, variant: EngineVariant): { resolverVersion: string; paramVersion: string } {
  const resolver = resolverFor(variant.resolverId, factory);
  const probe = factory.input(0, '0000000000000000');
  const deps = factory.deps(probe, variant, resolver);
  return { resolverVersion: `${resolver.id}@${resolver.version}`, paramVersion: deps.params.version };
}

/**
 * Runs a batch on `workers` threads (1 means this thread). The report is identical for every worker
 * count: that is the WP-24 acceptance check and J13.3.2.
 */
export async function runBatchOnWorkers(spec: BatchRunSpec, workers = 1): Promise<BatchReport> {
  const factory = await loadFactory(spec.factory);
  const meta = { ...variantMeta(factory, spec.variant), ruleSetId: factory.ruleSetId };
  const indexes = indexesOf(spec);
  const n = Math.max(1, Math.min(Math.floor(workers), indexes.length || 1));
  if (n === 1) return assemble(spec, runIndexes(factory, spec, indexes), { ...meta, workers: 1 });
  const chunks: number[][] = Array.from({ length: n }, () => []);
  scrambled(indexes).forEach((idx, k) => chunks[k % n]!.push(idx));
  const parts = await Promise.all(chunks.map((c) => runOnWorker(spec, c)));
  // Arrival order is whatever the workers produced; assemble applies index order.
  return assemble(spec, parts.reverse().flat(), { ...meta, workers: n });
}
