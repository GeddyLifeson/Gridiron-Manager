// The recruiting period formula (world recruiting RC-04) against the official NCAA FBS recruiting calendars
// (ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2024-25 and 2025-26), dates as printed there.
import { calendar } from '@gm/league';
import { describe, expect, it } from 'vitest';
import { formulaPeriods } from '../../src/recruiting/calendar.ts';

const rows = (y: number) => formulaPeriods(y).map((s) => `${calendar.iso(s.open)} ${calendar.iso(s.close)} ${s.period}`);

describe('recruiting periods built for any year (T4.2.1)', () => {
  it('matches the official calendars for January to December 2025', () => {
    expect(rows(2025)).toEqual([
      '2025-01-01 2025-01-05 dead', // 2024-25: Dec. 23 through Jan. 5 dead
      '2025-01-06 2025-01-11 contact', // Jan. 6 through Feb. 1 contact, except
      '2025-01-12 2025-01-12 quiet', // Jan. 12 quiet
      '2025-01-13 2025-01-15 dead', // Jan. 13-15 dead
      '2025-01-16 2025-02-01 contact',
      '2025-02-02 2025-02-02 quiet', // Feb. 2 quiet
      '2025-02-03 2025-03-02 dead', // Feb. 3 through March 2 dead
      '2025-03-03 2025-04-14 quiet', // March 3 through April 14 quiet
      '2025-04-15 2025-05-24 contact', // April 15 through May 24 contact
      '2025-05-25 2025-05-28 dead', // May 25-28 dead
      '2025-05-29 2025-06-22 quiet', // May 29 through June 22 quiet
      '2025-06-23 2025-07-31 dead', // June 23 through July 31 dead
      '2025-08-01 2025-08-31 dead', // 2025-26: Aug. 1-31 dead
      '2025-09-01 2025-11-30 evaluation', // Sept. 1 through Nov. 30 evaluation
      '2025-12-01 2025-12-31 dead', // Dec. 1 through Jan. 4 dead
    ]);
  });

  it('matches the official 2025-26 calendar for January to July 2026', () => {
    expect(rows(2026).slice(0, 12)).toEqual([
      '2026-01-01 2026-01-04 dead', '2026-01-05 2026-01-10 contact', '2026-01-11 2026-01-11 quiet', '2026-01-12 2026-01-14 dead',
      '2026-01-15 2026-01-31 contact', '2026-02-01 2026-02-01 quiet', '2026-02-02 2026-03-01 dead', '2026-03-02 2026-04-14 quiet',
      '2026-04-15 2026-05-23 contact', '2026-05-24 2026-05-27 dead', '2026-05-28 2026-06-21 quiet', '2026-06-22 2026-07-31 dead',
    ]);
  });

  it('covers every day of a year with exactly one period', () => {
    for (const y of [1869, 1900, 1987, 2031]) {
      const ps = formulaPeriods(y);
      expect(ps[0]!.open).toBe(calendar.dayNumber({ y, m: 1, d: 1 }));
      expect(ps[ps.length - 1]!.close).toBe(calendar.dayNumber({ y, m: 12, d: 31 }));
      for (let i = 1; i < ps.length; i++) expect(ps[i]!.open).toBe(ps[i - 1]!.close + 1);
    }
  });
});
