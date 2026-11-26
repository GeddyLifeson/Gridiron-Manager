// Automated calibration search (J15, Q2): measure, find the levers, propose parameter sets.
//   npx tsx packages/headless/src/tune/cli.ts <step> [options] [name=value ...]
// Steps (each writes its result into the output folder and is skipped when the result is already there):
//   measure   the baseline: every target row with a standard error
//   screen    every parameter nudged at once, many runs: leads on which parameter moves which row
//   dead      one game per parameter at the far end of its range: which parameters change nothing
//             (a dead parameter adds no noise to the screen, so this is a report, not a needed first step;
//             when it has been run, the screen leaves out dead parameters and ones the engine refused)
//   confirm   the best leads one at a time, down and up, on the baseline's seeds
//   search    bounded steps along the confirmed slopes, each one played; then a check on fresh seeds
//   report    report.md from whatever has been done so far
//   all       measure, screen, confirm, search, dead
// Options:
//   --rules pro_2026           rule set
//   --out <dir>                output folder (default test-results/tune/<rules>)
//   --workers <n>              processes (default: every core)
//   --games 96 --block 12      baseline size, and games per block (the first blocks use tune-probe's seeds)
//   --ov <file.json>           parameter overrides that define the baseline; also name=value arguments
//   --include <re> --exclude <re>   which parameters the scan may touch
//   --dead-games 1
//   --runs 256 --screen-games 2 --step 0.1      screen: runs, games per run, nudge as a share of range
//   --top 24 --params a,b      confirm: how many leads, or exact names
//   --confirm-step 0.25 --confirm-blocks 4
//   --iters 6 --holdout 96     search: steps, and fresh games per side for the final check (0 to skip)
//   --redo                     run the step again even when its result exists
// More screen runs can be added later: run `screen` again with a larger --runs.
import { execSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_ENGINE_PARAM_FILES, createRealGame } from '../real-game/index.ts';
import { rowMeta, seedHex, type BlockJob, type BlockResult, type BlockRow, type RowMeta } from './job.ts';
import { createPool, type Pool } from './pool.ts';
import { tunables, unitOf, valueAt, type Tunable } from './registry.ts';
import { confirmFit, confirmPlan, deadCheckJobs, findRefused, fitScreen, liveness, overridesAt, rankCandidates, rowNeed, screenJob, screenMoves, type Confirmed, type Liveness } from './scan.ts';
import { search, type SearchStepLog } from './search.ts';
import { pairedLoss, summarize } from './stats.ts';
import { formatTuneReport, type ReportInput } from './report.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const BASE_SEED = 0x1000, DEAD_SEED = 0x2000_0000, HOLDOUT_SEED = 0x9000_0000, DESIGN_SEED = 0x51ab;

interface Opts { [k: string]: string | boolean }
function parseArgs(argv: readonly string[]): { step: string; opts: Opts; overrides: Record<string, number> } {
  const [step = 'help', ...rest] = argv;
  const opts: Opts = {}, overrides: Record<string, number> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === '--redo') opts.redo = true;
    else if (a.startsWith('--')) opts[a.slice(2)] = rest[++i] ?? '';
    else { const [k, v] = a.split('='); if (!k || v === undefined || !Number.isFinite(Number(v))) throw new Error(`argument ${a}: want name=value`); overrides[k] = Number(v); }
  }
  return { step, opts, overrides };
}

interface Baseline { ruleSetId: string; build: string; games: number; blockGames: number; overrides: Record<string, number>; rows: string[]; blocks: BlockRow[][] }
interface DeadFile { games: number; verdict: Record<string, Liveness>; errors: Record<string, string> }
interface ScreenMeta { params: string[]; step: number; games: number; seed: number; refused: Record<string, string> }
interface ScreenLine { run: number; rows?: BlockRow[]; error?: string }
interface ConfirmFile { step: number; games: number; confirmed: Confirmed[] }
interface SearchFile {
  params: string[]; steps: SearchStepLog[]; bestU: number[]; bestBlocks: BlockRow[][]; proposal: Record<string, number>;
  holdout: null | { games: number; before: BlockRow[][]; after: BlockRow[][]; lossDrop: number; lossDropSe: number | null };
}

