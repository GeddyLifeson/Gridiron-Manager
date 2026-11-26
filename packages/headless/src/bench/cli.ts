#!/usr/bin/env node
// G-97 benchmark command (P6.5.1). Until the integrator wires `npm run headless -- bench`, run it with
//   npx tsx packages/headless/src/bench/cli.ts [--tier change|nightly|weekly|all] [--repeats 5]
//     [--workers 4] [--full-long-runs] [--out file.json] [--profile file.cpuprofile] [--write-baseline]
// Exit code 1 when a gated benchmark is more than 10% slower than the stored baseline after
// normalising, or when a result hash changed. A budget missed on this machine is reported, not failed:
// budgets name the minimum target machine (P6.2.1), which a shared runner is not.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { argOf } from '../batch/cli.ts';
import { gate, hashChanges, makeBaseline, type Baseline } from './compare.ts';
import { machineInfo, profiled, referenceWorkloadMs, type ProfileLine } from './measure.ts';
import { runSuite, TIERS, type BenchResult, type Tier } from './suite.ts';

export const BASELINE_FILE = new URL('./baseline.json', import.meta.url);

export async function readBaseline(): Promise<Baseline | null> {
  try { return JSON.parse(await readFile(BASELINE_FILE, 'utf8')) as Baseline; } catch { return null; }
}

const fmt = (ms: number | null): string => (ms === null ? '-' : ms >= 60_000 ? `${(ms / 60_000).toFixed(1)} min` : ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms.toFixed(2)} ms`);

export function table(results: readonly BenchResult[]): string {
  const rows = results.map((r) => `| ${r.id} | ${r.row} | ${fmt(r.budgetMs)} (${r.budgetMachine}) | ${fmt(r.ms)} | ${r.status.replace('_', ' ')} | ${r.note} |`);
  return ['| Benchmark | Bible row | Budget | Measured (median) | Status | Note |', '| --- | --- | --- | --- | --- | --- |', ...rows].join('\n');
}

async function main(argv: readonly string[]): Promise<number> {
  const tierArg = argOf(argv, 'tier', 'change')!;
  const tiers: Tier[] = tierArg === 'all' ? [...TIERS] : tierArg.split(',').map((t) => {
    if (!(TIERS as readonly string[]).includes(t)) throw new Error(`--tier ${t}: expected change, nightly, weekly or all`);
    return t as Tier;
  });
  const repeats = Number(argOf(argv, 'repeats', '5'));
  const workers = Number(argOf(argv, 'workers', '4'));
  const log = (l: string) => console.error(l);
  const machine = machineInfo();
  const referenceMs = referenceWorkloadMs();
  log(`machine: ${machine.cpu}, ${machine.cores} cores, node ${machine.node}; reference workload ${referenceMs.toFixed(1)} ms`);
  const profileFile = argOf(argv, 'profile');
  const { value: results, lines } = await profiled(() => runSuite({ repeats, workers, tiers, fullLongRuns: argv.includes('--full-long-runs'), log }), profileFile ? resolve(profileFile) : undefined);
  const base = await readBaseline();
  const rows = gate(results, referenceMs, base);
  const hashes = hashChanges(results, base);
  console.log(table(results));
  console.log('\nGate (normalised by the reference workload):');
  for (const r of rows) console.log(`  ${r.pass ? 'ok  ' : 'FAIL'} ${r.id}: ${r.change === null ? 'no baseline' : `${r.change >= 0 ? '+' : ''}${(r.change * 100).toFixed(1)}%`} (${r.reason})`);
  for (const h of hashes) console.log(`  FAIL result hash changed: ${h}`);
  console.log('\nWhere time goes (main thread, self time):');
  for (const l of lines.slice(0, 12)) console.log(`  ${l.selfPct.toFixed(1).padStart(5)}%  ${l.fn}  ${l.where}`);
  const out = argOf(argv, 'out');
  if (out) await writeFile(resolve(out), JSON.stringify({ machine, referenceMs, tiers, repeats, workers, results, gate: rows, hashChanges: hashes, profile: lines satisfies ProfileLine[] }, null, 2) + '\n');
  if (argv.includes('--write-baseline')) {
    const note = argOf(argv, 'note', 'baseline written by bench --write-baseline')!;
    await writeFile(BASELINE_FILE, JSON.stringify(makeBaseline(results, referenceMs, machine, note), null, 2) + '\n');
    log(`baseline written: ${BASELINE_FILE.pathname}`);
    return 0;
  }
  return rows.every((r) => r.pass) && hashes.length === 0 ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
}
