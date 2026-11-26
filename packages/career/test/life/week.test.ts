// E7.1.1, E7.1.2, E7.4.1, E7.4.2 acceptance.
import { describe, expect, it } from 'vitest';
import {
  runWeek, resolveDay, summaryWeek, weekHours, nightDebt, sleepBand, gameDayEffects, sleepNeedHours, ledgerRowsFor,
  HourLedger, workHoursOf, totalsByCategory, DEFAULT_LIFE_REALISM, unplannedWeeklyMean, type DayPlan, type WeekPlan, type WorkItem,
} from '../../src/life/index.ts';

const item = (taskId: string, hours: number, priority = 1, extra: Partial<WorkItem> = {}): WorkItem =>
  ({ taskId, category: 'film', hours, priority, delegateId: null, ...extra });
const day = (p: Partial<DayPlan> = {}): DayPlan => ({ work: [item('film.opponentAll', 10)], travelHours: 0, sleepHours: 7, homeHours: 3, facilityNight: false, ...p });
const sum = (d: { work: number; sleep: number; home: number; travel: number; free: number; needs: number }) => d.work + d.sleep + d.home + d.travel + d.free + d.needs;

describe('E7.1.1 the week as 168 hours', () => {
  it('every simulated week sums to exactly 168 hours (randomised plans)', () => {
    let seed = 7;
    const r = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let k = 0; k < 300; k++) {
      const days: DayPlan[] = Array.from({ length: 7 }, () => day({
        work: Array.from({ length: Math.floor(r() * 6) }, (_, i) => item(`t${i}`, Math.round(r() * 24) / 4 * 2, Math.floor(r() * 5))),
        travelHours: Math.round(r() * 8) / 4, sleepHours: Math.round(r() * 40) / 4, homeHours: Math.round(r() * 24) / 4, facilityNight: r() < 0.2,
      }));
      const res = runWeek({ days }, r() * 30);
      const t = res.week.totals;
      expect(sum(t)).toBe(weekHours());
      for (const d of res.week.days) expect(sum(d)).toBe(24);
    }
  });
  it('scheduling a 2-hour block into a full day forces a visible choice of what loses 2 hours', () => {
    const full = day({ work: [item('a', 12.5)], sleepHours: 7, homeHours: 3 }); // 12.5 + 7 + 3 + 1.5 = 24
    const base = resolveDay(full, 0);
    expect(base.day.free).toBe(0);
    const more = resolveDay({ ...full, work: [...full.work, item('block', 2, 5)] }, 0);
    expect(more.outcome.tookFromHome + more.outcome.tookFromSleep).toBe(2);
    const choseSleep = resolveDay({ ...full, work: [...full.work, item('block', 2, 5)], gives: ['sleep'] }, 0);
    expect(choseSleep.outcome.tookFromSleep).toBe(2);
    expect(choseSleep.day.home).toBe(3);
  });
  it('default order: home, then free, then sleep down to 4 hours, then the lowest-priority task is dropped', () => {
    const r = resolveDay(day({ work: [item('keep', 14, 9), item('low', 3, 1), item('mid', 2, 5)], sleepHours: 7, homeHours: 3 }), 0);
    // need 19 + 1.5 = 20.5 before sleep and home; home goes (3), sleep to 4 (3 h): 20.5 + 4 = 24.5 still over, drop 'low'.
    expect(r.day.home).toBe(0);
    expect(r.day.sleep).toBe(4);
    expect(r.outcome.dropped.map((w) => w.taskId)).toEqual(['low']);
  });
  it('a facility night has no commute and zero home hours', () => {
    const r = resolveDay(day({ facilityNight: true, homeHours: 5 }), 0);
    expect(r.day.home).toBe(0);
    expect(r.day.needs).toBe(1);
  });
  it('identical choices give identical coach_week whatever the coach history (no history input exists)', () => {
    const plan: WeekPlan = { days: Array.from({ length: 7 }, () => day()) };
    expect(runWeek(plan, 3)).toEqual(runWeek(plan, 3));
  });
  it('AI summary weeks sum to 168 at the summary tier (E7.7.3)', () => {
    const w = summaryWeek({ work: 83.25, sleepPerNight: 6, home: 9.5, travel: 4.75 });
    expect(sum(w.totals)).toBe(168);
    expect(w.totals.work).toBe(83.25);
  });
});

