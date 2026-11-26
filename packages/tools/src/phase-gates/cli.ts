// Phase gates 2 to 5 (R1.2.3 to R1.2.6) in one command:
//   npm run phase-gates -- [--phase 2,3,4,5] [--quick] [--rules pro_2026,college_2026] [--out test-results/phase-gates]
// Writes summary.md and summary.json to the output folder (not tracked in git). A phase passes only when every
// item is PASS (NOT_BLOCKING counts as held). Exit 0 only when every phase asked for passes.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ROOT, type CheckResult, type Status } from './checks.ts';
import { GATE_ITEMS } from './gates.ts';

const argv = process.argv.slice(2);
const flag = (n: string, d: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1]! : d; };
const phases = flag('phase', '2,3,4,5').split(',').map(Number);
const ctx = { quick: argv.includes('--quick'), ruleSets: flag('rules', 'pro_2026,college_2026').split(',') };
const out = resolve(ROOT, flag('out', 'test-results/phase-gates'));
const held = (s: Status) => s === 'PASS' || s === 'NOT_BLOCKING';

const rows: { phase: number; leaf: string; item: number; text: string; owner: string; result: CheckResult; seconds: number }[] = [];
for (const it of GATE_ITEMS.filter((g) => phases.includes(g.phase))) {
  const t0 = performance.now();
  let result: CheckResult;
  try { result = it.run(ctx); } catch (e) { result = { status: 'FAIL', evidence: `the check threw: ${(e as Error).message.split('\n')[0]}` }; }
  const seconds = Math.round((performance.now() - t0) / 100) / 10;
  rows.push({ phase: it.phase, leaf: it.leaf, item: it.item, text: it.text, owner: it.owner, result, seconds });
  console.log(`phase ${it.phase} item ${it.item}: ${result.status} (${seconds} s)`);
}
const verdicts = phases.map((p) => ({ phase: p, pass: rows.filter((r) => r.phase === p).every((r) => held(r.result.status)) }));
const L = ['# Phase gates 2 to 5 (R1.2.3 to R1.2.6)', '', `Rule sets: ${ctx.ruleSets.join(', ')}${ctx.quick ? ' (quick)' : ''}.`, ''];
for (const v of verdicts) {
  L.push(`## Phase ${v.phase}: ${v.pass ? 'PASS' : 'HOLD'}`, '', '| item | status | by level | evidence | owner of the gap |', '| --- | --- | --- | --- | --- |');
  for (const r of rows.filter((x) => x.phase === v.phase)) {
    const lv = r.result.levels ? Object.entries(r.result.levels).map(([k, s]) => `${k} ${s}`).join(', ') : '-';
    L.push(`| ${r.item}. ${r.text} | ${r.result.status} | ${lv} | ${r.result.evidence.replace(/\|/g, '/')} | ${held(r.result.status) ? '-' : r.owner} |`);
  }
  L.push('');
}
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'summary.md'), L.join('\n'));
writeFileSync(join(out, 'summary.json'), JSON.stringify({ ruleSets: ctx.ruleSets, quick: ctx.quick, verdicts, rows }, null, 2));
console.log(`\n${verdicts.map((v) => `phase ${v.phase} ${v.pass ? 'PASS' : 'HOLD'}`).join(', ')}. Report: ${join(out, 'summary.md')}`);
process.exitCode = verdicts.every((v) => v.pass) ? 0 : 1;
