import { describe, expect, it } from 'vitest';
import {
  collegeRules, expectedPassShare, playTerm, postseasonAllowedByRate, standingFor, teamAcademicRate, termCheck, weeklyLoad, collegeAct,
  type TermCheckInput, type TermInput,
} from '../../src/college/index.ts';
import { commitAct } from '../../src/compliance/index.ts';
import { COLLEGE_VALUES, MemorySink, emptyCompliance, party, ruleSet as complianceRules } from '../compliance/fixtures.ts';
import { RULES, ruleSet, stream } from './helpers.ts';

const fall = (hours: number): TermCheckInput => ({ term: 'fall', hoursPassedThisTerm: hours, hoursSincePreviousFall: hours, totalHours: hours, yearAboutToStart: 1, degreeProgressPct: 0, gpa: 3 });
const spring = (o: Partial<TermCheckInput>): TermCheckInput => ({ term: 'spring', hoursPassedThisTerm: 12, hoursSincePreviousFall: 24, totalHours: 24, yearAboutToStart: 2, degreeProgressPct: 50, gpa: 3, ...o });

describe('term checks (T5.3.1 acceptance)', () => {
  it('a player who passes 8 hours in the fall misses exactly the first 4 games of the next season', () => {
    const r = termCheck(fall(8), RULES);
    expect(r.gamesSuspendedNextSeason).toBe(4);
    expect(r.eligibleNextTerm).toBe(true);
    expect(r.failures).toEqual(['fall_rule']);
    expect(termCheck(fall(9), RULES).gamesSuspendedNextSeason).toBe(0);
  });
  it('fewer than 6 hours in a term sits him out the next term', () => {
    expect(termCheck(fall(5), RULES)).toMatchObject({ eligibleNextTerm: false, gamesSuspendedNextSeason: 4 });
    expect(termCheck({ ...spring({}), hoursPassedThisTerm: 5 }, RULES).eligibleNextTerm).toBe(false);
  });
  it('the 18-hour, 24-hour, degree progress and grade point rules', () => {
    expect(termCheck(spring({}), RULES).eligibleNextTerm).toBe(true);
    expect(termCheck(spring({ hoursSincePreviousFall: 17 }), RULES).failures).toContain('year_hours');
    expect(termCheck(spring({ totalHours: 23 }), RULES).failures).toContain('first_year_hours');
    expect(termCheck(spring({ totalHours: 23, yearAboutToStart: 3 }), RULES).failures).not.toContain('first_year_hours');
    expect(termCheck(spring({ yearAboutToStart: 3, degreeProgressPct: 39 }), RULES).failures).toContain('degree_progress');
    expect(termCheck(spring({ yearAboutToStart: 4, degreeProgressPct: 59 }), RULES).failures).toContain('degree_progress');
    expect(termCheck(spring({ yearAboutToStart: 5, degreeProgressPct: 79 }), RULES).failures).toContain('degree_progress');
    expect(termCheck(spring({ yearAboutToStart: 6, degreeProgressPct: 80 }), RULES).eligibleNextTerm).toBe(true);
    expect(termCheck(spring({ gpa: 1.79 }), RULES).failures).toContain('gpa');
    expect(termCheck(spring({ yearAboutToStart: 3, gpa: 1.85 }), RULES).failures).toContain('gpa');
    expect(termCheck(spring({ yearAboutToStart: 5, gpa: 1.99 }), RULES).failures).toContain('gpa');
  });
  it('a rule set without academic keys never fails anyone', () => {
    const none = collegeRules(ruleSet({ 'academic.term_min_hours': undefined }));
    expect(termCheck(fall(0), none)).toMatchObject({ eligibleNextTerm: true, gamesSuspendedNextSeason: 0 });
  });
});

describe('team academic rate (T5.3.1 rule 7)', () => {
  it('a team with a multi-year rate of 929 cannot enter the postseason; 930 can', () => {
    expect(postseasonAllowedByRate(929, RULES)).toBe(false);
    expect(postseasonAllowedByRate(930, RULES)).toBe(true);
  });
  it('one credit for eligibility and one for retention per player-term, on a 1,000 scale', () => {
    const rows = [...Array(9).fill({ stayedEligible: true, stayedOrGraduated: true }), { stayedEligible: false, stayedOrGraduated: true }];
    expect(teamAcademicRate(rows, RULES)).toBe(950);
    expect(teamAcademicRate([], RULES)).toBeNull();
  });
});

