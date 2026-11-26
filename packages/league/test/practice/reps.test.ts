import { describe, expect, it } from 'vitest';
import { assignPractice, impliedLabel, normalReps, repsPerPlayer, splitProblems, DEFAULT_SPLIT, type Participation } from '../../src/practice/index.ts';
import { ctx, practice, script, teamPeriod } from './fixtures.ts';

const scripts = new Map([['s-off', script('s-off', 'offense', ['p1', 'p2'], 40)]]);

describe('H3.3.1 rep distribution', () => {
  it('shares per position per period sum to 100 percent', () => {
    expect(splitProblems(DEFAULT_SPLIT)).toEqual([]);
    expect(splitProblems({ ...DEFAULT_SPLIT, first: 80 })).toEqual(['units']);
    expect(splitProblems({ ...DEFAULT_SPLIT, overrides: { QB: { QB1: 70, QB2: 40 } } })).toEqual(['QB']);
  });
  it('a per-position override gives the backup quarterback his share of the quarterback reps', () => {
    const c = ctx({ split: { ...DEFAULT_SPLIT, overrides: { QB: { QB1: 30 } } } });
    const p = practice([teamPeriod(1, { minutes: 10 })]);
    const as = assignPractice(p, scripts, c);
    const qbReps = as.map((a) => a.takers.find((t) => t.position === 'QB')!.personId);
    expect(qbReps.filter((x) => x === 'QB1').length).toBe(Math.floor(qbReps.length * 0.3));
  });
  it('a backup given zero reps watches: a mental rep, no taken rep', () => {
    const p = practice([teamPeriod(1, { minutes: 10 })]);
    const as = assignPractice(p, scripts, ctx());
    expect(repsPerPlayer(as).get('QB2')).toBeUndefined();
    expect(as.every((a) => a.watchers.includes('QB2'))).toBe(true);
  });
});

describe('H3.3.2 participation', () => {
  it('Limited takes the chosen share and no live periods; Did not participate takes none; the next man up gets the rep', () => {
    const part = new Map<string, Participation>([
      ['QB0', { personId: 'QB0', label: 'limited', share: 50, reason: 'injury', bodyPart: 'ankle' }],
      ['RB0', { personId: 'RB0', label: 'did_not_participate', reason: 'not_injury_related' }],
    ]);
    const p = practice([teamPeriod(1, { minutes: 20 }), teamPeriod(2, { minutes: 5, tempo: 'live' })]);
    const c = ctx({ participation: part });
    const as = assignPractice(p, scripts, c);
    const m = repsPerPlayer(as);
    const normal = normalReps(p, scripts, c);
    const thudFirstTeam = as.filter((a) => a.period === 1 && a.slot.unit === 'first').length;
    expect(m.get('QB0')).toBe(Math.floor(thudFirstTeam * 0.5));
    expect(as.filter((a) => a.period === 2).some((a) => a.takers.some((t) => t.personId === 'QB0'))).toBe(false);
    expect(m.get('RB0')).toBeUndefined();
    expect(m.get('RB1')).toBeGreaterThan(normal.get('RB1') ?? 0);
    expect(impliedLabel(m.get('QB0') ?? 0, normal.get('QB0')!, 'limited')).toBe('limited');
    expect(impliedLabel(m.get('RB0') ?? 0, normal.get('RB0')!, 'did_not_participate')).toBe('did_not_participate');
    expect(impliedLabel(normal.get('WR0')!, normal.get('WR0')!, 'full')).toBe('full');
  });
  it('a pulled or injured player is replaced from the depth chart', () => {
    const p = practice([teamPeriod(1, { minutes: 10 })]);
    const as = assignPractice(p, scripts, ctx({ out: new Set(['LT0']) }));
    expect(as.filter((a) => a.slot.unit === 'first').every((a) => a.takers.find((t) => t.position === 'LT')!.personId === 'LT1')).toBe(true);
  });
  it('a unit with too few healthy players runs short and is flagged', () => {
    const p = practice([teamPeriod(1, { minutes: 5 })]);
    const as = assignPractice(p, scripts, ctx({ out: new Set(['C0', 'C1', 'C2']) }));
    expect(as.every((a) => a.short)).toBe(true);
  });
});
