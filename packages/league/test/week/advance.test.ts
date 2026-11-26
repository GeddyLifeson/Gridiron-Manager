import { describe, expect, it } from 'vitest';
import { weeklyDeadlines } from '../../src/calendar/weekly.ts';
import { allBlocks, choose, chooseAttendance, delegationPreview, leagueItems, leagueOrder, startRun, step, type BlockResolver, type WeekRun } from '../../src/week/index.ts';
import { proWeek, collegeWeek } from './fixtures.ts';

const resolver: BlockResolver = (b, info) => `${info.teamId}:${b.id}:${info.delegated ? 'd' : 'u'}`;
const opts = { userRole: 'head_coach' as const };

function freshRun(): WeekRun {
  const w = proWeek();
  return startRun(w, leagueItems(weeklyDeadlines(w.kickoff!, 'game')));
}
function runAll(run: WeekRun, mode: 'block' | 'day' | 'decision', delegate: boolean): WeekRun {
  let r = run;
  for (let guard = 0; guard < 1000; guard++) {
    const s = step(r, mode, resolver, { ...opts, delegateUserBlocks: delegate });
    r = s.run;
    if (s.stop === 'decision' && s.item) r = choose(r, s.item.id, 'staff_default');
    const next = allBlocks(r.week).find((b) => !r.week.completed.includes(b.id));
    if (!next || next.type === 'game') return step(r, 'game', resolver, { ...opts, delegateUserBlocks: delegate }).run;
  }
  throw new Error('no end');
}

describe('advancing the week (H1.1.3)', () => {
  it('block by block and "to game day" reach identical states from the same choices', () => {
    const a = runAll(freshRun(), 'block', true);
    const g = step(freshRun(), 'game', resolver, opts);
    expect(g.stop).toBe('game_day');
    expect(g.run.week.completed).toEqual(a.week.completed);
    expect(g.run.reports).toEqual(a.reports);
    expect(g.run.log).toEqual(a.log);
  });

  it('day by day reaches the same state as block by block', () => {
    const a = runAll(freshRun(), 'block', false);
    const d = runAll(freshRun(), 'day', false);
    expect(d.log).toEqual(a.log);
  });

  it('"next decision" never passes a required league deadline without a choice', () => {
    let r = freshRun();
    const s = step(r, 'decision', resolver, opts);
    expect(s.stop).toBe('decision');
    expect(s.item!.required).toBe(true);
    expect(s.run.log.some((e) => e.id === s.item!.id)).toBe(false);
    r = choose(s.run, s.item!.id, 'questionable:3');
    const s2 = step(r, 'block', resolver, opts);
    expect(s2.run.log.find((e) => e.id === s.item!.id)).toEqual({ kind: 'choice', id: s.item!.id, at: s.item!.at, value: 'questionable:3' });
  });

  it('other controls record the default when they pass a deadline', () => {
    const r = runAll(freshRun(), 'block', false);
    const items = r.log.filter((e) => e.kind === 'default');
    expect(items.length).toBe(leagueItems(weeklyDeadlines(proWeek().kickoff!, 'game')).length);
  });

  it('"to game day" lists what it will delegate before it runs', () => {
    const p = delegationPreview(freshRun(), 'head_coach');
    expect(p.blocks.length).toBeGreaterThan(0);
    expect(p.defaults.length).toBeGreaterThan(0);
  });

  it('a resolved block cannot be resolved again', () => {
    const s = step(freshRun(), 'block', resolver, opts);
    const s2 = step(s.run, 'block', resolver, opts);
    expect(s2.run.week.completed[0]).toBe(s.run.week.completed[0]);
    expect(new Set(s2.run.week.completed).size).toBe(2);
  });

  it('orders the league by start time, then team', () => {
    const a = proWeek(), b = { ...proWeek(), teamId: 0 };
    const day = a.days[0]!.day;
    const order = leagueOrder([a, b], day);
    for (let i = 1; i < order.length; i++) {
      const p = order[i - 1]!.block.start.minute, q = order[i]!.block.start.minute;
      expect(p < q || (p === q && order[i - 1]!.teamId <= order[i]!.teamId)).toBe(true);
    }
    expect(leagueOrder([collegeWeek()], collegeWeek().days[0]!.day).length).toBeGreaterThan(0);
  });

  it('a double-booked coach attends one block; the other runs with its default leader', () => {
    const w = proWeek();
    const [x, y] = allBlocks(w).filter((b) => b.leader === 'head_coach');
    const r = chooseAttendance(w, x!.id, y!.id);
    expect(allBlocks(r.week).find((b) => b.id === y!.id)!.leader).toBe('staff_default');
    expect(r.record).toEqual({ kind: 'double_booked', attended: x!.id, delegated: y!.id });
  });
});
