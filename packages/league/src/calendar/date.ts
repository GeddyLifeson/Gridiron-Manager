// Civil dates for the calendar engine (C4.1.1). Pure integer arithmetic: no platform clock, no locale
// (P1.1.1). A day is a "day number": whole days since 1970-01-01 (negative before it). Times are
// minutes after midnight, US Eastern, the basis every league date is published in.
import G from './gregorian.json' with { type: 'json' };
import type { WorldDate } from '@gm/schema';

export interface CivilDate { readonly y: number; readonly m: number; readonly d: number }
/** One moment on the league clock: a day number plus minutes after midnight Eastern. */
export interface Instant { readonly day: number; readonly minute: number }

export const DAYS_PER_WEEK: number = G.daysPerWeek;
export const MINUTES_PER_DAY: number = G.minutesPerHour * G.hoursPerDay;
export const WEEKDAY = G.weekday;
export type WeekdayName = keyof typeof G.weekday;

export function isLeap(y: number): boolean {
  return (y % G.leapEvery === 0 && y % G.leapCenturySkip !== 0) || y % G.leapQuadCentury === 0;
}
export function daysInYear(y: number): number {
  let n = 0;
  for (let m = 1; m <= G.monthsPerYear; m++) n += daysInMonth(y, m);
  return n;
}
export function daysInMonth(y: number, m: number): number {
  const base = G.monthDays[m - 1];
  if (base === undefined) throw new Error(`no month ${m}`);
  return m === G.leapMonth && isLeap(y) ? base + 1 : base;
}

const yearStartCache = new Map<number, number>([[G.epochYear, 0]]);
/** Day number of January 1 of year y. */
export function yearStart(y: number): number {
  const hit = yearStartCache.get(y);
  if (hit !== undefined) return hit;
  let day = 0;
  if (y >= G.epochYear) for (let k = G.epochYear; k < y; k++) day += daysInYear(k);
  else for (let k = y; k < G.epochYear; k++) day -= daysInYear(k);
  yearStartCache.set(y, day);
  return day;
}

export function dayNumber(c: CivilDate): number {
  if (c.m < 1 || c.m > G.monthsPerYear) throw new Error(`bad month ${c.m}`);
  if (c.d < 1 || c.d > daysInMonth(c.y, c.m)) throw new Error(`bad day ${c.y}-${c.m}-${c.d}`);
  let day = yearStart(c.y);
  for (let m = 1; m < c.m; m++) day += daysInMonth(c.y, m);
  return day + c.d - 1;
}

export function civil(day: number): CivilDate {
  let y = G.epochYear;
  while (day < yearStart(y)) y--;
  while (day >= yearStart(y + 1)) y++;
  let rest = day - yearStart(y);
  let m = 1;
  while (rest >= daysInMonth(y, m)) { rest -= daysInMonth(y, m); m++; }
  return { y, m, d: rest + 1 };
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekday(day: number): number {
  const w = (day + G.epochWeekday) % G.daysPerWeek;
  return w < 0 ? w + G.daysPerWeek : w;
}

/** The n-th given weekday of a month; n = -1 is the last one. */
export function nthWeekday(y: number, m: number, wd: number, n: number): number {
  if (n === 0) throw new Error('n must not be 0');
  if (n > 0) {
    const first = dayNumber({ y, m, d: 1 });
    const shift = (wd - weekday(first) + G.daysPerWeek) % G.daysPerWeek;
    const day = first + shift + (n - 1) * G.daysPerWeek;
    if (civil(day).m !== m) throw new Error(`no weekday ${wd} number ${n} in ${y}-${m}`);
    return day;
  }
  const last = dayNumber({ y, m, d: daysInMonth(y, m) });
  const back = (weekday(last) - wd + G.daysPerWeek) % G.daysPerWeek;
  const day = last - back + (n + 1) * G.daysPerWeek;
  if (civil(day).m !== m) throw new Error(`no weekday ${wd} number ${n} in ${y}-${m}`);
  return day;
}

/** First day on or after `day` that falls on weekday wd. */
export function onOrAfter(day: number, wd: number): number {
  return day + ((wd - weekday(day) + G.daysPerWeek) % G.daysPerWeek);
}

function pad(n: number, w: number): string { return String(n).padStart(w, '0'); }

export function iso(day: number): string {
  const c = civil(day);
  return `${pad(c.y, G.yearDigits)}-${pad(c.m, G.datePad)}-${pad(c.d, G.datePad)}`;
}
export function parseIso(s: string): number {
  const m = /^(-?\d+)-(\d+)-(\d+)$/.exec(s);
  if (!m) throw new Error(`not a date: ${s}`);
  const [, ys, ms, ds] = m;
  return dayNumber({ y: Number(ys), m: Number(ms), d: Number(ds) });
}
/** "HH:MM" Eastern to minutes after midnight. */
export function parseTime(s: string): number {
  const m = /^(\d+):(\d+)$/.exec(s);
  if (!m) throw new Error(`not a time: ${s}`);
  const [, hs, mins] = m;
  const h = Number(hs), min = Number(mins);
  if (h >= G.hoursPerDay || min >= G.minutesPerHour) throw new Error(`not a time: ${s}`);
  return h * G.minutesPerHour + min;
}
export function formatTime(minute: number): string {
  return `${pad(Math.floor(minute / G.minutesPerHour), G.datePad)}:${pad(minute % G.minutesPerHour, G.datePad)}`;
}

export function instantValue(i: Instant): number { return i.day * MINUTES_PER_DAY + i.minute; }
export function compareInstant(a: Instant, b: Instant): number { return instantValue(a) - instantValue(b); }
export function addMinutes(i: Instant, minutes: number): Instant {
  const v = instantValue(i) + minutes;
  const day = Math.floor(v / MINUTES_PER_DAY);
  return { day, minute: v - day * MINUTES_PER_DAY };
}

/** World date (P3.1.2) is the calendar year plus the day of that year, January 1 = 0. */
export function toWorldDate(day: number): WorldDate {
  const y = civil(day).y;
  return { seasonYear: y, dayIndex: day - yearStart(y) };
}
export function fromWorldDate(w: WorldDate): number {
  if (w.dayIndex >= daysInYear(w.seasonYear)) throw new Error(`day ${w.dayIndex} is past the end of ${w.seasonYear}`);
  return yearStart(w.seasonYear) + w.dayIndex;
}
