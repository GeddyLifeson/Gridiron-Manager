// The master data run (Marlon 2026-11-26): the full fictional history from football's first season (1869)
// to today, on a full-size world, with every bound system and the REAL game engine for every game. Its
// output is gathered and baked into the game; a player's own rerun or shorter history never changes it.
//
// Run on a many-core PC (Node 22+, from the repo root):
//   npx tsx packages/world/test/loop/tools/master-history.ts --out=master-run [--seed=HEX] [--workers=N]
//       [--seasons=157] [--size=full] [--games=real|test] [--lost=1]
//
// --workers defaults to the core count minus one; the calling thread plays games too. --games=test swaps
// in the TEST DOUBLE game port for a quick dry run of the whole pipeline; every output then says so, and
// such a run must never be baked. --seasons shortens the span (it always ends the season before today).
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
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { COLLEGE_LOOKUP, CONTENT, NAMES, PRO_LOOKUP, generation, loop, setup, testGamePort } from '../../fixtures.ts';
import * as turnover from '../../../src/turnover/index.ts';
import * as people from '../../../src/people/index.ts';

const arg = (k: string, d: string): string => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const OUT = arg('out', 'master-run');
const SEED = arg('seed', '0000000000001869');
const SEASONS = Number(arg('seasons', String(generation.fullHistorySeasons(new Date().getUTCFullYear()))));
const SIZE = arg('size', 'full') as generation.SizePreset;
const GAMES = arg('games', 'real');
const LOST = Number(arg('lost', '1'));
const WORKERS = Number(arg('workers', String(Math.max(0, availableParallelism() - 1))));
const TODAY = new Date().getUTCFullYear();

mkdirSync(OUT, { recursive: true });
const write = (f: string, v: unknown): void => writeFileSync(join(OUT, f), `${JSON.stringify(v, null, 1)}\n`);
writeFileSync(join(OUT, 'progress.jsonl'), '');

// ---------- the world ----------
const content = CONTENT;
const rule: turnover.RuleRead = (lvl, k) => (lvl === 'pro' ? PRO_LOOKUP : COLLEGE_LOOKUP)(k);
const levelLookup = (level: string): generation.RuleLookup => (level === 'pro' ? PRO_LOOKUP : COLLEGE_LOOKUP);
const s = setup({ seedHex: SEED, size: SIZE, firstSeasonYear: TODAY - SEASONS, historySeasons: SEASONS });
const tBuild = performance.now();
const w = loop.createWorld({
  setup: s, content, names: NAMES, eventTypes: [...turnover.TURNOVER_EVENT_TYPES, ...people.peopleEventTypes()],
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
  const ref = wp.realWeekRef();
  const main = await wp.loadJobRunner(ref);
  pool = wp.createSyncPool({ module: ref, workers: WORKERS, mainRunner: main }) as Pool;
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
const systems = loop.systemsFrom({
  lifecycle: timed('lifecycle', loop.lifecycleStep({ content, names: NAMES, built: w })),
  games: timed('games', loop.gamesStepBatch(schedule, gamePort)),
  leaving: timed('leaving', loop.leavingStep()),
  // Log compaction has no counter list yet (X2.4.1 owner); the slot drops dead playing blocks (archive.ts).
  compaction: timed('compaction', loop.slimStep()),
  hall: timed('hall', loop.hallStep({ halls: loop.defaultHalls({ pro: 'pro', college: 'college' }, PRO_LOOKUP('standings.tie_win_value') ?? 0.5) })),
  cohorts: timed('cohorts', loop.cohortStep({
    // Recruit classes follow the college teams alive this season; the draft pool follows the clubs alive.
    scale: (world) => {
      const alive = world.teams.filter((t) => loop.isActive(world, t.id));
      const pro = alive.filter((t) => turnover.levelOfTeam(world, t.id) === 'pro').length;
      return { topCollegeTeams: alive.length - pro, draftedCount: pro * (PRO_LOOKUP(turnover.RULE_KEY.draftRounds) ?? 0), openEntryChairs: 0, retiredWouldBeCoaches: 0 };
    },
    names: NAMES, positionMix: content.levels.pro.rosterMix, homeRegion: () => 'region', kinds: ['recruit_class', 'college_walk_on', 'pro_entry_pool'],
  })),
  development: timed('development', turnover.developmentStep(binding)),
  moves: timed('moves', turnover.rosterMovesStep(binding)),
  // X6 memory, X7 edges, X5 needs and the X9 culture pass (world/src/people). Postseason goal ids are
  // level-free placeholders until C2/T3 league-rules content names them (README PD-10).
  ...Object.fromEntries(Object.entries(people.peopleSteps({ turnover: binding, goals: () => ({ cut: 'postseason', top: 'top_fifth' }) }))
    .map(([k, h]) => [k, timed(k, h)])),
}, 'master run: owning system not bound yet');

const unbound = loop.unboundSteps(systems);
const head = {
  // Output format of this folder. The bake refuses a format it does not know: bump on any field change.
  formatVersion: 1,
  kind: GAMES === 'real' ? 'MASTER DATA RUN' : 'DRY RUN WITH THE TEST DOUBLE GAME PORT: NOT FOR BAKING',
  seedHex: SEED, size: SIZE, firstSeasonYear: s.firstSeasonYear, seasons: SEASONS, games: GAMES, workers: GAMES === 'real' ? WORKERS : 0,
  lostClubsFraction: LOST, worldCode: generation.worldCode(s, 'gridiron-manager', content.contentVersion), teams: w.teams.length, proClubsWithLost: proClubs,
  peopleAtFounding: w.people.size, buildMs: Math.round(buildMs), unbound,
};
write('run.json', { ...head, status: 'running' });
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
    ...head, status, seasonsRun, totalSeconds: Math.round((performance.now() - t0) / 1000),
    validation, worldHash, peopleAtEnd: w.people.size, hallMembers: w.hall.members.length,
  });
  return { worldHash, failures: validation.failures };
}

// ---------- the run ----------
let last = t0;
const report = loop.runHistory(w, systems, {
  seasons: SEASONS, schedule,
  onSeason: (summary, done) => {
    const now = performance.now();
    const row = {
      season: summary.seasonYear, done, ms: Math.round(now - last), steps: Object.fromEntries(Object.entries(timing).map(([k, v]) => [k, Math.round(v)])),
      heapMB: Math.round(process.memoryUsage().heapUsed / 1e6), people: w.people.size, logRows: w.log.size,
      peopleState: people.stateSizes(w),
      teamsActive: w.teams.filter((t) => loop.isActive(w, t.id, summary.seasonYear)).length, hallMembers: w.hall.members.length,
      games: summary.games, points: summary.points, passPlays: summary.passPlays, runPlays: summary.runPlays,
      champions: summary.champions, peopleByStatus: summary.people, pools: summary.pools,
    };
    appendFileSync(join(OUT, 'progress.jsonl'), `${JSON.stringify(row)}\n`);
    if (done % 5 === 0 || done === SEASONS) console.log(JSON.stringify({ season: row.season, done, ms: row.ms, heapMB: row.heapMB, people: row.people, hall: row.hallMembers }));
    snapshot('running', done);
    for (const k of Object.keys(timing)) timing[k] = 0;
    last = performance.now();
  },
});
const totalS = (performance.now() - t0) / 1000;

// ---------- the end ----------
const final = snapshot(report.stoppedEarly ? 'stopped' : 'finished', report.seasonsRun);
console.log(JSON.stringify({ finished: report.seasonsRun, totalS: Math.round(totalS), worldHash: final.worldHash, failures: final.failures.slice(0, 5) }));
if (pool) await pool.close();
