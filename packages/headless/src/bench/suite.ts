// G-97 benchmark suite (P6.5.1): one benchmark per P6.1.1 budget row. Rows the build cannot run yet
// are listed with the reason, never left out (P6.1.1 acceptance: "each row has a benchmark").
//
// Tiers follow P6.5.1: `change` runs on every change (single play, single game, 500-run bench, plus
// the cheap extras), `nightly` adds the world week, a season and 10,000 games, `weekly` the long runs.
// Every game benchmark also checks determinism: repeats must give the same hashes, so a speed change
// that alters a result fails here before it reaches the golden check.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Decider, GameDeps, GameInput, Resolver } from '@gm/schema';
import { canonicalBytes, hash64Hex } from '@gm/engine-core';
import { flow } from '@gm/engine-game';
import { createRealGame, type RealGame } from '../real-game/index.ts';
import { gameSeedHex } from '../calibration/batch.ts';
import { runBatchOnWorkers } from '../batch/run.ts';
import { realFactoryRef } from '../batch/real-factory.ts';
import { median, timeRepeats } from './measure.ts';

export type Tier = 'change' | 'nightly' | 'weekly';
export const TIERS: readonly Tier[] = ['change', 'nightly', 'weekly'];

/** met / missed: measured against the budget on this machine. projected: computed from measured parts. not_measurable: the build lacks the system. */
export type BenchStatus = 'met' | 'missed' | 'projected_met' | 'projected_missed' | 'not_measurable';

export interface BenchResult {
  readonly id: string;
  /** The P6.1.1 row (or other bible row) this benchmark answers. */
  readonly row: string;
  readonly tier: Tier;
  readonly budgetMs: number | null;
  /** The machine the budget names (P6.1.1 "Machine" column). */
  readonly budgetMachine: string;
  /** Median wall time in ms, or null when not measured. */
  readonly ms: number | null;
  /** Each repeat's time in ms. */
  readonly samples: readonly number[];
  readonly status: BenchStatus;
  /** True when this benchmark is compared with the stored baseline (P6.5.1 change set). */
  readonly gated: boolean;
  /** Result hash: equal across repeats and runs, or the run fails. */
  readonly hash: string | null;
  readonly note: string;
  readonly extra?: Readonly<Record<string, number | string>>;
}

export interface SuiteOptions {
  readonly repeats: number;
  readonly workers: number;
  readonly tiers: readonly Tier[];
  /** Weekly long runs: run them in full (true) or project them from the measured game cost (false). */
  readonly fullLongRuns: boolean;
  /** Test hook: wraps the resolver of every single-thread game (the P6.5.1 "add 20% delay" check). */
  readonly wrapResolver?: (r: Resolver) => Resolver;
  /** Test hook: leave out the tick-resolver child process. */
  readonly skipTick?: boolean;
  readonly log?: (line: string) => void;
}

const MASTER_SEED = '00000000000097a1';
const SINGLE_GAMES: readonly { rules: string; index: number }[] = [
  { rules: 'pro_2026', index: 0 }, { rules: 'pro_2026', index: 1 }, { rules: 'college_2026', index: 0 }, { rules: 'college_2026', index: 1 },
];
/** Planning game counts from P6.1.1 and P5.4.1 (assumptions there, not football facts). */
export const COUNTS = { proWeek: 15, worldWeekPro: 15, worldWeekCollege: 65, season: 1110, calibration: 10_000, careerSeasons: 30, advanceSeasons: 20 } as const;

const hashOf = (v: unknown): string => hash64Hex(canonicalBytes(v));

function statusOf(ms: number | null, budget: number | null, projected = false): BenchStatus {
  if (ms === null || budget === null) return 'not_measurable';
  if (projected) return ms <= budget ? 'projected_met' : 'projected_missed';
  return ms <= budget ? 'met' : 'missed';
}

interface Timed { calls: number; ms: number; max: number }
const timed = (): Timed => ({ calls: 0, ms: 0, max: 0 });
function note(t: Timed, ms: number): void { t.calls++; t.ms += ms; if (ms > t.max) t.max = ms; }

function timedResolver(r: Resolver, t: Timed): Resolver {
  return { id: r.id, version: r.version, mayProduceSavedResults: r.mayProduceSavedResults, simulatePlay(input) { const t0 = performance.now(); const out = r.simulatePlay(input); note(t, performance.now() - t0); return out; } };
}
function timedDecider(d: Decider, t: Timed): Decider {
  return { side: d.side, decide(view) { const t0 = performance.now(); const out = d.decide(view); note(t, performance.now() - t0); return out; } };
}

