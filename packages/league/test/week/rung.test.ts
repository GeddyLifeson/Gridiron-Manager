import { describe, expect, it } from 'vitest';
import { completeTask, dailyLoadHours, mayMoveFixed, proposalOutcome, rungTasks } from '../../src/week/index.ts';
import { proWeek } from './fixtures.ts';

describe('the week by rung (H1.5.5, H4.6.2)', () => {
  it('a graduate assistant’s default tasks need more hours than the working day', () => {
    expect(dailyLoadHours('graduate_assistant')).toBeGreaterThan(14);
    const tasks = rungTasks('graduate_assistant', proWeek(), 23 * 60);
    const day1 = tasks.filter((t) => t.dueAt.day === proWeek().days[0]!.day).reduce((s, t) => s + t.hoursAtFullDepth, 0);
    expect(day1).toBeCloseTo(14 * 1.15, 6);
    expect(rungTasks('head_coach', proWeek(), 0)).toEqual([]);
  });
  it('every task produces one completion record with its depth and lateness', () => {
    const t = rungTasks('graduate_assistant', proWeek(), 23 * 60)[0]!;
    const r = completeTask(t, t.hoursAtFullDepth / 2, { day: t.dueAt.day, minute: t.dueAt.minute + 30 });
    expect(r).toEqual({ taskId: t.id, depth: 0.5, belowMinimum: false, lateMinutes: 30 });
  });
  it('only coordinators and head coaches move fixed blocks', () => {
    expect(mayMoveFixed('position_coach')).toBe(false);
    expect(mayMoveFixed('coordinator')).toBe(true);
  });
  it('a failed proposal costs less than a success gains', () => {
    expect(proposalOutcome(true, 1)).toBe(1);
    expect(proposalOutcome(false, 1)).toBe(-0.6);
  });
});
