// Free agency fixtures. Rule values are the real league rules file on main (packages/rules-data/data/league/
// proleague_2026.json, G-10 fact rows), read from disk; the calendar is G-12's. Players, agents and offers
// are made up for the test.
import { readFileSync } from 'node:fs';
import type { RuleSet } from '@gm/schema';
import { calendar, market } from '@gm/league';
import type { gm } from '@gm/front-office';
import type { scouting } from '@gm/people';
import type { FreeAgencyInput, FreeAgentInput } from '../../../src/read-models/free-agency/index.ts';

type V = number | boolean | string;
const FILE = JSON.parse(readFileSync(new URL('../../../../rules-data/data/league/proleague_2026.json', import.meta.url), 'utf8')) as { values: { key: string; value: V }[] };

export function ruleSet(over: Record<string, V> = {}): RuleSet {
  const m = new Map<string, V>(FILE.values.map((v) => [v.key, v.value]));
  for (const [k, v] of Object.entries(over)) m.set(k, v);
  const get = (k: string) => { if (!m.has(k)) throw new Error(`missing ${k}`); return m.get(k)!; };
  return { id: 'proleague_2026', level: 'pro', seasonYear: 2026, num: (k) => get(k) as number, bool: (k) => get(k) as boolean, opt: (k) => get(k) as string, keys: () => [...m.keys()].sort() };
}

export const RS = ruleSet();
export const MR = market.marketRules(RS, 2026);
const RESOLVER = new calendar.CalendarResolver(calendar.calendarSet('pro', calendar.CALENDAR_FILES), calendar.calendarLookup(calendar.lookupFromValues(FILE.values)));
export const DATES = market.marketDates(RESOLVER, 2026, MR);

export const CLUB = 7;
export const NAMES: Record<string, string> = { 3: 'Carver', 7: 'Glenwood' };
const $ = (usd: number) => Math.round(usd * 100);
export const dayShift = (i: market.Instant, days: number, minute = 12 * 60): market.Instant => ({ day: i.day + days, minute });
export const BEFORE = dayShift(DATES.negotiatingOpen, -10);
export const WINDOW = dayShift(DATES.negotiatingOpen, 0);
export const OPEN = dayShift(DATES.leagueYearStart, 1);

export const ask = (mid: number): market.ExpectedContract => ({
  years: 3, apyCents: { low: $(mid * 0.8), mid: $(mid), high: $(mid * 1.2) }, guaranteeCents: { low: $(mid), mid: $(mid * 1.5), high: $(mid * 2) }, guaranteeShare: 0.5,
});

const graded: scouting.GradeCell = {
  state: 'graded', attribute: 'role', text: '6.4 (good look), pro scout, graded 30 looks', value: 6.4, label: '6.4', confidence: 'good look' as never, bandText: '6.1 to 6.7',
  low: '6.1', high: '6.7', cutLow: false, cutHigh: false, n: 30, grader: 'pro scout', watched: [{ count: 30, what: 'looks' }], source: { kind: 'evidence', units: 30, evaluators: 1 },
  as_of: { seasonYear: 2026, dayIndex: 10 } as never, legend: null, relative: null,
} as scouting.GradeCell;

export function fa(personId: number, over: Partial<FreeAgentInput> = {}, exp: Partial<market.ExpiringPlayer> = {}): FreeAgentInput {
  return {
    personId, name: `Player ${personId}`, position: 'CB', age: 27,
    expiring: { personId, priorClubId: 3, accruedSeasons: 5, creditedSeasons: 5, draftRound: 2, priorParagraph5Cents: $(2_000_000), priorYearSalaryCents: $(2_500_000), expiringIsRookieContract: false, ...exp },
    tender: null, signed: false, grade: graded, ask: ask(10_000_000), publicSuitors: 3, saysHeWants: 'role', agent: { name: 'R. Vance', stance: 'neutral' }, ...over,
  };
}

export function power(holder: gm.Holder, delegated: readonly gm.PowerField[] = []): gm.Power {
  return { holders: { final_say_roster: holder, final_say_draft: holder, final_say_contracts: holder }, userIsHeadCoach: true, delegated: new Set(delegated) };
}

export function input(over: Partial<FreeAgencyInput> = {}): FreeAgencyInput {
  return {
    clubId: CLUB, now: OPEN, dates: DATES, mr: MR, capRules: RS, power: power('head_coach'), clubNames: NAMES,
    capRoomCents: $(30_000_000), rosterCount: 70, rosterLimit: 90, windowCallsUsed: 0,
    players: [
      fa(501),
      fa(502, { grade: { state: 'unwatched', attribute: 'role', text: 'not watched', source: { kind: 'public' } } as scouting.GradeCell, agent: { name: 'K. Rhee', stance: 'hostile' }, saysHeWants: null }),
      fa(503, { position: 'WR' }, { accruedSeasons: 3 }),
      fa(601, { name: 'Own Player', position: 'LB' }, { priorClubId: CLUB, accruedSeasons: 3 }),
      fa(602, { name: 'Own Veteran', position: 'S' }, { priorClubId: CLUB, accruedSeasons: 6 }),
      fa(504, { signed: true }),
    ],
    offers: [],
    tags: { day: DATES.leagueYearStart.day - 20, leagueYearStartDay: DATES.leagueYearStart.day, tagsUsed: 0 },
    ...over,
  };
}
export { $ };
