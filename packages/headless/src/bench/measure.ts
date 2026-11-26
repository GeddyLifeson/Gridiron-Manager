// G-97 measuring tools (P6.5.1): medians, the reference workload that normalises timings across
// machines, and a CPU profile recorded with every benchmark run (P6.3.1 "a profile of where time goes").
import { Session } from 'node:inspector/promises';
import { writeFile } from 'node:fs/promises';
import { cpus, totalmem } from 'node:os';
import { murmur3x86_128 } from '@gm/engine-core';

export function median(xs: readonly number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Runs `fn` `repeats` times after one warm-up run and returns each run's wall time in ms. */
export function timeRepeats<T>(repeats: number, fn: () => T, check?: (out: T, run: number) => void): number[] {
  check?.(fn(), -1);
  const out: number[] = [];
  for (let r = 0; r < repeats; r++) {
    const t0 = performance.now();
    const v = fn();
    out.push(performance.now() - t0);
    check?.(v, r);
  }
  return out;
}

/**
 * The reference workload (P6.5.1): a fixed mix of integer hashing, float math, small-object churn and
 * sorting, roughly the mix of the engine. Its median time on a machine divides every benchmark, so a
 * slower shared runner does not read as a slower engine. The work never changes; if it must, the
 * stored baseline is rewritten in the same change.
 */
export function referenceWorkloadOnce(): number {
  const buf = new Uint8Array(1 << 18);
  for (let i = 0; i < buf.length; i++) buf[i] = (i * 2654435761) >>> 24;
  let acc = 0;
  for (let k = 0; k < 24; k++) acc ^= murmur3x86_128(buf, k)[0];
  let x = 0.5;
  for (let i = 0; i < 400_000; i++) x = Math.sqrt(x * x + 1.000001) - Math.sin(x) * 0.5;
  const objs: { a: number; b: string }[] = [];
  for (let i = 0; i < 60_000; i++) objs.push({ a: (i * 7919) % 1000, b: `k${i % 97}` });
  objs.sort((p, q) => p.a - q.a || (p.b < q.b ? -1 : p.b > q.b ? 1 : 0));
  return acc ^ Math.floor(x * 1000) ^ objs[123]!.a;
}

export function referenceWorkloadMs(repeats = 7): number {
  return median(timeRepeats(repeats, referenceWorkloadOnce));
}

export interface MachineInfo {
  readonly cpu: string;
  readonly cores: number;
  readonly memGb: number;
  readonly node: string;
  readonly platform: string;
}

export function machineInfo(): MachineInfo {
  const c = cpus();
  return { cpu: c[0]?.model ?? 'unknown', cores: c.length, memGb: Math.round(totalmem() / 2 ** 30), node: process.version, platform: `${process.platform}-${process.arch}` };
}

export interface ProfileLine { readonly selfPct: number; readonly fn: string; readonly where: string }

interface CpuProfile {
  nodes: { id: number; callFrame: { functionName: string; url: string; lineNumber: number } }[];
  samples: number[];
  timeDeltas: number[];
}

/** Self time by function, largest first. */
export function summariseProfile(p: CpuProfile, top = 15): ProfileLine[] {
  const dt = new Map<number, number>();
  p.samples.forEach((s, i) => dt.set(s, (dt.get(s) ?? 0) + (p.timeDeltas[i] ?? 0)));
  const self = new Map<string, number>();
  let total = 0;
  for (const n of p.nodes) {
    const t = dt.get(n.id) ?? 0;
    const cf = n.callFrame;
    // Idle time and time spent waiting on a child process (the tick benchmark) are not engine time.
    if (cf.functionName === '(idle)' || cf.functionName === '(program)' || cf.functionName === 'spawnSync' || cf.functionName === 'spawn') continue;
    const where = cf.url ? cf.url.replace(/^.*\/packages\//, '').replace(/^file:\/\//, '') : '';
    total += t;
    const k = `${cf.functionName || '(anonymous)'}\u0000${where}`;
    self.set(k, (self.get(k) ?? 0) + t);
  }
  return [...self].sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, t]) => {
    const [fn, where] = k.split('\u0000') as [string, string];
    return { selfPct: total ? Math.round((1000 * t) / total) / 10 : 0, fn, where };
  });
}

/** Runs `fn` under the V8 sampling profiler. Writes the raw .cpuprofile when `file` is given. */
export async function profiled<T>(fn: () => T | Promise<T>, file?: string, top = 15): Promise<{ value: T; lines: ProfileLine[] }> {
  const s = new Session();
  s.connect();
  try {
    await s.post('Profiler.enable');
    await s.post('Profiler.setSamplingInterval', { interval: 200 });
    await s.post('Profiler.start');
    const value = await fn();
    const { profile } = (await s.post('Profiler.stop')) as unknown as { profile: CpuProfile };
    if (file) await writeFile(file, JSON.stringify(profile));
    return { value, lines: summariseProfile(profile, top) };
  } finally {
    s.disconnect();
  }
}
