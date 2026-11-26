#!/usr/bin/env node
// WP-24 diff command (Q1.3.2). Until the integrator wires `npm run headless -- diff`, run it with
//   npx tsx packages/headless/src/diff/cli.ts --rules pro_2026 --games 40 [--seed 16hex] [--plays 2000]
//     [--base-resolver reference] [--variant-resolver reference|tick]
//     [--base-param name=value ...] [--variant-param name=value ...] [--targets] [--out report.md] [--json report.json]
// --targets compares every calibration target row of the rule set (content/calibration/targets.<rules>.json).
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTargets } from '../calibration/files.ts';
import { realFactoryRef } from '../batch/real-factory.ts';
import { argOf, variantOf } from '../batch/cli.ts';
import { runDiff } from './run.ts';
import { formatDiffReport } from './report.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

async function main(argv: readonly string[]): Promise<number> {
  const ruleSetId = argOf(argv, 'rules', 'pro_2026')!;
  const filters = argv.includes('--targets') ? loadTargets(ROOT, ruleSetId).file.targets.map((t) => t.filter) : [];
  const t0 = Date.now();
  const report = await runDiff({
    factory: realFactoryRef({ ruleSetId }),
    base: variantOf(argv, 'base', 'base-resolver', 'base-param'),
    variant: variantOf(argv, 'variant', 'variant-resolver', 'variant-param'),
    masterSeedHex: argOf(argv, 'seed', '00000000000000a1')!, games: Number(argOf(argv, 'games', '40')),
    ...(argOf(argv, 'plays') ? { playSample: Number(argOf(argv, 'plays')) } : {}), filters,
  });
  const text = formatDiffReport(report);
  const out = argOf(argv, 'out'), json = argOf(argv, 'json');
  if (out) await writeFile(resolve(out), text);
  if (json) await writeFile(resolve(json), JSON.stringify(report, null, 2) + '\n');
  if (!out) process.stdout.write(text);
  console.error(`diff: ${report.plays.changed}/${report.plays.compared} plays changed, ${report.gamesChanged}/${report.games.length} games, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return report.plays.impure ? 1 : 0;
}

main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
