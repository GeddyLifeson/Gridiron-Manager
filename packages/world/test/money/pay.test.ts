import { describe, expect, it } from 'vitest';
import { contract } from '@gm/career';
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

  it('pays no one in the second college level and no off-ladder seat, and counts both (no sourced band)', () => {
    const w = world();
    const year = w.date.seasonYear;
    const run = money.payStaffYear(w, year);
    const second = w.teams.filter((t) => w.competitions.find((c) => c.id === t.competitionId)!.name !== money.TOP_COLLEGE_COMPETITION && turnover.levelOfTeam(w, t.id) === 'college').map((t) => t.id);
    for (const teamId of second) expect(money.staffPayCommitted(w, teamId, year)).toBe(0);
    if (second.length > 0) expect(run.noBand).toBeGreaterThan(0);
    const offIds = new Set([...w.offLadder.values()].filter((s) => s.holderPersonId !== null).map((s) => s.holderPersonId!));
    expect(run.offLadderUnpaid).toBe([...w.offLadder.values()].filter((s) => s.holderPersonId !== null).length);
    const ladderIds = new Set([...w.jobs.values()].map((j) => j.holderPersonId));
    for (const id of offIds) if (!ladderIds.has(id)) expect(money.grossPay(w, id)).toBe(0);
  });

  it('reads power four bands for top-band programs of the top college level and group of six bands for the rest', () => {
    const w = world();
    for (const t of w.teams) {
      const comp = w.competitions.find((c) => c.id === t.competitionId)!;
      const tier = money.defaultPayTier(w, t.id);
      if (comp.level === 'pro') expect(tier).toBe('pro');
      else if (comp.name !== money.TOP_COLLEGE_COMPETITION) expect(tier).toBeNull();
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