interface GameProbe { ms: number; plays: number; hash: string; resolver: Timed; decider: Timed; input: GameInput; deps: GameDeps; events: number }

function playGame(game: RealGame, index: number, wrap?: (r: Resolver) => Resolver): GameProbe {
  const input = game.input(index, gameSeedHex(MASTER_SEED, index));
  const base = game.deps(input);
  const resolver = timed(), decider = timed();
  const deps: GameDeps = { ...base, resolver: timedResolver(wrap ? wrap(base.resolver) : base.resolver, resolver), deciders: [timedDecider(base.deciders[0], decider), timedDecider(base.deciders[1], decider)] };
  const t0 = performance.now();
  const result = flow.simulateGame(input, deps);
  const ms = performance.now() - t0;
  return { ms, plays: result.records.length, hash: hashOf(result.events), resolver, decider, input, deps, events: result.events.length };
}

const games = new Map<string, RealGame>();
function realGame(rules: string): RealGame {
  let g = games.get(rules);
  if (!g) { g = createRealGame(rules); games.set(rules, g); }
  return g;
}

/** Single game, per-play and per-call costs, re-simulation for film, event replay. */
function gameBenches(o: SuiteOptions): BenchResult[] {
  const perGame: number[] = [], perPlay: number[] = [], perCall: number[] = [], resim: number[] = [], replay: number[] = [];
  let maxPlay = 0, maxCall = 0, hashes: string[] | null = null;
  for (const g of SINGLE_GAMES) playGame(realGame(g.rules), g.index, o.wrapResolver); // warm-up
  for (let r = 0; r < o.repeats; r++) {
    let ms = 0, plays = 0, pms = 0, pcalls = 0, cms = 0, ccalls = 0, rms = 0, xms = 0;
    const hs: string[] = [];
    for (const g of SINGLE_GAMES) {
      const game = realGame(g.rules);
      const p = playGame(game, g.index, o.wrapResolver);
      ms += p.ms; plays += p.plays; pms += p.resolver.ms; pcalls += p.resolver.calls; cms += p.decider.ms; ccalls += p.decider.calls;
      maxPlay = Math.max(maxPlay, p.resolver.max); maxCall = Math.max(maxCall, p.decider.max);
      hs.push(p.hash);
      // P5.4.1 film: re-simulate the stored game from its input and seed; it must reproduce the same events.
      const t0 = performance.now();
      const again = flow.simulateGame(p.input, game.deps(p.input));
      rms += performance.now() - t0;
      if (hashOf(again.events) !== p.hash) throw new Error(`bench: re-simulating ${g.rules} game ${g.index} gave different events (determinism broken)`);
      // J11.1.1: rebuild the final state from the event list alone.
      const t1 = performance.now();
      const deps = game.deps(p.input);
      const rebuilt = flow.replayEvents(deps, flow.newGame(p.input, deps), again.events);
      xms += performance.now() - t1;
      if (hashOf(rebuilt) !== hashOf(again.final)) throw new Error(`bench: replaying the events of ${g.rules} game ${g.index} did not rebuild the final state`);
    }
    if (hashes && hashes.join() !== hs.join()) throw new Error('bench: game results differ between repeats (determinism broken)');
    hashes = hs;
    perGame.push(ms / SINGLE_GAMES.length); perPlay.push(pms / pcalls); perCall.push(cms / Math.max(1, ccalls));
    resim.push(rms / SINGLE_GAMES.length); replay.push(xms / SINGLE_GAMES.length);
    o.log?.(`  game repeat ${r + 1}: ${(ms / SINGLE_GAMES.length).toFixed(1)} ms a game, ${plays / SINGLE_GAMES.length} plays`);
  }
  const hash = hashOf(hashes);
  const g = median(perGame), p = median(perPlay), c = median(perCall), s = median(resim), x = median(replay);
  return [
    { id: 'game.single', row: 'P6.1.1 One full game, full engine, no display', tier: 'change', budgetMs: 2000, budgetMachine: 'one core', ms: g, samples: perGame, status: statusOf(g, 2000), gated: true, hash,
      note: 'Real phase 1 game: game flow, officiating, statistics, chart caller, reference resolver; placeholder rosters. Pro and college, two games each.' },
    { id: 'play.reference', row: 'P6.1.1 Test-bench row: "a play costs about 12 ms"', tier: 'change', budgetMs: 12, budgetMachine: 'minimum target, one core', ms: p, samples: perPlay, status: statusOf(p, 12), gated: true, hash,
      note: 'Resolver time per play inside real games (reference resolver, no trajectory).', extra: { maxMs: Math.round(maxPlay * 1000) / 1000 } },
    { id: 'ai.call', row: 'P6.3.1 AI play calling: 20 ms per call', tier: 'change', budgetMs: 20, budgetMachine: 'one core', ms: c, samples: perCall, status: statusOf(c, 20), gated: true, hash,
      note: 'Every decider answer in real games (chart caller, WP-13). The coach AI (G-58) replaces it.', extra: { maxMs: Math.round(maxCall * 1000) / 1000 } },
    { id: 'game.resim', row: 'P6.1.1 Re-simulate one stored game for film (P5.4.1)', tier: 'change', budgetMs: 3000, budgetMachine: 'minimum target', ms: s, samples: resim, status: statusOf(s, 3000), gated: true, hash,
      note: 'Re-runs the game from its input and seed and checks the events are identical. No trajectories yet: the reference resolver records none.' },
    { id: 'game.replay', row: 'J11.1.1 Rebuild a game state from its event list', tier: 'change', budgetMs: null, budgetMachine: 'one core', ms: x, samples: replay, status: 'not_measurable', gated: true, hash,
      note: 'No bible budget; measured so a slowdown in loading a saved game shows.' },
  ];
}

