import { describe, expect, it } from 'vitest';
import {
  checkPractice, hasPaddedBudget, newPeriod, participationFindings, participationRequests, practiceActivity, practiceView, violationRequests, coverage,
} from '../../src/practice/index.ts';
import type { HeldActivity } from '../../src/calendar/work-rules.ts';
import { PC, checker, collegeRules, practice, proRules, rs, teamPeriod } from './fixtures.ts';

describe('H3.1.2 prohibited drills and H3.1.1 rule 4 pads, through the G-12 checker', () => {
  it('a prohibited drill in a regular-season practice is one hard finding and one violation request when confirmed', () => {
    const p = practice([newPeriod(1, 'individual', PC, { groups: ['LT'], drills: ['oklahoma'] })]);
    const fs = checkPractice(p, { rules: proRules, checker, ctx: rs(5)(p.day), held: [] });
    const hard = fs.filter((f) => f.hardness === 'hard');
    expect(hard.map((f) => f.ruleId)).toEqual(['camp.prohibited_drills']);
    expect(violationRequests(fs, p.blockId, 'w5', 1)).toHaveLength(1);
    expect(practiceActivity(p).drills).toEqual(['oklahoma']);
  });
  it('a padded practice past the early-season budget breaks the padded rule', () => {
    const p = practice([teamPeriod(1)], { pads: 'full' });
    const held: HeldActivity[] = Array.from({ length: proRules('work.season_padded_practices_max')! }, (_, i) => ({ activity: { ...practiceActivity(p), day: p.day - 7 * (i + 1) }, ctx: rs(1)(0) }));
    const fs = checkPractice(p, { rules: proRules, checker, ctx: rs(5)(p.day), held });
    expect(fs.some((f) => f.hardness === 'hard' && f.ruleId.startsWith('season.padded'))).toBe(true);
    expect(checkPractice({ ...p, pads: 'shells' }, { rules: proRules, checker, ctx: rs(5)(p.day), held }).filter((f) => f.hardness === 'hard')).toEqual([]);
  });
  it('live without full pads is a coaching warning, not a rule break', () => {
    const fs = checkPractice(practice([teamPeriod(1, { tempo: 'live' })]), { rules: proRules, checker, ctx: rs(5)(0), held: [] });
    expect(fs.find((f) => f.ruleId === 'live_without_pads')?.hardness).toBe('soft');
  });
});

describe('H3.6.1 college practice limits', () => {
  it('a practice that pushes the day over the daily hours warns, can be saved, and writes exactly one violation', () => {
    const dayMin = collegeRules('college.cara_day_hours')! * 60;
    const p = practice([teamPeriod(1, { minutes: 60 })]);
    const fs = checkPractice(p, { rules: collegeRules, otherCountableToday: dayMin - 30 });
    expect(fs.filter((f) => f.hardness === 'hard').map((f) => f.ruleId)).toEqual(['countable_day_hours']);
    expect(violationRequests(fs, p.blockId, 'c1', 2)).toHaveLength(1);
    expect(checkPractice(p, { rules: collegeRules, otherCountableToday: 0 }).filter((f) => f.hardness === 'hard')).toEqual([]);
  });
  it('with the padded-limit value empty, no padded budget is shown or enforced', () => {
    expect(hasPaddedBudget(collegeRules)).toBe(false);
    expect(hasPaddedBudget(proRules)).toBe(true);
    const p = practice([teamPeriod(1)], { pads: 'full' });
    const v = practiceView({ practice: p, rules: collegeRules, coverage: coverage([], []), findings: [], participation: [], paddedUsed: 3 });
    expect(v.paddedLeft).toBeNull();
    expect(v.hours?.provisional).toBe(true);
    const vp = practiceView({ practice: p, rules: proRules, coverage: coverage([], []), findings: [], participation: [], paddedUsed: 3 });
    expect(vp.paddedLeft).toBe(proRules('work.season_padded_practices_max')! - 3);
    expect(vp.hours).toBeNull();
  });
  it('the developmental period is offered at college level only', () => {
    const p = practice([newPeriod(1, 'developmental', PC, { groups: ['offense'], minutes: 15 })]);
    expect(checkPractice(p, { rules: collegeRules }).filter((f) => f.hardness === 'hard')).toEqual([]);
  });
});

describe('H3.3.2 report labels and clearance', () => {
  it('a filed label that differs from the practised one is a false report; practising an uncleared player is a breach; an overrule is only logged', () => {
    const sheet = [
      { personId: 'a', label: 'limited' as const, reason: 'injury' as const },
      { personId: 'b', label: 'full' as const, reason: 'injury' as const, medical: { recommend: 'did_not_participate' as const, cleared: false, protocol: true } },
      { personId: 'c', label: 'full' as const, reason: 'none' as const, medical: { recommend: 'limited' as const, cleared: true, protocol: false } },
    ];
    const fs = participationFindings(sheet, new Map([['a', 'limited']]), new Map([['a', 'did_not_participate']]));
    expect(fs.map((f) => `${f.personId}:${f.kind}`)).toEqual(['a:false_report', 'b:uncleared', 'c:overrule']);
    expect(participationRequests(fs, 'w1', 1)).toHaveLength(2);
    expect(participationFindings(sheet.slice(0, 1), new Map([['a', 'limited']]), new Map())).toEqual([]);
  });
});
