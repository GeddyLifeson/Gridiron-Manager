import { describe, expect, it } from 'vitest';
import { compliance as league } from '@gm/league';
import { COLLEGE_LOOKUP, NAMES, PRO_LOOKUP, loop, setup, testGamePort, testSchedule, trimmed } from '../fixtures.ts';
import * as turnover from '../../src/turnover/index.ts';
import * as compliance from '../../src/compliance/index.ts';
import * as money from '../../src/money/index.ts';

const content = trimmed();
const rule: turnover.RuleRead = (lvl, k) => (lvl === 'pro' ? PRO_LOOKUP : COLLEGE_LOOKUP)(k);
const binding: turnover.TurnoverBinding = { content, rule, policy: turnover.gmPolicy() };
const cb = compliance.complianceBindingFrom(binding, 'pro');
const RULES_YEAR = 2026;
const cap = money.capFromRules(rule, RULES_YEAR);

const world = () => loop.createWorld({ setup: setup({}), content, names: NAMES, eventTypes: turnover.TURNOVER_EVENT_TYPES });
const levelTeams = (w: loop.LiveWorld, lvl: turnover.Level) => w.teams.filter((t) => turnover.levelOfTeam(w, t.id) === lvl).map((t) => t.id);

describe('club cash budgets (C6.2.3)', () => {
  const w = world();
  const year = w.date.seasonYear;
  const capCents = PRO_LOOKUP(`cap.amount_${RULES_YEAR}`)! * money.CENTS_PER_DOLLAR;

  it('gives every pro club an owner budget between the low and high share of the cap by the owner spending weight', () => {
    for (const teamId of levelTeams(w, 'pro')) {
      const b = money.cashBudget(w, teamId, year, cap)!;
      const owner = money.ownerProfile(w, teamId)!;
      expect(b).toBeGreaterThanOrEqual(Math.floor(capCents * money.param('budget.capShareLow')));
      expect(b).toBeLessThanOrEqual(Math.ceil(capCents * money.param('budget.capShareHigh')));
      const lo = money.param('budget.capShareLow'), hi = money.param('budget.capShareHigh');
      expect(b).toBe(Math.round(capCents * (lo + (hi - lo) * owner.weights.spending)));
    }
  });

  it('draws the same owner, and so the same budget, every time and in every year (today\'s rules throughout)', () => {
    const teamId = levelTeams(w, 'pro')[0]!;
    expect(money.cashBudget(world(), teamId, year, cap)).toBe(money.cashBudget(w, teamId, year, cap));
    expect(money.cashBudget(w, teamId, year - 40, cap)).toBe(money.cashBudget(w, teamId, year, cap));
  });

  it('owners differ: not every club gets the same budget', () => {
    const budgets = new Set(levelTeams(w, 'pro').map((t) => money.cashBudget(w, t, year, cap)));
    expect(budgets.size).toBeGreaterThan(1);
  });

  it('has no budget for a college program (no cap key, no owner chair)', () => {
    for (const teamId of levelTeams(w, 'college')) expect(money.cashBudget(w, teamId, year, cap)).toBeNull();
  });

  it('takes payments off the cash left in their league year only, and folds them into the world hash', () => {
    const v = world();
    const teamId = levelTeams(v, 'pro')[0]!;
    const before = loop.worldHash(v);
    const budget = money.cashBudget(v, teamId, year, cap)!;
    money.chargeClub(v, { teamId, seasonYear: year, cents: 5_000_00, reason: 'test' });
    expect(money.cashCommitted(v, teamId, year)).toBe(5_000_00);
    expect(money.cashLeft(v, teamId, year, cap)).toBe(budget - 5_000_00);
    expect(money.cashLeft(v, teamId, year + 1, cap)).toBe(budget);
    expect(loop.worldHash(v)).not.toBe(before);
  });
});