describe('E7.1.2 the hour ledger and the dry run', () => {
  const plan: WeekPlan = { days: Array.from({ length: 7 }, (_, i) => day({ work: [item('film.opponentAll', 9), item('people.call', 1, 1, { delegateId: 42 }), ...(i === 2 ? [item('owner', 1, 2, { unplanned: true })] : [])] })) };
  it('the preview equals the committed week to the quarter hour and running it 100 times changes nothing', () => {
    const ledger = new HourLedger();
    const preview = runWeek(plan, 10);
    for (let k = 0; k < 100; k++) runWeek(plan, 10);
    expect(ledger.length).toBe(0);
    const committed = runWeek(plan, 10);
    ledger.append(ledgerRowsFor(1, 7, committed));
    expect(committed.week).toEqual(preview.week);
    expect(committed.debtEnd).toBe(preview.debtEnd);
  });
  it('ledger totals per week equal coach_week totals; delegated rows go to the delegate', () => {
    const r = runWeek(plan, 0);
    const rows = ledgerRowsFor(5, 7, r);
    expect(workHoursOf(rows, 7, 5)).toBe(r.week.totals.work);
    const t = totalsByCategory(rows, 7);
    expect(t.sleep).toBe(r.week.totals.sleep);
    expect(t.home).toBe(r.week.totals.home);
    expect(rows.filter((x) => x.delegated).every((x) => x.doneBy === 42)).toBe(true);
    expect(unplannedWeeklyMean(rows, 7, [5])).toBe(1);
  });
  it('the ledger is append-only: rows are frozen copies', () => {
    const l = new HourLedger();
    l.append(ledgerRowsFor(1, 7, runWeek(plan, 0)));
    const first = l.all()[0]!;
    expect(Object.isFrozen(first)).toBe(true);
    expect(() => { (first as { hours: number }).hours = 99; }).toThrow();
  });
});

describe('E7.4.1 sleep debt', () => {
  it('seven nights at 7.5 hours leave the debt unchanged; seven at 5 add 17.5', () => {
    let d = 3;
    for (let i = 0; i < 7; i++) d = nightDebt(d, { sleptHours: 7.5 });
    expect(d).toBe(3);
    d = 0;
    for (let i = 0; i < 7; i++) d = nightDebt(d, { sleptHours: 5 });
    expect(d).toBe(17.5);
  });
  it('need is never below the recommended adult minimum (F-life-0001)', () => {
    expect(sleepNeedHours()).toBeGreaterThanOrEqual(7);
  });
  it('recovery repays at most 2 h a night; cap 40; travel adds 1 h; bands', () => {
    expect(nightDebt(10, { sleptHours: 12 })).toBe(8);
    expect(nightDebt(39, { sleptHours: 0 })).toBe(40);
    expect(nightDebt(0, { sleptHours: 7.5, zoneShiftHours: -3 })).toBe(1);
    expect([0, 5, 5.25, 12, 12.25, 24, 24.25].map(sleepBand)).toEqual(['rested', 'rested', 'tired', 'tired', 'wornDown', 'wornDown', 'exhausted']);
  });
  it('a break spent away repays up to 14 hours per week (E7.6.2)', () => {
    let d = 30;
    for (let i = 0; i < 7; i++) d = nightDebt(d, { sleptHours: 10 });
    expect(d).toBe(16);
  });
});

describe('E7.4.2 what overwork costs and never costs', () => {
  it('exhausted: 6 s and two halftime items; worn down: 3 s and one; switch off: none', () => {
    expect(gameDayEffects(30, DEFAULT_LIFE_REALISM)).toMatchObject({ infoDelayS: 6, halftimeActionsLost: 2 });
    expect(gameDayEffects(18, DEFAULT_LIFE_REALISM)).toMatchObject({ infoDelayS: 3, halftimeActionsLost: 1 });
    expect(gameDayEffects(4, DEFAULT_LIFE_REALISM)).toMatchObject({ infoDelayS: 0, halftimeActionsLost: 0, notice: null });
    expect(gameDayEffects(30, { ...DEFAULT_LIFE_REALISM, gameDayTiredness: false })).toMatchObject({ infoDelayS: 0, halftimeActionsLost: 0 });
  });
  it('an exhausted day loses an hour to slow work', () => {
    const r = runWeek({ days: [day(), day()] }, 30);
    expect(r.week.days[0]!.needs).toBe(2.5);
    expect(r.slowWorkHours).toBeGreaterThanOrEqual(1);
  });
});
