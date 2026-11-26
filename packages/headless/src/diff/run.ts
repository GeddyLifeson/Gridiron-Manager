// WP-24 diff runner (Q1.3.2). Runs the same seeds under two builds (a build is a resolver plus parameter
// overrides) and reports:
//   - per game: whether the event logs match and the first play that changed;
//   - per play, isolated: every play input of the base run is replayed under the variant build, so one
//     changed play does not make every later play "changed". Each changed play gets its first tick of
//     divergence and the contest responsible;
//   - per target row: the distribution shift, measured the way calibration measures (Q2.1.1).
// Same resolver, same seeds, same parameters: the report must show zero changes (J13 determinism).
import type { GameSummary, PlayByPlayRow, PlayInput, PlayResult, Resolver } from '@gm/schema';
import { loadFactory, runOneGame, variantMeta } from '../batch/run.ts';
import { resolverFor } from '../batch/resolvers.ts';
import type { EngineVariant, FactoryRef } from '../batch/spec.ts';
import { playDivergence, type ExplainContest, type PlayDivergence } from './divergence.ts';
import type { CalibrationSample } from '../calibration/measures.ts';
import { distributionShift, type RowShift } from './distribution.ts';
import { diffParam } from './params.ts';

export interface DiffSpec {
  readonly factory: FactoryRef;
  readonly base: EngineVariant;
  readonly variant: EngineVariant;
  readonly masterSeedHex: string;
  readonly games: number;
  /** Plays replayed in isolation; default `diff.playSample` (Q1.3.2: 2,000). */
  readonly playSample?: number;
  /** Measure filters for the distribution comparison (target rows' `filter`). Empty: no comparison. */
  readonly filters?: readonly string[];
  /** Reads the contest at a tick from an explain record (tick engine, Q2.6.1). */
  readonly explainContest?: ExplainContest;
}

export interface ChangedPlay extends PlayDivergence {
  readonly gameIndex: number;
  readonly gameId: number;
  readonly playNumber: number;
  readonly playKind: string;
  /** The snapping call's kind (run, dropback_pass, punt ...), for "which plays changed" questions. */
  readonly call: string;
}

export interface GameDiff {
  readonly index: number;
  readonly seedHex: string;
  readonly sameEvents: boolean;
  /** 1-based index of the first play record whose truth differs, or null. */
  readonly firstChangedPlay: number | null;
  readonly baseScore: readonly [number, number];
  readonly variantScore: readonly [number, number];
  readonly basePlays: number;
  readonly variantPlays: number;
}

export interface BuildInfo { readonly variant: EngineVariant; readonly resolverVersion: string; readonly paramVersion: string }

export interface DiffReport {
  readonly ruleSetId: string;
  readonly masterSeedHex: string;
  readonly base: BuildInfo;
  readonly variant: BuildInfo;
  readonly games: readonly GameDiff[];
  readonly gamesChanged: number;
  readonly plays: {
    readonly compared: number;
    readonly changed: number;
    readonly share: number;
    /** Base plays whose replay with the same input gave a different result: a determinism fault. */
    readonly impure: number;
    readonly byCall: Readonly<Record<string, { readonly compared: number; readonly changed: number }>>;
    readonly byContest: Readonly<Record<string, number>>;
    readonly list: readonly ChangedPlay[];
  };
  readonly sameResolver: boolean;
  readonly streamOrderSuspected: boolean;
  /** False when play-by-play differences say nothing (two resolvers, stream order change): read `distribution`. */
  readonly playByPlayMeaningful: boolean;
  readonly distribution: readonly RowShift[] | null;
  readonly notes: readonly string[];
}

function callOf(input: PlayInput): string {
  const s = input.calls.snapping as { unit?: string; kind?: string; kickKind?: string };
  return s.kind ?? s.kickKind ?? s.unit ?? 'unknown';
}

const full = (input: PlayInput): PlayInput => ({ ...input, options: { ...input.options, detail: 'full' } });

function recorder(inner: Resolver, sink: (input: PlayInput, result: PlayResult) => void): Resolver {
  return {
    id: inner.id, version: inner.version, mayProduceSavedResults: inner.mayProduceSavedResults,
    simulatePlay(input) { const r = inner.simulatePlay(input); sink(input, r); return r; },
  };
}

