// League-side fixtures for the gm tests: a small rostered league and the compliance pipeline's inputs.
// A test may not reach into another package's files, so the roster rule values are a copy of G-15's test
// fixture (`pro-roster-rules.json`, with its fact ids) and the compliance values are copied from G-28's.
// None of these are game data, and none are triple-verified.
import type { RandomStream, RuleSet, WorldDate } from '@gm/schema';
import { compliance, roster } from '@gm/league';
import proRoster from './pro-roster-rules.json' with { type: 'json' };
import { rng } from './fixtures.ts';

type FixtureValues = Record<string, [number | boolean | string, string]>;

export function ruleSet(values: Record<string, number | boolean | string>, id = 'fixture'): RuleSet {
  const get = (k: string) => { if (!(k in values)) throw new Error(`no rule ${k}`); return values[k]!; };
  return { id, level: 'pro', seasonYear: 2026, num: (k) => get(k) as number, bool: (k) => get(k) as boolean, opt: (k) => get(k) as string, keys: () => Object.keys(values).sort() };
}

export const PRO = roster.rosterRules(ruleSet(Object.fromEntries(Object.entries((proRoster as unknown as { values: FixtureValues }).values).map(([k, [v]]) => [k, v])), 'fixture_pro_roster'));

export function facts(personId: number, over: Partial<roster.PlayerFacts> = {}): roster.PlayerFacts {
  return {
    personId, accruedSeasons: 0, pensionCreditedSeasons: 0, activeGamesInLastAccruedSeason: 0, offensiveLineman: false, quarterback: false,
    practicedThisPreseason: true, internationalPathway: false, injured: false, nonFootballInjury: false, medicallyCleared: true, countExempt: false, ...over,
  };
}

export function ok(r: roster.TxResult): roster.LeagueRosters {
  if (!r.ok) throw new Error(`refused ${r.rule}: ${r.message}`);
  return r.state;
}

/** Clubs 1..n in the offseason, club c holding players c*1000+1 .. c*1000+perClub. `linemen` of each club are offensive linemen. */
export function league(clubs: number, perClub: number, linemen: number): roster.LeagueRosters {
  const ids = Array.from({ length: clubs }, (_, i) => i + 1);
  let s = roster.emptyLeagueRosters(2026, ids, { dayIndex: 200, hour: 10 });
  const all = ids.flatMap((c) => Array.from({ length: perClub }, (_, i) => facts(c * 1000 + i + 1, { offensiveLineman: i < linemen })));
  s = ok(roster.applyEvent(s, { type: 'set_player_facts', facts: all }, PRO));
  for (const f of all) s = ok(roster.applyTransaction(s, { type: 'sign_free_agent', clubId: Math.floor(f.personId / 1000), personId: f.personId }, PRO));
  return s;
}

// ---------- compliance ----------

const K = compliance.K;
const COLLEGE_ONLY = ['recruiting_contact', 'transfer_tampering', 'pay_rules', 'countable_hours', 'eligibility_academic', 'roster_limit', 'failure_to_cooperate'];

export const PRO_COMPLIANCE = ruleSet({
  [K.detectWindowYears]: 5, [K.unionVisitsPerYear]: 8, [K.cooperationReducesTier]: true, [K.headCoachResponsible]: false,
  ...Object.fromEntries(COLLEGE_ONLY.map((x) => [K.classField(x, 'applies'), false])),
});
export const COLLEGE_COMPLIANCE = ruleSet({ [K.detectWindowYears]: 4, [K.cooperationReducesTier]: true, [K.headCoachResponsible]: true }, 'college_fixture');

export class MemorySink implements compliance.EventSink {
  readonly events: compliance.EventDraft[] = [];
  append(d: compliance.EventDraft): number { this.events.push(d); return this.events.length; }
}

export const D = (seasonYear: number, dayIndex: number): WorldDate => ({ seasonYear, dayIndex });
export const party = (personId: number, role: compliance.PartyRef['role'], teamId = 1, origin: compliance.PartyRef['origin'] = 'generated'): compliance.PartyRef => ({ personId, role, teamId, origin });

function streamOf(chance: (p: number) => boolean, uniform: () => number): RandomStream {
  return { name: 'fixture', draws: 0, nextU32: () => 0, uniform, normal: () => 0, pick: () => 0, int: (lo: number) => lo, chance } as RandomStream;
}
/** A stream whose `chance` answers by a script on the scope. */
export const scripted = (answer: (scope: readonly (string | number)[], p: number) => boolean): compliance.StreamFor => (scope) => streamOf((p) => answer(scope, p), () => 0);
/** A seeded stream per scope: the same scope always draws the same numbers. */
export const seeded = (seed: number): compliance.StreamFor => (scope) => {
  let h = seed >>> 0;
  for (const ch of scope.join('|')) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  const r = rng(h);
  return streamOf((p) => r.uniform() < p, r.uniform);
};

export function complianceContext(rules: RuleSet): compliance.ComplianceContext {
  return {
    rules, enforcement: seeded(1), grievance: () => false, complianceStrictness: () => 0, mediaLeakWeekly: () => 0, bodyStrictness: () => 1,
    headCoachOf: () => null, monitoring: () => 0, respond: () => 'fight',
  };
}
