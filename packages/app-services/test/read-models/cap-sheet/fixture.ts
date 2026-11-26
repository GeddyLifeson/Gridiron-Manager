// Fixtures for the cap sheet tests. Rule values are the G-10 league-rules values (copied with their fact
// ids into pro-cap-rules.json and college-rules.json, since a test may not reach into another package's
// files). Contracts are built here; amounts are test inputs, not facts.
import type { RuleSet } from '@gm/schema';
import { cap } from '@gm/league';
import pro from './pro-cap-rules.json' with { type: 'json' };
import college from './college-rules.json' with { type: 'json' };
import type { ProvenanceLookup, SheetContract } from '../../../src/read-models/cap-sheet/index.ts';

type V = number | boolean | string;
type File = { id: string; values: Record<string, [V, string]> };

export function ruleSet(file: File, level: 'pro' | 'college', seasonYear = 2026): RuleSet {
  const v = new Map<string, V>(Object.entries(file.values).map(([k, [val]]) => [k, val]));
  const get = (k: string) => { if (!v.has(k)) throw new Error(`missing ${k}`); return v.get(k)!; };
  return { id: file.id, level, seasonYear, num: (k) => get(k) as number, bool: (k) => get(k) as boolean, opt: (k) => get(k) as string, keys: () => [...v.keys()].sort() };
}

export const PRO_FILE = pro as unknown as File;
export const COLLEGE_FILE = college as unknown as File;
export const PRO = ruleSet(PRO_FILE, 'pro');
export const COLLEGE = ruleSet(COLLEGE_FILE, 'college');

/** Fact ids from the fixture; the status word is a stand-in (the host computes it from facts/*.json). */
export const lookup = (file: File): ProvenanceLookup => (key) => {
  const row = file.values[key];
  return row && row[1].startsWith('F-') ? { factId: row[1], status: 'Rulebook only' } : null;
};

export const M = 100 * 1000 * 1000; // one million dollars in cents

/** Five years 2026 to 2030, base 5M a year, a 10M signing bonus (2M a year of proration). */
export function veteran(id: number, personId: number, over: Partial<SheetContract> = {}): SheetContract {
  const years = [2026, 2027, 2028, 2029, 2030].map((y) => cap.plainYear(y, 5 * M));
  return {
    personId, player: { creditedSeasons: 6, undraftedRookie: false },
    contract: { id, form: 'veteran', years, offset: false, tranches: [{ amountCents: 10 * M, firstLeagueYear: 2026, paidLeagueYear: 2026, source: 'signing', guarantee: cap.FULLY_GUARANTEED }] },
    ...over,
  };
}

/** A one-year minimum deal for filler players (creditedSeasons 0 minimum for 2026 from the rule set). */
export function minimum(id: number, personId: number): SheetContract {
  const min = cap.minimumSalary(PRO, 2026, 0);
  return { personId, player: { creditedSeasons: 0, undraftedRookie: false }, contract: { id, form: 'veteran', years: [cap.plainYear(2026, min)], offset: false, tranches: [] } };
}
