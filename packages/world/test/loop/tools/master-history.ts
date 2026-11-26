// The master data run (Marlon 2026-11-26): the full fictional history from football's first season (1869)
// to today, on a full-size world, with every bound system and the REAL game engine for every game. Its
// output is gathered and baked into the game; a player's own rerun or shorter history never changes it.
//
// Run on a many-core PC (Node 22+, from the repo root):
//   npx tsx packages/world/test/loop/tools/master-history.ts --out=master-run [--seed=HEX] [--workers=N]
//       [--seasons=157] [--size=full] [--games=real|test] [--lost=1] [--code=bundle|source] [--checkpoint-every=N] [--resume] [--today=YEAR]
//
// --workers defaults to the core count minus one; the calling thread plays games too. --games=test swaps
// in the TEST DOUBLE game port for a quick dry run of the whole pipeline; every output then says so, and
// such a run must never be baked. --seasons shortens the span (it always ends the season before today).
// --code=bundle (the default) plays every game from plain JavaScript bundles of the week pool's worker and
// job (headless week-pool/bundle.ts: no TypeScript loader, about 9% faster); --code=source plays them from
// the TypeScript sources through tsx. Both give the same world hash.
//
// Output folder (one file per kind, all rewritten after every season, so a stopped run keeps what it reached):
//   progress.jsonl  one line per season: summary, step times, heap, people, active teams, hall members
//   run.json        setup, seed, world code, steps left unbound, validation, world hash, totals, status
//                   (running with seasonsRun after each season; stopped or finished at the end)
//   teams.json      every team: identity, competition, founded, folded
//   hall.json       hall members and every ballot
//   tenures.json    completed head coach tenures, and staff seasons per team
// Field names are a contract with the bake (run.json formatVersion); change them only with a version bump.
// The run is deterministic: the same seed, size and seasons give the same world hash on any machine and
// any worker count (G-97: results are placed by game index).
import { appendFileSync, closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, renameSync, writeFileSync, writeSync } from 'node:fs';
import { deserialize, serialize } from 'node:v8';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { COLLEGE_LOOKUP, CONTENT, NAMES, PRO_LOOKUP, generation, loop, setup, testGamePort } from '../../fixtures.ts';
import * as turnover from '../../../src/turnover/index.ts';
import * as health from '../../../src/health/index.ts';
import { medical } from '@gm/league';

const arg = (k: string, d: string): string => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const OUT = arg('out', 'master-run');
const SEED = arg('seed', '0000000000001869');
const SEASONS = Number(arg('seasons', String(generation.fullHistorySeasons(new Date().getUTCFullYear()))));
const SIZE = arg('size', 'full') as generation.SizePreset;
const GAMES = arg('games', 'real');
const LOST = Number(arg('lost', '1'));
const CODE = arg('code', 'bundle');
if (CODE !== 'bundle' && CODE !== 'source') throw new Error(`--code must be bundle or source, not ${CODE}`);
const WORKERS = Number(arg('workers', String(Math.max(0, availableParallelism() - 1))));
const TODAY = Number(arg('today', String(new Date().getUTCFullYear())));
// Checkpoints (for machines that can be reclaimed): the whole world after every N seasons, written to
// <out>/checkpoint.v8 through a temp file and a rename. --resume carries on from it; the restore checks the
// world hash, and the run ends on the same hash as an unbroken one (test/loop/checkpoint.test.ts).
const CHECKPOINT_EVERY = Number(arg('checkpoint-every', '0'));
const RESUME = process.argv.includes('--resume');
// --bundle (main's flag) is the default now (--code=bundle); still accepted so older command lines work.
const CHECKPOINT = join(OUT, 'checkpoint.v8');

mkdirSync(OUT, { recursive: true });
const write = (f: string, v: unknown): void => writeFileSync(join(OUT, f), `${JSON.stringify(v, null, 1)}\n`);

// ---------- the world ----------
const content = CONTENT;
const rule: turnover.RuleRead = (lvl, k) => (lvl === 'pro' ? PRO_LOOKUP : COLLEGE_LOOKUP)(k);
const levelLookup = (level: string): generation.RuleLookup => (level === 'pro' ? PRO_LOOKUP : COLLEGE_LOOKUP);
const s = setup({ seedHex: SEED, size: SIZE, firstSeasonYear: TODAY - SEASONS, historySeasons: SEASONS });
const tBuild = performance.now();
const w = loop.createWorld({
  setup: s, content, names: NAMES, eventTypes: [...turnover.TURNOVER_EVENT_TYPES, ...turnover.COACH_EVENT_TYPES, ...health.HEALTH_EVENT_TYPES],
  foundingCurves: generation.defaultFoundingCurves(), lostClubs: LOST > 0 ? { fraction: LOST } : undefined,
});
const buildMs = performance.now() - tBuild;

