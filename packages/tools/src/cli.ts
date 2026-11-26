// npm run lint | npm run facts -- --fill-used-by
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runLint, fillUsedBy, lintFacts } from './lint.ts';
import { newSave } from './new-save.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const sub = process.argv[2];
if (sub === 'lint') process.exit(runLint(ROOT));
else if (sub === 'facts') {
  if (process.argv.includes('--fill-used-by')) fillUsedBy(ROOT);
  const r = lintFacts(ROOT);
  for (const n of r.notes) console.log(n);
  for (const [id, c] of Object.entries(r.counts)) console.log(`${id}: ${Object.entries(c).map(([s, n]) => `${n} ${s}`).join(', ')}`);
  for (const p of r.problems) console.log(`[${p.rule}] ${p.message}`);
  process.exit(r.problems.length ? 1 : 0);
} else if (sub === 'new-save') {
  newSave(process.argv.slice(3)).then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
} else { console.error('usage: cli.ts lint | facts [--fill-used-by] | new-save <dir/name> [--seed hex] [--year y] [--advance days]'); process.exit(2); }
