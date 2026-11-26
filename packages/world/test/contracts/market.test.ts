import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cap as capRules, market } from '@gm/league';
import { FactFile } from '@gm/schema';
import { COLLEGE_LOOKUP, NAMES, PRO_LOOKUP, loop, setup, testGamePort, testSchedule, trimmed } from '../fixtures.ts';
import * as turnover from '../../src/turnover/index.ts';
import * as contracts from '../../src/contracts/index.ts';
import scaleFile from '../../src/contracts/pay-scale.json' with { type: 'json' };

const RULES_YEAR = 2026;
const content = trimmed();
const rule: turnover.RuleRead = (lvl, k) => (lvl === 'pro' ? PRO_LOOKUP : COLLEGE_LOOKUP)(k);
const read = (rel: string) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'));
const keysOf = (rel: string): string[] => (read(rel).values as { key: string }[]).map((v) => v.key);
const KEYS = { pro: keysOf('../../../rules-data/data/league/proleague_2026.json'), college: keysOf('../../../rules-data/data/league/collegeleague_2026.json') };
const binding: contracts.ContractsBinding = { rule, keys: (lvl) => (lvl === 'pro' ? KEYS.pro : KEYS.college), rulesYear: RULES_YEAR };
const capCents = PRO_LOOKUP(`cap.amount_${RULES_YEAR}`)! * 100;
const proRules = contracts.ruleSetFor(binding, 'pro');

function build(policy: turnover.RosterPolicy) {
  const tb: turnover.TurnoverBinding = { content, rule, policy };
  const w = loop.createWorld({ setup: setup({}), content, names: NAMES, eventTypes: turnover.TURNOVER_EVENT_TYPES });
  const pro = w.teams.filter((t) => turnover.levelOfTeam(w, t.id) === 'pro').length;
  const col = w.teams.length - pro;
  const sys = loop.systemsFrom({
    games: loop.gamesStep(testSchedule, testGamePort()), leaving: loop.leavingStep(),
    cohorts: loop.cohortStep({
      scale: () => ({ topCollegeTeams: col, draftedCount: pro * (PRO_LOOKUP(turnover.RULE_KEY.draftRounds) ?? 0), openEntryChairs: 0, retiredWouldBeCoaches: 0 }),
      names: NAMES, positionMix: content.levels.pro.rosterMix, homeRegion: () => 'region', kinds: ['recruit_class', 'college_walk_on', 'pro_entry_pool'],
    }),
    development: turnover.developmentStep(tb), moves: contracts.contractsStep(binding, turnover.rosterMovesStep(tb)),
  }, 'test: not bound');
  return { w, sys };
}

describe('sourced pay scale (C8.3.1 rule 1, OverTheCap via nflverse)', () => {
  const facts = new Map(FactFile.parse(read('../../../../facts/market-pay.json')).rows.map((r) => [r.id, r]));

  it('covers every pro roster-mix position, highest share first, each citing its fact row', () => {
    for (const pos of Object.keys(content.levels.pro.rosterMix)) {
      const s = contracts.sourcedScale(pos);
      expect(s.from).toEqual(scaleFile.positions[pos as keyof typeof scaleFile.positions].from);
      expect(s.shares).toHaveLength(scaleFile.points);
      for (let i = 1; i < s.shares.length; i++) expect(s.shares[i]!).toBeLessThanOrEqual(s.shares[i - 1]!);
      const row = facts.get(contracts.PAY_SCALE_FACTS[pos]!)!;
      expect(row.status).toBe('1 of 3');
      // The fact's value is the mean of the five best-paid contracts: no more than the top, above the median.
      expect(row.value as number).toBeLessThanOrEqual(s.shares[0]!);
      expect(row.value as number).toBeGreaterThan(s.shares[(scaleFile.points - 1) / 2]!);
    }
  });

  it('pays the quarterback most at the top and long snappers least (the real market\'s order)', () => {
    const top = (p: string) => contracts.sourcedScale(p).shares[0]!;
    for (const p of Object.keys(scaleFile.positions)) if (p !== 'QB') expect(top('QB')).toBeGreaterThan(top(p));
    for (const p of Object.keys(scaleFile.positions)) if (p !== 'LS') expect(top('LS')).toBeLessThan(top(p));
  });

  it('pools every position for a position the file does not name', () => {
    expect(contracts.sourcedScale('XX').shares.length).toBe(Object.keys(scaleFile.positions).length * scaleFile.points);
  });
});