// ---------- the games ----------
type Pool = { run(jobs: readonly unknown[]): unknown[]; close(): Promise<void> };
let pool: Pool | null = null;
let gamePort: loop.GameBatchPort;
if (GAMES === 'real') {
  // The week pool lives in @gm/headless, whose entry point does not export it yet; loaded by path, as the
  // fixture loads the names helpers.
  const wp = await import(new URL('../../../../headless/src/week-pool/index.ts', import.meta.url).href);
  const source = wp.realWeekRef();
  let bundle: { module: unknown; workerPath: string; dispose(): void } | null = null;
  if (CODE === 'bundle') {
    const b = await import(new URL('../../../../headless/src/week-pool/bundle.ts', import.meta.url).href);
    bundle = b.bundleForPool(source);
    process.on('exit', () => bundle?.dispose());
  }
  const ref = bundle?.module ?? source;
  const main = await wp.loadJobRunner(ref);
  pool = wp.createSyncPool({
    module: ref, workers: WORKERS, mainRunner: main, ...(bundle ? { workerPath: bundle.workerPath, execArgv: [] } : {}),
  }) as Pool;
  gamePort = wp.realWeekPort((jobs: readonly unknown[]) => pool!.run(jobs)) as loop.GameBatchPort;
} else if (GAMES === 'test') {
  gamePort = loop.batchOf(testGamePort());
} else throw new Error(`--games must be real or test, not ${GAMES}`);

const schedule = loop.historySchedule({
  regularGames: (c) => content.seasonGamesByLevelId?.[c.name] ?? content.levels[c.level as 'pro' | 'college'].seasonGames,
  postseasonField: (c) => levelLookup(c.level)('playoff.field_size'),
});

// ---------- the systems ----------
const binding: turnover.TurnoverBinding = { content, rule, policy: turnover.gmPolicy() };
const proClubs = w.teams.filter((t) => turnover.levelOfTeam(w, t.id) === 'pro').length;
const timing: Record<string, number> = {};
const timed = (name: string, h: loop.StepHandler): loop.StepHandler => (ctx) => {
  const t = performance.now(); const r = h(ctx); timing[name] = (timing[name] ?? 0) + performance.now() - t; return r;
};
// D11: the medical rules come from the league rules where the medical.* keys exist (G-10 owes them); the
// fallback keys used are written into run.json so the bake can see them.
const medicalRules = { pro: health.medicalRulesFrom('pro', PRO_LOOKUP), college: health.medicalRulesFrom('college', COLLEGE_LOOKUP) };
const healthBinding: health.HealthBinding = {
  catalogue: medical.catalogueFrom(JSON.parse(readFileSync(new URL('../../../../football-content/data/injuries/catalogue.json', import.meta.url), 'utf8')).rows),
  rules: (lvl) => medicalRules[lvl].rules, levelOfTeam: (world, id) => turnover.levelOfTeam(world, id),
};
const systems = loop.systemsFrom({
  lifecycle: timed('lifecycle', loop.lifecycleStep({ content, names: NAMES, built: w })),
  games: timed('games', loop.gamesStepBatch(schedule, gamePort)),
  health: timed('health', health.healthStep(healthBinding)),
  leaving: timed('leaving', loop.leavingStep()),
  // Log compaction has no counter list yet (X2.4.1 owner); the slot drops dead playing blocks (archive.ts).
  compaction: timed('compaction', loop.slimStep()),
  hall: timed('hall', loop.hallStep({ halls: loop.defaultHalls({ pro: 'pro', college: 'college' }, PRO_LOOKUP('standings.tie_win_value') ?? 0.5) })),
  cohorts: timed('cohorts', loop.cohortStep({
    // Recruit classes follow the college teams alive this season; the draft pool follows the clubs alive.
    scale: (world) => {
      const alive = world.teams.filter((t) => loop.isActive(world, t.id));
      const pro = alive.filter((t) => turnover.levelOfTeam(world, t.id) === 'pro').length;
      return { topCollegeTeams: alive.length - pro, draftedCount: pro * (PRO_LOOKUP(turnover.RULE_KEY.draftRounds) ?? 0), openEntryChairs: turnover.coachEntrants(world), retiredWouldBeCoaches: 0 };
    },
    names: NAMES, positionMix: content.levels.pro.rosterMix, homeRegion: () => 'region', kinds: ['recruit_class', 'college_walk_on', 'pro_entry_pool', 'coach_staff_entry'],
  })),
  development: timed('development', turnover.developmentStep(binding)),
  // Coach moves run before the roster cycle (C4), as the live world binds them (PR 231).
  moves: timed('moves', turnover.movesStep(binding, turnover.rosterMovesStep(binding))),
}, 'master run: owning system not bound yet');

