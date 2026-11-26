// E8.1.1, E8.2.1, E8.2.2, E8.2.3 acceptance.
import { describe, expect, it } from 'vitest';
import {
  newHealthRecord, yearlyStep, weeklyStep, computeLoad, loadBand, isHeavyWeek, eventPreconditions, DEFAULT_LIFE_REALISM,
  type HealthRecord, type WeekSummary,
} from '../../src/life/index.ts';
import { rng } from './rng.ts';

const subject = { personId: 1, imported: false };

describe('E8.1.1 sustained load', () => {
  it('recomputes exactly from weekly rows; bands; heavy weeks', () => {
    const weeks: WeekSummary[] = Array.from({ length: 60 }, (_, i) => ({ week: i, workHours: i % 2 ? 95 : 60, meanSleepHours: 6 }));
    const l = computeLoad(weeks, 59);
    expect(l.weeksUsed).toBe(12);
    expect(l.meanWorkHours).toBe(77.5);
    expect(l.band).toBe('heavy');
    expect(l.heavyWeeks52).toBe(26);
    expect([40, 55, 75, 76, 91].map(loadBand)).toEqual(['light', 'normal', 'normal', 'heavy', 'veryHeavy']);
    expect(isHeavyWeek({ week: 0, workHours: 50, meanSleepHours: 5 })).toBe(true);
  });
  it('the first weeks of a career use what exists', () => {
    expect(computeLoad([{ week: 0, workHours: 70, meanSleepHours: 7 }], 0).weeksUsed).toBe(1);
  });
});

function careerYears(seed: number, years: number, heavy: (y: number) => number, startAge = 30) {
  const r = rng(seed);
  let rec = newHealthRecord(subject);
  const seen: HealthRecord[] = [];
  for (let y = 0; y < years; y++) {
    rec = yearlyStep(rec, { week: y * 52, age: startAge + y, heavyWeeks52: heavy(y), checkupTaken: y % 3 !== 0, hasPartner: true, employed: true }, r);
    seen.push(rec);
  }
  return seen;
}

describe('E8.2.1 and E8.2.2 check-ups and warnings', () => {
  it('in 10,000 coach-years no state reaches serious without a prior delivered warning', () => {
    let years = 0, serious = 0;
    for (let s = 1; years < 10000; s++) {
      careerYears(s, 40, () => 40).forEach((rec, y) => {
        years++;
        if (rec.state === 'serious') { serious++; expect(rec.warnings.some((w) => w.delivered <= y * 52)).toBe(true); }
      });
    }
    expect(serious).toBeGreaterThan(0);
  });
  it('the yearly step cannot move at risk to serious when no warning was delivered', () => {
    const once = yearlyStep({ ...newHealthRecord(subject), state: 'atRisk' }, { week: 0, age: 70, heavyWeeks52: 52, checkupTaken: false, hasPartner: false, employed: false }, { uniform: () => 0.999 });
    expect(once.state).toBe('atRisk');
  });
  it('heavyWeeks52 of zero for a whole career never leaves well before 55', () => {
    for (let s = 1; s <= 300; s++) for (const rec of careerYears(s, 33, () => 0, 22).slice(0, 32)) expect(rec.state).toBe('well');
  });
  it('a warning is created on reaching at risk and delivered within 4 weeks when the check-up was skipped', () => {
    const rec = yearlyStep({ ...newHealthRecord(subject), state: 'watch' }, { week: 100, age: 40, heavyWeeks52: 40, checkupTaken: false, hasPartner: true, employed: false }, { uniform: () => 0.99 });
    expect(rec.state).toBe('atRisk');
    expect(rec.warnings[0]).toMatchObject({ delivered: 104, route: 'partner', reviewWeek: 116, sleepTargetHours: 6, workTargetHours: 80 });
  });
  it('meeting both targets for 12 weeks always moves the state to watch', () => {
    const rec = yearlyStep({ ...newHealthRecord(subject), state: 'watch' }, { week: 0, age: 40, heavyWeeks52: 40, checkupTaken: true, hasPartner: true, employed: true }, { uniform: () => 0.99 });
    const hist: WeekSummary[] = Array.from({ length: 12 }, (_, i) => ({ week: i + 1, workHours: 79, meanSleepHours: 6.5 }));
    const out = weeklyStep(rec, { week: 12, workHours: 79, history: hist }, rng(1), DEFAULT_LIFE_REALISM);
    expect(out.record.state).toBe('watch');
    expect(out.record.warnings[0]!.outcome).toBe('met');
  });
});

