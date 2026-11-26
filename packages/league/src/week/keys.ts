// Rule-key lookup for the week: league-rules values (G-10) first, then the week's own rows for keys
// not yet in a league-rules file (data/week-keys.json), filtered by the level of the active rule set.
// A key defined in both with different values is an error, so the two can never disagree silently.
import type { FactStatus } from '@gm/schema';
import local from './data/week-keys.json' with { type: 'json' };
import type { RuleLookup } from '../calendar/types.ts';

export interface WeekKeyRow {
  readonly key: string;
  readonly value: number;
  readonly unit: string;
  readonly status: FactStatus;
  readonly leaf: string;
  readonly levels: readonly string[];
  readonly source: string;
}

export const WEEK_KEYS: readonly WeekKeyRow[] = local.keys as WeekKeyRow[];

/** The lookup every week function reads. `level` is the rule set's level field, used only to filter rows. */
export function weekLookup(leagueRules: RuleLookup, level: string): RuleLookup {
  const own = new Map(WEEK_KEYS.filter((r) => r.levels.includes(level)).map((r) => [r.key, r.value] as const));
  return (k) => {
    const a = leagueRules(k);
    const b = own.get(k);
    if (a !== undefined && b !== undefined && a !== b) throw new Error(`rule key ${k}: league rules say ${a}, week rows say ${b}`);
    return a ?? b;
  };
}

/** A flag key: 1 is on, absent or 0 is off. */
export function flag(rules: RuleLookup, key: string): boolean { return rules(key) === 1; }

/** A number key the caller needs: absent throws, so a missing value never reads as zero. */
export function need(rules: RuleLookup, key: string): number {
  const v = rules(key);
  if (v === undefined) throw new Error(`rule key ${key} is not defined for this rule set`);
  return v;
}

/** True when the rule set counts athletic hours (the countable-hours regime, H1.5.2). Branches on a key, never a level. */
export function countsHours(rules: RuleLookup): boolean { return rules('college.cara_week_hours') !== undefined; }
