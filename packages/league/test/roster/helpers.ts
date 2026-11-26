import type { RuleSet } from '@gm/schema';
import { applyEvent, applyTransaction, emptyLeagueRosters, rosterRules, type LeagueRosters, type PlayerFacts, type RosterEvent, type RosterRules, type Transaction, type TxResult } from '../../src/roster/index.ts';
import pro from './fixtures/pro.json' with { type: 'json' };
import college from './fixtures/college.json' with { type: 'json' };

type FixtureValues = Record<string, [number | boolean | string, string]>;

export function fixtureRuleSet(file: { id: string; values: FixtureValues }, override: Record<string, number | boolean | string> = {}): RuleSet {
  const v = new Map<string, number | boolean | string>(Object.entries(file.values).map(([k, [val]]) => [k, val]));
  for (const [k, val] of Object.entries(override)) v.set(k, val);
  const get = (k: string) => { if (!v.has(k)) throw new Error(`missing ${k}`); return v.get(k)!; };
  return {
    id: file.id, level: 'pro', seasonYear: 2026,
    num: (k) => get(k) as number, bool: (k) => get(k) as boolean, opt: (k) => get(k) as string,
    keys: () => [...v.keys()].sort(),
  };
}

export const PRO_RS = fixtureRuleSet(pro as never);
export const COLLEGE_RS = fixtureRuleSet(college as never);
export const PRO = rosterRules(PRO_RS);
export const COLLEGE = rosterRules(COLLEGE_RS);
export { pro as proFixture, college as collegeFixture };

export function facts(personId: number, over: Partial<PlayerFacts> = {}): PlayerFacts {
  return {
    personId, accruedSeasons: 0, pensionCreditedSeasons: 0, activeGamesInLastAccruedSeason: 0, offensiveLineman: false,
    quarterback: false, practicedThisPreseason: true, internationalPathway: false, injured: false, nonFootballInjury: false,
    medicallyCleared: true, countExempt: false, ...over,
  };
}

export function ok(r: TxResult): LeagueRosters {
  if (!r.ok) throw new Error(`refused ${r.rule}: ${r.message}`);
  return r.state;
}
export const tx = (s: LeagueRosters, t: Transaction, rules: RosterRules = PRO) => applyTransaction(s, t, rules);
export const ev = (s: LeagueRosters, e: RosterEvent, rules: RosterRules = PRO) => applyEvent(s, e, rules);

/**
 * A league with `clubs` clubs (ids 1..n), each signed to `perClub` players in the offseason, plus `spare`
 * free agents. Player ids: club c holds c*1000+1 .. c*1000+perClub; free agents 900001...
 */
export function league(opts: { clubs?: number; perClub?: number; spare?: number; rules?: RosterRules; factOver?: (id: number) => Partial<PlayerFacts> } = {}): LeagueRosters {
  const clubs = opts.clubs ?? 2, perClub = opts.perClub ?? 53, spare = opts.spare ?? 20, rules = opts.rules ?? PRO;
  const ids = Array.from({ length: clubs }, (_, i) => i + 1);
  let s = emptyLeagueRosters(2026, ids, { dayIndex: 200, hour: 10 });
  const all: PlayerFacts[] = [];
  for (const c of ids) for (let i = 1; i <= perClub; i++) all.push(facts(c * 1000 + i, opts.factOver?.(c * 1000 + i)));
  for (let i = 1; i <= spare; i++) all.push(facts(900000 + i, opts.factOver?.(900000 + i)));
  s = ok(applyEvent(s, { type: 'set_player_facts', facts: all }, rules));
  for (const c of ids) for (let i = 1; i <= perClub; i++) s = ok(applyTransaction(s, { type: 'sign_free_agent', clubId: c, personId: c * 1000 + i }, rules));
  return s;
}

/** Moves a league of at most 53 per club past the roster deadline and the cutdown claims. */
export function inSeason(s: LeagueRosters, rules: RosterRules = PRO): LeagueRosters {
  s = ok(applyEvent(s, { type: 'roster_deadline', claimDeadline: { dayIndex: s.now.dayIndex + 1, hour: 13 } }, rules));
  return ok(applyEvent(s, { type: 'advance_time', to: { dayIndex: s.now.dayIndex + 2, hour: 10 } }, rules));
}

export function play(s: LeagueRosters, clubId: number, games = 1, rules: RosterRules = PRO): LeagueRosters {
  for (let i = 0; i < games; i++) s = ok(applyEvent(s, { type: 'game_played', clubId }, rules));
  return s;
}

export function setFacts(s: LeagueRosters, list: PlayerFacts[], rules: RosterRules = PRO): LeagueRosters {
  return ok(applyEvent(s, { type: 'set_player_facts', facts: list }, rules));
}
