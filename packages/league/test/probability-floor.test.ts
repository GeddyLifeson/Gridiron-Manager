// A3.1 ruling 22 (MA-52): no exposed chance of a possible event can reach 0 (or 1). Every input is
// pushed to its extremes; only the documented exceptions (protected real people, structural cases
// where the event cannot exist) may return 0.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { PROB_FLOOR } from '@gm/schema';
import { comebackChance, midSeasonRetirementChance, retirementChance } from '../src/development/index.ts';
import { declareChance, entryChance, expectedPassShare, landingChance, optOutChance, satOutChance } from '../src/college/index.ts';
import { agreeChance, hideChance, refusalChance, sidelineCorrectChance } from '../src/medical/index.ts';
import { N } from './development/helpers.ts';
import { SEASONS_RULES } from './college/helpers.ts';

const ext = fc.oneof(fc.constantFrom(-1e9, -1, 0, 1, 1e9), fc.double({ min: -1e3, max: 1e3, noNaN: true }));
const ok = (p: number) => p >= PROB_FLOOR && p <= 1 - PROB_FLOOR;
const RUNS = { seed: 22, numRuns: 300 };

describe('A3.1 ruling 22: league chances never reach 0', () => {
  it('college entry, landing, declaring, opting out, passing a term and sitting out', () => {
    fc.assert(fc.property(ext, ext, ext, fc.boolean(), (a, b, c, flag) => {
      const f = { satisfaction: a, blockedOnDepthChart: flag, positionCoachLeft: !flag, payToMarket: b, teamLosing: flag, backupWithEligibility: flag, relationship: c, rolePromise: !flag };
      return ok(entryChance(f)) && ok(landingChance(a, flag))
        && ok(declareChance({ expectedDraftValue: a, stayMoney: b, stayDevelopmentValue: c, injuryRisk: a, advice: flag ? 'push_to_stay' : 'none', coachTie: b }))
        && ok(optOutChance(flag ? null : Math.round(Math.abs(c) % 8), !flag, 'generated'))
        && ok(expectedPassShare({ aptitude: a, diligence: b, studyHoursWeek: Math.abs(c), support: a, overloadHoursWeek: Math.abs(b), gradesPriorityShare: 1 }))
        && ok(satOutChance({ origin: 'generated', governing: 'seasons', regularGamesSoFar: 4, satisfaction: a, hasMarket: true, brokenPromises: Math.abs(b), loyalty: c, positionCoachTie: a }, SEASONS_RULES));
    }), RUNS);
  });
  it('imported real people keep their protection (exact 0)', () => {
    expect(optOutChance(1, false, 'imported')).toBe(0);
  });
  it('retirement, mid-season retirement and comebacks', () => {
    fc.assert(fc.property(fc.integer({ min: 18, max: 60 }), fc.boolean(), (age, flag) => {
      const r = { family: 'QB' as const, ageYears: age, majorInjuryLastYear: flag, lostStartingJob: flag, contenderWantsHim: !flag, facets: {} };
      return ok(retirementChance(N, r)) && ok(midSeasonRetirementChance(N, r) ) && ok(comebackChance(N, age, flag));
    }), RUNS);
  });
  it('medical refusal, agreement, hiding and sideline diagnosis', () => {
    fc.assert(fc.property(ext, ext, fc.boolean(), (a, b, flag) => ok(refusalChance(a, b)) && ok(agreeChance(a, b, flag)) && ok(hideChance(a)) && ok(sidelineCorrectChance(a))), RUNS);
  });
});
