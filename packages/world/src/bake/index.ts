// The master history bake (Marlon 2026-11-26): data gathered from the full 1869-to-today master data run,
// shipped read-only with the game. A player's own history or rerun never changes it.
export { BAKE_FORMAT_VERSION, MASTER_RUN_KIND, bakeDigest, signBake, type BakedHistory, type BakedRun, type BakedSeason, type BakedSource, type ParityDecade, type Quantiles, type UnsignedBake } from './format.ts';
export { RUN_FORMAT_VERSION, extractBake, extractRun, runProblems, quantiles, fitTiming, parityOf, type RunFiles, type RunProgressRow, type ExtractOptions } from './extract.ts';
export { loadBakedHistory, estimateHistorySeconds, shapeAt, parityBounds, type EstimateInput, type HistoryEstimate, type LeagueShape } from './load.ts';
export { bakedHistory } from './shipped.ts';