describe('term projection and load (T5.3.1, T8.3.1)', () => {
  const avg: TermInput = { aptitude: 0.5, diligence: 0.5, studyHoursWeek: 6, support: 0.5, overloadHoursWeek: 0, gradesPriorityShare: 0.5 };
  it('a player with zero study hours for a term and low aptitude becomes at risk', () => {
    expect(standingFor(expectedPassShare({ ...avg, aptitude: 0.1, diligence: 0.2, studyHoursWeek: 0, support: 0.2 }))).toBe('at_risk');
    expect(standingFor(expectedPassShare({ ...avg, aptitude: 0.9, diligence: 0.9, studyHoursWeek: 8, support: 0.8 }))).toBe('good');
    expect(standingFor(0.9, false)).toBe('ineligible');
  });
  it('the weekly load counts class, study and football against the limit', () => {
    const w = weeklyLoad(20, false);
    expect(w.total).toBe(50); expect(w.overloadHours).toBe(0);
    expect(weeklyLoad(35, true).overloadHours).toBe(10);
  });
  it('a team given no tutoring and maximum football time shows more ineligible players next term than a matched supported team', () => {
    const rng = stream(37);
    let bare = 0, supported = 0;
    for (let i = 0; i < 400; i++) {
      const aptitude = (i % 20) / 20, diligence = ((i * 7) % 20) / 20;
      const over = weeklyLoad(40, false).overloadHours;
      const hb = playTerm({ aptitude, diligence, studyHoursWeek: 0, support: 0, overloadHoursWeek: over, gradesPriorityShare: 0.5 }, 'generated', RULES, rng);
      const hs = playTerm({ aptitude, diligence, studyHoursWeek: 8, support: 0.8, overloadHoursWeek: 0, gradesPriorityShare: 0.5 }, 'generated', RULES, rng);
      if (!termCheck(fall(hb), RULES).eligibleNextTerm) bare++;
      if (!termCheck(fall(hs), RULES).eligibleNextTerm) supported++;
    }
    expect(bare).toBeGreaterThan(supported);
  });
  it('imported people always pass a full load', () => {
    expect(playTerm({ aptitude: 0, diligence: 0, studyHoursWeek: 0, support: 0, overloadHoursWeek: 30, gradesPriorityShare: 1 }, 'imported', RULES, stream())).toBe(12);
  });
});

describe('academic shortcuts and playing an ineligible player (T5.3.2 acceptance)', () => {
  const ctx = { actor: party(10, 'head_coach', 1), day: 0, knew: [11, 12], tier: 1 as const, source: 'user' as const };
  const rules = complianceRules(COLLEGE_VALUES);
  it('both actions exist for a generated player and each writes exactly one violation row', () => {
    for (const id of ['academic_help', 'play_ineligible'] as const) {
      const act = collegeAct(id, ctx, { personId: 50, origin: 'generated' })!;
      expect(act.classId).toBe('eligibility_academic');
      expect(act.knew).toEqual([11, 12, 50]);
      const r = commitAct(emptyCompliance(), act, rules, new MemorySink());
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.state.log).toHaveLength(1);
    }
  });
  it('neither is ever offered for an imported player, nor by an imported actor', () => {
    expect(collegeAct('academic_help', ctx, { personId: 50, origin: 'imported' })).toBeNull();
    expect(collegeAct('play_ineligible', { ...ctx, actor: party(10, 'head_coach', 1, 'imported') }, { personId: 50, origin: 'generated' })).toBeNull();
  });
  it('a medical retirement of a player cleared to play is the same class (T5.1.2 rule 5)', () => {
    expect(collegeAct('false_medical_retirement', ctx, { personId: 51, origin: 'generated' })!.classId).toBe('eligibility_academic');
  });
});
