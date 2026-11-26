// One command for the whole phase 0 schedule on this machine (Q1.8.1 "every change", R1.2.1 gate):
//   npm run check
// Runs typecheck, lints, unit and property tests, the headless golden gate (with 1 and N workers),
// the browser gate and save round trip, and the desktop gate when a desktop build exists. Writes
// test-results/summary.json and test-results/summary.md, which are committed with the change while
// no CI host is chosen (R1.2.1 edge case). No GitHub Actions (project rule).
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform, arch, release } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'test-results');
mkdirSync(OUT, { recursive: true });
const win = process.platform === 'win32';
const quick = process.argv.includes('--quick');

interface Step { name: string; cmd: string; args: string[]; optional?: boolean; skip?: string }

function desktopBinary(): string | null {
  const base = join(ROOT, 'shells/desktop/src-tauri/target/release');
  for (const n of ['gridiron-manager.exe', 'gridiron-manager', 'Gridiron Manager.app/Contents/MacOS/gridiron-manager']) {
    if (existsSync(join(base, n))) return join(base, n);
  }
  return null;
}

const desktop = desktopBinary();
const desktopGate = join(OUT, `gate-desktop-${platform()}-${arch()}.json`);
const desktopSave = join(OUT, 'tmp-saves', 'from-desktop.gmsave');
mkdirSync(dirname(desktopSave), { recursive: true });
const steps: Step[] = [
  { name: 'typecheck (TypeScript strict)', cmd: 'npx', args: ['tsc', '-p', 'tsconfig.json', '--noEmit'] },
  { name: 'lints (P1.2.1, P1.2.2, P1.1.1, P1.1.2, Q1.2.1, Q6.2.1)', cmd: 'npx', args: ['tsx', 'packages/tools/src/cli.ts', 'lint'] },
  { name: 'unit, property and schema tests (vitest)', cmd: 'npx', args: ['vitest', 'run'] },
  { name: 'parameter registry: every module parameter file, no name defined twice (P3 PARAMS)', cmd: 'npx', args: ['tsx', 'scripts/param-registry.ts', '--out', join(OUT, 'param-registry.md')] },
  { name: 'headless golden gate, 1 and N workers (Q1.3.1)', cmd: 'npx', args: ['tsx', 'packages/headless/src/cli.ts', 'gate'] },
  { name: 'change-tier benchmarks against the stored baseline (P6.5.1, G-97)', cmd: 'npx', args: ['tsx', 'packages/headless/src/cli.ts', 'bench', '--tier', 'change'] },
  { name: 'browser golden gate and save round trip (R1.2.1 items 1-2)', cmd: 'npx', args: ['tsx', 'scripts/browser-gate.ts'], skip: quick ? '--quick' : undefined },
  { name: 'browser build works offline after the first visit (P2.3.2, G-06)', cmd: 'npx', args: ['tsx', 'shells/browser/scripts/offline-check.ts'], skip: quick ? '--quick' : undefined },
  {
    name: 'desktop shell golden gate (R1.2.1 item 1)',
    cmd: desktop ?? '', args: ['--gate', desktopGate],
    skip: quick ? '--quick' : desktop ? undefined : 'no desktop build (run: npm run desktop:build)',
    optional: true,
  },
  {
    name: 'desktop native save copied out (P5.1.1)',
    cmd: desktop ?? '', args: ['--copy-save', 'gate-desktop', desktopSave],
    skip: quick ? '--quick' : desktop ? undefined : 'no desktop build',
  },
  {
    name: 'desktop save opens and replays in Node (R1.2.1 item 2)',
    cmd: 'npx', args: ['tsx', 'packages/headless/src/cli.ts', 'replay', desktopSave],
    skip: quick ? '--quick' : desktop ? undefined : 'no desktop build',
  },
];

const results: { name: string; ok: boolean; skipped?: string; seconds: number; tail: string }[] = [];
for (const s of steps) {
  if (s.skip) { console.log(`\n=== SKIP ${s.name}: ${s.skip}`); results.push({ name: s.name, ok: true, skipped: s.skip, seconds: 0, tail: '' }); continue; }
  console.log(`\n=== ${s.name}`);
  const t0 = Date.now();
  const linuxDesktop = s.cmd === desktop && process.platform === 'linux' && !process.env.DISPLAY;
  const r = linuxDesktop
    ? spawnSync('xvfb-run', ['-a', s.cmd, ...s.args], { cwd: ROOT, encoding: 'utf8', shell: false })
    : spawnSync(s.cmd, s.args, { cwd: ROOT, encoding: 'utf8', shell: win && s.cmd === 'npx' });
  const text = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  process.stdout.write(text);
  let ok = r.status === 0;
  if (s.cmd === desktop && s.args[0] === '--gate' && existsSync(desktopGate)) ok = JSON.parse(readFileSync(desktopGate, 'utf8')).ok === true;
  results.push({ name: s.name, ok, seconds: Math.round((Date.now() - t0) / 100) / 10, tail: text.trim().split('\n').slice(-12).join('\n') });
}

const commit = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
const dirty = spawnSync('git', ['status', '--porcelain', '--', 'packages', 'facts', 'golden', 'shells', 'scripts'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim() !== '';
const allOk = results.every((r) => r.ok);
const summary = {
  ok: allOk, commit, uncommittedSourceChanges: dirty,
  machine: `${platform()} ${release()} ${arch()}, node ${process.versions.node}`,
  finishedAt: new Date().toISOString(),
  steps: results.map(({ tail, ...r }) => r),
};
writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
const md = [
  `# Phase 0 check: ${allOk ? 'PASS' : 'FAIL'}`, '',
  `Commit ${commit}${dirty ? ' (with uncommitted changes)' : ''} on ${summary.machine}, ${summary.finishedAt}.`, '',
  '| Step | Result | Seconds |', '| --- | --- | --- |',
  ...results.map((r) => `| ${r.name} | ${r.skipped ? `skipped: ${r.skipped}` : r.ok ? 'pass' : 'FAIL'} | ${r.seconds} |`), '',
];
writeFileSync(join(OUT, 'summary.md'), md.join('\n'));
console.log(`\n${md.join('\n')}`);
process.exit(allOk ? 0 : 1);