const unbound = loop.unboundSteps(systems);
const head = {
  // Output format of this folder. The bake refuses a format it does not know: bump on any field change.
  formatVersion: 1,
  kind: GAMES === 'real' ? 'MASTER DATA RUN' : 'DRY RUN WITH THE TEST DOUBLE GAME PORT: NOT FOR BAKING',
  seedHex: SEED, size: SIZE, firstSeasonYear: s.firstSeasonYear, seasons: SEASONS, games: GAMES, code: GAMES === 'real' ? CODE : null, bundled: GAMES === 'real' && CODE === 'bundle', workers: GAMES === 'real' ? WORKERS : 0,
  lostClubsFraction: LOST, worldCode: generation.worldCode(s, 'gridiron-manager', content.contentVersion), teams: w.teams.length, proClubsWithLost: proClubs,
  peopleAtFounding: w.people.size, buildMs: Math.round(buildMs), unbound,
  medicalRuleFallbacks: { pro: medicalRules.pro.fallbackKeys, college: medicalRules.college.fallbackKeys },
};
// A bound step whose input never arrives is not done: while games report no injuries (placeholder rosters,
// reference resolver), health stays in the unbound list with its reason, so the bake stays provisional.
const unboundNow = (): typeof unbound => {
  const h = health.healthOf(w);
  return h.unreportedGames > 0
    ? [...unbound, { step: 'health', reason: `bound, but ${h.unreportedGames} of ${h.unreportedGames + h.reportedGames} games reported no injuries (game rosters are not world people yet)` }]
    : unbound;
};
// The run's identity: a checkpoint from a different run is refused.
const identity = { seedHex: SEED, size: SIZE, firstSeasonYear: s.firstSeasonYear, seasons: SEASONS, games: GAMES, lostClubsFraction: LOST, worldCode: head.worldCode };
let alreadyDone = 0, elapsedBeforeMs = 0;
if (RESUME && existsSync(CHECKPOINT)) {
  const tR = performance.now();
  // readFileSync stops at 2 GiB, so the checkpoint is read in slices too.
  const fd = openSync(CHECKPOINT, 'r');
  const buf = Buffer.allocUnsafe(fstatSync(fd).size);
  for (let at = 0; at < buf.length; ) at += readSync(fd, buf, at, Math.min(1 << 30, buf.length - at), at);
  closeSync(fd);
  const cp = deserialize(buf) as loop.WorldCheckpoint;
  const extra = cp.extra as { done: number; elapsedMs: number; identity: typeof identity };
  if (JSON.stringify(extra.identity) !== JSON.stringify(identity)) throw new Error(`checkpoint is from another run: ${JSON.stringify(extra.identity)}`);
  loop.restoreCheckpoint(w, cp, SEED);
  alreadyDone = extra.done; elapsedBeforeMs = extra.elapsedMs;
  // Progress rows past the checkpoint are played again, so they are dropped.
  const rows = existsSync(join(OUT, 'progress.jsonl')) ? readFileSync(join(OUT, 'progress.jsonl'), 'utf8').split('\n').filter((l) => l.trim()) : [];
  writeFileSync(join(OUT, 'progress.jsonl'), rows.filter((l) => JSON.parse(l).done <= alreadyDone).map((l) => `${l}\n`).join(''));
  console.log(JSON.stringify({ resumed: alreadyDone, worldHash: cp.worldHash, restoreMs: Math.round(performance.now() - tR) }));
} else {
  if (RESUME) console.log(JSON.stringify({ resume: 'no checkpoint found, starting from the first season' }));
  writeFileSync(join(OUT, 'progress.jsonl'), '');
  write('run.json', { ...head, status: 'running' });
}
console.log(JSON.stringify(head));

