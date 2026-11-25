// Public interface of app-services. app-ui may import only from this entry point (P1.2.2).
export * from './platform.ts';
export * from './world-service.ts';
export { runGolden, compareGolden, type GoldenReport } from '@gm/engine-game';
export { goldenInputs } from './golden-inputs.ts';
export type { WorldSummaryModel, SaveHeader } from '@gm/schema';
