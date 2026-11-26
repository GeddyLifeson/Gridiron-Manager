// Offseason speed bench: a world of the chosen size with every bound offseason system (coach and roster
// moves with the front office policy, development, cohorts, leaving, lifecycle) and the TEST DOUBLE game
// port, timing each step per season and printing the deep world hash after each season. The hash is the
// check that a speed change kept results byte-identical: the same seed must print the same hashes.
//   npx tsx packages/world/test/loop/tools/offseason-bench.ts [--seasons=3] [--size=small] [--seed=HEX] [--recruiting=1]
// --workers=N runs the development years on N worker threads plus this one (the headless pool); the hashes
// must not change.
// --recruiting=1 adds the off-screen T4 recruiting weeks (and its signed letters) to the moves step.
// --sizes=1 adds the entry count of each part of the recruiting state per season (to see what grows).
// --hash=0 skips the deep hash (timings only). If the hash cannot be built, the line names the parts of the
// world that are largest instead, so the cause shows.
import { COLLEGE_LOOKUP, CONTENT, NAMES, PRO_LOOKUP, generation, loop, setup, testGamePort, testSchedule } from '../../fixtures.ts';
import { calendar } from '@gm/league';
import * as turnover from '../../../src/turnover/index.ts';
import * as rec from '../../../src/recruiting/index.ts';

const arg = (k: string, d: string): string => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const SEASONS = Number(arg('seasons', '3'));
const SIZE = arg('size', 'small') as generation.SizePreset;
const SEED = arg('seed', '0000000000001869');
const RECRUITING = arg('recruiting', '0') === '1';
const WORKERS = Number(arg('workers', '0'));
const HASH = arg('hash', '1') === '1';
const SIZES = arg('sizes', '0') === '1';

// The pool lives in @gm/headless, which the world may not import: loaded by path, as master-history.ts does.
type Pool = { run(jobs: readonly unknown[]): unknown[]; close(): Promise<void> };
let pool: Pool | null = null;
let developBatch: turnover.TurnoverBinding['developBatch'];
if (WORKERS > 0) {
  const wp = await import(new URL('../../../../headless/src/week-pool/index.ts', import.meta.url).href);
  const dp = await import(new URL('../../../../headless/src/world-pool/index.ts', import.meta.url).href);
  const ref = dp.developmentRef();
  pool = wp.createSyncPool({ module: ref, workers: WORKERS, mainRunner: await wp.loadJobRunner(ref) }) as Pool;
  developBatch = dp.developmentBatchPort((chunks: readonly unknown[]) => pool!.run(chunks));
}

const content = CONTENT;
const rule: turnover.RuleRead = (lvl, k) => (lvl === 'pro' ? PRO_LOOKUP : COLLEGE_LOOKUP)(k);
const t0 = performance.now();
const w = loop.createWorld({
  setup: setup({ seedHex: SEED, size: SIZE, firstSeasonYear: 2026 - SEASONS, historySeasons: SEASONS }),
  content, names: NAMES, eventTypes: [...turnover.TURNOVER_EVENT_TYPES, ...turnover.COACH_EVENT_TYPES], foundingCurves: generation.defaultFoundingCurves(),
});
console.log(JSON.stringify({ size: SIZE, seed: SEED, recruiting: RECRUITING, workers: WORKERS, teams: w.teams.length, people: w.people.size, buildMs: Math.round(performance.now() - t0) }));

const base: turnover.TurnoverBinding = { content, rule };
const binding: turnover.TurnoverBinding = { content, rule, policy: RECRUITING ? rec.lettersPolicy(turnover.gmPolicy()) : turnover.gmPolicy(), ...(developBatch ? { developBatch } : {}) };
const recruiting: rec.RecruitingBinding = { turnover: base, calendarFiles: calendar.CALENDAR_FILES, policy: () => rec.gmRecruitingPolicy() };
const timing: Record<string, number> = {};
const timed = (name: string, h: loop.StepHandler): loop.StepHandler => (ctx) => {
  const t = performance.now(); const r = h(ctx); timing[name] = (timing[name] ?? 0) + performance.now() - t; return r;
};
const systems = loop.systemsFrom({
  lifecycle: timed('lifecycle', loop.lifecycleStep({ content, names: NAMES, built: w })),
  games: timed('games', loop.gamesStep(testSchedule, testGamePort())),
  leaving: timed('leaving', loop.leavingStep()),
  cohorts: timed('cohorts', loop.cohortStep({
    scale: (world) => {
      const alive = world.teams.filter((t) => loop.isActive(world, t.id));
      const pro = alive.filter((t) => turnover.levelOfTeam(world, t.id) === 'pro').length;
      return { topCollegeTeams: alive.length - pro, draftedCount: pro * (PRO_LOOKUP(turnover.RULE_KEY.draftRounds) ?? 0), openEntryChairs: 0, retiredWouldBeCoaches: 0 };
    },
    names: NAMES, positionMix: content.levels.pro.rosterMix, homeRegion: () => 'region', kinds: ['recruit_class', 'college_walk_on', 'pro_entry_pool'],
    ...(RECRUITING ? { recruitLeadYears: rec.param('cohort.leadYears') } : {}),
  })),
  development: timed('development', turnover.developmentStep(binding)),
  moves: timed('moves', turnover.movesStep(binding, RECRUITING
    ? rec.movesWithRecruiting(recruiting, timed('rosterMoves', turnover.rosterMovesStep(binding)))
    : timed('rosterMoves', turnover.rosterMovesStep(binding)))),
}, 'offseason bench: not bound');

