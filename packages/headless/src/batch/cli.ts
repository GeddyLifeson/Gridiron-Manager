#!/usr/bin/env node
// WP-24 batch command (J14.6.1). Until the integrator wires `npm run headless -- batch`, run it with
//   npx tsx packages/headless/src/batch/cli.ts --rules pro_2026 --games 200 --workers 8 [--seed 16hex]
//     [--resolver reference|tick] [--param name=value ...] [--groups 5] [--out report.json]
// Prints the batch hash; the JSON report holds every game's seed, so any game can be re-run in full.
import { writeFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import { resolve } from 'node:path';
import { runBatchOnWorkers } from './run.ts';
import { realFactoryRef } from './real-factory.ts';
import type { EngineVariant } from './spec.ts';

export function argOf(argv: readonly string[], name: string, def?: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
}

/** Every `--<name> key=value` pair, as a parameter override map. */
export function paramsOf(argv: readonly string[], name: string): Record<string, number> {
  const out: Record<string, number> = {};
  argv.forEach((a, i) => {
    if (a !== `--${name}`) return;
    const kv = argv[i + 1] ?? '';
    const eq = kv.indexOf('=');
    const v = Number(kv.slice(eq + 1));
    if (eq <= 0 || !Number.isFinite(v)) throw new Error(`--${name} ${kv}: expected name=number`);
    out[kv.slice(0, eq)] = v;
  });
  return out;
}

export function variantOf(argv: readonly string[], label: string, resolverFlag: string, paramFlag: string, defResolver = 'reference'): EngineVariant {
  const resolverId = argOf(argv, resolverFlag, defResolver);
  if (resolverId !== 'reference' && resolverId !== 'tick') throw new Error(`--${resolverFlag} ${resolverId}: expected reference or tick`);
  const paramOverrides = paramsOf(argv, paramFlag);
  return { label, resolverId, ...(Object.keys(paramOverrides).length ? { paramOverrides } : {}) };
}

async function main(argv: readonly string[]): Promise<number> {
  const ruleSetId = argOf(argv, 'rules', 'pro_2026')!;
  const games = Number(argOf(argv, 'games', '100'));
  const workers = Number(argOf(argv, 'workers', String(Math.max(1, cpus().length - 1))));
  const t0 = Date.now();
  const report = await runBatchOnWorkers({
    factory: realFactoryRef({ ruleSetId }), variant: variantOf(argv, 'batch', 'resolver', 'param'),
    masterSeedHex: argOf(argv, 'seed', '00000000000000a1')!, games, seedGroups: Number(argOf(argv, 'groups', '0')),
  }, workers);
  const out = argOf(argv, 'out');
  if (out) await writeFile(resolve(out), JSON.stringify(report, null, 2) + '\n');
  const plays = report.outcomes.reduce((s, o) => s + o.plays, 0);
  console.log(`${games} games, ${plays} plays, ${report.workers} workers, ${((Date.now() - t0) / 1000).toFixed(1)}s: batch hash ${report.batchHash} (${report.resolverVersion}, ${ruleSetId})${out ? ` -> ${out}` : ''}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
}
