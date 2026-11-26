// Release-gate cleanup: rewrite a stored status word that differs from the status computed from the row's sources (Q6.1.2).
// The word is never chosen by hand; this only copies the computed value and logs why in statusHistory.
// Usage: npx tsx scripts/release/tools/sync-status.ts <fact file>...
import { readFileSync, writeFileSync } from 'node:fs';
import { computeStatus } from '../../../packages/schema/src/index.ts';

for (const f of process.argv.slice(2)) {
  const text = readFileSync(f, 'utf8');
  const indent = /^\{\n( +)"/.exec(text)?.[1].length ?? 2;
  const d = JSON.parse(text);
  let n = 0;
  for (const r of d.rows) {
    const c = computeStatus(r);
    if (c === r.status) continue;
    r.statusHistory ??= [];
    r.statusHistory.push({ date: '2026-11-26', status: c, reason: `Release gate cleanup: stored word "${r.status}" did not match the status computed from the sources (Q6.1.2).` });
    r.status = c;
    n++;
  }
  if (n) writeFileSync(f, JSON.stringify(d, null, indent) + (text.endsWith('\n') ? '\n' : ''));
  console.log(f, 'fixed', n);
}
