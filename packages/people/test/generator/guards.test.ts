// Drift guards over 30 cohorts (D13.4). The living-world census (D13.4.1) and the 60-year soak (D13.4.4)
// need development, aging and the season loop (G-20, G-44, G-88). Here the generator's side is proven:
// classes drawn from fixed profiles do not drift, the class validator passes them, and the correction
// rules move only future intake, stay small in a correct world and alarm when the world is wrong.
import { describe, expect, it } from 'vitest';
import {
  MAIN_POSITIONS, POSITION_RELEVANCE, GROUPS, classStats, correctionIss, generatePlayer, generateValidatedClass, intakeSize,
  meanSd, nextTalentCorrection, param, profileOf, proProfile, validateClass, bodyDriftAlarms,
  type GeneratedPlayer, type TalentCorrection,
} from './exports.ts';
import { req, rng } from './helpers.ts';

const PER_POSITION = 200;
const YEARS = 30;
const R = rng(424242);
const targets = { counts: Object.fromEntries(MAIN_POSITIONS.map((p) => [p, PER_POSITION])) };

function buildClass(year: number, attempt: number, shiftIss: number): GeneratedPlayer[] {
  const out: GeneratedPlayer[] = [];
  MAIN_POSITIONS.forEach((pos, pi) => {
    for (let i = 0; i < PER_POSITION; i++) {
      const slot = pi * 1000 + i;
      out.push(generatePlayer(req(pos, slot, {
        personId: (year - 2029) * 100000 + attempt * 15000 + slot + 1,
        classKey: { classYear: year, classType: `soak${attempt}`, slotIndex: slot },
        ceilingShiftIss: shiftIss,
      }), R));
    }
  });
  return out;
}
const posOf = (p: GeneratedPlayer) => profileOf(p.record.playing!.position);

/** Mean primary-group ceiling across a class: the stand-in for the starter ISS mean the census measures. */
function primaryCeilingMean(cls: readonly GeneratedPlayer[]): number {
  const xs: number[] = [];
  for (const p of cls) {
    const pos = posOf(p);
    for (const [g, list] of Object.entries(GROUPS)) if (POSITION_RELEVANCE[pos][g] === 'p' && g !== 'mental') for (const a of list) xs.push(p.record.playing!.ceilings[a]!);
  }
  return meanSd(xs).mean;
}

describe('30 cohorts from fixed profiles (D13.4.2 rule 4, D13.4.3 frozen era, D13.4.5)', () => {
  const years: { cls: GeneratedPlayer[]; attempt: number; alarm: boolean }[] = [];
  let correction: TalentCorrection = { totalSd: 0, alarm: false };
  const deviations: number[] = [];
  const corrections: number[] = [];
  for (let y = 0; y < YEARS; y++) {
    const shift = correctionIss(correction);
    const v = generateValidatedClass((a) => buildClass(2030 + y, a, shift), (cls) => validateClass(classStats(cls, posOf), targets));
    years.push({ cls: v.cls, attempt: v.classAttempt, alarm: v.alarm });
    // Census stand-in: deviation of the class's primary ceiling mean from the entrant target, in tolerances.
    deviations.push((primaryCeilingMean(v.cls) - param('proEntrantCeilingMean')) / param('starterIssMeanTol'));
    correction = nextTalentCorrection(correction, deviations);
    corrections.push(correction.totalSd);
  }

  it('regenerates under 5 percent of classes and never accepts a class with an alarm', () => {
    expect(years.filter((y) => y.attempt > 0).length / YEARS).toBeLessThan(0.05 + 1e-9);
    expect(years.some((y) => y.alarm)).toBe(false);
  });
  it('keeps every position mean of every measurable within 0.15 sd of the fixed profile in every year (no body drift alarm)', () => {
    for (const y of years) expect(bodyDriftAlarms(classStats(y.cls, posOf))).toEqual([]);
  });
  it('holds the frozen era: mean forty of receivers in years 1 to 5 and 26 to 30 differ by under 0.01 s', () => {
    const wr40 = (ys: typeof years) => meanSd(ys.flatMap((y) => y.cls.filter((p) => posOf(p) === 'WR').map((p) => p.adult.fortyS!))).mean;
    expect(Math.abs(wr40(years.slice(0, 5)) - wr40(years.slice(25)))).toBeLessThan(0.01);
    expect(Math.abs(wr40(years) - proProfile('WR').mean('fortyS'))).toBeLessThan(0.01);
  });
  it('keeps total talent correction under 0.15 sd in a correct world', () => {
    for (const c of corrections) expect(Math.abs(c)).toBeLessThan(0.15);
    expect(correction.alarm).toBe(false);
  });
  it('never edits a living person: an earlier class is unchanged after later classes and corrections', () => {
    const first = JSON.stringify(years[0]!.cls[0]!.record);
    const again = generatePlayer(req(MAIN_POSITIONS[0]!, 0, { personId: 100000 + years[0]!.attempt * 15000 + 1, classKey: { classYear: 2030, classType: `soak${years[0]!.attempt}`, slotIndex: 0 }, ceilingShiftIss: 0 }), rng(424242));
    expect(JSON.stringify(again.record)).toBe(first);
  });
});

