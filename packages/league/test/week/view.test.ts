// The schedule view carries no truth-class value (H9.1.1 rule 3, K9).
import { describe, expect, it } from 'vitest';
import { createWeekDocuments, documentView, scheduleView } from '../../src/week/index.ts';
import { proWeek } from './fixtures.ts';

describe('schedule view', () => {
  const week = proWeek();
  const docs = createWeekDocuments(week, { groups: 8, planScale: 1, countable: false, selfScoutDue: false })
    .map((d) => documentView({ ...d, quality: 0.123456, errors: ['secret-error'] }, d.dueAt));
  const v = scheduleView(week, [], docs);
  it('lists every day and block with its owner area', () => {
    expect(v.days.length).toBe(week.days.length);
    expect(v.days.flatMap((d) => d.blocks).length).toBe(week.days.flatMap((d) => d.blocks).length);
    expect(v.days.flatMap((d) => d.blocks).every((b) => b.owner.length > 0)).toBe(true);
  });
  it('never carries document quality or seeded errors', () => {
    const s = JSON.stringify(v);
    expect(s).not.toContain('0.123456');
    expect(s).not.toContain('secret-error');
  });
});
