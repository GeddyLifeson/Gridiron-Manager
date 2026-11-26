// Install board read model and commands (O3.3.2 over G5 and D9.4): day loads follow G5.2.1's daily limit,
// prerequisites follow G5.1.1, readiness is G5.4.1 on the staff's estimates, laggers carry D9.4.1's error
// chance at their estimate, and a short week drops cards into the tray.
import { describe, expect, it } from 'vitest';
import { knowledge } from '@gm/league';
import { buildInstallView, type InstallInput } from '../../../src/read-models/install/index.ts';
import { runInstallCommand, defaultFill, type InstallContext, type InstallState } from '../../../src/commands/install/index.ts';
import { input, TEAM, UNITS } from './fixture.ts';

const build = (over: Partial<InstallInput> = {}) => buildInstallView({ ...input(over), teamId: TEAM, side: 'offense', mode: 'week' });

describe('install board view (O3.3.2)', () => {
  it('lays cards on their days with load per group and the periods given to them', () => {
    const v = build();
    expect(v.days.map((d) => d.cards.map((c) => c.unitId))).toEqual([['f.trips', 'p.slide'], ['play.stick'], []]);
    const d1 = v.days[0]!;
    expect(d1.load).toEqual([
      { group: 'OL', units: 3, limit: 12, over: 0, lostShare: 0 },
      { group: 'QB', units: 2, limit: 12, over: 0, lostShare: 0 },
      { group: 'WR', units: 2, limit: 12, over: 0, lostShare: 0 },
    ]);
    expect(d1.overloaded).toBe(false);
    expect(v.days[1]!.cards[0]!.periods).toHaveLength(2);
    expect(v.tray.map((c) => [c.unitId, c.tray])).toEqual([['chk.stick', 'unplaced']]);
    expect(v.totals).toEqual({ placed: 3, unplaced: 1, installed: 0 });
  });
  it('acceptance: the load total per day equals the G5.2.1 count (distinct learning units, over = beyond the limit)', () => {
    const numbers = knowledge.knowledgeNumbers({ 'install.dailyLimit': 2 });
    const v = build({ numbers });
    for (const day of v.days) {
      const units = UNITS.filter((u) => day.cards.some((c) => c.unitId === u.id));
      for (const l of day.load) {
        const distinct = new Set(units.flatMap((u) => u.items[l.group] ?? []));
        expect(l.units).toBe(distinct.size);
        expect(l.over).toBe(Math.max(0, distinct.size - 2));
        expect(l.lostShare).toBe(l.over ? 0.75 : 0);
      }
    }
    expect(v.days[0]!.overloaded).toBe(true);
    expect(v.days[0]!.load.find((l) => l.group === 'OL')).toEqual({ group: 'OL', units: 3, limit: 2, over: 1, lostShare: 0.75 });
  });
  it('a card placed before its prerequisites names what is missing (G5.1.1)', () => {
    const v = build({ placed: { 'f.trips': 'practice1', 'p.slide': 'practice2', 'play.stick': 'practice1', 'chk.stick': 'practice3' } });
    expect(v.days[0]!.cards.find((c) => c.unitId === 'play.stick')!.missing).toEqual(['p.slide']);
    expect(v.days[2]!.cards[0]!.missing).toEqual([]);
  });
  it('a short week removes a day and its cards fall into the tray (O3.3.2 edge case)', () => {
    const v = build({
      days: [{ id: 'practice1', label: 'Practice 1' }, { id: 'practice2', label: 'Practice 2' }, { id: 'practice3', label: 'Practice 3', removed: true }],
      placed: { 'f.trips': 'practice1', 'p.slide': 'practice1', 'play.stick': 'practice2', 'chk.stick': 'practice3' },
    });
    expect(v.days.map((d) => d.id)).toEqual(['practice1', 'practice2']);
    expect(v.tray).toHaveLength(1);
    expect(v.tray[0]!.tray).toBe('day_removed');
    expect(v.numbers.shortWeek).toBe(true);
  });
  it('readiness by group is G5.4.1 on the estimates; laggers carry the D9.4.1 error chance and delay', () => {
    const v = build();
    const stick = v.readiness.find((r) => r.unitId === 'play.stick')!;
    const wr = stick.groups.find((g) => g.group === 'WR')!;
    // values 65 and 20: mean 42.5 minus half the gap of 22.5
    expect(wr.readiness).toBe(31.25);
    expect(wr.weakest).toBe(20);
    expect(wr.laggers).toHaveLength(1);
    const rookie = wr.laggers[0]!;
    expect(rookie.name).toBe('Rookie Receiver');
    // 0.5 x (1 - 0.2)^2 x (0.6 + 0.75 x 1.0) = 0.432; delay (80 - 20) x 0.01 = 0.6 s
    expect(rookie.errorChance).toBe(0.432);
    expect(rookie.delayS).toBe(0.6);
    expect(stick.groups.find((g) => g.group === 'OL')!.unjudged).toBe(true);
    expect(stick.installed).toBe(false);
  });
  it('a lower estimate gives a higher error chance (the D9.4 link the board shows)', () => {
    const v = build();
    const fade = v.readiness.find((r) => r.unitId === 'chk.stick')!.groups.find((g) => g.group === 'WR')!.laggers[0]!;
    const routes = v.readiness.find((r) => r.unitId === 'play.stick')!.groups.find((g) => g.group === 'WR')!.laggers[0]!;
    expect(fade.estimate).toBeGreaterThan(routes.estimate);
    expect(fade.errorChance).toBeLessThan(routes.errorChance);
  });
  it('the default order respects prerequisites; a coordinator holds the board and a position coach suggests', () => {
    const v = build();
    expect(v.order.indexOf('play.stick')).toBeGreaterThan(v.order.indexOf('p.slide'));
    expect(v.order.indexOf('chk.stick')).toBeGreaterThan(v.order.indexOf('play.stick'));
    expect(v.locks.edit).toEqual({ allowed: true, heldBy: null, suggest: false });
    expect(build({ holder: { job: 'position_coach', side: 'offense' } }).locks.edit).toEqual({ allowed: false, heldBy: 'coordinator', suggest: true });
  });
});

