// Offseason speed bench: a world of the chosen size with every bound offseason system (coach and roster
// moves with the front office policy, development, cohorts, leaving, lifecycle) and the TEST DOUBLE game
// port, timing each step per season and printing the deep world hash after each season. The hash is the
// check that a speed change kept results byte-identical: the same seed must print the same hashes.
//   npx tsx packages/world/test/loop/tools/offseason-bench.ts [--seasons=3] [--size=small] [--seed=HEX] [--recruiting=1]
// --recruiting=1 adds the off-screen T4 recruiting weeks (and its signed letters) to the moves step.
import { COLLEGE_LOOKUP, CONTENT, NAMES, PRO_LOOKUP, generation, loop, setup, testGamePort, testSchedule } from '../../fixtures.ts';
import { calendar } from '@gm/league';
import * as turnover from '../../../src/turnover/index.ts';
import * as rec from '../../../src/recruiting/index.ts';

const arg = (k: string, d: string): string => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const SEASONS = Number(arg('seasons', '3'));
const SIZE = arg('size', 'small') as generation.SizePreset;
const SEED = arg('seed', '0000000000001869');
const RECRUITING = arg('recruiting', '0') === '1';

const content = CONTENT;
const rule: turnover.RuleRead = (lvl, k) => (lvl === 'pro' ? PRO_LOOKUP : COLLEGE_LOOKUP)(k);
const t0 = performance.now();
const w = loop.createWorld({
  setup: setup({ seedHex: SEED, size: SIZE, firstSeasonYear: 2026 - SEASONS, historySeasons: SEASONS }),
  content, names: NAMES, eventTypes: [...turnover.TURNOVER_EVENT_TYPES, ...turnover.COACH_EVENT_TYPES], foundingCurves: generation.defaultFoundingCurves(),
});
console.log(JSON.stringify({ size: SIZE, seed: SEED, recruiting: RECRUITING, teams: w.teams.length, people: w.people.size, buildMs: Math.round(performance.now() - t0) }));

const base: turnover.TurnoverBinding = { content, rule };
const binding: turnover.TurnoverBinding = { content, rule, policy: RECRUITING ? rec.lettersPolicy(turnover.gmPolicy()) : turnover.gmPolicy() };
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

let last = performance.now();
loop.runHistory(w, systems, {
  seasons: SEASONS, schedule: testSchedule,
  onSeason: (summary, done) => {
    const now = performance.now();
    console.log(JSON.stringify({
      season: summary.seasonYear, done, ms: Math.round(now - last), steps: Object.fromEntries(Object.entries(timing).map(([k, v]) => [k, Math.round(v)])),
      people: w.people.size, hash: loop.worldHash(w),
    }));
    for (const k of Object.keys(timing)) timing[k] = 0;
    last = performance.now();
  },
});
