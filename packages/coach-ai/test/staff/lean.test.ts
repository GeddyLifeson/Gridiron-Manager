// Staff with an angle (plans/head-coach-nuance.md item 1, Q3): biased advisers, bad news that comes soft and
// late, and a head coach who learns whose numbers to trust from settled calls.
import { describe, expect, it } from 'vitest';
import { stream } from '@gm/engine-core';
import {
  FRESH_HISTORY, NO_AIM, corrected, fourthDownLean, leanedFourthDown, leanedGrade, ownUnitLean, reportBadNews, respond, roomLean, softening, trackRecord,
  type TrackEntry,
} from '../../src/staff/index.ts';
import { SEED, staffer } from './fixtures.ts';

/**
 * One season of fourth downs: the adviser's number is the true edge of going (share), plus his lean, plus noise.
 * The blind coach goes when the adviser says go; the careful coach takes out the lean the settled calls show.
 * Returns the true value each coach banked (going pays the edge, kicking pays 0).
 */
function season(lean: number, seed: number): { blind: number; careful: number } {
  const d = stream(SEED, 'coachAI', ['lean_season', seed]);
  const settled: TrackEntry[] = [];
  let blind = 0, careful = 0;
  for (let i = 0; i < 30; i++) {
    const edge = (d.uniform() - 0.5) * 0.08;
    const said = edge + lean + d.normal() * 0.01;
    if (said > 0) blind += edge;
    if (corrected(said, trackRecord(settled)) > 0) careful += edge;
    settled.push({ said, was: edge });
  }
  return { blind, careful };
}

describe('staff with an angle', () => {
  it('over 200 seeded seasons with a biased adviser, weighting him by his track record beats following him blindly; with an unbiased one they tie', () => {
    let blindB = 0, carefulB = 0, blindU = 0, carefulU = 0;
    for (let s = 0; s < 200; s++) {
      const b = season(0.025, s);
      blindB += b.blind; carefulB += b.careful;
      const u = season(0, s);
      blindU += u.blind; carefulU += u.careful;
    }
    expect(carefulB).toBeGreaterThan(blindB * 1.1);
    expect(Math.abs(carefulU - blindU)).toBeLessThan(Math.abs(blindU) * 0.05);
  });

  it("the bold OC's fourth-down number leans toward going; a cautious DC's leans the other way", () => {
    const oc = staffer(10, 'offensiveCoordinator', { facets: { riskTolerance: 80 } });
    const dc = staffer(11, 'defensiveCoordinator', { facets: { riskTolerance: 25 } });
    expect(fourthDownLean(oc)).toBeGreaterThan(0);
    expect(fourthDownLean(dc)).toBeLessThan(0);
    const own = [{ optionId: 'punt', wp: 0.41 }, { optionId: 'go', wp: 0.40 }];
    expect(leanedFourthDown(own, ['go'], fourthDownLean(oc)).best).toBe('go');
    expect(leanedFourthDown(own, ['go'], fourthDownLean(dc)).best).toBe('punt');
  });

  it('the assistant who wants a coordinator job oversells his own room, not other rooms', () => {
    const a = staffer(15, 'positionCoach');
    expect(roomLean(a, { wantsPromotion: true })).toBeGreaterThan(roomLean(a, NO_AIM));
    expect(leanedGrade(0.2, true, a, { wantsPromotion: true })).toBeGreaterThan(0.2);
    expect(leanedGrade(0.2, false, a, { wantsPromotion: true })).toBe(0.2);
  });

  it('a high-ego coordinator undersells his own unit more than a low-ego one', () => {
    expect(ownUnitLean(staffer(11, 'defensiveCoordinator', { facets: { ego: 90 } }))).toBeGreaterThan(ownUnitLean(staffer(12, 'defensiveCoordinator', { facets: { ego: 10 } })));
  });

  it('punishing bad news in meetings measurably delays and softens the next report', () => {
    const m = staffer(11, 'defensiveCoordinator');
    const punished = respond(respond(respond(FRESH_HISTORY, 'punished'), 'punished'), 'punished');
    let fresh = 0, after = 0;
    for (let i = 0; i < 400; i++) {
      fresh += reportBadNews(m, FRESH_HISTORY, { severity: 0.7, ownUnit: false }, stream(SEED, 'coachAI', ['news', i])).delayDays;
      after += reportBadNews(m, punished, { severity: 0.7, ownUnit: false }, stream(SEED, 'coachAI', ['news', i])).delayDays;
    }
    expect(after).toBeGreaterThan(fresh * 1.3);
    expect(softening(m, punished, false)).toBeGreaterThan(softening(m, FRESH_HISTORY, false));
  });

  it('bad news is never wholly hidden, even from the quietest, most afraid man about his own unit', () => {
    const m = staffer(11, 'defensiveCoordinator', { facets: { candor: 0, ego: 100 } });
    const scared = { ...FRESH_HISTORY, safety: 0 };
    expect(reportBadNews(m, scared, { severity: 1, ownUnit: true }, stream(SEED, 'coachAI', ['x'])).severitySaid).toBeGreaterThan(0);
  });

  it('a track record measures the lean; with no settled calls there is no correction', () => {
    const rec = trackRecord([{ said: 0.05, was: 0.02 }, { said: 0.01, was: -0.02 }]);
    expect(rec.lean).toBeCloseTo(0.03, 12);
    expect(rec.miss).toBeCloseTo(0, 12);
    expect(corrected(0.04, trackRecord([]))).toBe(0.04);
  });
});