export async function runDiff(spec: DiffSpec): Promise<DiffReport> {
  const factory = await loadFactory(spec.factory);
  const baseRes = resolverFor(spec.base.resolverId, factory);
  const varRes = resolverFor(spec.variant.resolverId, factory);
  const sample = spec.playSample ?? diffParam('diff.playSample');
  const filters = spec.filters ?? [];
  const keepRows = filters.length > 0 && !!factory.stats;

  const games: GameDiff[] = [];
  const list: ChangedPlay[] = [];
  const byCall: Record<string, { compared: number; changed: number }> = {};
  const byContest: Record<string, number> = {};
  const baseSample = { summaries: [] as GameSummary[], plays: [] as PlayByPlayRow[] };
  const varSample = { summaries: [] as GameSummary[], plays: [] as PlayByPlayRow[] };
  let compared = 0, impure = 0;

  for (let i = 0; i < spec.games; i++) {
    const captured: { input: PlayInput; result: PlayResult }[] = [];
    const room = () => compared + captured.length < sample;
    const bd = runOneGame(factory, spec.base, spec.masterSeedHex, i, {
      keepRows, wrapResolver: (r) => recorder(r, (input, result) => { if (room()) captured.push({ input, result }); }),
    });
    const vd = runOneGame(factory, spec.variant, spec.masterSeedHex, i, { keepRows });
    const bo = bd.run.outcome, vo = vd.run.outcome;
    let first: number | null = null;
    for (let k = 0; k < Math.max(bo.truthHashes.length, vo.truthHashes.length); k++) {
      if (bo.truthHashes[k] !== vo.truthHashes[k]) { first = k + 1; break; }
    }
    games.push({
      index: i, seedHex: bo.seedHex, sameEvents: bo.eventsHash === vo.eventsHash, firstChangedPlay: first,
      baseScore: bo.score, variantScore: vo.score, basePlays: bo.plays, variantPlays: vo.plays,
    });
    if (keepRows) {
      baseSample.plays.push(...(bd.run.rows ?? [])); if (bd.run.summary) baseSample.summaries.push(bd.run.summary);
      varSample.plays.push(...(vd.run.rows ?? [])); if (vd.run.summary) varSample.summaries.push(vd.run.summary);
    }

    for (const { input, result } of captured) {
      compared++;
      const call = callOf(input);
      const c = (byCall[call] ??= { compared: 0, changed: 0 });
      c.compared++;
      if (playDivergence(result, baseRes.simulatePlay(input)) !== null) impure++;
      const vInput: PlayInput = { ...input, rules: vd.deps.rules, params: vd.deps.params };
      const quick = playDivergence(result, varRes.simulatePlay(vInput));
      if (!quick) continue;
      // Re-run the changed play at full detail for trajectories and the explain record.
      const div = playDivergence(baseRes.simulatePlay(full(input)), varRes.simulatePlay(full(vInput)), spec.explainContest) ?? quick;
      c.changed++;
      const key = div.contest ?? '(none found)';
      byContest[key] = (byContest[key] ?? 0) + 1;
      list.push({ ...div, gameIndex: i, gameId: input.situation.gameId, playNumber: input.situation.playNumber, playKind: input.situation.playKind, call });
    }
  }

  const changed = list.length;
  const share = compared ? changed / compared : 0;
  const sameResolver = baseRes.id === varRes.id && baseRes.version === varRes.version;
  const streamOrderSuspected = sameResolver && compared > 0 && share >= diffParam('diff.streamOrderShare');
  const notes: string[] = [];
  if (!sameResolver) notes.push(`different resolvers (${baseRes.id}@${baseRes.version} and ${varRes.id}@${varRes.version}): nearly every play is expected to differ; read the distribution comparison`);
  if (streamOrderSuspected) notes.push(`${(share * 100).toFixed(1)}% of plays changed: the random stream order probably changed (Q1.3.2 edge case); falling back to the distribution comparison`);
  if (impure) notes.push(`${impure} base plays gave a different result when replayed with the same input: determinism fault (J13), fix before reading anything else`);
  if (compared < sample) notes.push(`compared ${compared} plays, fewer than the ${sample}-play sample: run more games for the full sample`);
  let distribution: RowShift[] | null = null;
  if (filters.length && !factory.stats) notes.push('the factory has no statistics module: no distribution comparison');
  else if (filters.length) distribution = distributionShift([baseSample] as CalibrationSample[], [varSample] as CalibrationSample[], filters, diffParam('diff.shiftZ'));

  const bm = variantMeta(factory, spec.base), vm = variantMeta(factory, spec.variant);
  return {
    ruleSetId: factory.ruleSetId, masterSeedHex: spec.masterSeedHex,
    base: { variant: spec.base, ...bm }, variant: { variant: spec.variant, ...vm },
    games, gamesChanged: games.filter((g) => !g.sameEvents).length,
    plays: { compared, changed, share, impure, byCall, byContest, list },
    sameResolver, streamOrderSuspected, playByPlayMeaningful: sameResolver && !streamOrderSuspected,
    distribution, notes,
  };
}
