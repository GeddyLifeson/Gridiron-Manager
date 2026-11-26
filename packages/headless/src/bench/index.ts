// G-97 benchmark suite (P6.5.1). The integrator re-exports it from the package entry point.
export { runSuite, NOT_YET, COUNTS, TIERS, type BenchResult, type BenchStatus, type SuiteOptions, type Tier } from './suite.ts';
export { gate, hashChanges, makeBaseline, normalise, REGRESSION_LIMIT, type Baseline, type GateRow } from './compare.ts';
export { machineInfo, median, profiled, referenceWorkloadMs, summariseProfile, timeRepeats, type MachineInfo, type ProfileLine } from './measure.ts';
export { table, readBaseline, BASELINE_FILE } from './cli.ts';
