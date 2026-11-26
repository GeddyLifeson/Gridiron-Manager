// Content command: validate packs, print the report and hashes, optionally watch for edits (P4.2.2:
// "Validation is the same code in the designer, the pack loader, and the headless validate command").
//   npm run content -- validate <pack folder or .zip>... (same as tsx packages/tools/src/content/cli.ts validate ...)
//   tsx packages/tools/src/content/cli.ts validate <pack folder or .zip>... [--certified] [--watch]
import { resolveRuleSet, RULE_SET_FILES } from '@gm/rules-data';
import { loadPacks } from './load.ts';
import { readPackFolder, readPackZip } from './node-fs.ts';
import { ContentStore } from './reload.ts';
import { watchPackFolder } from './watch.ts';
import type { LoadResult, Problem } from './index.ts';

export function formatReport(r: Pick<LoadResult, 'problems' | 'ignored' | 'order'> & { set: LoadResult['set'] }): string {
  const lines: string[] = [];
  const order: Problem['severity'][] = ['error', 'flag', 'warning', 'info'];
  for (const sev of order) {
    const ps = r.problems.filter((p) => p.severity === sev);
    if (!ps.length) continue;
    lines.push(`${sev.toUpperCase()} (${ps.length})`);
    for (const p of ps) lines.push(`  [${p.code}] ${p.packId}${p.file ? `/${p.file}` : ''}${p.path ? ` ${p.path}` : ''}${p.ruleSetId ? ` (${p.ruleSetId})` : ''}: ${p.message}`);
  }
  if (r.ignored.length) lines.push(`ignored files: ${r.ignored.length}`);
  lines.push(`load order: ${r.order.join(', ') || '(none)'}`);
  if (r.set) {
    for (const m of r.set.manifest) lines.push(`  ${m.packId} ${m.version} ${m.hash}`);
    lines.push(`content hash: ${r.set.hash} (${r.set.items.size} items)`);
  } else lines.push('result: REFUSED (errors above)');
  return lines.join('\n');
}

function main(argv: string[]): number {
  const [cmd, ...rest] = argv;
  if (cmd !== 'validate') { console.error('usage: content validate <pack>... [--certified] [--watch]'); return 2; }
  const certified = rest.includes('--certified');
  const watchMode = rest.includes('--watch');
  const paths = rest.filter((a) => !a.startsWith('--'));
  if (!paths.length) { console.error('usage: content validate <pack folder or .zip>... [--certified] [--watch]'); return 2; }
  const sources = paths.map((p) => (p.endsWith('.zip') ? readPackZip(p) : readPackFolder(p)));
  const ruleSets = RULE_SET_FILES.map((f) => resolveRuleSet(f.ruleset_id));
  if (!watchMode) {
    const r = loadPacks(sources, { certified, ruleSets });
    console.log(formatReport(r));
    return r.set ? 0 : 1;
  }
  const { store, result } = ContentStore.open(sources, { mode: 'dev', certified, ruleSets });
  console.log(formatReport(result));
  if (!store) return 1;
  for (const p of paths.filter((x) => !x.endsWith('.zip'))) {
    watchPackFolder(p, store, (r, files) => {
      console.log(`\n${files.join(', ')} -> ${r.accepted ? `set v${r.version}${r.pending ? ' (after this play)' : ''}, changed: ${r.changed.join(', ') || 'none'}` : 'refused, old set kept'}`);
      for (const pr of r.problems.filter((x) => x.severity !== 'info')) console.log(`  [${pr.severity} ${pr.code}] ${pr.file} ${pr.path}: ${pr.message}`);
    });
  }
  console.log(`watching ${paths.length} folder(s); Ctrl+C to stop`);
  return -1;
}

if (process.argv[1] && /content[\\/]cli\.ts$/.test(process.argv[1])) {
  const code = main(process.argv.slice(2));
  if (code >= 0) process.exitCode = code;
}
