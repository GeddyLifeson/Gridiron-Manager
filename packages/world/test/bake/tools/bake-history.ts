// The bake tool: master-run output folders in, the baked history JSON out (the file shipped with the game).
//
//   npx tsx packages/world/test/bake/tools/bake-history.ts --run=master-run [--run=small-run ...]
//       [--out=packages/world/src/bake/data/master-history.json] [--master=full] [--allow-dry]
//
// Each --run is a folder written by packages/world/test/loop/tools/master-history.ts (one per size preset).
// A dry run (--games=test) is refused unless --allow-dry, and is then baked as provisional. The output is
// checked by the loader before it is written, and the tool prints its digest and provisional reasons.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractBake, type RunFiles } from '../../../src/bake/extract.ts';
import { loadBakedHistory } from '../../../src/bake/load.ts';

const args = process.argv.slice(2);
const many = (k: string): string[] => args.filter((a) => a.startsWith(`--${k}=`)).map((a) => a.slice(k.length + 3));
const one = (k: string, d: string): string => many(k)[0] ?? d;
const runs = many('run');
if (runs.length === 0) throw new Error('give at least one --run=<folder>');
const OUT = one('out', new URL('../../../src/bake/data/master-history.json', import.meta.url).pathname);

export function readRunFolder(dir: string): RunFiles {
  const j = (f: string): any => JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const progress = readFileSync(join(dir, 'progress.jsonl'), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  return { run: j('run.json'), progress, teams: j('teams.json'), hall: j('hall.json'), tenures: j('tenures.json') };
}

const bake = extractBake(runs.map(readRunFolder), { masterSize: one('master', 'full'), allowDry: args.includes('--allow-dry') });
loadBakedHistory(JSON.parse(JSON.stringify(bake)));
writeFileSync(OUT, `${JSON.stringify(bake, null, 1)}\n`);
console.log(JSON.stringify({
  out: OUT, digest: bake.digest, provisional: bake.provisional, endYear: bake.endYear,
  runs: Object.fromEntries(Object.entries(bake.runs).map(([k, r]) => [k, { seasons: r.seasons.length, provisional: r.provisionalReasons }])),
}, null, 1));
