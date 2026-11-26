// Break test command line:
//   npx tsx packages/tools/src/breaktest/cli.ts [--targets a,b] [--seeds N] [--seed HEX] [--steps N] [--no-shrink] [--out DIR]
// Writes break-test.md and break-test.json to --out (default test-results/breaktest). Exit code 0 always: the
// report is the result; a crash of the rig itself exits 2.
import { execSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runTarget } from './engine.ts';
import { jsonReport, markdown } from './report.ts';
import { deriveSeed } from './rnd.ts';
import { TARGETS, makeTarget, type TargetId } from './targets/index.ts';
import { DEFAULT_RUN, type TargetReport } from './types.ts';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const targets = (arg('targets')?.split(',') ?? [...TARGETS]) as TargetId[];
  for (const t of targets) if (!(TARGETS as readonly string[]).includes(t)) throw new Error(`unknown target ${t}; known: ${TARGETS.join(', ')}`);
  const base = arg('seed') ?? '0b5e55ed0b5e55ed';
  const n = Number(arg('seeds') ?? 3);
  const steps = Number(arg('steps') ?? DEFAULT_RUN.steps);
  const out = arg('out') ?? 'test-results/breaktest';
  const seeds = Array.from({ length: n }, (_, i) => (i === 0 ? base : deriveSeed(base, i)));
  const o = { ...DEFAULT_RUN, steps, shrink: !process.argv.includes('--no-shrink') };
  const t0 = performance.now();
  const reports: TargetReport[] = [];
  for (const id of targets) {
    for (const seed of seeds) {
      const r = await runTarget(makeTarget(id, join(out, 'saves')), seed, o);
      reports.push(r);
      const real = r.findings.filter((f) => f.kind !== 'unreachable').length;
      console.log(`${id} ${seed}: ${r.steps} steps, ${r.accepted} accepted, ${r.refused} refused, ${r.reloads} reloads, ${real} findings, ${(r.ms / 1000).toFixed(1)} s`);
    }
  }
  let commit = 'unknown';
  try { commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); } catch { /* not a checkout */ }
  const meta = { commit, seeds, steps, targets, ms: Math.round(performance.now() - t0) };
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'break-test.md'), markdown(meta, reports));
  await writeFile(join(out, 'break-test.json'), JSON.stringify(jsonReport(meta, reports), null, 1));
  console.log(`report: ${join(out, 'break-test.md')}`);
}

main().catch((e) => { console.error(e); process.exit(2); });
