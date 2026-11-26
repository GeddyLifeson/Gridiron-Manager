// The default game factory: the real phase 1 game (real-game/index.ts) with the resolver and parameter
// overrides of a variant. Placeholder rosters until G-17 feeds generated players; no real people.
import { field } from '@gm/engine-core';
import { flow, stats } from '@gm/engine-game';
import { createRealGame, type RealGame } from '../real-game/index.ts';
import type { CreateGameFactory, EngineVariant, GameFactory, Json } from './spec.ts';

/** Module URL of this factory, for a `FactoryRef`. */
export const REAL_FACTORY_MODULE = new URL('./real-factory.ts', import.meta.url).href;

export interface RealFactoryOptions { readonly ruleSetId: string; readonly iss?: number }

export function realFactoryRef(opts: RealFactoryOptions): { module: string; options: Json } {
  return { module: REAL_FACTORY_MODULE, options: { ruleSetId: opts.ruleSetId, ...(opts.iss === undefined ? {} : { iss: opts.iss }) } };
}

const overridesKey = (v: EngineVariant): string => JSON.stringify(Object.entries(v.paramOverrides ?? {}).sort(([a], [b]) => (a < b ? -1 : 1)));

export const createGameFactory: CreateGameFactory = (raw) => {
  const o = raw as unknown as RealFactoryOptions;
  if (!o || typeof o.ruleSetId !== 'string') throw new Error('real factory: options need ruleSetId');
  const games = new Map<string, RealGame>();
  const gameFor = (v: EngineVariant): RealGame => {
    const k = overridesKey(v);
    let g = games.get(k);
    if (!g) { g = createRealGame(o.ruleSetId, { iss: o.iss, paramOverrides: v.paramOverrides }); games.set(k, g); }
    return g;
  };
  const base = gameFor({ label: 'base', resolverId: 'reference' });
  const statsModule = stats.createStatsModule({ geometry: field.fieldGeometry(base.rules), params: base.params });
  const factory: GameFactory = {
    ruleSetId: o.ruleSetId,
    input: (i, seedHex) => base.input(i, seedHex),
    deps: (input, variant, resolver) => ({ ...gameFor(variant).deps(input), resolver }),
    flow: { simulateGame: (input, deps) => flow.simulateGame(input, deps) },
    stats: statsModule,
  };
  return factory;
};
