// Fits the D8.2.1 physical-index curve to the measured production targets (facts/aging-build/targets.json,
// fact rows F-aging-0012..0022) and writes the curve, prime end and decline into tables.json.
//
// Model: from age s the yearly change is -m x (age - s + 1) percent (a ramp; 0 before s). For each curve
// group a cohort of drafted rookies is developed as starters from 21 to 37 (no exits, so no survivor
// bias) and the mean whole-player value (value.ts) is recorded. Production is read as proportional to
// value above a floor `value.productionSpanIss` below the peak, the 31-33 band times `value.survivorLateFactor`
// (survivor bias), so the target value change from 25 to age a
// is span x (P(a) - P(25)) / max P, with P compounded from the band rates. The fit is the (s, m) with the
// least squared error over ages 25 to 34. The real bands carry survivor bias (declines after 30 are
// understated), so the fit errs toward too little decline after 30, never too much.
//
// Run: npx tsx packages/league/test/development/tools/fit-aging.ts [--write]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { developYear, defaultYearPlan, devNumbers, num, TABLES, wholePlayerValue, CURVE_GROUP, type DevelopmentTables, type PositionFamily } from '../../../src/development/index.ts';
import { MATH, makePlayer, meanOf, rng } from '../helpers.ts';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const TARGETS = JSON.parse(readFileSync(here('../../../../../facts/aging-build/targets.json'), 'utf8')) as { percentPerYear: Record<string, number[]> };
const TABLES_PATH = here('../../../src/development/tables.json');
const BAND_STARTS = Array.from({ length: 18 }, (_, i) => 23 + i);
const FIRST = 21;
const LAST = 40;
const FIT_FROM = 25;
const FIT_TO = 34;
const N_PER = Number(process.env.FIT_N ?? 40);

const ramp = (s: number, m: number) => BAND_STARTS.map((a) => (a < s ? 0 : -Math.round(m * (a - s + 1) * 1000) / 1000));

function tablesWith(group: string, row: number[]): DevelopmentTables {
  const groups: Record<string, number[]> = {};
  for (const g of new Set(Object.values(CURVE_GROUP))) groups[g] = BAND_STARTS.map(() => 0);
  groups[group] = row;
  return { ...TABLES, curves: { ...TABLES.curves, bandStarts: BAND_STARTS, groups } };
}

/** Mean whole-player value by age (FIRST..LAST) of a starter cohort at a family under a curve row. */
function path(family: PositionFamily, row: number[]): number[] {
  const n = devNumbers({}, tablesWith(CURVE_GROUP[family], row));
  const cohort = Array.from({ length: N_PER }, (_, i) => {
    const s = rng(11, 'fit', family, i);
    return makePlayer(s, { family, ageYears: FIRST, ceilingMean: 50 + s.normal() * 6, gapMean: Math.max(2, 11 + s.normal() * 4) });
  });
  const out: number[] = [];
  for (let age = FIRST; age <= LAST; age++) {
    out.push(meanOf(cohort.map((p) => wholePlayerValue(n, p, family))));
    for (let i = 0; i < cohort.length; i++) {
      const facets = { work_habits: 50, coachability: 50, competitiveness: 50, love_of_football: 50 };
      cohort[i] = developYear(n, MATH, { position: family, ageYears: age + 1, playing: cohort[i]!, facets }, defaultYearPlan(n, 'starter'), (k) => rng(11, 'dev', family, i, age, k));
    }
  }
  return out;
}

/** Target change in whole-player value from age 25, by age FIT_FROM..FIT_TO. */
function target(group: string, span: number, late: number): number[] {
  const bands = TARGETS.percentPerYear[group]!;
  const rate = (a: number) => (a <= 24 ? bands[0]! : a <= 27 ? bands[1]! : a <= 30 ? bands[2]! : bands[3]! * late);
  const P: Record<number, number> = { [FIRST]: 1 };
  for (let a = FIRST; a < FIT_TO; a++) P[a + 1] = P[a]! * (1 + rate(a) / 100);
  const max = Math.max(...Object.values(P));
  const out: number[] = [];
  for (let a = FIT_FROM; a <= FIT_TO; a++) out.push(span * (P[a]! - P[FIT_FROM]!) / max);
  return out;
}

