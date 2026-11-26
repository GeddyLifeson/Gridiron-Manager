// Rebuilds src/generation/data/founding-curves.json from the project's research file
// (/mnt/project-files/research/history-run/team-lifecycle.json). Only years are read: the curves say what
// share of a level's present-day teams existed by each year. No real team name is written.
// Run: npx tsx packages/world/test/generation/tools/build-founding-curves.ts [RESEARCH_JSON]
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2] ?? '/mnt/project-files/research/history-run/team-lifecycle.json';
const d = JSON.parse(readFileSync(file, 'utf8'));
type Curve = [number, number][];

/** Cumulative shares at each distinct year of a list of first seasons. */
function fromYears(years: number[]): Curve {
  const sorted = [...years].sort((a, b) => a - b);
  const out: Curve = [];
  sorted.forEach((y, i) => {
    const share = +((i + 1) / sorted.length).toFixed(6);
    if (out.length > 0 && out[out.length - 1]![0] === y) out[out.length - 1]![1] = share; else out.push([y, share]);
  });
  out[out.length - 1]![1] = 1;
  return out;
}

/** Decade counts spread evenly over each decade's years (the source gives decades only). */
function fromDecades(counts: Record<string, number>, firstYear: number): Curve {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const out: Curve = [];
  let acc = 0;
  for (const [dec, n] of Object.entries(counts).sort()) {
    const start = Math.max(firstYear, Number(dec.slice(0, 4)));
    const end = Math.min(2026, Number(dec.slice(0, 4)) + 9); // the table was read in 2026
    for (let y = start; y <= end; y++) {
      acc += n / (end - start + 1);
      out.push([y, +(acc / total).toFixed(6)]);
    }
  }
  out[out.length - 1]![1] = 1;
  return out;
}

const firstYear = 1869;
const proYears = d.nflFranchiseFirstSeasons.map((r: { firstSeason: number }) => r.firstSeason);
const topYears = d.fbsFirstSeasonByDecade.programs.map((r: { firstYear: number }) => r.firstYear);
const out = {
  $comment: 'Founding curves: share of present-day teams founded by each year. Calibration only; world teams are fictional. Built by test/generation/tools/build-founding-curves.ts.',
  source: 'research/history-run/team-lifecycle.json and team-lifecycle-sources.md (read 2026-11-26)',
  curves: {
    pro: { status: 'Verified', basis: `first seasons of the ${proYears.length} present-day pro clubs (Pro Football Reference, Pro Football Hall of Fame franchise histories, Wikipedia)`, points: fromYears(proYears) },
    college_top: { status: '1 of 3', basis: `first years of the ${topYears.length} present-day top-division programs (one full table; spot checks show 5 Conflicts on single programs)`, points: fromYears(topYears) },
    college_second: { status: '1 of 3', basis: `second-division programs by decade established (${d.fcsFirstSeasonByDecade.programCount} rows of one table), spread evenly inside each decade`, points: fromDecades(d.fcsFirstSeasonByDecade.counts, firstYear) },
  },
};
writeFileSync(new URL('../../../src/generation/data/founding-curves.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
console.log(Object.entries(out.curves).map(([k, c]) => `${k}: ${c.points.length} points, ${c.points[0]} .. ${c.points[c.points.length - 1]}`).join('\n'));
