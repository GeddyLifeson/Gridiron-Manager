import { describe, expect, it } from 'vitest';
import {
  afterDraft, collegeRules, declarationDeadline, declare, declareChance, draftEligibleByYears, eligibilityStatus, optOutChance,
} from '../../src/college/index.ts';
import { RULES, day, rec, ruleSet } from './helpers.ts';

describe('early entry (T8.5.1)', () => {
  it('eligible to declare three years after high school', () => {
    expect(draftEligibleByYears(2024, 2027, RULES)).toBe(true);
    expect(draftEligibleByYears(2025, 2027, RULES)).toBe(false);
  });
  it('deadline January 14, January 23 for title-game players', () => {
    expect(declarationDeadline(2027, false, RULES)).toBe(day(2027, 1, 14));
    expect(declarationDeadline(2027, true, RULES)).toBe(day(2027, 1, 23));
  });
  it('a declaration after the deadline or too soon after high school is refused; one in time ends eligibility', () => {
    const r = rec({ firstEnrollYear: 2024, birthDay: day(2005, 6, 1) });
    expect(declare(r, 2024, 2027, day(2027, 1, 15), false, RULES)).toEqual({ ok: false, reason: 'after_deadline' });
    expect(declare(r, 2024, 2027, day(2027, 1, 15), true, RULES).ok).toBe(true);
    expect(declare(r, 2025, 2027, day(2027, 1, 10), false, RULES)).toEqual({ ok: false, reason: 'too_early_from_high_school' });
    const d = declare(r, 2024, 2027, day(2027, 1, 10), false, RULES);
    expect(d.ok).toBe(true);
    if (d.ok) {
      expect(eligibilityStatus(d.record, 2027, RULES)).toMatchObject({ eligible: false, reason: 'declared' });
      expect(declare(d.record, 2024, 2027, day(2027, 1, 11), false, RULES)).toEqual({ ok: false, reason: 'already_declared' });
    }
  });
  it('an undrafted early entrant may not return unless the rule set says so', () => {
    const declared = rec({ declared: true, firstEnrollYear: 2024, birthDay: day(2005, 6, 1) });
    expect(eligibilityStatus(afterDraft(declared, false, RULES), 2027, RULES).eligible).toBe(false);
    const back = collegeRules(ruleSet({ 'draft.undrafted_may_return': true }));
    expect(eligibilityStatus(afterDraft(declared, false, back), 2027, back).eligible).toBe(true);
    expect(afterDraft(declared, true, back)).toBe(declared);
  });
  it('stay or go: more draft value means more declare; roster money keeps mid-round players; a coach can pull', () => {
    const base = { expectedDraftValue: 4000000, stayMoney: 1000000, stayDevelopmentValue: 500000, injuryRisk: 0.1, advice: 'honest_read' as const, coachTie: 0.8 };
    expect(declareChance({ ...base, expectedDraftValue: 20000000 })).toBeGreaterThan(declareChance(base));
    expect(declareChance({ ...base, stayMoney: 3000000 })).toBeLessThan(declareChance(base));
    expect(declareChance({ ...base, advice: 'push_to_stay' })).toBeLessThan(declareChance(base));
    expect(declareChance({ ...base, expectedDraftValue: 0, injuryRisk: 0 })).toBe(0);
  });
});

describe('opt-outs (T8.5.2)', () => {
  it('half of projected top-two-round players skip a non-playoff bowl; near zero in the playoff; never for imported people', () => {
    expect(optOutChance(1, false, 'generated')).toBe(0.5);
    expect(optOutChance(2, false, 'generated')).toBe(0.5);
    expect(optOutChance(4, false, 'generated')).toBeLessThan(0.5);
    expect(optOutChance(1, true, 'generated')).toBeLessThan(0.05);
    expect(optOutChance(null, false, 'generated')).toBe(0);
    expect(optOutChance(1, false, 'imported')).toBe(0);
  });
});