describe('fines are paid (MO-01)', () => {
  it('pays a club fine from the owner cash and a person fine from his own pocket, once, and keeps a null amount unpaid', () => {
    const w = world();
    const teamId = levelTeams(w, 'pro')[0]!;
    const gmId = compliance.generalManagerOf(w, teamId)!;
    const year = w.date.seasonYear;
    const budget = money.cashBudget(w, teamId, year, cap)!;
    compliance.setCompliance(w, {
      ...league.emptyCompliance(), orders: [
        { caseId: 1, order: { kind: 'fine', party: { kind: 'person', id: gmId }, cents: 150000000, tier: null, mayBeRepaidByClub: false } },
        { caseId: 1, order: { kind: 'fine', party: { kind: 'team', id: teamId }, cents: 400000000, tier: null, mayBeRepaidByClub: true } },
        { caseId: 2, order: { kind: 'fine', party: { kind: 'team', id: teamId }, cents: null, tier: 'fine_tier_2', mayBeRepaidByClub: true } },
      ],
    });
    const sys = loop.systemsFrom({ games: loop.gamesStep(testSchedule, testGamePort()), compliance: compliance.complianceStep(cb) }, 'test: not bound');
    for (let i = 0; i < 3; i++) loop.runWeek(w, sys);
    expect(money.cashCommitted(w, teamId, year)).toBe(400000000);
    expect(money.cashLeft(w, teamId, year, cap)).toBe(budget - 400000000);
    expect(money.personalPaid(w, gmId)).toBe(150000000);
    expect(money.personalPaid(w, gmId, year)).toBe(150000000);
    expect(money.clubMoneyOf(w).payments.map((p) => p.reason)).toEqual(['fine:case:1']);
  });
});

describe('generated cap after the rules year (C6.2.1 rule 5, CBA Art. 12 s.6(c))', () => {
  const w = world();
  const pro = levelTeams(w, 'pro')[0]!;
  const rulesCap = PRO_LOOKUP(`cap.amount_${RULES_YEAR}`)! * money.CENTS_PER_DOLLAR;
  const read = (k: string) => PRO_LOOKUP(k);

  it('keeps the rules cap at and before the rules year (MO-02), and has a cap for every year after it', () => {
    expect(cap(w, pro, 1950)).toBe(rulesCap);
    expect(cap(w, pro, RULES_YEAR)).toBe(rulesCap);
    for (let y = RULES_YEAR + 1; y <= RULES_YEAR + 40; y++) {
      const c = cap(w, pro, y)!;
      expect(Number.isInteger(c / money.CENTS_PER_DOLLAR)).toBe(true);
      expect(c).toBe(money.generatedCapCents(w, read, RULES_YEAR, rulesCap, y));
    }
    expect(cap(w, levelTeams(w, 'college')[0]!, 2030)).toBeUndefined();
  });

  it('moves the cap with projected revenue: each year is last year times one plus that year\'s growth draw', () => {
    for (let y = RULES_YEAR + 1; y <= RULES_YEAR + 10; y++) {
      const p = money.capProjection(w, read, RULES_YEAR, rulesCap, y);
      expect(p.revenueIndex).toBeCloseTo(money.revenueIndex(w, RULES_YEAR, y - 1) * (1 + money.revenueGrowth(w, y)), 12);
      expect(Math.abs(p.capCents - rulesCap * p.revenueIndex)).toBeLessThanOrEqual(money.CENTS_PER_DOLLAR / 2);
      expect(p.trueUpCents).toBe(0);
    }
  });

  it('draws growth near the bible\'s 7% mean with a 3-point spread, the same for every reader, different by seed', () => {
    const g = Array.from({ length: 200 }, (_, i) => money.revenueGrowth(w, RULES_YEAR + 1 + i));
    const mean = g.reduce((a, x) => a + x, 0) / g.length;
    const sd = Math.sqrt(g.reduce((a, x) => a + (x - mean) ** 2, 0) / (g.length - 1));
    expect(Math.abs(mean - money.param('revenue.growthMean'))).toBeLessThan(0.01);
    expect(Math.abs(sd - money.param('revenue.growthSd'))).toBeLessThan(0.01);
    expect(money.revenueGrowth(w, 2031)).toBe(money.revenueGrowth(world(), 2031));
    const other = loop.createWorld({ setup: setup({ seedHex: 'ab'.repeat(8) }), content, names: NAMES, eventTypes: turnover.TURNOVER_EVENT_TYPES });
    expect(money.revenueGrowth(other, 2031)).not.toBe(money.revenueGrowth(w, 2031));
  });

  it('reads the Player Cost Amount share from the Art. 12 keys: equal buckets fall under the floor, so 48% of AR', () => {
    expect(money.playerCostShare(read)).toBe(PRO_LOOKUP('cap.player_cost_floor_pct_ar')! / 100);
    expect(money.playerCostShare(() => undefined)).toBeUndefined();
    // A mix all in League Media (55%) sits over the ceiling and is held at 48.5%.
    const high = (k: string) => (k === 'cap.player_cost_ventures_pct' || k === 'cap.player_cost_local_pct' ? 55 : read(k));
    expect(money.playerCostShare(high)).toBe(PRO_LOOKUP('cap.player_cost_ceiling_pct_ar')! / 100);
  });
});
