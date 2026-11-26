// Probe: the mean whole-player role grade by age for a cohort that starts as drafted rookies and plays
// as starters to 37 (no exits, so no survivor bias). Prints the yearly change and the age the grade
// peaks at, per position family. Run: npx tsx packages/league/test/development/tools/age-curve-probe.ts
import { developYear, defaultYearPlan, devNumbers, TABLES, WORKED, type PositionFamily } from '../../../src/development/index.ts';
import { MATH, makePlayer, meanOf, rng } from '../helpers.ts';
import { roleGrade, FAMILIES, type Pro } from '../league-fixture.ts';

const curves = process.env.CURVES ? JSON.parse(process.env.CURVES) : TABLES.curves;
const n = devNumbers({}, { ...TABLES, curves });
const attrMean = (p: Pro) => meanOf(WORKED[p.family].map((x) => p.playing.attributes[x] ?? 0));
const grade = process.env.PROBE_ROLE ? roleGrade : attrMean;
const N_PER = Number(process.env.PROBE_N ?? 150);
for (const f of FAMILIES as PositionFamily[]) {
  const cohort: Pro[] = [];
  for (let i = 0; i < N_PER; i++) {
    const s = rng(7, 'probe', f, i);
    const playing = makePlayer(s, { family: f, ageYears: 21, ceilingMean: 50 + s.normal() * 6, gapMean: Math.max(2, 11 + s.normal() * 4) });
    cohort.push({ id: i, family: f, age: 21, rookieSeason: 0, playing, starter: true, facets: { work_habits: 50, coachability: 50, competitiveness: 50, love_of_football: 50 }, drafted: true });
  }
  const byAge: number[] = [];
  for (let age = 21; age <= 37; age++) {
    byAge.push(meanOf(cohort.map(grade)));
    for (const p of cohort) {
      p.age += 1;
      p.playing = developYear(n, MATH, { position: f, ageYears: p.age, playing: p.playing, facets: p.facets }, defaultYearPlan(n, 'starter'), (k) => rng(7, 'dev', age, f, p.id, k));
    }
  }
  const peak = byAge.indexOf(Math.max(...byAge)) + 21;
  const d = byAge.slice(1).map((v, i) => (v - byAge[i]!).toFixed(2));
  console.log(`${f.padEnd(4)} peak ${peak} grades ${byAge.map((v) => v.toFixed(1)).join(' ')}\n     deltas ${d.join(' ')}`);
}