// ---------- the outputs ----------
// Every file is rewritten after each season, so a run stopped at any point (Ctrl+C, a crash, a power cut
// between seasons) leaves a complete folder for the seasons it reached: run.json then says "running" with
// seasonsRun, and the bake treats it as provisional.
const t0 = performance.now();
const nameOf = (id: number): string => { const p = w.people.get(id); return p ? `${p.name.first} ${p.name.last}` : `#${id}`; };
function snapshot(status: 'running' | 'stopped' | 'finished', seasonsRun: number): { worldHash: string; failures: readonly string[] } {
  write('teams.json', w.teams.map((t) => ({
    id: t.id, name: t.identity.name, abbreviation: t.identity.abbreviation, competitionId: t.competitionId,
    founded: w.teamSpans.get(t.id)?.founded ?? s.firstSeasonYear, folded: w.teamSpans.get(t.id)?.folded ?? null,
  })));
  write('hall.json', { members: w.hall.members.map((m) => ({ ...m, name: nameOf(m.personId) })), ballots: w.hall.ballots });
  write('tenures.json', { completedHeadCoachTenures: loop.headCoachTenures(w.staffSeasons), staffSeasons: w.staffSeasons.length });
  const validation = loop.validateHistory(w);
  const worldHash = loop.worldHash(w);
  write('run.json', {
    ...head, status, seasonsRun, totalSeconds: Math.round((elapsedBeforeMs + performance.now() - t0) / 1000), resumedFrom: alreadyDone || undefined,
    unbound: unboundNow(), injuriesOpened: health.healthOf(w).opened,
    validation, worldHash, peopleAtEnd: w.people.size, hallMembers: w.hall.members.length,
  });
  return { worldHash, failures: validation.failures };
}

// ---------- the run ----------
let last = t0;
const report = loop.runHistory(w, systems, {
  seasons: SEASONS, schedule, alreadyDone,
  onSeason: (summary, done) => {
    const now = performance.now();
    const row = {
      season: summary.seasonYear, done, ms: Math.round(now - last), steps: Object.fromEntries(Object.entries(timing).map(([k, v]) => [k, Math.round(v)])),
      heapMB: Math.round(process.memoryUsage().heapUsed / 1e6), people: w.people.size, logRows: w.log.rows().length,
      teamsActive: w.teams.filter((t) => loop.isActive(w, t.id, summary.seasonYear)).length, hallMembers: w.hall.members.length,
      games: summary.games, points: summary.points, passPlays: summary.passPlays, runPlays: summary.runPlays,
      champions: summary.champions, peopleByStatus: summary.people, pools: summary.pools,
    };
    appendFileSync(join(OUT, 'progress.jsonl'), `${JSON.stringify(row)}\n`);
    if (done % 5 === 0 || done === SEASONS) console.log(JSON.stringify({ season: row.season, done, ms: row.ms, heapMB: row.heapMB, people: row.people, hall: row.hallMembers }));
    snapshot('running', done);
    if (CHECKPOINT_EVERY > 0 && done % CHECKPOINT_EVERY === 0 && done < SEASONS) {
      const tC = performance.now();
      const bytes = serialize(loop.checkpointData(w, SEED, { done, elapsedMs: elapsedBeforeMs + performance.now() - t0, identity }));
      // One write call takes at most 2 GiB, and a full world's checkpoint is larger, so it goes in slices.
      const fd = openSync(`${CHECKPOINT}.tmp`, 'w');
      for (let at = 0; at < bytes.length; at += 1 << 30) writeSync(fd, bytes, at, Math.min(1 << 30, bytes.length - at));
      closeSync(fd);
      renameSync(`${CHECKPOINT}.tmp`, CHECKPOINT);
      console.log(JSON.stringify({ checkpoint: done, MB: Math.round(bytes.length / 1e6), ms: Math.round(performance.now() - tC) }));
    }
    for (const k of Object.keys(timing)) timing[k] = 0;
    last = performance.now();
  },
});
const totalS = (performance.now() - t0) / 1000;

// ---------- the end ----------
const final = snapshot(report.stoppedEarly ? 'stopped' : 'finished', report.seasonsRun);
console.log(JSON.stringify({ finished: report.seasonsRun, totalS: Math.round(totalS), worldHash: final.worldHash, failures: final.failures.slice(0, 5) }));
if (pool) await pool.close();
