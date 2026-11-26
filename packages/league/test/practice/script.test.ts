import { describe, expect, it } from 'vitest';
import { P, cardMatch, cardMatchFactor, cardProblems, closeness, coverage, draftScript, fearCard, repsInPeriod, scoutQuality, unitSequence } from '../../src/practice/index.ts';
import { CARDS, practice, teamPeriod } from './fixtures.ts';

describe('H3.2.2 scout cards', () => {
  it('gains follow the three-level match rule', () => {
    const a = { ref: 'cover3_sky', family: 'cover3' };
    expect(cardMatch(a, a)).toBe('exact');
    expect(cardMatch(a, { ref: 'cover3_cloud', family: 'cover3' })).toBe('near');
    expect(cardMatch(a, { ref: 'cover0', family: 'cover0' })).toBe('none');
    expect([cardMatchFactor('exact'), cardMatchFactor('near'), cardMatchFactor('none')]).toEqual([1, 0.5, 0]);
  });
  it('every card links to a tag source or is the coach\'s own', () => {
    expect(cardProblems(CARDS)).toEqual([]);
    expect(cardProblems([fearCard('f', 'offense', { ref: 'x', family: 'y' })])).toEqual([]);
    expect(cardProblems([{ ...CARDS[0]!, sourceTags: [] }])).toEqual(['c-cover3']);
  });
});

describe('H3.2.3 scout team', () => {
  it('assigning a closer-matching scout player raises the factor, inside the starting range', () => {
    const far = scoutQuality([{ scoutId: 's1', opponentId: 'o', scoutAttrs: [60, 50], opponentAttrs: [95, 90], effort: 1 }]);
    const near = scoutQuality([{ scoutId: 's2', opponentId: 'o', scoutAttrs: [92, 88], opponentAttrs: [95, 90], effort: 1 }]);
    expect(near.factor).toBeGreaterThan(far.factor);
    for (const q of [far, near]) { expect(q.factor).toBeGreaterThanOrEqual(P('scout_factor_min')); expect(q.factor).toBeLessThanOrEqual(P('scout_factor_max')); }
    expect(scoutQuality([]).factor).toBe(P('scout_factor_min'));
    expect(closeness([50], [50])).toBe(1);
  });
  it('a graduate assistant user\'s organisation changes the factor (H3.6.2 acceptance 2)', () => {
    const as = [{ scoutId: 's', opponentId: 'o', scoutAttrs: [80], opponentAttrs: [85], effort: 0.9 }];
    expect(scoutQuality(as, 1).factor).toBeGreaterThan(scoutQuality(as, 0.5).factor);
  });
});

describe('H3.2.1 the script', () => {
  it('the coordinator draft fills the period and pairs items with more than one look', () => {
    const per = teamPeriod(1, { minutes: 10 });
    const items = [{ callId: 'p1', side: 'offense' as const, down: 1, distance: 10 }, { callId: 'p2', side: 'offense' as const, down: 3, distance: 6 }];
    const s = draftScript('d', 'offense', per, practice([]), items, CARDS);
    expect(s.reps.length).toBe(repsInPeriod(per, practice([])));
    expect(s.approved).toBe(false);
    const looksForP1 = new Set(s.reps.filter((r) => r.callId === 'p1').map((r) => r.cardId));
    expect(looksForP1.size).toBeGreaterThan(1);
  });
  it('each call-sheet play shows its number of scripted reps for the week', () => {
    const per = teamPeriod(1, { minutes: 5 });
    const s = draftScript('d', 'offense', per, practice([]), [{ callId: 'p1', side: 'offense', down: 1, distance: 10 }], CARDS);
    const c = coverage(['p1', 'p2', 'p3'], [s, { ...s, reps: [{ ...s.reps[0]!, callId: 'p2' }] }]);
    expect(c.reps['p1']).toBe(s.reps.length);
    expect(c.zero).toEqual(['p3']);
    expect(c.one).toEqual(['p2']);
    expect(c.more).toEqual(['p1']);
  });
  it('the unit split holds exactly over a period (70, 25, 5)', () => {
    const u = unitSequence(20, { first: P('split_first'), second: P('split_second'), third: P('split_third') });
    expect(u.filter((x) => x === 'first').length).toBe(14);
    expect(u.filter((x) => x === 'second').length).toBe(5);
    expect(u.filter((x) => x === 'third').length).toBe(1);
  });
});
