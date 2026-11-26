// World-date arithmetic for the pipeline. World dates are season year plus C4 day index, never wall
// clock (P3.1.2). The year length is the league calendar's (world.ts, C4).
import type { WorldDate } from '@gm/schema';
import { DAYS_PER_YEAR } from '../world.ts';
import { P } from './params.ts';

export function dayNumber(d: WorldDate): number { return d.seasonYear * DAYS_PER_YEAR + d.dayIndex; }

export function daysBetween(from: WorldDate, to: WorldDate): number { return dayNumber(to) - dayNumber(from); }

export function addDays(d: WorldDate, days: number): WorldDate {
  const n = dayNumber(d) + days;
  const seasonYear = Math.floor(n / DAYS_PER_YEAR);
  return { seasonYear, dayIndex: n - seasonYear * DAYS_PER_YEAR };
}

export function addWeeks(d: WorldDate, weeks: number): WorldDate { return addDays(d, weeks * P('days_per_week')); }

export function weeksBetween(from: WorldDate, to: WorldDate): number { return daysBetween(from, to) / P('days_per_week'); }

export function yearsBetween(from: WorldDate, to: WorldDate): number { return daysBetween(from, to) / DAYS_PER_YEAR; }

export function weeksPerYear(): number { return DAYS_PER_YEAR / P('days_per_week'); }

export function onOrBefore(a: WorldDate, b: WorldDate): boolean { return dayNumber(a) <= dayNumber(b); }
