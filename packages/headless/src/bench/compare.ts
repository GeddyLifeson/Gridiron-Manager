// G-97 baseline and gate (P6.5.1, P6.1.1 acceptance): a gated benchmark more than 10% slower than the
// stored baseline, after normalising by the reference workload, fails. A deliberate slowdown rewrites
// the baseline in the same change, with the reason in the change description (P6.5.1 edge case).
import type { BenchResult } from './suite.ts';
import type { MachineInfo } from './measure.ts';

export const REGRESSION_LIMIT = 0.10;

export interface Baseline {
  readonly note: string;
  readonly machine: MachineInfo;
  readonly referenceMs: number;
  /** Benchmark id -> median ms divided by the reference workload's median ms. */
  readonly normalised: Readonly<Record<string, number>>;
  /** Benchmark id -> result hash at the time of the baseline (a changed hash means changed results). */
  readonly hashes: Readonly<Record<string, string>>;
}

export interface GateRow {
  readonly id: string;
  readonly baseline: number | null;
  readonly now: number;
  /** now / baseline - 1. */
  readonly change: number | null;
  readonly pass: boolean;
  readonly reason: string;
}

export function normalise(results: readonly BenchResult[], referenceMs: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of results) if (r.gated && r.ms !== null) out[r.id] = r.ms / referenceMs;
  return out;
}

export function makeBaseline(results: readonly BenchResult[], referenceMs: number, machine: MachineInfo, note: string): Baseline {
  const hashes: Record<string, string> = {};
  for (const r of results) if (r.gated && r.hash) hashes[r.id] = r.hash;
  return { note, machine, referenceMs, normalised: normalise(results, referenceMs), hashes };
}

/** Compares a run with the baseline. Benchmarks with no baseline value pass and say so. */
export function gate(results: readonly BenchResult[], referenceMs: number, base: Baseline | null, limit = REGRESSION_LIMIT): GateRow[] {
  const now = normalise(results, referenceMs);
  return Object.keys(now).sort().map((id) => {
    const b = base?.normalised[id] ?? null;
    const n = now[id]!;
    if (b === null) return { id, baseline: null, now: n, change: null, pass: true, reason: 'no baseline yet' };
    const change = n / b - 1;
    const pass = change <= limit;
    return { id, baseline: b, now: n, change, pass, reason: pass ? 'within limit' : `${(change * 100).toFixed(1)}% slower than the baseline (limit ${(limit * 100).toFixed(0)}%)` };
  });
}

/** Result hashes that differ from the baseline's. Speed work must leave results alone (G-97). */
export function hashChanges(results: readonly BenchResult[], base: Baseline | null): string[] {
  if (!base) return [];
  return results.filter((r) => r.gated && r.hash && base.hashes[r.id] && base.hashes[r.id] !== r.hash).map((r) => `${r.id}: ${base.hashes[r.id]} -> ${r.hash}`);
}
