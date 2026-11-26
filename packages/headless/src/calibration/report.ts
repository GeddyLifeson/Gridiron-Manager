// The calibration report (J15.10.1, Q1.7.2). One TargetResult per target row. PROVISIONAL is printed
// for every row that is not Verified (Q6.3.1); MISSING SOURCE for a row with no fact row; NOT MEASURABLE
// for a row whose measure the sample cannot support yet. The gate looks only at `certify` rows: it passes
// when there is at least one and every one passes. A run with no certify rows cannot pass the gate,
// so no gate is ever called passed on provisional rows alone.
// The text output is byte-identical for the same inputs (J15.10.1 acceptance): fixed order, fixed
// number formatting, no clock.
import type { CalibrationTarget, TargetResult, FactStatus } from '@gm/schema';
import { parseMeasure, prepare, observe, mean, sampleSd, quantile, type CalibrationSample, type PreparedSample } from './measures.ts';
import { compareScalar, compareQuantiles, compareOrdering } from './compare.ts';
import type { LoadedTargets } from './targets.ts';

export type RowState = 'measured' | 'missing_source' | 'not_measurable' | 'no_events';

export interface ReportRow extends TargetResult {
  readonly state: RowState;
  readonly leaf: string;
  /** Simulated events behind the value (observations), or seed groups for ordering rows. */
  readonly simEvents: number;
}

export interface RunInfo {
  /** Engine build id, parameter file hash, resolver id, seeds (J15.10.1 first section). */
  readonly build: string;
  readonly paramsHash: string;
  readonly resolverId: string;
  readonly seeds: string;
  readonly games: number;
  readonly seedGroups: number;
}

export type GateVerdict = 'pass' | 'fail' | 'no_certify_rows';

export interface CalibrationReport {
  readonly ruleSetId: string;
  readonly targetsVersion: string;
  readonly run: RunInfo;
  readonly rows: readonly ReportRow[];
  readonly gate: GateVerdict;
  readonly counts: Readonly<Record<'rows' | 'certify' | 'certifyPassed' | 'provisional' | 'missingSource' | 'notMeasurable' | 'measured' | 'passed' | 'failed', number>>;
  readonly loaderProblems: readonly string[];
}

function scalarFor(t: CalibrationTarget, obs: readonly number[]): number | null {
  if (t.kind === 'sd') return sampleSd(obs);
  return mean(obs);
}

function evaluateRow(t: CalibrationTarget, status: FactStatus | null, pooled: PreparedSample, groups: readonly PreparedSample[]): ReportRow {
  const base = { id: t.id, leaf: t.leaf, real: t.value, status, tier: t.tier, provisional: status !== 'Verified' };
  const none = (state: RowState, simEvents = 0): ReportRow => ({ ...base, simulated: null, signedError: null, toleranceUsed: null, pass: null, state, simEvents });
  if (t.factId === null && t.kind !== 'ordering') return none('missing_source');
  const m = parseMeasure(t.filter);
  if (m.name === 'none') return none('not_measurable');
  if (t.kind === 'ordering') {
    const names = (t.value as string[]).map(parseMeasure);
    let held = 0;
    for (const g of groups) {
      const vals = names.map((n) => { const o = observe(n, g); return o === null ? null : mean(o); });
      if (vals.some((v) => v === null)) continue;
      let ok = true;
      for (let i = 1; i < vals.length; i++) if (!(vals[i]! > vals[i - 1]!)) ok = false;
      if (ok) held++;
    }
    const pooledVals = names.map((n) => { const o = observe(n, pooled); return o === null ? Number.NaN : (mean(o) ?? Number.NaN); });
    const c = compareOrdering(t, held, groups.length);
    return { ...base, simulated: pooledVals, signedError: c.signedError, toleranceUsed: c.toleranceUsed, pass: c.pass, state: 'measured', simEvents: groups.length };
  }
  const obs = observe(m, pooled);
  if (obs === null) return none('not_measurable');
  if (t.kind === 'quantiles') {
    if (obs.length === 0 || m.quantiles === null) return none('no_events');
    const sorted = [...obs].sort((a, b) => a - b);
    const q = m.quantiles.map((p) => quantile(sorted, p)!);
    const c = compareQuantiles(t, q);
    return { ...base, simulated: q, signedError: c.signedError, toleranceUsed: c.toleranceUsed, pass: c.pass, state: 'measured', simEvents: obs.length };
  }
  const v = scalarFor(t, obs);
  if (v === null) return none('no_events', obs.length);
  const c = compareScalar(t, v, obs.length);
  return { ...base, simulated: v, signedError: c.signedError, toleranceUsed: c.toleranceUsed, pass: c.pass, state: 'measured', simEvents: obs.length };
}

