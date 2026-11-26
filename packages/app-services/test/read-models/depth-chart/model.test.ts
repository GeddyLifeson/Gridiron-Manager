// Depth chart read model (M2.1 to M2.5): lineups, package inheritance, shares, special teams counts,
// the emergency card, battles and the depth map the played game reads.
import { describe, expect, it } from 'vitest';
import { depth } from '@gm/league';
import { applyDepthEdit, buildDepthChartView, simDepthFor, unitOrder } from '../../../src/read-models/depth-chart/index.ts';
import { chart, DEFS, input } from './fixture.ts';

describe('depth chart view (M2)', () => {
  it('orders units offense, defense, special teams, base before package', () => {
    expect(unitOrder(DEFS)).toEqual(['off:11', 'off:12', 'def:base', 'def:nickel', 'st:kickoff', 'st:punt']);
  });

  it('shows each job list with names and who is on the field', () => {
    const v = buildDepthChartView(input());
    const qb = v.units[0]!.jobs.find((j) => j.job === 'QB')!;
    expect(qb.list.map((e) => e.name)).toEqual(['QB 1', 'QB 2']);
    expect(qb.onField).toBe(1);
    expect(v.units[0]!.gaps).toEqual([]);
    expect(v.onField).toBe(11);
  });

  it('marks package jobs filled from the base unit as inherited (M2.2.1)', () => {
    const nickel = buildDepthChartView(input()).units.find((u) => u.unitId === 'def:nickel')!;
    expect(nickel.jobs.find((j) => j.job === 'NB')).toMatchObject({ inherited: false, mapsTo: 'SAM', onField: 74 });
    expect(nickel.jobs.find((j) => j.job === 'MIKE')).toMatchObject({ inherited: true, onField: 61 });
  });

  it('an injured starter drops out: the next man is on the field and the game map skips him', () => {
    const base = input();
    const people = base.people.map((p) => (p.personId === 1 ? { ...p, out: true } : p));
    const v = buildDepthChartView({ ...base, people });
    const qb = v.units[0]!.jobs.find((j) => j.job === 'QB')!;
    expect(qb.onField).toBe(2);
    expect(qb.list[0]).toMatchObject({ personId: 1, out: true });
    expect(v.simDepth.QB).toEqual([2]);
  });

  it('the game map matches the depth module for the base-first unit order', () => {
    const i = input({ actives: input().people.map((p) => p.personId).filter((id) => id !== 20) });
    const expected = depth.toSimDepth(i.chart, i.defs, unitOrder(i.defs), (id) => id !== 20);
    expect(simDepthFor(i)).toEqual(expected);
    expect(buildDepthChartView(i).simDepth.X).toEqual([23]);
  });

  it('reports chart problems from the depth module (empty column, emergency card)', () => {
    const c = chart();
    const v = buildDepthChartView(input({ chart: { ...c, units: { ...c.units, 'off:11': { ...c.units['off:11']!, RB: [] } }, emergency: {} } }));
    expect(v.problems.some((p) => p.unitId === 'off:11' && /RB: empty column/.test(p.message))).toBe(true);
    expect(v.problems.some((p) => p.unitId === 'emergency')).toBe(true);
  });

  it('counts special teams firsts and lists the emergency card', () => {
    const v = buildDepthChartView(input());
    expect(v.specialTeams.find((r) => r.personId === 63)!.firsts).toBe(2); // PP on punt, L1 on kickoff
    expect(v.emergency.find((e) => e.need === 'quarterback')).toEqual({ need: 'quarterback', personId: 3, name: 'QB 3' });
  });

  it('shows staff shares for each unit, starters first', () => {
    const off = buildDepthChartView(input()).units[0]!;
    expect(off.shares.length).toBeGreaterThan(0);
    expect(off.shares.every((s, i, a) => i === 0 || a[i - 1]!.share >= s.share)).toBe(true);
  });

  it('shows a battle card and its clock', () => {
    const battle: depth.Battle = { unitId: 'off:11', job: 'X', competitors: [20, 23], split: [0.5, 0.5], decideBy: 190, openedOn: 150 };
    const v = buildDepthChartView(input({ battles: [{ battle, evidence: [{ personId: 20, grade: 70, reps: 40, against: 'first' }] }] }));
    expect(v.battles[0]).toMatchObject({ unitId: 'off:11', job: 'X', late: true });
    expect(v.battles[0]!.competitors.map((c) => c.name)).toEqual(['WR 20', 'WR 23']);
  });
});

describe('depth chart edits', () => {
  const ctx = input();

  it('moves a player up a list', () => {
    const r = applyDepthEdit(chart(), { kind: 'move', unitId: 'off:11', job: 'RB', personId: 12, toIndex: 0 }, ctx);
    expect(r.ok && r.chart.units['off:11']!.RB).toEqual([12, 10, 11]);
  });

  it('adds and removes, and refuses a player not on the roster', () => {
    const add = applyDepthEdit(chart(), { kind: 'add', unitId: 'off:11', job: 'QB', personId: 3 }, ctx);
    expect(add.ok && add.chart.units['off:11']!.QB).toEqual([1, 2, 3]);
    const rem = applyDepthEdit(chart(), { kind: 'remove', unitId: 'off:11', job: 'QB', personId: 2 }, ctx);
    expect(rem.ok && rem.chart.units['off:11']!.QB).toEqual([1]);
    expect(applyDepthEdit(chart(), { kind: 'add', unitId: 'off:11', job: 'QB', personId: 999 }, ctx)).toMatchObject({ ok: false, rule: 'M2.1.1' });
  });

  it('a package job can go back to inheriting; a base job cannot', () => {
    const r = applyDepthEdit(chart(), { kind: 'inherit', unitId: 'off:12', job: 'F' }, ctx);
    expect(r.ok && r.chart.units['off:12']!.F).toBeUndefined();
    expect(applyDepthEdit(chart(), { kind: 'inherit', unitId: 'off:11', job: 'QB' }, ctx).ok).toBe(false);
  });

  it('after the lock only actives may enter a list', () => {
    const actives = ctx.people.map((p) => p.personId).filter((id) => id !== 3);
    const r = applyDepthEdit(chart(), { kind: 'add', unitId: 'off:11', job: 'QB', personId: 3 }, { ...ctx, actives, locked: true });
    expect(r).toMatchObject({ ok: false, rule: 'M2.1.1' });
    expect(applyDepthEdit(chart(), { kind: 'move', unitId: 'off:11', job: 'QB', personId: 2, toIndex: 0 }, { ...ctx, actives, locked: true }).ok).toBe(true);
  });

  it('names and clears the emergency card', () => {
    const r = applyDepthEdit(chart(), { kind: 'emergency', need: 'holder', personId: 2 }, ctx);
    expect(r.ok && r.chart.emergency.holder).toBe(2);
    const c = applyDepthEdit(chart(), { kind: 'emergency', need: 'holder', personId: null }, ctx);
    expect(c.ok && c.chart.emergency.holder).toBeUndefined();
  });

  it('deciding a battle puts the winner first', () => {
    const battle: depth.Battle = { unitId: 'off:11', job: 'X', competitors: [20, 23], split: [0.5, 0.5], decideBy: 190, openedOn: 150 };
    const r = applyDepthEdit(chart(), { kind: 'decide_battle', unitId: 'off:11', job: 'X', winner: 23 }, { ...ctx, battles: [{ battle, evidence: [] }] });
    expect(r.ok && r.chart.units['off:11']!.X).toEqual([23, 20]);
  });
});