function main(): Promise<void> {
  const { step, opts, overrides: argOverrides } = parseArgs(process.argv.slice(2));
  const num = (k: string, d: number): number => (opts[k] === undefined ? d : Number(opts[k]));
  const ruleSetId = String(opts.rules ?? 'pro_2026');
  const out = resolve(String(opts.out ?? join(ROOT, 'test-results', 'tune', ruleSetId)));
  const file = (n: string): string => join(out, n);
  const read = <T>(n: string): T | null => (existsSync(file(n)) ? JSON.parse(readFileSync(file(n), 'utf8')) as T : null);
  const write = (n: string, v: unknown): void => writeFileSync(file(n), typeof v === 'string' ? v : JSON.stringify(v));
  const say = (s: string): void => { process.stderr.write(s + '\n'); };
  if (!['measure', 'dead', 'screen', 'confirm', 'search', 'report', 'all'].includes(step)) {
    say(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
    return Promise.resolve();
  }
  mkdirSync(out, { recursive: true });
  const metas: RowMeta[] = rowMeta(ROOT, ruleSetId);
  const baseOverrides: Record<string, number> = { ...(opts.ov ? JSON.parse(readFileSync(String(opts.ov), 'utf8')) as Record<string, number> : {}), ...argOverrides };
  let pool: Pool | null = null;
  const getPool = (): Pool => (pool ??= createPool(ROOT, opts.workers ? Number(opts.workers) : undefined));
  const redo = opts.redo === true;
  /** Steps already run again in this process: --redo runs each step once, not once per step that needs it. */
  const fresh = new Set<string>();

  /** Plays jobs on the pool with the baseline's overrides under each job's own, printing progress. */
  async function play(label: string, jobs: readonly BlockJob[], onDone?: (i: number, r: BlockResult) => void): Promise<BlockResult[]> {
    const p = getPool();
    const t0 = Date.now();
    let done = 0, last = 0;
    const games = jobs.reduce((a, j) => a + j.games, 0);
    say(`${label}: ${jobs.length} blocks, ${games} games, ${p.workers} workers`);
    const res = await p.run(jobs.map((j) => ({ ...j, overrides: { ...base().overrides, ...j.overrides } })), (i, r) => {
      done++;
      onDone?.(i, r);
      if (Date.now() - last > 30_000 || done === jobs.length) {
        last = Date.now();
        const el = (last - t0) / 1000;
        say(`  ${label}: ${done} of ${jobs.length} blocks, ${el.toFixed(0)} s, about ${((el / done) * (jobs.length - done)).toFixed(0)} s left`);
      }
    });
    return res;
  }

  let baseCache: { overrides: Record<string, number> } | null = null;
  const base = (): { overrides: Record<string, number> } => (baseCache ??= { overrides: read<Baseline>('baseline.json')?.overrides ?? baseOverrides });
  /** The tunable list at the baseline: an overridden parameter starts from its overridden value. */
  // Only what this build's game holds in its table: a file the game does not read is not a lever.
  const table = createRealGame(ruleSetId).params;
  const allParams = (): Tunable[] => tunables(ALL_ENGINE_PARAM_FILES, { include: opts.include ? new RegExp(String(opts.include)) : undefined, exclude: opts.exclude ? new RegExp(String(opts.exclude)) : undefined })
    .filter((p) => table.has(p.name))
    .map((p) => { const v = base().overrides[p.name]; return v === undefined ? p : { ...p, value: v, lo: Math.min(p.lo, v), hi: Math.max(p.hi, v) }; });
  const byName = (names: readonly string[]): Tunable[] => { const m = new Map(allParams().map((p) => [p.name, p])); return names.map((n) => { const p = m.get(n); if (!p) throw new Error(`unknown or untunable parameter ${n}`); return p; }); };
  const rowsOk = (r: BlockResult): BlockRow[] => { if (r.error) throw new Error(`a block failed: ${r.error}`); return r.rows as BlockRow[]; };
  const build = (): string => { try { return execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return 'unknown'; } };

  async function measure(): Promise<Baseline> {
    const have = fresh.has('measure') || !redo ? read<Baseline>('baseline.json') : null;
    if (have) return have;
    fresh.add('measure');
    const blockGames = num('block', 12), blocks = Math.max(2, Math.round(num('games', 96) / blockGames));
    baseCache = { overrides: baseOverrides };
    const res = await play('measure', Array.from({ length: blocks }, (_, b) => ({ ruleSetId, games: blockGames, seedHex: seedHex(BASE_SEED + b), overrides: {} })));
    const b: Baseline = { ruleSetId, build: build(), games: blocks * blockGames, blockGames, overrides: baseOverrides, rows: metas.map((m) => m.id), blocks: res.map(rowsOk) };
    write('baseline.json', b);
    const s = summarize(metas, b.blocks);
    say(`baseline: ${b.games} games, ${s.passed} of ${s.measured} rows pass, loss ${s.loss.toFixed(1)}`);
    return b;
  }

  async function dead(): Promise<DeadFile> {
    const have = read<DeadFile>('dead.json');
    if (have && !redo) return have;
    const params = allParams(), games = num('dead-games', 1);
    const res = await play('dead check', deadCheckJobs(ruleSetId, params, games, DEAD_SEED));
    const verdict = liveness(res);
    const d: DeadFile = { games, verdict: {}, errors: {} };
    params.forEach((p, j) => { d.verdict[p.name] = verdict[j]!; if (verdict[j] === 'error') d.errors[p.name] = res[j + 1]!.error ?? ''; });
    write('dead.json', d);
    say(`dead check: ${verdict.filter((v) => v === 'live').length} live, ${verdict.filter((v) => v === 'dead').length} dead, ${verdict.filter((v) => v === 'error').length} refused`);
    return d;
  }

  const readScreen = (): ScreenLine[] => (existsSync(file('screen.jsonl')) ? readFileSync(file('screen.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as ScreenLine) : []);
  function screenFit(): NonNullable<ReportInput['screen']> | null {
    const meta = read<ScreenMeta>('screen-meta.json');
    if (!meta) return null;
    const params = byName(meta.params);
    const lines = readScreen().filter((l) => l.rows);
    const fit = fitScreen(lines.map((l) => screenMoves(params, l.run, meta.step, meta.seed)), lines.map((l) => l.rows!), metas.length, params.length);
    return { params, fit, games: meta.games, step: meta.step, failedRuns: readScreen().length - lines.length, refused: meta.refused ?? {} };
  }

  async function screen(): Promise<void> {
    let meta = redo ? null : read<ScreenMeta>('screen-meta.json');
    if (!meta) {
      const d = read<DeadFile>('dead.json');
      const step = num('step', 0.1);
      let params = allParams().filter((p) => !d || d.verdict[p.name] === 'live');
      say(`screen: looking for values the engine refuses to have moved, among ${params.length} parameters`);
      const pl = getPool();
      const refused = await findRefused(params, async (set) => {
        const res = await pl.run([0, 1].map((r) => ({ ...screenJob(ruleSetId, set, r, 1, step, DESIGN_SEED), overrides: { ...base().overrides, ...overridesAt(set, screenMoves(set, r, step, DESIGN_SEED)) } })));
        return res.find((r) => r.error)?.error ?? null;
      });
      for (const [n, e] of refused) say(`  refused: ${n}: ${e}`);
      params = params.filter((p) => !refused.has(p.name));
      meta = { params: params.map((p) => p.name), step, games: num('screen-games', 2), seed: DESIGN_SEED, refused: Object.fromEntries(refused) };
      write('screen-meta.json', meta);
      write('screen.jsonl', '');
    }
    const params = byName(meta.params);
    const doneRuns = new Set(readScreen().map((l) => l.run));
    // Whole mirrored pairs only, so the design stays balanced.
    const want = Math.ceil(num('runs', 256) / 2) * 2;
    const todo = Array.from({ length: want }, (_, r) => r).filter((r) => !doneRuns.has(r));
    if (todo.length === 0) { say(`screen: ${doneRuns.size} runs already done`); return; }
    const m = meta;
    await play('screen', todo.map((r) => screenJob(ruleSetId, params, r, m.games, m.step, m.seed)), (i, r) => {
      appendFileSync(file('screen.jsonl'), JSON.stringify(r.error ? { run: todo[i], error: r.error } : { run: todo[i], rows: r.rows }) + '\n');
    });
  }

  async function confirm(): Promise<ConfirmFile> {
    const have = fresh.has('confirm') || !redo ? read<ConfirmFile>('confirm.json') : null;
    if (have) return have;
    fresh.add('confirm');
    const b = await measure();
    let names: string[];
    if (opts.params) names = String(opts.params).split(',').filter(Boolean);
    else {
      const sf = screenFit();
      if (!sf) throw new Error('confirm: run `screen` first, or name parameters with --params');
      const need = rowNeed(metas, summarize(metas, b.blocks).scores);
      names = rankCandidates(sf.fit, need, num('top', 24)).map((c) => sf.params[c.param]!.name);
    }
    const params = byName(names);
    const blocks = Math.min(num('confirm-blocks', 4), b.blocks.length), step = num('confirm-step', 0.25);
    const plan = confirmPlan(ruleSetId, params, step, blocks, b.blockGames, BASE_SEED);
    const res = await play('confirm', plan.flatMap((p) => p.jobs));
    const per = 2 * blocks;
    const c: ConfirmFile = { step, games: blocks * b.blockGames, confirmed: plan.map((p, k) => confirmFit(metas, p, res.slice(k * per, (k + 1) * per))) };
    write('confirm.json', c);
    return c;
  }

  async function doSearch(): Promise<SearchFile> {
    const have = read<SearchFile>('search.json');
    if (have && !redo) return have;
    const b = await measure(), c = await confirm();
    const good = c.confirmed.filter((x) => !x.error);
    const params = byName(good.map((x) => x.name));
    const slopes = metas.map((_, i) => good.map((x) => { const s = x.slope[i], se = x.se[i]; return s !== null && se !== null && s !== undefined && se !== undefined && se > 0 && Math.abs(s / se) >= 2 ? s : 0; }));
    const at = (u: readonly number[]): Record<string, number> => {
      const o: Record<string, number> = {};
      params.forEach((p, j) => { if (Math.abs(u[j]! - unitOf(p)) > 1e-9) o[p.name] = valueAt(p, u[j]!); });
      return o;
    };
    const blocksAt = async (label: string, u: readonly number[] | null, seed: number, blocks: number): Promise<BlockRow[][] | null> => {
      const res = await play(label, Array.from({ length: blocks }, (_, k) => ({ ruleSetId, games: b.blockGames, seedHex: seedHex(seed + k), overrides: u ? at(u) : {} })));
      return res.some((r) => r.error) ? null : res.map((r) => r.rows as BlockRow[]);
    };
    let n = 0;
    const r = await search({
      metas, slopes, startU: params.map((p) => unitOf(p)), startBlocks: b.blocks, iterations: num('iters', 6), log: say,
      evaluate: (u) => blocksAt(`search step ${++n}`, u, BASE_SEED, b.blocks.length),
    });
    const s: SearchFile = { params: params.map((p) => p.name), steps: r.steps, bestU: r.bestU, bestBlocks: r.bestBlocks as BlockRow[][], proposal: at(r.bestU), holdout: null };
    const hold = Math.round(num('holdout', 96) / b.blockGames);
    if (hold >= 2 && Object.keys(s.proposal).length > 0) {
      const before = await blocksAt('fresh check, before', null, HOLDOUT_SEED, hold), after = await blocksAt('fresh check, after', r.bestU, HOLDOUT_SEED, hold);
      if (before && after) { const d = pairedLoss(metas, before, after); s.holdout = { games: hold * b.blockGames, before, after, lossDrop: d.drop, lossDropSe: d.se }; }
    }
    write('search.json', s);
    write('proposal.json', JSON.stringify({ ...b.overrides, ...s.proposal }, null, 2) + '\n');
    return s;
  }

  function report(): void {
    const b = read<Baseline>('baseline.json');
    if (!b) throw new Error('report: run `measure` first');
    const d = read<DeadFile>('dead.json'), c = read<ConfirmFile>('confirm.json'), s = read<SearchFile>('search.json');
    const deadParams = d ? allParams().filter((p) => d.verdict[p.name] !== undefined) : [];
    const input: ReportInput = {
      ruleSetId, build: b.build, metas, baseline: b,
      ...(d ? { dead: { games: d.games, params: deadParams, verdict: deadParams.map((p) => d.verdict[p.name]!), errors: d.errors } } : {}),
      ...(screenFit() ? { screen: screenFit()! } : {}),
      ...(c ? { confirm: { params: byName(c.confirmed.map((x) => x.name)), confirmed: c.confirmed, step: c.step, games: c.games } } : {}),
      ...(s ? { search: { params: byName(s.params), steps: s.steps, bestU: s.bestU, best: summarize(metas, s.bestBlocks),
        holdout: s.holdout ? { games: s.holdout.games, before: summarize(metas, s.holdout.before), after: summarize(metas, s.holdout.after), lossDrop: s.holdout.lossDrop, lossDropSe: s.holdout.lossDropSe } : null } } : {}),
    };
    write('report.md', formatTuneReport(input));
    say(`report: ${file('report.md')}`);
  }

  const steps: Record<string, () => Promise<unknown>> = {
    measure, dead: async () => { await measure(); await dead(); }, screen: async () => { await measure(); await screen(); }, confirm, search: doSearch, report: async () => undefined,
    all: async () => { await measure(); await screen(); await confirm(); await doSearch(); await dead(); },
  };
  return steps[step]!().then(() => { report(); }).finally(() => pool?.close());
}

main().catch((e: unknown) => { process.stderr.write(`tune: ${e instanceof Error ? e.message : String(e)}\n`); process.exit(1); });
