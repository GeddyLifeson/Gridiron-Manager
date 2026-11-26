// Headless Mods list: `npx tsx packages/tools/src/editors/cli.ts scan <user content folder> [--core <core pack folder>] [--report]`.
// Prints one line per pack (selectable or not, with error count); --report prints each pack's error text.
import { readPackFolder } from '../content/index.ts';
import { assessUserContent, errorReportText } from './folder.ts';
import { scanUserContentFolder } from './node-folder.ts';

function main(argv: string[]): number {
  const [cmd, folder, ...rest] = argv;
  if (cmd !== 'scan' || !folder) { process.stderr.write('usage: cli.ts scan <folder> [--core <dir>] [--report]\n'); return 2; }
  const ci = rest.indexOf('--core');
  const base = ci >= 0 && rest[ci + 1] ? [readPackFolder(rest[ci + 1]!)] : [];
  const list = assessUserContent(scanUserContentFolder(folder), { base });
  for (const e of list.entries) {
    const errs = e.problems.filter((p) => p.severity === 'error').length;
    process.stdout.write(`${e.selectable ? 'OK     ' : 'REFUSED'} ${e.packId} ${e.version} by ${e.author} [${e.kinds.join(', ')}] ${e.signature}${errs ? ` errors ${errs}` : ''}\n`);
    if (rest.includes('--report') && !e.selectable) process.stdout.write(`${errorReportText(e)}\n`);
  }
  return list.entries.every((e) => e.selectable) ? 0 : 1;
}

if (process.argv[1] && /editors[\\/]cli\.ts$/.test(process.argv[1])) process.exit(main(process.argv.slice(2)));
