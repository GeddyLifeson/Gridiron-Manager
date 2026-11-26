// The statistics module's surface (WP-07): the contract's `StatsModule`, bound to the field geometry
// and the parameter table of one game. All three functions are pure functions of play records.
import { Contract } from '@gm/engine-core';
import { PARAMS, paramTableOf } from './params.ts';
import { credits } from './credits.ts';
import { playByPlay } from './play-by-play.ts';
import { summary, type SummaryFinal } from './summary.ts';
import type { StatsDeps } from './facts.ts';

export interface StatsModuleInput {
  /** Built from the rule set's `field.*` keys by engine-core. The module holds no field dimension. */
  readonly geometry: Contract.FieldGeometry;
  /** The merged parameter table. Left out, the module's own parameter file is used. */
  readonly params?: Contract.ParamTable;
}

export interface BoundStatsModule extends Contract.StatsModule {
  readonly deps: StatsDeps;
  summary(records: readonly Contract.PlayRecord[], drives: readonly Contract.DriveRecord[], final: SummaryFinal): Contract.GameSummary;
}

export function createStatsModule(input: StatsModuleInput): BoundStatsModule {
  const deps: StatsDeps = { geometry: input.geometry, params: input.params ?? paramTableOf(PARAMS) };
  return {
    deps,
    credits: (record) => credits(record, deps),
    playByPlay: (record, next) => playByPlay(record, next, deps),
    summary: (records, drives, final) => summary(records, drives, final, deps),
  };
}