/** P6.1.1 row 1 and the 500-run bench row, on the tick resolver (child process: the WP-23 fixtures live in engine-core's tests). */
function tickBenches(o: SuiteOptions): BenchResult[] {
  const script = fileURLToPath(new URL('../../../engine-core/test/bench/tick-play.ts', import.meta.url));
  const run = spawnSync(process.execPath, ['--import', 'tsx', script, String(o.repeats), '20', '500'], { encoding: 'utf8', maxBuffer: 1 << 24 });
  if (run.status !== 0) throw new Error(`tick bench failed: ${run.stderr}`);
  const r = JSON.parse(run.stdout.trim().split('\n').pop()!) as { msPerPlay: number[]; plays: number; resultHash: string; standIns: string[]; bench500Ms: number[]; bench500Hash: string };
  const p = median(r.msPerPlay), b = median(r.bench500Ms);
  const stand = r.standIns.length ? ` Stand-in modules: ${r.standIns.join(', ')}.` : '';
  // The same row with the real quarterback plugged in (WP-20): what a play costs once real modules replace stand-ins.
  const qbScript = fileURLToPath(new URL('../../../engine-core/test/bench/qb-play.ts', import.meta.url));
  const qbRun = spawnSync(process.execPath, ['--import', 'tsx', qbScript, String(o.repeats), '60'], { encoding: 'utf8', maxBuffer: 1 << 24 });
  if (qbRun.status !== 0) throw new Error(`quarterback play bench failed: ${qbRun.stderr}`);
  const q = JSON.parse(qbRun.stdout.trim().split('\n').pop()!) as { msPerPlay: number[]; plays: number; resultHash: string; standIns: string[] };
  const qm = median(q.msPerPlay);
  return [
    { id: 'play.tick.qb', row: 'P6.1.1 One play, full engine, real quarterback module', tier: 'change', budgetMs: 50, budgetMachine: 'minimum target, one core', ms: qm, samples: q.msPerPlay, status: statusOf(qm, 50), gated: true, hash: q.resultHash,
      note: `Tick resolver with the real quarterback plug (WP-20) on ${q.plays} fixture pass and run plays.${q.standIns.length ? ` Stand-in modules: ${q.standIns.join(', ')}.` : ''}` },
    { id: 'play.tick', row: 'P6.1.1 One play, full engine, trajectory recorded', tier: 'change', budgetMs: 50, budgetMachine: 'minimum target, one core', ms: p, samples: r.msPerPlay, status: statusOf(p, 50), gated: true, hash: r.resultHash,
      note: `Tick resolver (WP-23) with full record, on the WP-23 fixture plays (${r.plays} plays: pass, run, punt, field goal, kickoff).${stand}` },
    { id: 'bench.500', row: 'P6.1.1 Test-bench batch, 500 runs of one play (O3.1.4)', tier: 'change', budgetMs: 5000, budgetMachine: 'minimum target', ms: b, samples: r.bench500Ms, status: statusOf(b, 5000), gated: true, hash: r.bench500Hash,
      note: `Tick resolver, one fixture pass play, 500 seeds, summary record.${stand}` },
  ];
}

async function batchMs(rules: string, n: number, workers: number, seed: string): Promise<{ ms: number; hash: string; plays: number }> {
  const t0 = performance.now();
  const rep = await runBatchOnWorkers({ factory: realFactoryRef({ ruleSetId: rules }), variant: { label: 'bench', resolverId: 'reference' }, masterSeedHex: seed, games: n }, workers);
  return { ms: performance.now() - t0, hash: rep.batchHash, plays: rep.outcomes.reduce((s, x) => s + x.plays, 0) };
}

