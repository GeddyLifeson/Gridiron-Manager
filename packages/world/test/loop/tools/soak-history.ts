// Soak: a full-span history from 1869 on a trimmed world with the TEST DOUBLE game port, to measure the
// loop's own time and memory per season (not engine time). Run:
// npx tsx packages/world/test/loop/tools/soak-history.ts [SEASONS] [CLUBS] [SCHOOLS]
import { generation, loop, NAMES, setup, testSchedule, testSystems, trimmed } from '../../fixtures.ts';
const seasons = Number(process.argv[2] ?? 157), clubs = Number(process.argv[3] ?? 8), schools = Number(process.argv[4] ?? 6);
const content = trimmed(clubs, schools);
const w = loop.createWorld({ setup: setup({ firstSeasonYear: 2026 - seasons, historySeasons: seasons }), content, names: NAMES, foundingCurves: generation.defaultFoundingCurves() });
const sys = testSystems({ lifecycle: loop.lifecycleStep({ content, names: NAMES, built: w }) });
const t0 = performance.now();
let last = t0;
loop.runHistory(w, sys, { seasons, schedule: testSchedule, onSeason: (s, done) => {
  if (done % 25 === 0 || done === seasons) {
    const now = performance.now();
    console.log(JSON.stringify({ season: s.seasonYear, done, msPer25: Math.round(now - last), heapMB: Math.round(process.memoryUsage().heapUsed / 1e6), people: w.people.size, logRows: w.log.rows().length, staffSeasons: w.staffSeasons.length, teamsActive: [...w.teamSpans.values()].filter((x) => loop.isActive(w, x.teamId)).length }));
    last = now;
  }
} });
console.log(JSON.stringify({ totalS: +((performance.now() - t0) / 1000).toFixed(1), validation: loop.validateHistory(w).failures.slice(0, 5) }));
