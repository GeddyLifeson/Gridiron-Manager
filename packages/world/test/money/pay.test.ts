import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contract } from '@gm/career';
import { FactFile, computeStatus } from '@gm/schema';
import { COLLEGE_LOOKUP, NAMES, PRO_LOOKUP, loop, setup, testGamePort, testSchedule, trimmed } from '../fixtures.ts';
import * as turnover from '../../src/turnover/index.ts';
import * as money from '../../src/money/index.ts';

const content = trimmed();
const rule: turnover.RuleRead = (lvl, k) => (lvl === 'pro' ? PRO_LOOKUP : COLLEGE_LOOKUP)(k);
const cap = money.capFromRules(rule, 2026);
const world = () => loop.createWorld({ setup: setup({}), content, names: NAMES, eventTypes: turnover.TURNOVER_EVENT_TYPES });
const levelTeams = (w: loop.LiveWorld, lvl: turnover.Level) => w.teams.filter((t) => turnover.levelOfTeam(w, t.id) === lvl).map((t) => t.id);

describe('world staff pay (E3.2.1, MO-05 to MO-09)', () => {
  it('pays every held, paid seat of a pro club its band median, charges the club the total, and keeps each person\'s gross pay', () => {
    const w = world();
    const year = w.date.seasonYear;
    const teamId = levelTeams(w, 'pro')[0]!;
    const run = money.payStaffYear(w, year);
    expect(run.already).toBe(false);
    expect(run.paid).toBeGreaterThan(0);
    const held = [...w.jobs.values()].filter((j) => j.teamId === teamId && j.holderPersonId !== null && j.holding !== 'acting' && j.paid !== 'none');
    expect(held.length).toBeGreaterThan(0);
    let expected = 0;
    const perPerson = new Map<number, number>();
    for (const j of held) perPerson.set(j.holderPersonId!, Math.max(perPerson.get(j.holderPersonId!) ?? 0, contract.payBand('pro', j.rung).medianCents));
    for (const s of w.offLadder.values()) if (s.teamId === teamId && s.holderPersonId !== null) {
      const c = money.offLadderPay(w, s);
      if (c !== null) perPerson.set(s.holderPersonId, Math.max(perPerson.get(s.holderPersonId) ?? 0, c));
    }
    for (const c of perPerson.values()) expected += c;
    expect(money.staffPayCommitted(w, teamId, year)).toBe(expected);
    expect(money.cashCommitted(w, teamId, year)).toBe(expected);
    const hc = held.find((j) => j.rung === 9)!;
    expect(money.grossPay(w, hc.holderPersonId!, year)).toBe(contract.payBand('pro', 9).medianCents);
    expect(money.cashLeft(w, teamId, year, cap)).toBe(money.cashBudget(w, teamId, year, cap)! - expected);
  });

  it('charges a league year once, however often it is asked', () => {
    const w = world();
    const year = w.date.seasonYear;
    const first = money.payStaffYear(w, year);
    const again = money.payStaffYear(w, year);
    expect(again.already).toBe(true);
    expect(money.personIncomeOf(w).income.length).toBe(first.paid);
    expect(money.clubMoneyOf(w).payments.filter((p) => p.reason === money.STAFF_PAY_REASON).length).toBe(new Set(money.personIncomeOf(w).income.map((r) => r.teamId)).size);
  });

  it('pays a general manager his world band median and leaves seats with no band unpaid and counted (MO-11)', () => {
    const w = world();
    const year = w.date.seasonYear;
    const run = money.payStaffYear(w, year);
    const held = [...w.offLadder.values()].filter((s) => s.holderPersonId !== null);
    const unpaid = held.filter((s) => money.offLadderPay(w, s) === null);
    expect(run.offLadderUnpaid).toBe(unpaid.length);
    for (const s of held.filter((x) => x.positionId === 'pos:general_manager')) {
      expect(money.offLadderPay(w, s)).toBe(money.WORLD_BANDS.offLadder['pos:general_manager']!.pro!.median * 100);
      expect(money.grossPay(w, s.holderPersonId!, year)).toBe(money.offLadderPay(w, s));
    }
    for (const s of held.filter((x) => x.positionId === 'pos:owner' || x.positionId === 'pos:president')) expect(money.offLadderPay(w, s)).toBeNull();
    const ladderIds = new Set([...w.jobs.values()].map((j) => j.holderPersonId));
    for (const s of unpaid) if (!ladderIds.has(s.holderPersonId)) expect(money.grossPay(w, s.holderPersonId!)).toBe(0);
  });

  it('reads the second college level from its own bands, nearest rung below, and pays no rung below every row', () => {
    const w = world();
    const second: money.PayTierRead = () => 'college_second';
    const job = [...w.jobs.values()].find((j) => j.holderPersonId !== null && j.paid !== 'none')!;
    const rows = money.WORLD_BANDS.ladder.college_second!;
    expect(money.seatPay(w, { ...job, rung: 9 }, second)).toBe(rows['9']!.median * 100);
    expect(money.seatPay(w, { ...job, rung: 8 }, second)).toBe(rows['7']!.median * 100);
    expect(money.seatPay(w, { ...job, rung: 6 }, second)).toBe(rows['5']!.median * 100);
    expect(money.seatPay(w, { ...job, rung: 3 }, second)).toBeNull();
    expect(money.seatPay(w, { ...job, rung: 9, paid: 'none' }, second)).toBe(0);
  });

  // The rows come from PR 278 (facts/exec-pay.json, facts/college-second-pay.json). Until those files are on
  // main the row check is skipped, as the cap citation test does.
  const FACT_FILES = ['facts/exec-pay.json', 'facts/college-second-pay.json'].map((f) => join(import.meta.dirname, '..', '..', '..', '..', f));
  it.skipIf(!FACT_FILES.every((f) => existsSync(f)))('cites a fact row for every world band, none of them a Conflict, each with its computed status (Q6)', () => {
    const facts = new Map(FACT_FILES.flatMap((f) => FactFile.parse(JSON.parse(readFileSync(f, 'utf8'))).rows).map((r) => [r.id, r]));
    for (const { path, band } of money.worldBandRows()) {
      expect(band.facts.length, path).toBeGreaterThan(0);
      expect(band.low, path).toBeLessThanOrEqual(band.median);
      expect(band.median, path).toBeLessThanOrEqual(band.high);
      for (const id of band.facts) {
        const row = facts.get(id);
        expect(row, `${path} -> ${id}`).toBeDefined();
        expect(row!.status, id).toBe(computeStatus(row!));
        expect(row!.status, `${path} -> ${id}`).not.toBe('Conflict');
      }
    }
  });

  it('reads power four bands for top-band programs of the top college level and group of six bands for the rest', () => {
    const w = world();
    for (const t of w.teams) {
      const comp = w.competitions.find((c) => c.id === t.competitionId)!;
      const tier = money.defaultPayTier(w, t.id);
      if (comp.level === 'pro') expect(tier).toBe('pro');
      else if (comp.name === money.SECOND_COLLEGE_COMPETITION) expect(tier).toBe('college_second');
      else expect(tier).toBe(t.resourceBand === 'top' ? 'power_four' : 'group_of_six');
    }
  });

  it('pays a person holding two seats on one staff once, for the better-paid seat, and an acting holder nothing for the seat he covers', () => {
    const w = world();
    const year = w.date.seasonYear;
    const teamId = levelTeams(w, 'pro')[0]!;
    const seats = [...w.jobs.values()].filter((j) => j.teamId === teamId && j.holderPersonId !== null).sort((a, b) => b.rung - a.rung);
    const top = seats[0]!, low = seats[seats.length - 1]!;
    // The low seat's holder also covers the top seat, acting; then the top holder takes a second, lower seat.
    const lowHolder = low.holderPersonId!;
    w.jobs.set(top.id, { ...top, holding: 'acting', holderPersonId: lowHolder });
    w.jobs.set(low.id, { ...low, holderPersonId: lowHolder });
    money.payStaffYear(w, year);
    expect(money.grossPay(w, lowHolder, year)).toBe(money.seatPay(w, low));
    expect(money.personIncomeOf(w).income.filter((r) => r.personId === lowHolder).length).toBe(1);
  });

  it('builds prior pay year by year for an E6.1.2 head_coach opening sheet', () => {
    const w = world();
    const year = w.date.seasonYear;
    money.payStaffYear(w, year);
    money.payStaffYear(w, year + 1);
    const r = money.personIncomeOf(w).income[0]!;
    const pay = money.priorPay(w, r.personId);
    expect(pay.length).toBe(2);
    expect(pay.reduce((a, b) => a + b, 0)).toBe(money.grossPay(w, r.personId));
  });

  it('runs payroll as part of a weekly step, once per league year, and folds it into the world hash', () => {
    const w = world();
    const year = w.date.seasonYear;
    const before = loop.worldHash(w);
    const sys = loop.systemsFrom({ games: loop.gamesStep(testSchedule, testGamePort()), compliance: money.payrollStep(() => ({ inner: 1 })) }, 'test: not bound');
    for (let i = 0; i < 3; i++) loop.runWeek(w, sys);
    expect(money.payrollOf(w).years).toEqual([year]);
    expect(money.personIncomeOf(w).income.length).toBeGreaterThan(0);
    expect(loop.worldHash(w)).not.toBe(before);
    const v = world();
    for (let i = 0; i < 3; i++) loop.runWeek(v, sys);
    expect(loop.worldHash(v)).toBe(loop.worldHash(w));
  });
});