/** A mixed world batch: pro and college games side by side on the same workers (wall time of the slower). */
async function worldBatch(pro: number, college: number, workers: number, seed: string): Promise<{ ms: number; hash: string }> {
  const proW = Math.max(1, Math.round((workers * pro) / (pro + college)));
  const colW = Math.max(1, workers - proW);
  const t0 = performance.now();
  const [a, b] = await Promise.all([
    pro ? batchMs('pro_2026', pro, Math.min(proW, workers), seed) : Promise.resolve({ ms: 0, hash: '', plays: 0 }),
    college ? batchMs('college_2026', college, workers === 1 ? 1 : colW, seed) : Promise.resolve({ ms: 0, hash: '', plays: 0 }),
  ]);
  return { ms: performance.now() - t0, hash: hashOf([a.hash, b.hash]) };
}

async function nightlyBenches(o: SuiteOptions): Promise<BenchResult[]> {
  const w = o.workers;
  const out: BenchResult[] = [];
  const reps = Math.max(1, Math.min(o.repeats, 3));
  const week: number[] = []; let weekHash = '';
  for (let r = 0; r < reps; r++) {
    const b = await batchMs('pro_2026', COUNTS.proWeek, w, MASTER_SEED);
    if (weekHash && b.hash !== weekHash) throw new Error('bench: pro week batch hash changed between repeats');
    weekHash = b.hash; week.push(b.ms);
  }
  const wm = median(week);
  out.push({ id: 'week.pro', row: 'P6.1.1 Pro week, the other 15 games', tier: 'nightly', budgetMs: 10_000, budgetMachine: 'minimum target, 4 pool workers', ms: wm, samples: week, status: statusOf(wm, 10_000), gated: false, hash: weekHash,
    note: `${COUNTS.proWeek} pro games on ${w} worker threads, worker start-up included.` });
  const ww: number[] = []; let wwHash = '';
  for (let r = 0; r < reps; r++) {
    const b = await worldBatch(COUNTS.worldWeekPro, COUNTS.worldWeekCollege, w, MASTER_SEED);
    if (wwHash && b.hash !== wwHash) throw new Error('bench: world week batch hash changed between repeats');
    wwHash = b.hash; ww.push(b.ms);
  }
  const wwm = median(ww);
  out.push({ id: 'week.world', row: 'P6.1.1 World week, about 80 other games', tier: 'nightly', budgetMs: 45_000, budgetMachine: 'minimum target, 4 pool workers', ms: wwm, samples: ww, status: statusOf(wwm, 45_000), gated: false, hash: wwHash,
    note: `${COUNTS.worldWeekPro} pro and ${COUNTS.worldWeekCollege} college games on ${w} workers. AI weekly preparation (0.5 core-s a team) is not in the build yet.` });
  const pro = Math.round((COUNTS.season * COUNTS.worldWeekPro) / (COUNTS.worldWeekPro + COUNTS.worldWeekCollege));
  const s = await worldBatch(pro, COUNTS.season - pro, w, '000000000000a5e1');
  out.push({ id: 'season.world', row: 'P6.1.1 One season of the default world, about 1,110 games', tier: 'nightly', budgetMs: 600_000, budgetMachine: 'minimum target, 4 pool workers', ms: s.ms, samples: [s.ms], status: statusOf(s.ms, 600_000), gated: false, hash: s.hash,
    note: `${pro} pro and ${COUNTS.season - pro} college games on ${w} workers. Games only: the world loop (G-81) is not in yet.` });
  const c = await worldBatch(COUNTS.calibration / 2, COUNTS.calibration / 2, w, '000000000000ca1b');
  // P6.1.1 names 16 cores; scale the measured wall time by worker count to the 16-core figure.
  const at16 = (c.ms * w) / 16;
  out.push({ id: 'calibration.10k', row: 'P6.1.1 10,000 games for calibration', tier: 'nightly', budgetMs: 1_800_000, budgetMachine: '16 cores', ms: at16, samples: [c.ms], status: statusOf(at16, 1_800_000, w !== 16), gated: false, hash: c.hash,
    note: `Measured ${(c.ms / 1000).toFixed(0)} s on ${w} workers, scaled to 16 cores${w === 16 ? '' : ' (projection)'}.`, extra: { measuredMs: Math.round(c.ms), workers: w } });
  return out;
}

