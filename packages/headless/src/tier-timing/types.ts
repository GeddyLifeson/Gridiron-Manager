// X13.3.1 timed measurement runner: the types. The protocol's logic (what may be thinned, when three
// numbers agree, which configuration ships) is G-82's, in @gm/world `tiers`. This tool takes it as a
// port, the way the long-run harness takes the loop, because @gm/world's entry point does not export
// it yet. The shapes below are the parts of G-82's types this runner touches, and no more.
import type { Json } from '../week-pool/job-module.ts';

export interface TierConfig { readonly id: string; readonly thinned: readonly string[] }
/** X13.3.1 rule 4: the harness timer, an operating-system measurement of the same run, and a second cold start. */
export interface Triple { readonly harness: number; readonly os: number; readonly second: number }
export type Budgets = Readonly<Record<string, number | undefined>>;

/** G-82's `tiers` module, as far as this runner calls it. `R` is its TierReport, `C` its ShippingChoice. */
export interface TiersPort<R, C> {
  readonly METRICS: readonly string[];
  configLadder(): TierConfig[];
  configProblems(c: TierConfig): string[];
  buildReport(input: { config: TierConfig; buildHash: string; machine: string; scale: Readonly<Record<string, number>>; triples: Readonly<Record<string, Triple>> }): R;
  reportProblems(r: R, budgets: Budgets): string[];
  chooseShipping(reports: readonly R[], budgets: Budgets): C;
  diffReports(before: R, after: R): unknown[];
}

/**
 * A workload is a module that exports `createWorkload(options)`. Each measurement runs it in a fresh
 * process (a cold start), so a number never benefits from an earlier run's warm code or memory.
 */
export interface Workload {
  /** World scale this workload runs at (games, people, teams), recorded with the report. */
  readonly scale: Readonly<Record<string, number>>;
  /** True when the workload really records less under this thinning step. A step it cannot apply is never measured as if it had been. */
  supports(step: string): boolean;
  /** Set-up that is not part of the measured work (loading rule sets, starting worker threads). */
  prepare?(config: TierConfig): void | Promise<void>;
  /** The measured work. Synchronous. May return a measured quantity that is not a time (a size in MB): the harness's own count and the operating system's. */
  run(config: TierConfig): void | { readonly harness: number; readonly os: number };
  close?(): void | Promise<void>;
}
export type CreateWorkload = (options: Json) => Workload | Promise<Workload>;

export interface WorkloadPlan {
  readonly id: string;
  readonly module: string;
  readonly options: Json;
  /** Which report numbers one run of this workload feeds. */
  readonly feeds: { readonly timeMs?: string; readonly peakMemoryMb?: string; readonly value?: string };
}

/** What one cold-start run reports. */
export type ChildSample =
  | { readonly ok: true; readonly unsupported: readonly string[]; readonly scale: Readonly<Record<string, number>>;
      /** Monotonic harness timer around `run` (performance.now). */
      readonly harnessMs: number;
      /** The operating system's wall clock around the same run (Date.now reads the system clock). */
      readonly osMs: number;
      /** Processor time the operating system charged the process during the run, user plus system, all threads. */
      readonly cpuMs: number;
      /** Highest resident memory the harness saw at its checkpoints, and the operating system's own peak for the process. */
      readonly peakRssHarnessMb: number; readonly peakRssOsMb: number;
      readonly value: { readonly harness: number; readonly os: number } | null }
  | { readonly ok: false; readonly error: string };
