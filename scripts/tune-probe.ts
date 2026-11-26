// Tuning probe: the calibration report of a batch of real games with parameter overrides, run in several processes.
// Usage: npx tsx scripts/tune-probe.ts <ruleSetId> <gamesPerProcess> <processes> [--ov overrides.json] [--out table.txt] [name=value ...]
// Each process takes its own master seed; a row's simulated value is the mean over the processes (equal game counts), so
// sd and quantile rows are close but not the exact pooled value. The gate itself is `headless calibrate`; this only steers tuning.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRealGame } from '../packages/headless/src/real-game/index.ts';
import { buildReport, loadTargets } from '../packages/headless/src/calibration/index.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [rulesId = 'pro_2026', gamesArg = '500', procsArg = '4', ...rest] = process.argv.slice(2);
const games = Number(gamesArg), procs = Number(procsArg);
const overrides: Record<string, number> = {};
let out: string | null = null;
for (let i = 0; i < rest.length; i++) {
  const a = rest[i]!;
  if (a === '--ov') Object.assign(overrides, JSON.parse(readFileSync(rest[++i]!, 'utf8')));
  else if (a === '--out') out = rest[++i]!;
  else { const [k, v] = a.split('='); overrides[k!] = Number(v); }
}

interface Row { id: string; tier: string; status: string | null; real: unknown; sim: number | null; tol: number | null; events: number; state: string }

if (process.env.TUNE_CHILD) {
  const seed = process.env.TUNE_CHILD;
  const batch = createRealGame(rulesId, { paramOverrides: overrides }).batch(games, 4, seed);
  const report = buildReport(loadTargets(ROOT, rulesId), batch.groups, { build: 'tune', paramsHash: 'tune', resolverId: 'reference', seeds: seed, games, seedGroups: 4 });
  const rows: Row[] = report.rows.map((r) => ({ id: r.id, tier: r.tier, status: r.status, real: r.real, sim: r.signedError === null ? null : (typeof r.real === 'number' ? r.real + r.signedError : r.signedError), tol: r.toleranceUsed, events: r.simEvents, state: r.state }));
  process.stdout.write(JSON.stringify(rows));
} else {
  const runs = await Promise.all(Array.from({ length: procs }, (_, k) => new Promise<Row[]>((ok, bad) => {
    const seed = (0x1000n + BigInt(k)).toString(16).padStart(16, '0');
    const c = spawn(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), ...process.argv.slice(2)], { env: { ...process.env, TUNE_CHILD: seed }, stdio: ['ignore', 'pipe', 'inherit'] });
    let buf = '';
    c.stdout.on('data', (d) => { buf += d; });
    c.on('close', (code) => (code === 0 ? ok(JSON.parse(buf) as Row[]) : bad(new Error(`child ${k} exit ${code}`))));
  })));
  const lines: string[] = [];
  let pass = 0, fail = 0;
  runs[0]!.forEach((r0, i) => {
    if (r0.state !== 'measured') return;
    const sims = runs.map((r) => r[i]!.sim).filter((v): v is number => v !== null);
    if (sims.length === 0) return;
    const sim = sims.reduce((a, b) => a + b, 0) / sims.length;
    const events = runs.reduce((a, r) => a + r[i]!.events, 0);
    const scalar = typeof r0.real === 'number';
    const err = scalar ? sim - (r0.real as number) : sim;
    // Ordering rows report (share held - share needed); quantile rows the worst point's error.
    const ok = r0.tol === null ? false : scalar ? Math.abs(err) <= r0.tol : Array.isArray(r0.real) && typeof (r0.real as unknown[])[0] === 'string' ? err >= 0 : Math.abs(err) <= r0.tol;
    if (ok) pass++; else fail++;
    const ratio = r0.tol && r0.tol > 0 ? err / r0.tol : 0;
    lines.push(`${r0.id}|${r0.tier}|${r0.status}|${scalar ? Number(r0.real).toPrecision(4) : '-'}|${sim.toPrecision(4)}|${ratio.toFixed(1)}|${events}|${ok ? 'PASS' : 'FAIL'}`);
  });
  const text = `${rulesId} ${games * procs} games: pass ${pass}, fail ${fail}\n` + lines.join('\n') + '\n';
  if (out) { writeFileSync(out, text); console.log(text.split('\n')[0]); } else console.log(text);
}
