// Fixtures for the market tests. Rule values come from the real league-rules file on main
// (a copy in fixtures/proleague_2026.json, G-10 fact rows); the calendar is G-12's.
import type { RuleSet } from '@gm/schema';
import proLeague from './fixtures/proleague_2026.json' with { type: 'json' };
import { CALENDAR_FILES } from '../../src/calendar/files.ts';
import { calendarLookup, lookupFromValues } from '../../src/calendar/keys.ts';
import { calendarSet, CalendarResolver } from '../../src/calendar/resolve.ts';
import { dayNumber, parseTime, type Instant } from '../../src/calendar/date.ts';
import { marketDates, marketRules, type ExpiringPlayer, type MarketDates, type MarketRules } from '../../src/market/index.ts';

type V = number | boolean | string;
export function ruleSet(values: readonly { key: string; value: V }[], over: Record<string, V> = {}, drop: readonly string[] = []): RuleSet {
  const m = new Map<string, V>(values.map((v) => [v.key, v.value]));
  for (const [k, v] of Object.entries(over)) m.set(k, v);
  for (const k of drop) m.delete(k);
  const get = (k: string) => { if (!m.has(k)) throw new Error(`missing ${k}`); return m.get(k)!; };
  return { id: 'proleague_2026', level: 'pro', seasonYear: 2026, num: (k) => get(k) as number, bool: (k) => get(k) as boolean, opt: (k) => get(k) as string, keys: () => [...m.keys()].sort() };
}

export const PRO_VALUES = proLeague.values as readonly { key: string; value: V }[];
export const RS: RuleSet = ruleSet(PRO_VALUES);
export const MR: MarketRules = marketRules(RS, 2026);
export const RESOLVER = new CalendarResolver(calendarSet('pro', CALENDAR_FILES), calendarLookup(lookupFromValues(PRO_VALUES)));
export const DATES: MarketDates = marketDates(RESOLVER, 2026, MR);

export const at = (iso: string, time = '12:00'): Instant => {
  const [y, m, d] = iso.split('-').map(Number);
  return { day: dayNumber({ y: y!, m: m!, d: d! }), minute: parseTime(time) };
};

export function player(over: Partial<ExpiringPlayer> = {}): ExpiringPlayer {
  return {
    personId: 501, priorClubId: 1, accruedSeasons: 3, creditedSeasons: 3, draftRound: 3,
    priorParagraph5Cents: 100_000_000, priorYearSalaryCents: 120_000_000, expiringIsRookieContract: false, ...over,
  };
}

/** Whole dollars to cents. */
export const $ = (usd: number): number => Math.round(usd * 100);
