// Play test bench (G-90; O3.1.4, G1.6.2). The integrator re-exports this file from the package entry
// as the namespace `playBench`. The defensive call designer (G-91) uses the same entry with a defensive subject.
export { PARAMS, benchParam } from './params.ts';
export {
  runBench, benchInput, summarise,
  type BenchSide, type BenchContent, type BenchRequest, type BenchDeps, type BenchReport, type BenchBlock, type RunSummary, type RunOutcome, type Rate, type MeanCi,
} from './bench.ts';
