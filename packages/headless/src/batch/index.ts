// WP-24 fast simulation: worker batch runs (J14.6.1, J14.2.1, J13.3.2). The integrator re-exports this module.
export type {
  Json, EngineVariant, GameFactory, CreateGameFactory, FactoryRef, BatchRunSpec, GameOutcome, GameRun, BatchReport,
} from './spec.ts';
export { hashOf, truthHash, loadFactory, runOneGame, runIndexes, assemble, variantMeta, runBatchOnWorkers } from './run.ts';
export type { GameRunDetail } from './run.ts';
export { resolverFor, availableResolvers } from './resolvers.ts';
export { REAL_FACTORY_MODULE, realFactoryRef } from './real-factory.ts';
export type { RealFactoryOptions } from './real-factory.ts';
export { PARAMS } from './params.ts';