/** The deep hash, or the sizes of the world's largest parts when the canonical text is too long to build. */
function safeHash(): string {
  try { return loop.worldHash(w); } catch (e) {
    if (!(e instanceof RangeError)) throw e;
    const size = (v: unknown): number => { try { return JSON.stringify(v, (_k, x) => (x instanceof Map ? [...x] : x instanceof Set ? [...x] : x))?.length ?? 0; } catch { return -1; } };
    const parts: Record<string, number> = {};
    for (const [k, v] of w.systemState) parts[`systemState.${k}`] = size(v);
    for (const k of ['rosters', 'pools', 'status', 'tiers', 'nextIds'] as const) parts[k] = size(w[k]);
    return `too long to hash; sizes ${JSON.stringify(parts)}`;
  }
}

/** Entry count of each part of the recruiting state (arrays by length, records by key count). */
function recruitingCounts(): Record<string, number> {
  const st = (w.systemState.get(rec.RECRUITING_KEY) as rec.WorldRecruiting | undefined)?.state;
  if (!st) return {};
  return Object.fromEntries(Object.entries(st).map(([k, v]) => [k, Array.isArray(v) ? v.length : v !== null && typeof v === 'object' ? Object.keys(v).length : 1]));
}

/** Approximate canonical text size of each part of the recruiting state in MB, entry by entry (no one giant string), and board grade count. */
function recruitingBytes(): Record<string, number> {
  const st = (w.systemState.get(rec.RECRUITING_KEY) as rec.WorldRecruiting | undefined)?.state as unknown as Record<string, unknown> | undefined;
  if (!st) return {};
  const len = (v: unknown): number => {
    if (Array.isArray(v)) return v.reduce((a: number, x) => a + len(x), 0);
    if (v !== null && typeof v === 'object') { let n = 0; for (const [k, x] of Object.entries(v)) n += k.length + len(x); return n; }
    return JSON.stringify(v)?.length ?? 0;
  };
  const mb = (n: number) => Math.round(n / 1e5) / 10;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(st)) out[k] = mb(len(v));
  const boards = Object.values((st['boards'] ?? {}) as Record<string, { grades: object; reads: object }>);
  out['boardGradesCount'] = boards.reduce((a, b) => a + Object.keys(b.grades).length, 0);
  const reads = boards.flatMap((b) => Object.values((b as unknown as { reads: Record<string, Record<string, unknown>> }).reads));
  out['board.readsCount'] = reads.length;
  for (const part of ['evidence', 'reasons', 'rivals']) out[`read.${part}Mb`] = mb(reads.reduce((a, r) => a + len(r[part]), 0));
  for (const part of ['grades', 'reads', 'circles', 'firmness', 'academics', 'queue']) {
    out[`board.${part}Mb`] = mb(boards.reduce((a, b) => a + len((b as unknown as Record<string, unknown>)[part]), 0));
  }
  return out;
}

/** Live and archived rows of the compliance violation log (the pipeline's state in systemState). */
function complianceSize(): { live: number; archived: number } {
  const c = w.systemState.get('compliance') as { log: readonly unknown[]; archive?: readonly (readonly unknown[])[] } | undefined;
  return { live: c?.log.length ?? 0, archived: (c?.archive ?? []).reduce((a, x) => a + x.length, 0) };
}

let last = performance.now();
loop.runHistory(w, systems, {
  seasons: SEASONS, schedule: testSchedule,
  onSeason: (summary, done) => {
    const now = performance.now();
    console.log(JSON.stringify({
      season: summary.seasonYear, done, ms: Math.round(now - last), steps: Object.fromEntries(Object.entries(timing).map(([k, v]) => [k, Math.round(v)])),
      people: w.people.size, complianceLog: complianceSize(), hash: HASH ? safeHash() : 'off', ...(SIZES ? { recruitingCounts: recruitingCounts(), recruitingMb: recruitingBytes() } : {}),
    }));
    for (const k of Object.keys(timing)) timing[k] = 0;
    last = performance.now();
  },
});
if (pool) await pool.close();
