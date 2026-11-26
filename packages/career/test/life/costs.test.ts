// E7.2.1, E7.2.2, E7.3.1, E7.3.2, E7.7.2, S9.2.1 acceptance.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TASKS, taskCost, WeekViewings, delegateWeek, mayDelegate, reviewProduct, tallyReview, distrustShown, runWeek,
  requiredHours, discretionaryHours, sleepNeedHours, type WorkItem,
} from '../../src/life/index.ts';

describe('E7.2.1 the task cost table', () => {
  it('every row resolves to a cost; the E4 and E6 costs equal the table', () => {
    for (const t of TASKS) expect(taskCost(t.id, 1).hours, t.id).toBeGreaterThanOrEqual(0);
    expect(taskCost('boss.writtenPlan', 1).hours).toBe(3);
    expect(taskCost('boss.preseasonMeeting', 1).hours).toBe(0.5);
    expect(taskCost('outside.speech', 1).hours).toBe(6);
    expect(taskCost('money.adviserCheck', 1).hours).toBe(1);
    expect(taskCost('notebook.entry', 5).hours).toBe(0);
  });
  it('unknown tasks throw so a builder adds a row (rule 4)', () => {
    expect(() => taskCost('film.nonexistent', 1)).toThrow(/add a row/);
  });
  it('options, clips, travel, blocks and the interview cap', () => {
    expect(taskCost('people.playerTalk', 1, { long: true }).hours).toBe(0.5);
    expect(taskCost('film.cutup', 41).hours).toBe(1);
    expect(taskCost('people.homeVisit', 1, { travelHours: 2.5 }).hours).toBe(6.5);
    expect(taskCost('block.scheduled', 1, { blockHours: 1.75 }).hours).toBe(1.75);
    expect(taskCost('career.interview', 1, { realHours: 5, capHours: 3 }).hours).toBe(3);
  });
  it('a film cost applies once per game per week', () => {
    const v = new WeekViewings();
    expect(v.charge('film.opponentAll', 'g3').hours).toBe(3);
    expect(v.charge('film.opponentAll', 'g3').hours).toBe(0);
    expect(new WeekViewings().charge('film.opponentAll', 'g3').hours).toBe(3);
  });
  it('E7.2.2: the cost function has no input from the coach record (only task, units, location and schedule)', () => {
    const src = readFileSync(join(__dirname, '../../src/life/costs.ts'), 'utf8');
    for (const banned of ['age', 'experience', 'label', 'seasons', 'fluency', 'sleepDebt', 'fatigue']) expect(src).not.toMatch(new RegExp(`readonly ${banned}\\b`, 'i'));
  });
});

const w = (taskId: string, hours: number, priority: number, delegateId: number | null): WorkItem => ({ taskId, category: 'planning', hours, priority, delegateId });

describe('E7.3.1 handing work off', () => {
  it('delegating reduces the coach by the table cost and adds it to the delegate', () => {
    const self = runWeek({ days: [{ work: [w('plan.callSheetBuild', 2, 1, null)], travelHours: 0, sleepHours: 7, homeHours: 2, facilityNight: false }] }, 0);
    const deleg = runWeek({ days: [{ work: [w('plan.callSheetBuild', 2, 1, 9)], travelHours: 0, sleepHours: 7, homeHours: 2, facilityNight: false }] }, 0);
    expect(self.week.totals.work - deleg.week.totals.work).toBe(2);
    const dw = delegateWeek({ personId: 9, rung: 6, reportsTo: 1, capacityHours: 10 }, deleg.outcomes[0]!.delegated);
    expect(dw.assignedHours).toBe(2);
    expect(dw.tasks[0]!.status).toBe('complete');
  });
  it('an overloaded delegate returns the lowest-priority work incomplete', () => {
    const dw = delegateWeek({ personId: 9, rung: 6, reportsTo: 1, capacityHours: 3 }, [w('a', 2, 5, 9), w('b', 2, 1, 9), w('c', 1, 3, 9)]);
    expect(dw.overloaded).toBe(true);
    expect(dw.tasks.map((t) => [t.item.taskId, t.status])).toEqual([['a', 'complete'], ['b', 'incomplete'], ['c', 'complete']]);
  });
  it('below head coach, only to people who report to him (E7.7.2 rule 3)', () => {
    expect(mayDelegate(1, false, { personId: 2, rung: 3, reportsTo: 1, capacityHours: 5 })).toBe(true);
    expect(mayDelegate(1, false, { personId: 3, rung: 3, reportsTo: 8, capacityHours: 5 })).toBe(false);
    expect(mayDelegate(1, true, { personId: 3, rung: 3, reportsTo: 8, capacityHours: 5 })).toBe(true);
  });
});

describe('E7.3.2 checking delegated work', () => {
  it('returning adds hours to the delegate and only the review to the coach', () => {
    expect(reviewProduct('plan.sectionBuild', 'return')).toEqual({ coachHours: 0.25, delegateHours: 1, staffEvent: 'returned' });
    expect(reviewProduct('plan.sectionBuild', 'replace')).toEqual({ coachHours: 1.25, delegateHours: 0, staffEvent: 'replaced' });
  });
  it('replacing more than 30 percent of a delegate products shows distrust', () => {
    let t = { products: 0, replaced: 0 };
    for (const a of ['accept', 'accept', 'replace'] as const) t = tallyReview(t, a);
    expect(distrustShown(t)).toBe(true);
    t = tallyReview(t, 'accept');
    expect(distrustShown(t)).toBe(false);
  });
});

describe('E7.7.2 and S9.2.1 required hours by rung', () => {
  it('S9 ranges, the boss culture picks inside them, head coach sets his own', () => {
    expect(requiredHours(2, true, 0)).toBe(70);
    expect(requiredHours(2, true, 1)).toBe(90);
    expect(requiredHours(8, true, 1)).toBe(0);
    expect(requiredHours(0, true, 0, true)).toBe(40);
  });
  it('rung 2 under a high-hours boss in a game week leaves little discretionary time (S9.2.1 acceptance, see decisions D-9)', () => {
    const left = discretionaryHours(requiredHours(2, true, 1), sleepNeedHours(), 0);
    expect(left).toBe(15);
  });
});
