#!/usr/bin/env node
// Headless runner (P2.3.4). Same packages as the application; nothing in the engine knows which
// shell called it. Run with: npm run headless -- <subcommand> [options]
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { createWriteStream, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { cpus, platform as osPlatform, arch } from 'node:os';
import {
  runGolden, compareGolden, seasonFixtures, summariseSeason, playGame, dummyTeams,
  type GoldenReport, type GameRecord,
} from '@gm/engine-game';
import { seedFromNumber, seedFromHex } from '@gm/engine-core';
import { resolveRuleSet } from '@gm/rules-data';
import { WorldService } from '@gm/app-services';
import { readHeader, SqlJsDriver } from '@gm/store';
import { NodePlatform, sqlJs } from './node-platform.ts';
import { goldenInputs } from './golden-inputs.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const GOLDEN_FILE = join(ROOT, 'golden', 'golden.json');

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function platformLabel(): string {
  return `node-${osPlatform()}-${arch()}`;
}

async function seasonWithWorkers(ruleSetId: string, workers: number): Promise<string> {
  const fixtures = seasonFixtures();
  // Deliberately scrambled order across workers: results must not depend on it.
  const order = fixtures.map((_, i) => i).sort((a, b) => ((a * 7919) % 31) - ((b * 7919) % 31));
  const chunks: number[][] = Array.from({ length: workers }, () => []);
  order.forEach((idx, k) => chunks[k % workers]!.push(idx));
  const workerUrl = new URL('./season-worker.ts', import.meta.url);
  const results = await Promise.all(chunks.filter((c) => c.length).map((indexes) => new Promise<GameRecord[]>((res, rej) => {
    const w = new Worker(fileURLToPath(workerUrl), { workerData: { ruleSetId, indexes }, execArgv: ['--import', 'tsx'] });
    w.once('message', res);
    w.once('error', rej);
  })));
  // Arrival order is whatever the workers produced; summariseSeason applies schedule order.
  return summariseSeason(ruleSetId, fixtures, results.flat().reverse()).seasonHash;
}

async function gate(): Promise<number> {
  const t0 = Date.now();
  const report = runGolden(goldenInputs(), (s) => process.stderr.write(`  golden: ${s}\n`));
  const mismatches: string[] = [];
  const workerCounts = [1, Math.min(8, Math.max(2, cpus().length))];
  const workerChecks: Record<string, string> = {};
  for (const id of ['pro_2026', 'college_2026']) {
    for (const n of workerCounts) {
      const h = await seasonWithWorkers(id, n);
      workerChecks[`${id}.season.workers${n}`] = h;
      if (h !== report.results[`${id}.season`]) mismatches.push(`${id} season with ${n} workers: ${h} differs from single-thread ${report.results[`${id}.season`]}`);
    }
  }
  if (flag('write-golden')) {
    await mkdir(dirname(GOLDEN_FILE), { recursive: true });
    await writeFile(GOLDEN_FILE, JSON.stringify(report, null, 2) + '\n');
    console.log(`wrote ${GOLDEN_FILE}`);
  }
  if (!existsSync(GOLDEN_FILE)) { console.error('no golden file; run with --write-golden once and commit it with a reason'); return 1; }
  const golden = JSON.parse(await readFile(GOLDEN_FILE, 'utf8')) as GoldenReport;
  const cmp = compareGolden(report, golden);
  mismatches.push(...cmp.mismatches);
  const result = {
    suite: 'Q1.3.1 golden-seed determinism (phase 0 dummy game)',
    platform: platformLabel(),
    runtime: `node ${process.versions.node} (V8 ${process.versions.v8})`,
    ok: mismatches.length === 0,
    digest: report.digest,
    goldenDigest: golden.digest,
    mismatches,
    workerChecks,
    counts: report.counts,
    seconds: Math.round((Date.now() - t0) / 100) / 10,
  };
  const out = arg('out') ?? join(ROOT, 'test-results', `gate-${platformLabel()}.json`);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(result, null, 2) + '\n');
  console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.suite} on ${result.platform}: digest ${report.digest} (golden ${golden.digest}), ${result.seconds}s -> ${out}`);
  for (const m of mismatches) console.log(`  mismatch: ${m}`);
  return result.ok ? 0 : 1;
}

async function games(): Promise<number> {
  const rules = resolveRuleSet(arg('rules', 'pro_2026')!);
  const count = Number(arg('count', '10'));
  const base = Number(arg('seed', '1'));
  const out = arg('out');
  const sink = out ? createWriteStream(out) : null;
  let plays = 0;
  for (let i = 0; i < count; i++) {
    const seed = seedFromNumber(base + i);
    const [a, b] = dummyTeams(seed, 2);
    const g = playGame(i + 1, a!, b!, rules, seed);
    plays += g.plays.length;
    // Streamed, so a large batch never holds every play in memory (P2.3.4 edge case).
    if (sink) for (const p of g.plays) sink.write(JSON.stringify(p) + '\n');
    console.log(`game ${i + 1}: ${g.finalState.teams[0].score}-${g.finalState.teams[1].score}, ${g.plays.length} plays, chain ${g.chainHead}`);
  }
  sink?.end();
  console.log(`${count} games, ${plays} plays (${rules.id})`);
  return 0;
}

async function newSave(): Promise<number> {
  const file = process.argv[3];
  if (!file) { console.error('usage: new-save <dir/name> [--seed hex] [--year 2026] [--advance days]'); return 2; }
  const p = new NodePlatform(dirname(resolve(file)));
  const name = file.split(/[\\/]/).pop()!.replace(/\.gmsave$/, '');
  const seedHex = (arg('seed', '00000000c0ffee01')!).padStart(16, '0');
  seedFromHex(seedHex);
  const svc = await WorldService.newCareer(p, { saveName: name, masterSeedHex: seedHex, startSeasonYear: Number(arg('year', '2026')) });
  const adv = Number(arg('advance', '0'));
  for (let i = 0; i < adv; i++) await svc.run('AdvanceDay', { days: 1 });
  console.log(JSON.stringify(svc.worldSummary().data));
  await svc.close();
  return 0;
}

async function replay(): Promise<number> {
  const file = process.argv[3];
  if (!file) { console.error('usage: replay <file.gmsave>'); return 2; }
  const p = new NodePlatform(dirname(resolve(file)));
  const name = file.split(/[\\/]/).pop()!.replace(/\.gmsave$/, '');
  const header = await readHeader(SqlJsDriver.open(await sqlJs(), new Uint8Array(await readFile(resolve(file)))));
  console.log(`header: ${header.summary}; chain head ${header.hashChainHead}; made with ${header.createdWith}`);
  try {
    const svc = await WorldService.load(p, name);
    const v = await svc.verify();
    console.log(`replay OK: state ${v.replayedHash}, chain head ${svc.saveHeader().hashChainHead}`);
    await svc.close();
    return 0;
  } catch (e) {
    console.log(`replay FAILED: ${(e as Error).message}`);
    return 1;
  }
}

async function validate(): Promise<number> {
  const { runLint } = await import('@gm/tools');
  return runLint(ROOT);
}

const later: Record<string, string> = {
  seasons: 'phase 4 (R1.2.5)', careers: 'phase 6 (Q1.6.1)', bench: 'phase 2 (R1.2.3)', sweep: 'phase 2 (Q1.7.3)',
  search: 'phase 8 (Q4)', diff: 'phase 1 (Q1.3.2)',
};

async function main(): Promise<number> {
  const sub = process.argv[2];
  switch (sub) {
    case 'gate': return gate();
    case 'games': return games();
    case 'new-save': return newSave();
    case 'replay': return replay();
    case 'validate': return validate();
    default:
      if (sub && later[sub]) { console.error(`'${sub}' is built in ${later[sub]}.`); return 2; }
      console.error('subcommands: gate [--write-golden] [--out f], games [--rules id --count n --seed s --out f.jsonl], new-save <path>, replay <file.gmsave>, validate');
      console.error(`later: ${Object.keys(later).join(', ')}`);
      return 2;
  }
}

main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