function weeklyBenches(o: SuiteOptions, gameMs: number | null): Promise<BenchResult[]> | BenchResult[] {
  if (gameMs === null) return [];
  // Long runs are projected from the measured single-game cost unless asked to run in full (on the long-run machine).
  const careerGames = COUNTS.careerSeasons * COUNTS.season;
  const career16 = (careerGames * gameMs) / 16;
  const advance4 = (COUNTS.advanceSeasons * COUNTS.season * gameMs) / 4;
  const out: BenchResult[] = [
    { id: 'career.30season', row: 'P6.1.1 30-season headless career run (Q1.6.1)', tier: 'weekly', budgetMs: 90 * 60_000, budgetMachine: '16 cores', ms: career16, samples: [], status: statusOf(career16, 90 * 60_000, true), gated: false, hash: null,
      note: `Projected: ${careerGames} games x ${gameMs.toFixed(0)} ms / 16 cores. Games only; the world loop (G-81) and the long-run harness (G-88) are not in yet.` },
    { id: 'advance.20season', row: 'P6.1.1 20-season advance (O7.6.3): budget 3.5 h, target 60 min', tier: 'weekly', budgetMs: 210 * 60_000, budgetMachine: 'minimum target, 4 pool workers', ms: advance4, samples: [], status: statusOf(advance4, 210 * 60_000, true), gated: false, hash: null,
      note: `Projected: ${COUNTS.advanceSeasons * COUNTS.season} games x ${gameMs.toFixed(0)} ms / 4 workers; ${advance4 <= 60 * 60_000 ? 'inside' : 'outside'} the 60-minute target. Games only.`, extra: { targetMs: 60 * 60_000 } },
  ];
  if (!o.fullLongRuns) return out;
  return (async () => {
    const t0 = performance.now();
    const r = await worldBatch(Math.round(careerGames / 2), careerGames - Math.round(careerGames / 2), o.workers, '000000000000c30a');
    const ms = performance.now() - t0, at16 = (ms * o.workers) / 16;
    return [{ ...out[0]!, ms: at16, samples: [ms], status: statusOf(at16, 90 * 60_000, o.workers !== 16), hash: r.hash, note: `Ran ${careerGames} games on ${o.workers} workers in ${(ms / 60_000).toFixed(1)} min, scaled to 16 cores. Games only.` }, out[1]!];
  })();
}

/** Rows the build cannot measure yet. Listed so the report covers every P6.1.1 row. */
export const NOT_YET: readonly BenchResult[] = [
  { id: 'career.open', row: 'P6.1.1 Open a career', tier: 'change', budgetMs: 5000, budgetMachine: 'minimum target', ms: null, samples: [], status: 'not_measurable', gated: false, hash: null, note: 'Needs a default-sized world save (G-81 world generation); headless may not import the app services.' },
  { id: 'season.archive', row: 'P6.1.1 Season archive step (P5.4.2)', tier: 'nightly', budgetMs: 60_000, budgetMachine: 'minimum target', ms: null, samples: [], status: 'not_measurable', gated: false, hash: null, note: 'Needs a season of saved world data (G-87 season runner).' },
  { id: 'ai.prep', row: 'P6.1.1 AI weekly preparation, 0.5 core-s a team a week', tier: 'nightly', budgetMs: 500, budgetMachine: 'one core', ms: null, samples: [], status: 'not_measurable', gated: false, hash: null, note: 'Coach AI preparation (G-57/G-58) is not in the build.' },
  { id: 'tick.alloc', row: 'P6.3.1 Allocation counter for a play\'s tick loop reads zero', tier: 'change', budgetMs: null, budgetMachine: 'benchmark build', ms: null, samples: [], status: 'not_measurable', gated: false, hash: null, note: 'Needs an allocation-counting build of the tick loop.' },
];

export async function runSuite(o: SuiteOptions): Promise<BenchResult[]> {
  const out: BenchResult[] = [];
  const want = new Set(o.tiers);
  if (want.has('change')) {
    o.log?.('change tier: single game, play, AI call, re-simulation');
    out.push(...gameBenches(o));
    if (!o.skipTick) {
      o.log?.('change tier: tick resolver play and 500-run bench');
      out.push(...tickBenches(o));
    }
  }
  if (want.has('nightly')) { o.log?.('nightly tier: week, world week, season, 10,000 games'); out.push(...(await nightlyBenches(o))); }
  if (want.has('weekly')) {
    const g = out.find((b) => b.id === 'game.single')?.ms ?? (o.log?.('weekly tier: measuring the single game first'), gameBenches({ ...o, repeats: Math.min(o.repeats, 3) })[0]!.ms);
    out.push(...(await weeklyBenches(o, g)));
  }
  out.push(...NOT_YET.filter((b) => want.has(b.tier)));
  return out;
}

