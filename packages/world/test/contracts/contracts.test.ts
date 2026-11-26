import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cap as capRules } from '@gm/league';
import { ContractRecord } from '@gm/schema';
import { COLLEGE_LOOKUP, NAMES, PRO_LOOKUP, loop, setup, testGamePort, testSchedule, trimmed } from '../fixtures.ts';
import * as turnover from '../../src/turnover/index.ts';
import * as money from '../../src/money/index.ts';
import * as contracts from '../../src/contracts/index.ts';

const RULES_YEAR = 2026;
const content = trimmed();
const rule: turnover.RuleRead = (lvl, k) => (lvl === 'pro' ? PRO_LOOKUP : COLLEGE_LOOKUP)(k);
const keysOf = (rel: string): string[] =>
  (JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')).values as { key: string }[]).map((v) => v.key);
const KEYS = { pro: keysOf('../../../rules-data/data/league/proleague_2026.json'), college: keysOf('../../../rules-data/data/league/collegeleague_2026.json') };
const binding: contracts.ContractsBinding = { rule, keys: (lvl) => (lvl === 'pro' ? KEYS.pro : KEYS.college), rulesYear: RULES_YEAR };
const tb: turnover.TurnoverBinding = { content, rule, policy: turnover.gmPolicy() };
const cap = money.capFromRules(rule, RULES_YEAR);
const capCents = PRO_LOOKUP(`cap.amount_${RULES_YEAR}`)! * money.CENTS_PER_DOLLAR;
const proRules = contracts.ruleSetFor(binding, 'pro');

function build(seedHex?: string) {
  const w = loop.createWorld({ setup: setup(seedHex ? { seedHex } : {}), content, names: NAMES, eventTypes: turnover.TURNOVER_EVENT_TYPES });
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

const proTeams = (w: loop.LiveWorld) => w.teams.filter((t) => turnover.levelOfTeam(w, t.id) === 'pro').map((t) => t.id);
const minFor = (w: loop.LiveWorld, id: number, k: number) =>
  capRules.minimumSalary(proRules, RULES_YEAR, w.people.get(id)!.playing!.eligibility.pro.creditedSeasons + k);

describe('floor periods (C6.2.3 rule 2, CBA Art. 12 s.9)', () => {
  it('reads the CBA periods as written', () => {
    expect(contracts.floorPeriodOf(2021)).toEqual({ from: 2021, to: 2023 });
    expect(contracts.floorPeriodOf(2026)).toEqual({ from: 2024, to: 2026 });
    expect(contracts.floorPeriodOf(2030)).toEqual({ from: 2027, to: 2030 });
  });

  it('keeps four-year periods past 2030 and before 2021; the backward period lands on the CBA\'s own 2017 to 2020 period (Art. 12 s.9(a))', () => {
    expect(contracts.floorPeriodOf(2031)).toEqual({ from: 2031, to: 2034 });
    expect(contracts.floorPeriodOf(2042)).toEqual({ from: 2039, to: 2042 });
    expect(contracts.floorPeriodOf(2017)).toEqual({ from: 2017, to: 2020 });
    expect(contracts.floorPeriodOf(2020)).toEqual({ from: 2017, to: 2020 });
    expect(contracts.floorPeriodOf(1900)).toEqual({ from: 1897, to: 1900 });
  });
});

describe('founding contracts (C6.1.1, C6.4.1, C8.3.1)', () => {
  const { w, sys } = build();
  const year = w.date.seasonYear;
  loop.runWeek(w, sys);
  const st = contracts.contractsOf(w);

  it('gives every rostered player at a capped club one contract with that club, and none at a college', () => {
    const seen = new Set<number>();
    for (const [teamId, ids] of w.rosters) {
      const capped = cap(w, teamId, year) !== undefined;
      for (const id of ids) {
        const c = contracts.contractOf(w, id);
        if (!capped) { expect(c).toBeUndefined(); continue; }
        expect(c?.teamId).toBe(teamId);
      }
    }
    for (const c of st.active) { expect(seen.has(c.personId)).toBe(false); seen.add(c.personId); }
    expect(st.active.length).toBe(proTeams(w).reduce((s, t) => s + (w.rosters.get(t) ?? []).length, 0));
  });

  it('writes rows the world schema accepts (P3.2.4)', () => {
    for (const c of st.active) expect(() => ContractRecord.parse(c)).not.toThrow();
  });

  it('pays no year below the player\'s minimum for his credited seasons (C6.4.1)', () => {
    for (const c of st.active) c.terms.years.forEach((y, k) => expect(y.baseSalary.amountCents).toBeGreaterThanOrEqual(minFor(w, c.personId, k)));
  });

  it('spends each owner\'s budget, capped at the cap: the year\'s payroll is above the 90% floor and not above the cap', () => {
    const floorShare = PRO_LOOKUP('cap.min_cash_spend_pct')! / 100;
    for (const teamId of proTeams(w)) {
      const pay = contracts.playerCashPaid(w, teamId, year);
      const target = Math.min(money.cashBudget(w, teamId, year, cap)!, capCents);
      expect(pay).toBeLessThanOrEqual(capCents);
      expect(pay).toBeGreaterThanOrEqual(Math.floor(capCents * floorShare));
      expect(Math.abs(pay - target)).toBeLessThan((w.rosters.get(teamId) ?? []).length);
    }
  });

  it('charges each club its salaries once, as one player pay entry for the year (C6.2.3 rule 1)', () => {
    for (const teamId of proTeams(w)) {
      const entries = money.clubMoneyOf(w).payments.filter((p) => p.teamId === teamId && p.reason === contracts.PLAYER_PAY_REASON);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.cents).toBe(contracts.clubContracts(w, teamId).reduce((s, c) => s + contracts.salaryIn(c, year), 0));
    }
    loop.runWeek(w, sys);
    expect(money.clubMoneyOf(w).payments.filter((p) => p.reason === contracts.PLAYER_PAY_REASON)).toHaveLength(proTeams(w).length);
  });

  it('pays better-graded players more and spreads contract ends over the years', () => {
    const apys = st.active.map((c) => c.terms.years[0]!.baseSalary.amountCents);
    expect(Math.max(...apys)).toBeGreaterThan(Math.min(...apys) * 5);
    const ends = new Set(st.active.map((c) => contracts.lastYear(c)));
    expect(ends.size).toBeGreaterThan(2);
  });

  it('is the same every time for the same seed', () => {
    const again = build();
    loop.runWeek(again.w, again.sys);
    expect(JSON.stringify(contracts.contractsOf(again.w).active)).toBe(JSON.stringify(st.active));
  });
});

describe('contracts over offseasons (C6.4.2, C8, C6.2.3)', () => {
  const { w, sys } = build();
  const first = w.date.seasonYear;
  // Make one club underspend: drop its founding payroll entry, as if its owner had not paid.
  loop.runWeek(w, sys);
  const stingy = proTeams(w)[0]!;
  const m = money.clubMoneyOf(w);
  w.systemState.set(money.CLUB_MONEY_KEY, { payments: m.payments.filter((p) => !(p.teamId === stingy && p.reason === contracts.PLAYER_PAY_REASON)) });
  for (let i = 0; i < 4; i++) loop.runSeason(w, sys, testSchedule);
  const st = contracts.contractsOf(w);
  // The last league year with contract work: the loop has already turned to the next season at the season point.
  const year = Math.max(...st.paidYears);
  const drafted = new Map(w.log.rows().filter((e) => e.type === turnover.PLAYER_DRAFTED).map((e) => [e.subjects[0]!.id, e]));

  it('keeps one contract per rostered player at a capped club, with the club that rosters him', () => {
    const seen = new Set<number>();
    for (const c of st.active) {
      expect(seen.has(c.personId)).toBe(false);
      seen.add(c.personId);
      expect(w.rosters.get(c.teamId)).toContain(c.personId);
      expect(contracts.lastYear(c)).toBeGreaterThanOrEqual(year);
    }
    for (const teamId of proTeams(w)) for (const id of w.rosters.get(teamId) ?? []) expect(seen.has(id)).toBe(true);
  });

  it('signs drafted players to the rookie length at the minimum, first-rounders fully guaranteed (C6.4.2 rules 1 and 3)', () => {
    let rookies = 0;
    for (const c of st.active) {
      const e = drafted.get(c.personId);
      if (!e || c.terms.form !== 'rookie') continue;
      rookies++;
      const round = e.payload.round as number;
      expect(c.terms.years).toHaveLength(capRules.rookieLength(round, proRules));
      for (const y of c.terms.years) expect(y.baseSalary.guarantee.skill).toBe(round === 1);
      // The 25 percent rule (rule 2): no year rises by more than a quarter of year one.
      const one = c.terms.years[0]!.baseSalary.amountCents;
      c.terms.years.forEach((y, k) => { if (k > 0) expect(y.baseSalary.amountCents - c.terms.years[k - 1]!.baseSalary.amountCents).toBeLessThanOrEqual(one * proRules.num('rookie.max_annual_increase_pct') / 100); });
    }
    expect(rookies).toBeGreaterThan(0);
  });

  it('signs undrafted rookies for the undrafted length', () => {
    const und = new Set(w.log.rows().filter((e) => e.type === turnover.PLAYER_SIGNED && e.payload.kind === 'undrafted').map((e) => e.subjects[0]!.id));
    const rows = st.active.filter((c) => und.has(c.personId) && c.terms.form === 'rookie');
    expect(rows.length).toBeGreaterThan(0);
    for (const c of rows) expect(c.terms.years).toHaveLength(capRules.rookieLength(null, proRules));
  });

  it('pays every club every year once, and keeps each year under the cap', () => {
    for (let y = first; y <= year; y++) {
      for (const teamId of proTeams(w)) {
        const pay = contracts.playerCashPaid(w, teamId, y);
        if (teamId === stingy && y === first) { expect(pay).toBe(0); continue; }
        expect(pay).toBeGreaterThan(0);
        expect(pay).toBeLessThanOrEqual(capCents);
      }
    }
  });

  it('checks each floor period that closed, once, and pays a shortfall to the period\'s players, logged', () => {
    const closed = new Set<string>();
    for (let y = first; y < year; y++) { const p = contracts.floorPeriodOf(y); if (p.to < year) closed.add(`${p.from}-${p.to}`); }
    expect([...st.checkedPeriods].sort()).toEqual([...closed].sort());
    expect(closed.size).toBeGreaterThan(0);
    const firstPeriod = contracts.floorPeriodOf(first);
    const check = st.floorChecks.find((c) => c.teamId === stingy && c.from === firstPeriod.from)!;
    expect(check.shortfallCents).toBeGreaterThan(0);
    expect(check.shortfallCents).toBe(Math.max(0, check.requiredCents - check.spentCents));
    expect(check.recipients.reduce((s, r) => s + r.cents, 0)).toBe(check.shortfallCents);
    const paid = money.clubMoneyOf(w).payments.filter((p) => p.teamId === stingy && p.reason === `${contracts.FLOOR_SHORTFALL_REASON}:${check.from}-${check.to}`);
    expect(paid).toHaveLength(1);
    expect(paid[0]!.cents).toBe(check.shortfallCents);
    expect(paid[0]!.seasonYear).toBe(check.to + 1);
    // Clubs that paid their owner's budget meet the floor.
    for (const c of st.floorChecks.filter((x) => x.teamId !== stingy)) expect(c.shortfallCents).toBe(0);
  });
});
