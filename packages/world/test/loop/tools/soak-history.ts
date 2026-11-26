// Soak: a full-span history from 1869 on a trimmed world with the TEST DOUBLE game port, to measure the
// loop's own time and memory per season (not engine time). Bound: team lifecycle with lost clubs, the
// history schedule, leaving (inactive and deceased), cohorts (new people every season), the hall, and
// with --turnover the D7/D8 development and K7 roster moves (slow: see the performance note in PR 226).
// Run:
// node --expose-gc --import tsx packages/world/test/loop/tools/soak-history.ts [SEASONS] [CLUBS] [SCHOOLS] [--turnover] [--no-slim]
import { COLLEGE_LOOKUP, NAMES, PRO_LOOKUP, generation, loop, setup, testGamePort, testSystems, trimmed } from '../../fixtures.ts';
import * as turnover from '../../../src/turnover/index.ts';

const pos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const seasons = Number(pos[0] ?? 157), clubs = Number(pos[1] ?? 8), schools = Number(pos[2] ?? 6);
const withTurnover = process.argv.includes('--turnover');
const slim = !process.argv.includes('--no-slim');
/** Heap after a full collection when node runs with --expose-gc, so the numbers compare across runs. */
const heapMB = (): number => { (globalThis as { gc?: () => void }).gc?.(); return Math.round(process.memoryUsage().heapUsed / 1e6); };
const content = trimmed(clubs, schools);
const w = loop.createWorld({
  setup: setup({ firstSeasonYear: 2026 - seasons, historySeasons: seasons }), content, names: NAMES, eventTypes: turnover.TURNOVER_EVENT_TYPES,
  foundingCurves: generation.defaultFoundingCurves(), lostClubs: { fraction: 1 },
});
const schedule = loop.historySchedule({
  regularGames: (c) => content.seasonGamesByLevelId?.[c.name] ?? content.levels[c.level as 'pro' | 'college'].seasonGames,
  postseasonField: (c) => (c.level === 'pro' ? PRO_LOOKUP : COLLEGE_LOOKUP)('playoff.field_size'),
});
const binding: turnover.TurnoverBinding = { content, rule: (lvl, k) => (lvl === 'pro' ? PRO_LOOKUP : COLLEGE_LOOKUP)(k), policy: turnover.gmPolicy() };
const sys = testSystems({
  lifecycle: loop.lifecycleStep({ content, names: NAMES, built: w }),
  games: loop.gamesStep(schedule, testGamePort()),
  ...(slim ? { compaction: loop.slimStep() } : {}),
  hall: loop.hallStep({ halls: loop.defaultHalls({ pro: 'pro', college: 'college' }, 0.5) }),
  cohorts: loop.cohortStep({
    scale: (world) => {
      const alive = world.teams.filter((t) => loop.isActive(world, t.id));
      const pro = alive.filter((t) => turnover.levelOfTeam(world, t.id) === 'pro').length;
      return { topCollegeTeams: alive.length - pro, draftedCount: pro * (PRO_LOOKUP(turnover.RULE_KEY.draftRounds) ?? 0), openEntryChairs: 0, retiredWouldBeCoaches: 0 };
    },
    names: NAMES, positionMix: content.levels.pro.rosterMix, homeRegion: () => 'region', kinds: ['recruit_class', 'college_walk_on', 'pro_entry_pool'],
  }),
  ...(withTurnover ? { development: turnover.developmentStep(binding), moves: turnover.rosterMovesStep(binding) } : {}),
});
const t0 = performance.now();
let last = t0;
loop.runHistory(w, sys, { seasons, schedule, onSeason: (s, done) => {
  if (done % 10 === 0 || done === seasons) {
    const now = performance.now();
    const status = { active: 0, inactive: 0, deceased: 0 };
    for (const v of w.status.values()) status[v]++;
    console.log(JSON.stringify({
      season: s.seasonYear, done, msPer10: Math.round(now - last), heapMB: heapMB(), people: w.people.size, status,
      logRows: w.log.rows().length, staffSeasons: w.staffSeasons.length, rosterSeasons: w.rosterSeasons.size, hallPlayers: w.hall.players.size,
      hallMembers: w.hall.members.length, teamsActive: [...w.teamSpans.values()].filter((x) => loop.isActive(w, x.teamId)).length,
    }));
    last = now;
  }
} });
console.log(JSON.stringify({ totalS: +((performance.now() - t0) / 1000).toFixed(1), validation: loop.validateHistory(w).failures.slice(0, 5) }));
