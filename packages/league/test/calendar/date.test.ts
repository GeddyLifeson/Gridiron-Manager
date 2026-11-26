import { describe, expect, it } from 'vitest';
import {
  civil, dayNumber, daysInYear, fromWorldDate, iso, isLeap, nthWeekday, onOrAfter, parseIso, parseTime, formatTime,
  toWorldDate, weekday, addMinutes, WEEKDAY,
} from '../../src/calendar/date.ts';

describe('civil dates (C4.1.1 time unit)', () => {
  it('epoch and known weekdays', () => {
    expect(dayNumber({ y: 1970, m: 1, d: 1 })).toBe(0);
    expect(weekday(0)).toBe(WEEKDAY.thu);
    expect(weekday(parseIso('2026-03-11'))).toBe(WEEKDAY.wed);
    expect(weekday(parseIso('2026-11-26'))).toBe(WEEKDAY.thu); // Thanksgiving 2026
    expect(weekday(parseIso('2027-08-28'))).toBe(WEEKDAY.sat);
    expect(weekday(parseIso('1969-12-31'))).toBe(WEEKDAY.wed);
  });
  it('round-trips every day from 1900 to 2100', () => {
    for (let d = parseIso('1900-01-01'); d <= parseIso('2100-12-31'); d += 1) expect(dayNumber(civil(d))).toBe(d);
  });
  it('leap years', () => {
    expect([1900, 2000, 2024, 2026, 2100].map(isLeap)).toEqual([false, true, true, false, false]);
    expect(daysInYear(2028)).toBe(366);
    expect(() => dayNumber({ y: 2026, m: 2, d: 29 })).toThrow();
  });
  it('nth and last weekday', () => {
    expect(iso(nthWeekday(2026, 3, WEEKDAY.wed, 2))).toBe('2026-03-11');
    expect(iso(nthWeekday(2027, 3, WEEKDAY.wed, 2))).toBe('2027-03-10');
    expect(iso(nthWeekday(2027, 4, WEEKDAY.mon, 3))).toBe('2027-04-19');
    expect(iso(nthWeekday(2027, 4, WEEKDAY.mon, 1))).toBe('2027-04-05');
    expect(iso(nthWeekday(2027, 8, WEEKDAY.sat, -1))).toBe('2027-08-28');
    expect(iso(nthWeekday(2026, 11, WEEKDAY.thu, 4))).toBe('2026-11-26');
    expect(() => nthWeekday(2026, 2, WEEKDAY.mon, 5)).toThrow();
    expect(iso(onOrAfter(parseIso('2026-04-26'), WEEKDAY.fri))).toBe('2026-05-01');
  });
  it('times and world dates', () => {
    expect(parseTime('16:00')).toBe(960);
    expect(formatTime(959)).toBe('15:59');
    expect(addMinutes({ day: 10, minute: 30 }, -90)).toEqual({ day: 9, minute: 1380 });
    const d = parseIso('2028-12-31');
    expect(toWorldDate(d)).toEqual({ seasonYear: 2028, dayIndex: 365 });
    expect(fromWorldDate(toWorldDate(d))).toBe(d);
    expect(() => fromWorldDate({ seasonYear: 2026, dayIndex: 365 })).toThrow();
  });
});
