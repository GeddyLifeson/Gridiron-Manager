// Population soak (X12.1.3 acceptance: "the world's stored person count levels off"). Runs the master-run
// world from football's first season with every bound system, and prints per season: people by status,
// who still holds a playing block, the size of the people table as JSON, pools, and step times.
//
//   npx tsx packages/world/test/loop/tools/population-soak.ts --run=60 [--size=small] [--games=test] [--out=FILE]
//
// --run is how many seasons to play of the full span (1869 to today), so a short soak starts in 1869 too.
// --first=YEAR starts the world in that season instead (a modern career world: --first=1996 --run=31).
// --baseline=1 turns off the entry-pool pruning and the archive (for before and after numbers).
// --save=1 adds worldMB: the people table, systemState and the event log as JSON, a proxy for save size.
// Games use the TEST DOUBLE port by default: this tool measures people, not football.
import { writeFileSync, appendFileSync } from 'node:fs';
import { COLLEGE_LOOKUP, CONTENT, NAMES, PRO_LOOKUP, generation, loop, setup, testGamePort } from '../../fixtures.ts';
import * as turnover from '../../../src/turnover/index.ts';

const arg = (k: string, d: string): string => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const SIZE = arg('size', 'small') as generation.SizePreset;
const SPAN = generation.fullHistorySeasons(new Date().getUTCFullYear());
const RUN = Number(arg('run', String(SPAN)));
const OUT = arg('out', '');
const content = CONTENT;
const rule: turnover.RuleRead = (lvl, k) => (lvl === 'pro' ? PRO_LOOKUP : COLLEGE_LOOKUP)(k);
const levelLookup = (level: string): generation.RuleLookup => (level === 'pro' ? PRO_LOOKUP : COLLEGE_LOOKUP);
const FIRST = Number(arg('first', String(generation.footballStartYear())));
const SAVE = arg('save', '0') === '1';
const s = setup({ seedHex: arg('seed', '0000000000001869'), size: SIZE, firstSeasonYear: FIRST, historySeasons: Math.max(RUN, 1) });
const w = loop.createWorld({
  setup: s, content, names: NAMES, eventTypes: turnover.TURNOVER_EVENT_TYPES,
  foundingCurves: generation.defaultFoundingCurves(), lostClubs: { fraction: 1 },
});
const schedule = loop.historySchedule({
  regularGames: (c) => content.seasonGamesByLevelId?.[c.name] ?? content.levels[c.level as 'pro' | 'college'].seasonGames,
  postseasonField: (c) => levelLookup(c.level)('playoff.field_size'),
});
const binding: turnover.TurnoverBinding = { content, rule, policy: turnover.gmPolicy() };
const timing: Record<string, number> = {};
const timed = (name: string, h: loop.StepHandler): loop.StepHandler => (ctx) => {
  const t = performance.now(); const r = h(ctx); timing[name] = (timing[name] ?? 0) + performance.now() - t; return r;
};
const systems = loop.systemsFrom({
  lifecycle: timed('lifecycle', loop.lifecycleStep({ content, names: NAMES, built: w })),
  games: timed('games', loop.gamesStepBatch(schedule, loop.batchOf(testGamePort()))),
  leaving: timed('leaving', loop.leavingStep(arg('baseline', '0') === '1' ? { unclaimedPools: [], archiveUnnamed: false } : {})),
  compaction: timed('compaction', loop.slimStep()),
  hall: timed('hall', loop.hallStep({ halls: loop.defaultHalls({ pro: 'pro', college: 'college' }, PRO_LOOKUP('standings.tie_win_value') ?? 0.5) })),
  cohorts: timed('cohorts', loop.cohortStep({
    scale: (world) => {
      const alive = world.teams.filter((t) => loop.isActive(world, t.id));
      const pro = alive.filter((t) => turnover.levelOfTeam(world, t.id) === 'pro').length;
      return { topCollegeTeams: alive.length - pro, draftedCount: pro * (PRO_LOOKUP(turnover.RULE_KEY.draftRounds) ?? 0), openEntryChairs: 0, retiredWouldBeCoaches: 0 };
    },
    names: NAMES, positionMix: content.levels.pro.rosterMix, homeRegion: () => 'region', kinds: ['recruit_class', 'college_walk_on', 'pro_entry_pool'],
  })),
  development: timed('development', turnover.developmentStep(binding)),
  moves: timed('moves', turnover.rosterMovesStep(binding)),
}, 'population soak: not bound');

if (OUT) writeFileSync(OUT, '');
let last = performance.now();
loop.runHistory(w, systems, {
  seasons: RUN, schedule,
  onSeason: (summary, done) => {
    const now = performance.now();
    let playing = 0, bytes = 0;
    for (const p of w.people.values()) { if (p.playing) playing++; bytes += JSON.stringify(p).length; }
    
    const row = {
      season: summary.seasonYear, done, ms: Math.round(now - last), heapMB: Math.round(process.memoryUsage().heapUsed / 1e6),
      people: w.people.size, archived: loop.archivedCount(w), archiveMB: +(JSON.stringify(w.systemState.get(loop.ARCHIVE_KEY) ?? {}).length / 1e6).toFixed(1), byStatus: summary.people, playing, peopleMB: +(bytes / 1e6).toFixed(1), logRows: w.log.rows().length,
      worldMB: SAVE ? +((bytes + JSON.stringify([...w.systemState]).length + JSON.stringify(w.log.rows()).length) / 1e6).toFixed(1) : undefined,
      pools: summary.pools, steps: Object.fromEntries(Object.entries(timing).filter(([, v]) => v >= 50).map(([k, v]) => [k, Math.round(v)])),
    };
    console.log(JSON.stringify(row));
    if (OUT) appendFileSync(OUT, `${JSON.stringify(row)}\n`);
    for (const k of Object.keys(timing)) timing[k] = 0;
    last = performance.now();
  },
});