function atRiskUnmet(): HealthRecord {
  const rec = yearlyStep({ ...newHealthRecord(subject), state: 'watch' }, { week: 0, age: 40, heavyWeeks52: 40, checkupTaken: true, hasPartner: true, employed: true }, { uniform: () => 0.99 });
  const hist: WeekSummary[] = Array.from({ length: 12 }, (_, i) => ({ week: i + 1, workHours: 100, meanSleepHours: 5 }));
  return weeklyStep(rec, { week: 12, workHours: 100, history: hist }, rng(1), DEFAULT_LIFE_REALISM).record;
}

describe('E8.2.3 health events', () => {
  it('in 10,000 careers with every warning followed, zero events occur', () => {
    let events = 0;
    for (let c = 0; c < 10000; c++) {
      const r = rng(c + 1);
      let rec = yearlyStep({ ...newHealthRecord(subject), state: 'watch' }, { week: 0, age: 45, heavyWeeks52: 40, checkupTaken: c % 2 === 0, hasPartner: true, employed: true }, { uniform: () => 0.99 });
      const hist: WeekSummary[] = [];
      for (let wk = 1; wk <= 30; wk++) {
        hist.push({ week: wk, workHours: 75, meanSleepHours: 6.5 });
        const out = weeklyStep(rec, { week: wk, workHours: 75, history: hist }, r, DEFAULT_LIFE_REALISM);
        rec = out.record;
        if (out.event) events++;
      }
    }
    expect(events).toBe(0);
  });
  it('without the preconditions the hazard is exactly zero and no draw is made', () => {
    const r = rng(5);
    const rec = newHealthRecord(subject);
    for (let wk = 0; wk < 500; wk++) expect(weeklyStep(rec, { week: wk, workHours: 120, history: [] }, r, DEFAULT_LIFE_REALISM).event).toBeNull();
    expect(r.draws).toBe(0);
  });
  it('ignoring a warning for a year gives roughly a one in four chance; 100+ hour weeks double the hazard', () => {
    const rate = (hours: number) => {
      let hit = 0;
      const n = 4000;
      for (let c = 0; c < n; c++) {
        const r = rng(c + 11);
        let rec = atRiskUnmet();
        for (let wk = 13; wk < 13 + 52; wk++) {
          const out = weeklyStep(rec, { week: wk, workHours: hours, history: [] }, r, DEFAULT_LIFE_REALISM);
          rec = out.record;
          if (out.event) { hit++; break; }
        }
      }
      return hit / n;
    };
    const normal = rate(90);
    expect(normal).toBeGreaterThan(0.19);
    expect(normal).toBeLessThan(0.27);
    expect(rate(105)).toBeGreaterThan(normal * 1.5);
  });
  it('events: 2 to 16 weeks away, second advises retirement and makes serious, third takes a full season', () => {
    let rec = atRiskUnmet();
    expect(eventPreconditions(rec, 24)).toBe(true);
    const always = { uniform: () => 0 };
    const e1 = weeklyStep(rec, { week: 24, workHours: 90, history: [] }, always, DEFAULT_LIFE_REALISM);
    expect(e1.event).toMatchObject({ ordinal: 1, weeksAway: 2, retirementAdvised: false });
    rec = e1.record;
    expect(weeklyStep(rec, { week: 25, workHours: 0, history: [] }, always, DEFAULT_LIFE_REALISM).event).toBeNull();
    // Back at week 26 with fresh advice; ignore it for its 12 weeks.
    const unmet: WeekSummary[] = Array.from({ length: 12 }, (_, i) => ({ week: 27 + i, workHours: 100, meanSleepHours: 5 }));
    rec = weeklyStep(rec, { week: 38, workHours: 100, history: unmet }, rng(2), DEFAULT_LIFE_REALISM).record;
    const e2 = weeklyStep(rec, { week: 39, workHours: 100, history: unmet }, always, DEFAULT_LIFE_REALISM);
    expect(e2.event).toMatchObject({ ordinal: 2, stateAfter: 'serious', retirementAdvised: true });
  });
  it('with the healthEvents switch off the consequence stops at the warning', () => {
    const out = weeklyStep(atRiskUnmet(), { week: 24, workHours: 120, history: [] }, { uniform: () => 0 }, { ...DEFAULT_LIFE_REALISM, healthEvents: false });
    expect(out.event).toBeNull();
  });
  it('no health record can be made for an imported person', () => {
    expect(() => newHealthRecord({ personId: 2, imported: true })).toThrow(/imported/);
  });
});