describe('correction rules (D13.4.2)', () => {
  /** A toy world where the census reads entrant talent plus a development bias, and corrections shift entrants. */
  function run(biasIss: number, years: number) {
    let c: TalentCorrection = { totalSd: 0, alarm: false };
    const dev: number[] = [];
    const starter: number[] = [];
    for (let y = 0; y < years; y++) {
      const mean = 50 + biasIss + correctionIss(c);
      starter.push(mean);
      dev.push((mean - 50) / param('starterIssMeanTol'));
      c = nextTalentCorrection(c, dev);
    }
    return { c, starter };
  }
  it('pulls a moderately biased world back inside 1.5 tolerances within the cap, without an alarm', () => {
    const { c, starter } = run(4, YEARS);
    expect(c.alarm).toBe(false);
    for (const s of starter.slice(10)) expect(Math.abs(s - 50)).toBeLessThanOrEqual(1.5 * param('starterIssMeanTol'));
  });
  it('fires the cap alarm when the bias is beyond what 0.5 sd may mask (the model is wrong, fix it in tuning)', () => {
    const { c } = run(12, YEARS);
    expect(c.alarm).toBe(true);
    expect(Math.abs(c.totalSd)).toBeLessThanOrEqual(param('talentCapSd') + 1e-12);
  });
  it('moves at most 0.1 sd a year and only after three years of data', () => {
    let c: TalentCorrection = { totalSd: 0, alarm: false };
    c = nextTalentCorrection(c, [5, 5]);
    expect(c.totalSd).toBe(0);
    c = nextTalentCorrection(c, [5, 5, 5]);
    expect(c.totalSd).toBeCloseTo(-0.1, 12);
  });
  it('limits intake size to 0.8 to 1.25 times the formula (rule 2)', () => {
    expect(intakeSize(100, 0)).toBe(100);
    expect(intakeSize(100, 2)).toBe(80);
    expect(intakeSize(100, -2)).toBe(125);
    expect(intakeSize(100, 0.2)).toBe(90);
  });
  it('fails a class whose counts or means are off (D13.4.5)', () => {
    const cls = Array.from({ length: 60 }, (_, i) => generatePlayer(req('CB', i), R));
    expect(validateClass(classStats(cls, posOf), { counts: { CB: 60 } })).toEqual([]);
    expect(validateClass(classStats(cls, posOf), { counts: { CB: 80 } }).map((p) => p.kind)).toContain('count');
    const shifted = validateClass(classStats(cls, posOf), { counts: { CB: 60 }, measurables: { CB: { fortyS: { mean: 4.6, sd: 0.09 } } } });
    expect(shifted.map((p) => p.kind)).toContain('mean');
  });
});
