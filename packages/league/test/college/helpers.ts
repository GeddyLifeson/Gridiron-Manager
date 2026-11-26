import type { RuleSet } from '@gm/schema';
import { dayNumber } from '../../src/calendar/date.ts';
import { collegeRules, type CollegeRules, type EligibilityRecord, type SeasonPlayed, type Stream } from '../../src/college/index.ts';
import fixture from './fixtures/college.json' with { type: 'json' };

type Val = number | boolean | string;
export const FIXTURE = fixture as unknown as { id: string; seasonYear: number; values: Record<string, [Val, string]> };

export function ruleSet(override: Record<string, Val | undefined> = {}, seasonYear = FIXTURE.seasonYear): RuleSet {
  const v = new Map<string, Val>(Object.entries(FIXTURE.values).map(([k, [val]]) => [k, val]));
  for (const [k, val] of Object.entries(override)) { if (val === undefined) v.delete(k); else v.set(k, val); }
  const get = (k: string) => { if (!v.has(k)) throw new Error(`missing ${k}`); return v.get(k)!; };
  return {
    id: FIXTURE.id, level: 'college', seasonYear,
    num: (k) => get(k) as number, bool: (k) => get(k) as boolean, opt: (k) => get(k) as string,
    keys: () => [...v.keys()].sort(),
  };
}

export const RULES: CollegeRules = collegeRules(ruleSet());
export const SEASONS_RULES: CollegeRules = collegeRules(ruleSet({ 'eligibility.model': 'seasons' }));

export const day = (y: number, m: number, d: number) => dayNumber({ y, m, d });

export function rec(over: Partial<EligibilityRecord> = {}): EligibilityRecord {
  return { personId: 1, birthDay: day(2007, 3, 1), firstEnrollYear: 2026, firstCompetedYear: null, seasons: [], declared: false, ...over };
}

export const season = (s: number, regularGames: number, postseasonGames = 0, juco = false): SeasonPlayed => ({ season: s, regularGames, postseasonGames, juco });

/** Deterministic test stream (mulberry32). */
export function stream(seed = 1): Stream {
  let a = seed >>> 0;
  return {
    uniform() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}