describe('market price (C8.3.1 rules 2 to 4)', () => {
  const base: contracts.PriceInput = { position: 'WR', percentile: 0.9, suitors: 3, age: 24, primeEndAge: 27, capCents, minimumCents: 100_000_000, time: 1 };

  it('rises with the public percentile, the suitors and the time factor, and never falls below the minimum', () => {
    const at = (x: Partial<contracts.PriceInput>) => contracts.marketPrice({ ...base, ...x }).apyCents.mid;
    expect(at({ percentile: 0.99 })).toBeGreaterThan(at({ percentile: 0.9 }));
    expect(at({ suitors: 5 })).toBeGreaterThan(at({ suitors: 1 }));
    expect(at({ time: 0.9 })).toBeLessThan(at({ time: 1 }));
    expect(at({ percentile: 0 })).toBe(base.minimumCents);
    // Rule 1 and 2 together: the scale share times the cap times the demand factor.
    expect(at({})).toBe(Math.round(market.shareAt(contracts.sourcedScale('WR'), 0.9) * capCents * market.demandFactor(3)));
  });

  it('reads the public percentile at a position, ties sharing their middle rank', () => {
    const grades = new Map([[1, 50], [2, 60], [3, 60], [4, 70]]);
    const world = { people: new Map([...grades.keys()].map((id) => [id, { playing: { position: 'QB' } }])) } as unknown as loop.LiveWorld;
    const g = { publicGrade: (id: number) => grades.get(id)! } as unknown as turnover.GradeContext;
    const p = contracts.publicPercentiles(world, g, [1, 2, 3, 4]);
    expect(p.get(1)).toBe(0);
    expect(p.get(4)).toBe(1);
    expect(p.get(2)).toBe(0.5);
    expect(p.get(3)).toBe(0.5);
  });
});

describe('free agents and front offices in the world (C8.3.1, K7.2.2 rule 5, TO-07)', () => {
  const priced = build(turnover.gmPolicy({ contracts: binding }));
  loop.runWeek(priced.w, priced.sys);
  const founding = contracts.contractsOf(priced.w).active.map((c) => ({ ...c }));
  for (let i = 0; i < 3; i++) loop.runSeason(priced.w, priced.sys, testSchedule);
  const st = contracts.contractsOf(priced.w);

  it('prices founding contracts on the real scale: no one above the top of his position, payroll within the cap', () => {
    for (const c of founding) {
      const pos = priced.w.people.get(c.personId)!.playing!.position;
      expect(contracts.salaryIn(c, c.terms.years[0]!.leagueYear)).toBeLessThanOrEqual(Math.round(contracts.sourcedScale(pos).shares[0]! * capCents) + 1);
    }
    const top = Math.max(...founding.map((c) => contracts.salaryIn(c, c.terms.years[0]!.leagueYear)));
    // The best-paid founding contract is a real top-of-market share (the scale's top is 24.5% at QB).
    expect(top / capCents).toBeGreaterThan(0.1);
  });

  it('records last market\'s free agent signings, each on a contract at or above his minimum and within the cap', () => {
    const m = st.lastMarket!;
    expect(m.seasonYear).toBe(Math.max(...st.paidYears));
    expect(m.signings.length).toBeGreaterThan(0);
    const signedEvents = new Set(priced.w.log.rows().filter((e) => e.type === turnover.PLAYER_SIGNED && e.payload.kind === 'free_agent').map((e) => e.subjects[0]!.id));
    for (const s of m.signings) {
      expect(signedEvents.has(s.personId)).toBe(true);
      const c = st.active.find((x) => x.personId === s.personId);
      if (!c) continue;
      expect(c.teamId).toBe(s.teamId);
      expect(contracts.salaryIn(c, m.seasonYear)).toBe(s.apyCents);
      // His credited seasons have grown since he signed, so the check is the lowest band's minimum.
      expect(s.apyCents).toBeGreaterThanOrEqual(capRules.minimumSalary(proRules, RULES_YEAR, 0));
      expect(s.apyCents).toBeLessThanOrEqual(capCents);
    }
  });

  it('signs veterans for real lengths: about four in five veteran deals are one year (PC-14, F-aging-0023)', () => {
    const year = st.lastMarket!.seasonYear;
    const lens = st.active.filter((c) => c.terms.kind === 'player' && c.terms.form !== 'rookie' && c.terms.years[0]!.leagueYear === year)
      .map((c) => (c.terms.kind === 'player' ? c.terms.years.length : 0));
    const one = lens.filter((n) => n === 1).length / lens.length;
    console.log(`veteran deals signed ${year}: ${lens.length}, one year ${(100 * one).toFixed(1)} percent, mean ${(lens.reduce((a, b) => a + b, 0) / lens.length).toFixed(2)} years`);
    expect(lens.some((n) => n > 1)).toBe(true);
    expect(one).toBeGreaterThan(0.6);
    expect(one).toBeLessThan(0.95);
  });

  it('counts at least one suitor for any free agent who signs', () => {
    const fa = priced.w.log.rows().filter((e) => e.type === turnover.PLAYER_SIGNED && e.payload.kind === 'free_agent').at(-1);
    if (!fa) return;
    expect(contracts.suitorsAt(priced.w, binding, turnover.gradeContext(priced.w, turnover.rosteredSet(priced.w)), fa.subjects[0]!.id, fa.payload.team as number)).toBeGreaterThanOrEqual(1);
  });

  it('changes front office choices once costs and the going rate enter them', () => {
    const blind = build(turnover.gmPolicy());
    loop.runWeek(blind.w, blind.sys);
    for (let i = 0; i < 3; i++) loop.runSeason(blind.w, blind.sys, testSchedule);
    const signed = (w: loop.LiveWorld) => w.log.rows().filter((e) => e.type === turnover.PLAYER_SIGNED && e.payload.kind === 'free_agent').map((e) => `${e.subjects[0]!.id}:${e.payload.team}`).join(',');
    expect(signed(priced.w)).not.toBe(signed(blind.w));
  });
});
