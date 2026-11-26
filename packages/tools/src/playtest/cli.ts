// The headless career playtest runner (npm run playtest). Runs many seeded careers, in parallel worker processes,
// and writes findings and a summary:
//   npm run playtest -- --careers 50 --seed 00000000c0ffee00 --jobs 8 --out playtest-results
//   flags: --careers N (20)  --seed <16 hex> (base seed)  --jobs N (CPU count, max 16)  --seasons N (30)
//          --games N game days per season (2)  --head-seasons N seasons as pro head coach (3)
//          --world-seasons N seasons and offseasons on one live world through the save (2)
//          --script rung0_to_pro_head | average_work | fired_and_rehired | mixed (rung0_to_pro_head)
//          --out DIR (playtest-results)  --fail-on kinds (crash,stuck,invalid,rule)
// Writes DIR/careers.jsonl (one CareerReport per line), DIR/findings.json (groups) and DIR/summary.md.
// Exit code 1 when any finding group of a --fail-on kind exists. The output folder is not tracked in git.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync, rmSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPlaytestCareer } from './career.ts';
import { formatSummary, summarise } from './report.ts';
import { DEFAULT_OPTIONS, FINDING_KINDS, SCRIPTS, type CareerReport, type FindingKind, type PlaytestScript } from './types.ts';

const argv = process.argv.slice(2);
const flag = (name: string, def: string): string => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : def; };
const int = (name: string, def: number): number => { const v = Number(flag(name, String(def))); if (!Number.isInteger(v) || v < 0) throw new Error(`--${name} must be a whole number`); return v; };

/** Career seed i from the base seed: the base plus i, as 16 hex digits. */
export function careerSeed(baseHex: string, i: number): string {
  return ((BigInt(`0x${baseHex}`) + BigInt(i)) & 0xffffffffffffffffn).toString(16).padStart(16, '0');
}

function scriptOf(name: string, i: number): PlaytestScript {
  if (name === 'mixed') return SCRIPTS[i % SCRIPTS.length]!;
  if (!(SCRIPTS as readonly string[]).includes(name)) throw new Error(`--script must be one of ${[...SCRIPTS, 'mixed'].join(', ')}`);
  return name as PlaytestScript;
}

async function worker(): Promise<void> {
  const [idx, of] = flag('worker', '0/1').split('/').map(Number) as [number, number];
  const out = flag('jsonl', '');
  const careers = int('careers', 20);
  const base = flag('seed', '00000000c0ffee00');
  const saveDir = join(tmpdir(), `gm-playtest-${process.pid}`);
  for (let i = idx; i < careers; i += of) {
    const r = await runPlaytestCareer(careerSeed(base, i), {
      ...DEFAULT_OPTIONS, saveDir, seasons: int('seasons', DEFAULT_OPTIONS.seasons), gamesPerSeason: int('games', DEFAULT_OPTIONS.gamesPerSeason),
      headSeasons: int('head-seasons', DEFAULT_OPTIONS.headSeasons), worldSeasons: int('world-seasons', DEFAULT_OPTIONS.worldSeasons), script: scriptOf(flag('script', DEFAULT_OPTIONS.script), i),
    });
    appendFileSync(out, JSON.stringify(r) + '\n');
    process.stdout.write(`career ${i} ${r.seedHex} ${r.script}: ${r.seasons} seasons, ${r.games} games, ${r.findings.length} findings, ${(r.ms / 1000).toFixed(1)} s\n`);
  }
  rmSync(saveDir, { recursive: true, force: true });
}

async function main(): Promise<void> {
  if (argv.includes('--worker')) return worker();
  const out = resolve(flag('out', 'playtest-results'));
  mkdirSync(out, { recursive: true });
  const careers = int('careers', 20);
  const jobs = Math.max(1, Math.min(careers, int('jobs', Math.min(16, cpus().length))));
  const failOn = new Set(flag('fail-on', 'crash,stuck,invalid,rule').split(',').filter(Boolean) as FindingKind[]);
  for (const k of failOn) if (!FINDING_KINDS.includes(k)) throw new Error(`--fail-on: unknown kind ${k}`);
  const passOn = argv.filter((a, i) => !['--out', '--jobs', '--fail-on'].includes(a) && !['--out', '--jobs', '--fail-on'].includes(argv[i - 1] ?? ''));
  const parts = Array.from({ length: jobs }, (_, i) => join(out, `careers-${i}.jsonl`));
  for (const p of parts) if (existsSync(p)) rmSync(p);
  const self = fileURLToPath(import.meta.url);
  const t0 = performance.now();
  const codes = await Promise.all(parts.map((p, i) => new Promise<number>((done) => {
    const c = spawn(process.execPath, [...process.execArgv, self, ...passOn, '--worker', `${i}/${jobs}`, '--jsonl', p], { stdio: ['ignore', 'inherit', 'inherit'] });
    c.on('exit', (code) => done(code ?? 1));
  })));
  const reports: CareerReport[] = [];
  for (const p of parts) if (existsSync(p)) for (const line of readFileSync(p, 'utf8').split('\n')) if (line.trim()) reports.push(JSON.parse(line) as CareerReport);
  reports.sort((a, b) => a.seedHex.localeCompare(b.seedHex));
  writeFileSync(join(out, 'careers.jsonl'), reports.map((r) => JSON.stringify(r)).join('\n') + '\n');
  for (const p of parts) rmSync(p, { force: true });
  const s = summarise(reports);
  writeFileSync(join(out, 'findings.json'), JSON.stringify(s, null, 2));
  const md = formatSummary(s, { command: `npm run playtest -- ${argv.join(' ')}`, script: flag('script', DEFAULT_OPTIONS.script) });
  writeFileSync(join(out, 'summary.md'), md);
  const wall = ((performance.now() - t0) / 1000).toFixed(1);
  console.log(`\n${reports.length} of ${careers} careers reported in ${wall} s wall on ${jobs} jobs. Groups: ${FINDING_KINDS.map((k) => `${k} ${s.byKind[k]}`).join(', ')}. Summary: ${join(out, 'summary.md')}`);
  const failed = codes.some((c) => c !== 0) || reports.length < careers || s.groups.some((g) => failOn.has(g.kind));
  process.exitCode = failed ? 1 : 0;
}

void main();
