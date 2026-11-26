// A one-club league in season for the roster moves tests. Rule values are G-15's test fixtures (copied
// here with their fact ids, since a test may not reach into another package's files). Ids: 1-9
// offensive linemen, 10-12 quarterbacks, 13-53 the rest of the 53, 101-116 the practice squad.
import type { RuleSet } from '@gm/schema';
import { roster } from '@gm/league';
import pro from './pro-rules.json' with { type: 'json' };
import college from './college-rules.json' with { type: 'json' };
import type { DepthUnit } from '../../../src/read-models/roster-moves/index.ts';

type FixtureValues = Record<string, [number | boolean | string, string]>;

export function ruleSet(file: { id: string; values: FixtureValues }, extra: Record<string, number | boolean | string> = {}): RuleSet {
  const v = new Map<string, number | boolean | string>(Object.entries(file.values).map(([k, [val]]) => [k, val]));
  for (const [k, val] of Object.entries(extra)) v.set(k, val);
  const get = (k: string) => { if (!v.has(k)) throw new Error(`missing ${k}`); return v.get(k)!; };
  return { id: file.id, level: 'pro', seasonYear: 2026, num: (k) => get(k) as number, bool: (k) => get(k) as boolean, opt: (k) => get(k) as string, keys: () => [...v.keys()].sort() };
}

export const PRO = roster.rosterRules(ruleSet(pro as never));
export const COLLEGE = roster.rosterRules(ruleSet(college as never));
/** Rule-set `substitution.max_players` (F-rule-0021 in pro_2026.json). */
export const SIDE = 11;
export const CLUB = 1;
export const OL = [1, 2, 3, 4, 5, 6, 7, 8, 9];
export const QB = [10, 11, 12];
export const ROSTER = Array.from({ length: 53 }, (_, i) => i + 1);
export const PRACTICE_SQUAD = Array.from({ length: 16 }, (_, i) => 101 + i);

function ok(r: roster.TxResult): roster.LeagueRosters {
  if (!r.ok) throw new Error(`refused ${r.rule}: ${r.message}`);
  return r.state;
}

const facts = (personId: number): roster.PlayerFacts => ({
  personId, accruedSeasons: 0, pensionCreditedSeasons: 0, activeGamesInLastAccruedSeason: 0, offensiveLineman: OL.includes(personId),
  quarterback: QB.includes(personId) || personId === 101, practicedThisPreseason: true, internationalPathway: false, injured: false,
  nonFootballInjury: false, medicallyCleared: true, countExempt: false,
});

/** The league after the roster deadline and the cutdown claims, at `day` hour 10, practice squad signed. */
export function inSeason(rules: roster.RosterRules = PRO, day = 200): roster.LeagueRosters {
  let s = roster.emptyLeagueRosters(2026, [CLUB, 2], { dayIndex: day, hour: 10 });
  s = ok(roster.applyEvent(s, { type: 'set_player_facts', facts: [...ROSTER, ...PRACTICE_SQUAD].map(facts) }, rules));
  for (const id of ROSTER) s = ok(roster.applyTransaction(s, { type: 'sign_free_agent', clubId: CLUB, personId: id }, rules));
  s = ok(roster.applyEvent(s, { type: 'roster_deadline', claimDeadline: { dayIndex: day + 1, hour: 13 } }, rules));
  s = ok(roster.applyEvent(s, { type: 'advance_time', to: { dayIndex: day + 2, hour: 10 } }, rules));
  if (rules.practiceSquad) for (const id of PRACTICE_SQUAD) s = ok(roster.applyTransaction(s, { type: 'sign_practice_squad', clubId: CLUB, personId: id }, rules));
  return s;
}

/** A game five days after `now`, the previous one two days before it. */
export function weekOf(s: roster.LeagueRosters, daysToGame = 5): roster.WeekInput {
  return { kickoff: { dayIndex: s.now.dayIndex + daysToGame, hour: 13 }, previousGameDay: s.now.dayIndex - 2, tradeDeadlineWeek: false };
}

export function at(s: roster.LeagueRosters, to: roster.Instant, rules: roster.RosterRules = PRO): roster.LeagueRosters {
  return ok(roster.applyEvent(s, { type: 'advance_time', to }, rules));
}

const job = (ids: number[]) => ids;
/** Offense, defense and four special teams units. Backups 45-53 and defensive reserves fill the kicking units. */
export function depth(): DepthUnit[] {
  return [
    { unitId: 'off:base', roles: { qb: job([10, 11, 12]), lt: [1, 6], lg: [2, 7], c: [3, 8], rg: [4, 9], rt: [5, 6], rb: [13, 14], x: [15, 16], z: [17, 18], slot: [19, 20], y: [21, 22] } },
    { unitId: 'def:base', roles: { de1: [23, 24], de2: [25, 26], dt1: [27, 28], dt2: [29, 30], wlb: [31, 32], mlb: [33, 34], slb: [35, 36], cb1: [37, 38], cb2: [39, 40], fs: [41, 42], ss: [43, 44] } },
    { unitId: 'st:kickoff', roles: { k: [45], l1: [32], l2: [34], l3: [36], l4: [38], l5: [40], r1: [42], r2: [44], r3: [46], r4: [47], r5: [48, 51] } },
    { unitId: 'st:kickoff_return', roles: { kr: [20], fb1: [24], fb2: [26], m1: [32], m2: [34], m3: [36], w1: [38], w2: [40], w3: [42], w4: [44], up: [14] } },
    { unitId: 'st:punt', roles: { p: [49], ls: [50], pp: [36], lg: [7], rg: [8], lt: [9], rt: [6], lw: [22], rw: [16], g1: [46, 52], g2: [47, 53] } },
    { unitId: 'st:field_goal', roles: { k: [45], h: [49], ls: [50], lt: [1], lg: [2], c: [3], rg: [4], rt: [5], lw: [21], rw: [22], te: [6] } },
  ];
}

export const COACH_POWER = { arrangement: 'coach_final_say' as const };
export const GM_POWER = { arrangement: 'gm_final_say' as const };
