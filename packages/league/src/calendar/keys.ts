// Rule-key lookup for the calendar: league-rules values (G-10) first, then the calendar's own rows for
// keys not yet in a league-rules file (data/calendar-keys.json). A key defined in both with different
// values is an error, so the two can never disagree silently.
import type { FactStatus } from '@gm/schema';
import local from './data/calendar-keys.json' with { type: 'json' };
import type { RuleLookup } from './types.ts';

export interface CalendarKeyRow {
  readonly key: string;
  readonly value: number;
  readonly unit: string;
  readonly status: FactStatus;
  readonly leaf: string;
  readonly source: string;
}

export const CALENDAR_KEYS: readonly CalendarKeyRow[] = local.keys as CalendarKeyRow[];

/** Lookup over a plain key-value list such as a league-rules file's `values`. */
export function lookupFromValues(values: readonly { key: string; value: unknown }[]): RuleLookup {
  const m = new Map<string, number>();
  for (const v of values) if (typeof v.value === 'number') m.set(v.key, v.value);
  return (k) => m.get(k);
}

export function calendarLookup(leagueRules: RuleLookup): RuleLookup {
  const own = new Map(CALENDAR_KEYS.map((r) => [r.key, r.value] as const));
  return (k) => {
    const a = leagueRules(k);
    const b = own.get(k);
    if (a !== undefined && b !== undefined && a !== b) throw new Error(`rule key ${k}: league rules say ${a}, calendar rows say ${b}`);
    return a ?? b;
  };
}
