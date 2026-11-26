// X13.3.1 the measurement protocol, timed (G-97 on G-82). Walks G-82's ladder: the baseline first
// (rule 1), then one more thinning step at a time (rule 2), stopping at the first configuration inside
// every budget (rule 3). Every number is taken three ways (rule 4): the harness timer, an
// operating-system measurement of the same run, and a second cold start. G-82 decides whether the
// three agree and which configuration ships; nothing here judges a number.
//
// A thinning step no workload can apply yet stops the ladder there and is reported. It is never
// measured as if it had been applied, and nothing but recording is ever thinned (A3.1.1 row 20).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Budgets, ChildSample, TierConfig, TiersPort, Triple, WorkloadPlan } from './types.ts';

const CHILD = fileURLToPath(new URL('./child.ts', import.meta.url));

/** Runs one workload once in a fresh process. */
export function coldStart(plan: WorkloadPlan, config: TierConfig): ChildSample {
  const run = spawnSync(process.execPath, ['--import', 'tsx', CHILD, JSON.stringify({ module: plan.module, options: plan.options, config })], { encoding: 'utf8', maxBuffer: 1 << 24 });
  const line = (run.stdout ?? '').trim().split('\n').pop() ?? '';
  try { return JSON.parse(line) as ChildSample; }
  catch { return { ok: false, error: `workload ${plan.id}: no answer (exit ${run.status}): ${run.stderr ?? ''}` }; }
}

export interface ProtocolInput<R, C> {
  readonly tiers: TiersPort<R, C>;
  readonly workloads: readonly WorkloadPlan[];
  /** P6 owns the budgets; the caller passes the rows that apply, keyed by metric. */
  readonly budgets: Budgets;
  readonly buildHash: string;
  /** The machine the run was on, as the report should name it (P6.2.1). */
  readonly machine: string;
  /** The last stored reports, by configuration id, for the diff the acceptance asks for. */
  readonly previous?: Readonly<Record<string, R>>;
  /** Test seam. Default: a fresh process per run. */
  readonly sample?: (plan: WorkloadPlan, config: TierConfig) => ChildSample;
}

export interface MeasuredConfig<R> {
  readonly report: R;
  readonly problems: readonly string[];
  /** Raw first and second cold start of every workload, kept so the report can be audited. */
  readonly samples: Readonly<Record<string, { readonly first: ChildSample; readonly second: ChildSample }>>;
  readonly diff: unknown[] | null;
}

export interface ProtocolResult<R, C> {
  readonly buildHash: string;
  readonly machine: string;
  readonly budgets: Budgets;
  readonly configs: readonly MeasuredConfig<R>[];
  readonly choice: C;
  /** Metrics of the report with no workload bound yet, each with the reason. */
  readonly notMeasured: readonly { readonly metric: string; readonly reason: string }[];
  /** Why the ladder stopped where it did. */
  readonly stopped: { readonly at: string; readonly reason: 'inside_every_budget' | 'ladder_end' | 'step_not_supported'; readonly detail: string };
}

export function runProtocol<R, C>(input: ProtocolInput<R, C>): ProtocolResult<R, C> {
  const { tiers, workloads, budgets } = input;
  const sample = input.sample ?? coldStart;
  if (workloads.length === 0) throw new Error('tier timing: no workload given, so nothing would be measured');
  const fed = new Map<string, string>();
  for (const w of workloads) for (const metric of Object.values(w.feeds)) {
    if (metric === undefined) continue;
    if (!tiers.METRICS.includes(metric)) throw new Error(`tier timing: workload ${w.id} feeds ${metric}, which is not a report metric`);
    if (fed.has(metric)) throw new Error(`tier timing: ${metric} is fed by both ${fed.get(metric)!} and ${w.id}`);
    fed.set(metric, w.id);
  }
  const configs: MeasuredConfig<R>[] = [];
  const ladder = tiers.configLadder();
  let stopped: ProtocolResult<R, C>['stopped'] = { at: ladder[ladder.length - 1]?.id ?? '', reason: 'ladder_end', detail: 'every configuration of the ladder was measured' };

  ladder: for (const config of ladder) {
    const bad = tiers.configProblems(config);
    if (bad.length > 0) throw new Error(`tier timing: ${bad.join('; ')}`);
    const triples: Record<string, Triple> = {};
    const scale: Record<string, number> = {};
    const samples: Record<string, { first: ChildSample; second: ChildSample }> = {};
    for (const plan of workloads) {
      const first = sample(plan, config);
      if (!first.ok) throw new Error(`tier timing: workload ${plan.id} failed on ${config.id}: ${first.error}`);
      if (first.unsupported.length > 0) {
        if (configs.length === 0) throw new Error(`tier timing: workload ${plan.id} cannot run the baseline`);
        stopped = { at: config.id, reason: 'step_not_supported', detail: `workload ${plan.id} cannot apply ${first.unsupported.join(', ')} yet, so ${config.id} was not measured` };
        break ladder;
      }
      const second = sample(plan, config);
      if (!second.ok) throw new Error(`tier timing: workload ${plan.id} failed on its second cold start of ${config.id}: ${second.error}`);
      if (second.unsupported.length > 0) throw new Error(`tier timing: workload ${plan.id} changed its answer about ${config.id} between two runs`);
      samples[plan.id] = { first, second };
      for (const [k, v] of Object.entries(first.scale)) {
        if (scale[k] !== undefined && scale[k] !== v) throw new Error(`tier timing: workloads disagree on scale ${k} (${scale[k]} and ${v})`);
        scale[k] = v;
      }
      const f = plan.feeds;
      if (f.timeMs) triples[f.timeMs] = { harness: first.harnessMs, os: first.osMs, second: second.harnessMs };
      if (f.peakMemoryMb) triples[f.peakMemoryMb] = { harness: first.peakRssHarnessMb, os: first.peakRssOsMb, second: second.peakRssOsMb };
      if (f.value) {
        if (!first.value || !second.value) throw new Error(`tier timing: workload ${plan.id} feeds ${f.value} but returned no value`);
        triples[f.value] = { harness: first.value.harness, os: first.value.os, second: second.value.harness };
      }
    }
    const report = tiers.buildReport({ config, buildHash: input.buildHash, machine: input.machine, scale, triples });
    const problems = tiers.reportProblems(report, budgets);
    const before = input.previous?.[config.id];
    configs.push({ report, problems, samples, diff: before === undefined ? null : tiers.diffReports(before, report) });
    if (problems.length === 0) { stopped = { at: config.id, reason: 'inside_every_budget', detail: `${config.id} is inside every budget given (X13.3.1 rule 3)` }; break; }
  }

  const notMeasured = tiers.METRICS.filter((m) => !fed.has(m)).map((metric) => ({ metric, reason: 'no workload is bound for this number yet' }));
  return {
    buildHash: input.buildHash, machine: input.machine, budgets, configs,
    choice: tiers.chooseShipping(configs.map((c) => c.report), budgets), notMeasured, stopped,
  };
}