const ctx = (over: Partial<InstallContext> = {}): InstallContext => ({
  holder: { job: 'coordinator', side: 'offense' }, side: 'offense', units: UNITS, days: ['practice1', 'practice2', 'practice3'], newId: 's1', userId: 'u1', ...over,
});
const state = (): InstallState => ({ placed: { ...input().placed }, alwaysUp: ['f.trips'], listed: [] });

describe('install board commands (G5)', () => {
  it('places a unit when its prerequisites are on or before the day, and refuses otherwise', () => {
    const ok = runInstallCommand(state(), ctx(), { kind: 'place', unitId: 'chk.stick', dayId: 'practice3' });
    expect(ok.ok && ok.state.placed['chk.stick']).toBe('practice3');
    const early = runInstallCommand(state(), ctx(), { kind: 'place', unitId: 'chk.stick', dayId: 'practice1' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.refusal).toContain('play.stick');
    const late = runInstallCommand(state(), ctx(), { kind: 'place', unitId: 'f.trips', dayId: 'practice3' });
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.refusal).toContain('play.stick');
  });
  it('a placement over the daily limit is kept with a note (G5.2.1 yield falls, it is not forbidden)', () => {
    const r = runInstallCommand(state(), ctx({ numbers: knowledge.knowledgeNumbers({ 'install.dailyLimit': 2 }) }), { kind: 'place', unitId: 'play.stick', dayId: 'practice1' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.notes.some((n) => n.startsWith('OL goes'))).toBe(true);
  });
  it('the default fill packs the install order under the limit and never breaks a prerequisite', () => {
    const f = defaultFill(ctx({ numbers: knowledge.knowledgeNumbers({ 'install.dailyLimit': 2 }) }), state());
    expect(f.placed).toEqual({ 'f.trips': 'practice1', 'p.slide': 'practice2', 'play.stick': 'practice2', 'chk.stick': 'practice3' });
    expect(f.notFitting).toEqual([]);
    const tight = defaultFill(ctx({ days: ['practice1'], numbers: knowledge.knowledgeNumbers({ 'install.dailyLimit': 2 }) }), state());
    expect(tight.notFitting).toEqual(['p.slide', 'play.stick', 'chk.stick']);
  });
  it('a position coach is refused and a suggestion goes to the coordinator; nothing changes', () => {
    const r = runInstallCommand(state(), ctx({ holder: { job: 'position_coach', side: 'offense' } }), { kind: 'fill' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.suggestion?.to).toBe('coordinator');
  });
  it('always-up and the playbook hand-off update the state', () => {
    const a = runInstallCommand(state(), ctx(), { kind: 'always_up', unitId: 'play.stick', on: true });
    expect(a.ok && a.state.alwaysUp).toEqual(['f.trips', 'play.stick']);
    const b = runInstallCommand(state(), ctx(), { kind: 'add_plays', playIds: ['x', 'x', 'y'] });
    expect(b.ok && b.state.listed).toEqual(['x', 'y']);
  });
});