/**
 * Runs every target of a loaded file against a sample. `groups` are the seed groups of the run (ordering
 * rows, Q2.3.1); the pooled sample is their union. A loaded file with loader problems still produces a
 * report, but its gate is `fail`.
 */
export function buildReport(loaded: LoadedTargets, groups: readonly CalibrationSample[], run: RunInfo): CalibrationReport {
  const pooledSample: CalibrationSample = { summaries: groups.flatMap((g) => g.summaries), plays: groups.flatMap((g) => g.plays) };
  const pooled = prepare(pooledSample);
  const prepared = groups.map(prepare);
  const rows = loaded.file.targets.map((t) => evaluateRow(t, loaded.statusOf.get(t.id) ?? null, pooled, prepared));
  const certify = rows.filter((r) => r.tier === 'certify');
  const certifyPassed = certify.filter((r) => r.pass === true).length;
  const gate: GateVerdict = loaded.problems.length > 0 ? 'fail' : certify.length === 0 ? 'no_certify_rows' : certifyPassed === certify.length ? 'pass' : 'fail';
  const counts = {
    rows: rows.length,
    certify: certify.length,
    certifyPassed,
    provisional: rows.filter((r) => r.provisional).length,
    missingSource: rows.filter((r) => r.state === 'missing_source').length,
    notMeasurable: rows.filter((r) => r.state === 'not_measurable').length,
    measured: rows.filter((r) => r.state === 'measured').length,
    passed: rows.filter((r) => r.pass === true).length,
    failed: rows.filter((r) => r.pass === false).length,
  };
  return { ruleSetId: loaded.file.ruleSetId, targetsVersion: loaded.file.version, run, rows, gate, counts, loaderProblems: loaded.problems };
}

/** Fixed number formatting: up to six significant digits, no exponent for ordinary values. */
export function fmt(v: unknown): string {
  if (v === null || v === undefined) return '-';
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return 'n/a';
    if (!Number.isFinite(v)) return v > 0 ? 'inf' : '-inf';
    if (v === 0) return '0';
    return String(Number(v.toPrecision(6)));
  }
  if (Array.isArray(v)) return '[' + v.map(fmt).join(', ') + ']';
  return String(v);
}

function label(r: ReportRow): string {
  const parts: string[] = [];
  if (r.state === 'missing_source') parts.push('MISSING SOURCE');
  else if (r.state === 'not_measurable') parts.push('NOT MEASURABLE');
  else if (r.state === 'no_events') parts.push('NO EVENTS');
  else parts.push(r.pass ? 'PASS' : 'FAIL');
  if (r.provisional) parts.push('PROVISIONAL');
  return parts.join(' ');
}

/** The report as text (J15.10.1 sections that this harness owns). */
export function formatReport(rep: CalibrationReport): string {
  const L: string[] = [];
  L.push(`Calibration report: ${rep.ruleSetId} (targets version ${rep.targetsVersion})`);
  L.push(`Build ${rep.run.build}; parameters ${rep.run.paramsHash}; resolver ${rep.run.resolverId}; ${rep.run.games} games in ${rep.run.seedGroups} seed groups; seeds ${rep.run.seeds}`);
  const gateText = rep.gate === 'pass' ? 'PASS (every certify row passes)'
    : rep.gate === 'no_certify_rows' ? 'NOT PASSED: this rule set has no certify row (no Verified target), so nothing can certify it'
    : `FAIL (${rep.counts.certifyPassed} of ${rep.counts.certify} certify rows pass${rep.loaderProblems.length ? `; ${rep.loaderProblems.length} loader problems` : ''})`;
  L.push(`Gate: ${gateText}`);
  const c = rep.counts;
  L.push(`Rows ${c.rows}: measured ${c.measured} (pass ${c.passed}, fail ${c.failed}), not measurable ${c.notMeasurable}, missing source ${c.missingSource}; provisional ${c.provisional} of ${c.rows}. A pass on a provisional row is not a verified match.`);
  if (rep.loaderProblems.length) {
    L.push('', 'Loader problems:');
    for (const p of rep.loaderProblems) L.push(`  ${p}`);
  }
  L.push('', 'id | leaf | tier | status | real | simulated | signed error | tolerance | events | result');
  for (const r of rep.rows) {
    L.push([r.id, r.leaf, r.tier, r.status ?? 'none', fmt(r.real), fmt(r.simulated), fmt(r.signedError), fmt(r.toleranceUsed), String(r.simEvents), label(r)].join(' | '));
  }
  L.push('', 'Not Verified (owner is the leaf named):');
  for (const r of rep.rows) if (r.provisional) L.push(`  ${r.id} (${r.leaf}): ${r.status ?? 'no fact row'}`);
  return L.join('\n') + '\n';
}
