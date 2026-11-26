import { describe, expect, it } from 'vitest';
import { staffGradeSheet, userGradeSheet, sheetTotals, displayGrade, GRADE_SCALES, zeroToFourMark, gradingEvidence, policyEffects, assignmentWords, type SnapMark } from '../../../src/read-models/film/index.ts';
import { makeSource, person, SEED } from './fixtures.ts';

const perfect = { personId: 90, accuracy: 1, favourites: [], favouriteLean: 0 };
const opts = { seed: SEED, gameId: 7 };

describe('grading sheet (N1.4.1)', () => {
  const src = makeSource({ contests: [{ winner: 0, loser: 11 }], mentalError: { slot: 3, cause: 'knowledge' } });

  it('a perfect grader with no favourites returns what happened', () => {
    expect(staffGradeSheet([src], person(0), perfect, opts).rows[0]).toMatchObject({ assignment: 'right', technique: 'plus', lostContest: false, loaf: false });
    expect(staffGradeSheet([src], person(3), perfect, opts).rows[0]).toMatchObject({ assignment: 'wrong' });
    expect(staffGradeSheet([src], person(11), perfect, opts).rows[0]).toMatchObject({ technique: 'minus', lostContest: true });
    expect(staffGradeSheet([src], person(3), perfect, opts).gameScore).toBe(-2);
  });

  it('lower accuracy gives more disagreements, in proportion', () => {
    const plays = Array.from({ length: 150 }, (_, i) => makeSource({ playNumber: i + 1, contests: [{ winner: 0, loser: 11 }] }));
    const truthRows = staffGradeSheet(plays, person(0), perfect, opts).rows;
    const disagree = (acc: number) => {
      const rows = staffGradeSheet(plays, person(0), { ...perfect, accuracy: acc }, opts).rows;
      let n = 0;
      rows.forEach((r, i) => { for (const k of ['assignment', 'technique', 'lostContest', 'loaf'] as const) if (r[k] !== truthRows[i]![k]) n++; });
      return n / (rows.length * 4);
    };
    const hi = disagree(0.9), lo = disagree(0.6);
    expect(hi).toBeGreaterThan(0.04); expect(hi).toBeLessThan(0.16);
    expect(lo).toBeGreaterThan(0.3); expect(lo).toBeLessThan(0.5);
  });

  it('a biased grader excuses his favourites', () => {
    const plays = Array.from({ length: 150 }, (_, i) => makeSource({ playNumber: i + 1, mentalError: { slot: 3, cause: 'knowledge' } }));
    const g = { personId: 91, accuracy: 0.5, favourites: [person(3)], favouriteLean: 1 };
    const rows = staffGradeSheet(plays, person(3), g, opts).rows;
    expect(rows.every((r) => r.assignment === 'right' || r.assignment === 'wrong')).toBe(true);
    // Every error leans his way: wrong is reported right about half the time, never the reverse.
    const right = rows.filter((r) => r.assignment === 'right').length;
    expect(right).toBeGreaterThan(50);
    const neutral = staffGradeSheet(plays, person(3), { ...g, favourites: [] }, opts).rows.filter((r) => r.assignment === 'right').length;
    expect(neutral).toBeGreaterThan(50); // unbiased errors flip too, but bias adds no wrong-to-wrong noise
  });

  it('totals: assignment share to one decimal, loafs, 0 to 4 mean', () => {
    const mk = (assignment: 'right' | 'wrong', technique: 'plus' | 'zero' | 'minus', lostContest = false, loaf = false): SnapMark => ({ playId: '7:1', assignment, technique, lostContest, loaf, loafCandidate: false, note: '' });
    const rows = [mk('right', 'plus'), mk('right', 'zero'), mk('right', 'minus'), mk('wrong', 'zero'), mk('right', 'zero', true), mk('right', 'zero', false, true), mk('right', 'plus')];
    const t = sheetTotals(rows);
    expect((t.assignmentShare * 100).toFixed(1)).toBe('85.7');
    expect(t.loafs).toBe(1);
    expect(rows.map((r) => zeroToFourMark(r))).toEqual([3, 3, 2, 0, 1, 3, 3]);
    expect(zeroToFourMark(rows[0]!, true)).toBe(4);
    expect(t.zeroToFour).toBe(2.1);
    expect(t.gameScore).toBeCloseTo((1 + 0 - 1 - 2 - 1 - 2 + 1) / 7);
  });

  it('switching the scale changes the display and no stored value', () => {
    const s = staffGradeSheet([src], person(0), perfect, opts);
    const frozen = JSON.stringify(s);
    const shown = GRADE_SCALES.map((sc) => displayGrade(s, sc));
    expect(new Set(shown).size).toBe(GRADE_SCALES.length);
    expect(JSON.stringify(s)).toBe(frozen);
    expect(displayGrade({ gameScore: 1, assignmentShare: 1, zeroToFour: 3 }, 'decimal')).toBe('9.0');
    expect(assignmentWords(0.9)).toBe('best-player level');
    expect(assignmentWords(0.86)).toBe('average');
    expect(assignmentWords(0.8)).toBe('in trouble');
  });

  it('the user grades himself; agreement with what happened is private evidence only', () => {
    const user = userGradeSheet(7, person(3), [{ playId: '7:12', assignment: 'right', technique: 'zero', lostContest: false, loaf: false, loafCandidate: false, note: '' }]);
    expect(user.grader).toBe('user');
    expect(gradingEvidence([src], user)).toEqual({ personId: person(3), gameId: 7, marks: 4, agreements: 3 });
  });

  it('grade policy effects name the policy that caused them (N1.4.4)', () => {
    const fx = policyEffects('posted', ['loaf_board'], [{ personId: 1, competitiveAboveMedian: true, lowConfidence: false, leadsLoafBoard: false }, { personId: 2, competitiveAboveMedian: false, lowConfidence: true, leadsLoafBoard: true }]);
    expect(fx).toEqual([
      expect.objectContaining({ personId: 1, loafRateCut: 0.1, stressStep: false, cause: expect.stringContaining('loaf board') }),
      expect.objectContaining({ personId: 2, loafRateCut: 0, stressStep: true }),
    ]);
    expect(policyEffects('private', ['loaf_board'], [{ personId: 1, competitiveAboveMedian: true, lowConfidence: true, leadsLoafBoard: true }])).toEqual([]);
  });
});
