// Q1.6.4 long-run stability over 30 headless seasons, and D8.2.1's roster-age drift limit.
// The league is the fixture in league-fixture.ts. Tolerances per series are open in Q1.6.4
// ("research, from real-world year-to-year variation"); the ones used here are named below.
import { describe, expect, it } from 'vitest';
import { devNumbers, driftTest } from '../../src/development/index.ts';
import { FAMILIES, GROUPS, GROUP_OF, SLOTS, STARTERS, runLeague, type SeasonStats } from './league-fixture.ts';
import { MATH, meanOf } from './helpers.ts';

/**
 * The fixture's first league is artificial (everyone near his ceiling, ages spread evenly), so it
 * runs a 20-season history first (the world runs one before a career starts, X10; slower aging since the
 * measured-curve fit needs the longer warm-up to reach its age mix). The Q1.6.4
 * window is then seasons 5 to 30 of the career: run seasons 25 to 50.
 */
const HISTORY = 20;
const FROM = HISTORY + 5;
const SEASONS = HISTORY + 31;
/** D8.2.1 acceptance: no position's mean roster age drifts more than 0.5 years over 30 years. */
const AGE_DRIFT = 0.5;
/** Talent: starters' mean role grade may drift at most 1 ISS (0.1 sd) over the window (fixture tolerance). */
const TALENT_DRIFT = 1;
/**
 * A position may exceed the fixed limit only by less than 2 standard errors of its own wander: a
 * 32-player position drifts by generations, and Q1.6.4 leaves tolerances to research "from real-world
 * year-to-year variation". The pooled league series get no such allowance.
 */
const SE_MULTIPLE = 2;
/** Every season inside +-4 ISS of the window mean (talent) and +-2 years (age). */
const TALENT_BAND = 4;
const AGE_BAND = 2;

function series(stats: SeasonStats[], pick: (s: SeasonStats) => number) {
  const w = stats.filter((s) => s.season >= FROM);
  return { seasons: w.map((s) => s.season), values: w.map(pick) };
}

function report(stats: SeasonStats[]) {
  const failures: string[] = [];
  for (const f of GROUPS) {
    const t = series(stats, (s) => s.starterMean[f]!);
    const tm = meanOf(t.values);
    const tr = driftTest(MATH, `talent ${f}`, t.seasons, t.values, TALENT_DRIFT, SE_MULTIPLE, tm - TALENT_BAND, tm + TALENT_BAND);
    const a = series(stats, (s) => s.rosterAge[f]!);
    const am = meanOf(a.values);
    const ar = driftTest(MATH, `age ${f}`, a.seasons, a.values, AGE_DRIFT, SE_MULTIPLE, am - AGE_BAND, am + AGE_BAND);
    for (const r of [tr, ar]) if (!r.ok) failures.push(`${r.series}: drift ${r.driftOverRun.toFixed(2)} allowed ${r.allowed.toFixed(2)}${r.withinBand ? '' : ' (outside band)'}`);
  }
  // Pooled league series: weighted by starters (talent) and roster slots (age); fixed limits only.
  const wt = (w: Record<string, number>, pick: (s: SeasonStats, g: string) => number) => (s: SeasonStats) =>
    FAMILIES.reduce((acc, f) => acc + w[f]! * pick(s, GROUP_OF[f]), 0) / FAMILIES.reduce((acc, f) => acc + w[f]!, 0);
  const pt = series(stats, wt(STARTERS, (s, f) => s.starterMean[f]!));
  const pa = series(stats, wt(SLOTS, (s, f) => s.rosterAge[f]!));
  const ptm = meanOf(pt.values), pam = meanOf(pa.values);
  for (const r of [
    driftTest(MATH, 'talent league', pt.seasons, pt.values, TALENT_DRIFT, 0, ptm - TALENT_BAND, ptm + TALENT_BAND),
    driftTest(MATH, 'age league', pa.seasons, pa.values, AGE_DRIFT, 0, pam - AGE_BAND, pam + AGE_BAND),
  ]) if (!r.ok) failures.push(`${r.series}: drift ${r.driftOverRun.toFixed(2)} allowed ${r.allowed.toFixed(2)}${r.withinBand ? '' : ' (outside band)'}`);
  return failures;
}

describe('Q1.6.4 long-run stability (30 headless seasons)', () => {
  it('talent and age by position stay stable; career lengths and exits are reported', () => {
    const stats = runLeague(devNumbers(), 2026, SEASONS);
    const failures = report(stats);
    // Report against the 1-of-3 targets (D13.4.1 ages, D8.4.1 career median), for the PR and the calibration owner.
    const ages = Object.fromEntries(GROUPS.map((f) => [f, meanOf(stats.slice(FROM).map((s) => s.rosterAge[f]!)).toFixed(1)]));
    const careers = stats.slice(FROM).flatMap((s) => s.careers);
    const median = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); return a[Math.floor(a.length / 2)] ?? 0; };
    console.log('mean roster age by position', ages);
    console.log('career median seasons: drafted', median(careers.filter((c) => c.drafted).map((c) => c.seasons)), 'all', median(careers.map((c) => c.seasons)));
    console.log('starter grade by position', Object.fromEntries(GROUPS.map((f) => [f, meanOf(stats.slice(FROM).map((s) => s.starterMean[f]!)).toFixed(1)])));
    expect(failures).toEqual([]);
  }, 300_000);
  it('negative control: with aging decline removed the age series fails (Q1.6.4 acceptance)', () => {
    const base = devNumbers();
    const flat = { ...base.tables, curves: { ...base.tables.curves, groups: Object.fromEntries(Object.keys(base.tables.curves.groups).map((k) => [k, base.tables.curves.groups[k]!.map(() => 0)])) } };
    const stats = runLeague({ params: base.params, tables: flat }, 2026, SEASONS);
    // Same window and limits as the real run.
    const ageFailures = report(stats).filter((x) => x.startsWith('age'));
    console.log('age failures without decline', ageFailures);
    expect(ageFailures.length).toBeGreaterThan(0);
  }, 300_000);
});
