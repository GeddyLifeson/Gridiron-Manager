import { describe, expect, it } from 'vitest';
import {
  allBlocks, answer, coordinatorProblems, injuryAnswers, leakChance, mediaFindings, offMessageChance, questions, recruitComment,
  removeBlock, skipSession, topicScore, brokenPromise, criticiseOfficials, appearanceAllowed, skipAppearance, weekLookup,
} from '../../src/week/index.ts';
import { SUN, at, collegeRules, collegeWeek, proEnv, proLeague, proRules, proWeek, rng } from './fixtures.ts';

describe('required sessions (H7.1.1)', () => {
  it('the default week holds the configured sessions; removing one warns', () => {
    const w = proWeek();
    expect(mediaFindings(w, proRules)).toEqual([]);
    const mid = allBlocks(w).find((b) => b.session === 'mid_week')!;
    const r = removeBlock(w, mid.id, proEnv());
    if (r.kind !== 'placed') throw new Error('removal refused');
    expect(mediaFindings(r.week, proRules).map((f) => f.ruleId)).toEqual(['media.head_coach_days']);
  });
  it('session counts read from config', () => {
    const two = weekLookup((k) => (k === 'media.head_coach_days_per_week' ? 4 : proLeague(k)), 'pro');
    expect(() => mediaFindings(proWeek(), two)).toThrow(); // a contradicting league value throws, never silently wins
    const four = (k: string) => (k === 'media.head_coach_days_per_week' ? 4 : proRules(k));
    expect(mediaFindings(proWeek(), four).map((f) => f.ruleId)).toEqual(['media.head_coach_days']);
  });
  it('a skipped required session creates exactly one C11 and one L6 event; the first is a warning', () => {
    const b = allBlocks(proWeek()).find((x) => x.session === 'mid_week')!;
    const a = skipSession(b, { breaches: 0 });
    expect(a.events.filter((e) => e.to === 'C11').length).toBe(1);
    expect(a.events.filter((e) => e.to === 'L6').length).toBe(1);
    expect(a.events[0]!.effect).toBe('warning');
    expect(skipSession(b, a.season).events[0]!.effect).toBe('fine_scale');
  });
  it('the production meeting is optional: goodwill only', () => {
    const b = allBlocks(proWeek()).find((x) => x.session === 'production_meeting')!;
    expect(skipSession(b, { breaches: 0 }).events.map((e) => e.to)).toEqual(['L6']);
  });
  it('conference championship week needs Wednesday to Friday', () => {
    expect(mediaFindings(proWeek({ playoff: true }), proRules, 'conference_championship').map((f) => f.ruleId)).toEqual(['media.conference_championship']);
  });
  it('coordinators speak on a day the head coach does not', () => {
    expect(coordinatorProblems(proWeek(), proRules)).toEqual([]);
  });
  it('the college week holds its weekly conference and reads no pro value', () => {
    expect(mediaFindings(collegeWeek(), collegeRules)).toEqual([]);
    expect(collegeRules('media.head_coach_days_per_week')).toBeUndefined();
  });
});

describe('what the coach says (H7.2)', () => {
  it('every answer writes one statement and events only to its audiences; bland has no relationship effect', () => {
    const r = answer('loss', 'blame_player', at(SUN, 15));
    expect(r.statement.audiences).toEqual(['players', 'media']);
    expect(r.events.map((e) => e.to)).toEqual(['L1', 'L6']);
    const b = answer('loss', 'bland', at(SUN, 15));
    expect(b.events.every((e) => e.effect === 'tally')).toBe(true);
    expect(answer('x', 'take_blame', at(SUN, 15), true).events.some((e) => e.to === 'E10')).toBe(true);
  });
  it('a quarterback change is always the top topic', () => {
    expect(questions([{ topic: 'star_injury', daysAgo: 0 }, { topic: 'qb_change', daysAgo: 0 }, { topic: 'losing_streak', daysAgo: 0 }], 15)[0]).toBe('qb_change');
    expect(topicScore('qb_change', 3)).toBe(5);
  });
  it('leaks rise with people who know and with lower trust', () => {
    expect(leakChance(5, 0.5)).toBeGreaterThan(leakChance(2, 0.5));
    expect(leakChance(5, 0.2)).toBeGreaterThan(leakChance(5, 0.8));
    const s = rng(3);
    let low = 0, high = 0;
    for (let i = 0; i < 1000; i++) { if (s.chance(leakChance(4, 0.2))) low++; if (s.chance(leakChance(4, 0.8))) high++; }
    expect(low).toBeGreaterThan(high);
  });
  it('off-message quotes rise as trust falls', () => {
    const s = rng(4);
    let lowTrust = 0, highTrust = 0;
    for (let i = 0; i < 1000; i++) { if (s.chance(offMessageChance(0.1, 0.5, 0.5, false, false))) lowTrust++; if (s.chance(offMessageChance(0.9, 0.5, 0.5, false, false))) highTrust++; }
    expect(lowTrust).toBeGreaterThan(highTrust);
  });
  it('injury answers never include mental health; college without a report has no "refer"', () => {
    expect(injuryAnswers(proRules)).toEqual(['refer_to_report', 'decline', 'honest_outlook']);
    expect(injuryAnswers(collegeRules)).toEqual(['decline', 'honest_outlook']);
  });
  it('naming an unsigned recruit is offered as a violation at college level only', () => {
    expect(recruitComment(collegeRules, collegeWeek()).request!.classId).toBe('recruiting_contact');
    expect(recruitComment(proRules, proWeek()).violation).toBe(false);
  });
  it('promises, officials, appearances', () => {
    expect(brokenPromise(100, 150)).toBe(true);
    expect(brokenPromise(100, 170)).toBe(false);
    expect(criticiseOfficials(false).length).toBe(1);
    expect(criticiseOfficials(true).length).toBe(2);
    expect(appearanceAllowed(at(SUN - 1, 14), at(SUN, 13))).toBe(false);
    expect(appearanceAllowed(at(SUN - 2, 12), at(SUN, 13))).toBe(true);
    expect(skipAppearance(2, false).events.some((e) => e.to === 'E3')).toBe(true);
    expect(skipAppearance(0, true).goodwill).toBe(0.5);
  });
});