function err(fams: PositionFamily[], row: number[], tgt: number[]): { e: number; paths: number[][] } {
  let e = 0;
  const paths: number[][] = [];
  for (const f of fams) {
    const p = path(f, row);
    paths.push(p);
    for (let a = FIT_FROM; a <= FIT_TO; a++) {
      const d = p[a - FIRST]! - p[FIT_FROM - FIRST]! - tgt[a - FIT_FROM]!;
      e += d * d;
    }
  }
  return { e, paths };
}

const n0 = devNumbers();
const span = num(n0, 'value.productionSpanIss');
const band = num(n0, 'value.primeBandIss');
const late = num(n0, 'value.survivorLateFactor');
const famsOf = (g: string) => (Object.keys(CURVE_GROUP) as PositionFamily[]).filter((f) => CURVE_GROUP[f] === g);
// FIT_GROUPS=K,P refits only those groups and keeps the rest of tables.json as it is.
const ONLY = process.env.FIT_GROUPS ? process.env.FIT_GROUPS.split(',') : null;
const groups: Record<string, number[]> = ONLY ? { ...TABLES.curves.groups } as Record<string, number[]> : {};
const primeEnd: Record<string, number> = ONLY ? { ...TABLES.curves.primeEnd } : {};
const decline: Record<string, number> = ONLY ? { ...TABLES.curves.declineIssPerYear } : {};
const report: string[] = [];
for (const g of [...new Set(Object.values(CURVE_GROUP))].filter((x) => !ONLY || ONLY.includes(x))) {
  const fams = famsOf(g);
  const tgt = target(g, span, late);
  let best = { s: 0, m: 0, e: Infinity, paths: [] as number[][] };
  const consider = (s: number, m: number) => {
    const r = err(fams, ramp(s, m), tgt);
    if (r.e < best.e) best = { s, m, e: r.e, paths: r.paths };
  };
  for (let s = 23; s <= 33; s++) for (const m of [0.02, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.6, 0.8, 1.0, 1.3]) consider(s, m);
  const s0 = best.s;
  const m0 = best.m;
  for (const s of [s0 - 1, s0, s0 + 1]) for (const k of [0.6, 0.7, 0.8, 0.9, 1.1, 1.2, 1.35, 1.5]) consider(s, Math.round(m0 * k * 1000) / 1000);
  groups[g] = ramp(best.s, best.m);
  // Prime end and decline from the fitted path (mean over the group's families).
  const mean = best.paths[0]!.map((_, i) => meanOf(best.paths.map((p) => p[i]!)));
  const peak = Math.max(...mean);
  const peakAge = FIRST + mean.indexOf(peak);
  let end = peakAge;
  while (end + 1 <= LAST && mean[end + 1 - FIRST]! >= peak - band) end++;
  primeEnd[g] = end;
  const after = mean.slice(end - FIRST, Math.min(mean.length, end - FIRST + 5));
  decline[g] = Math.round(Math.max(0, (after[0]! - after[after.length - 1]!) / Math.max(1, after.length - 1)) * 100) / 100;
  const got = mean.slice(FIT_FROM - FIRST, FIT_TO - FIRST + 1).map((v) => v - mean[FIT_FROM - FIRST]!);
  report.push(`${g.padEnd(4)} start ${best.s} slope ${best.m} rmse ${Math.sqrt(best.e / (fams.length * tgt.length)).toFixed(2)} peak ${peakAge} primeEnd ${end} decline ${decline[g]}/yr\n     target ${tgt.map((v) => v.toFixed(1)).join(' ')}\n     game   ${got.map((v) => v.toFixed(1)).join(' ')}`);
}
console.log(report.join('\n'));
if (process.argv.includes('--write')) {
  const raw = JSON.parse(readFileSync(TABLES_PATH, 'utf8'));
  raw.curves = {
    basis: 'bible', leaf: 'D8.2.1',
    note: 'Yearly percent change in the physical index by age (age on September 1), one band per year. Fitted by packages/league/test/development/tools/fit-aging.ts to the measured production change by age (facts/aging.json F-aging-0012..0022; targets in facts/aging-build/targets.json): a ramp -m x (age - start + 1) from the start age, chosen by least squares on the whole-player value from 25 to 34. primeEnd is the last age within value.primeBandIss of the fitted peak; declineIssPerYear the mean yearly loss over the four years after it. The targets carry survivor bias, so decline after 30 is if anything too mild.',
    bandStarts: BAND_STARTS, groups, primeEnd, declineIssPerYear: decline,
  };
  writeFileSync(TABLES_PATH, `${JSON.stringify(raw, null, 1)}\n`);
  console.log('tables.json curves written');
}
