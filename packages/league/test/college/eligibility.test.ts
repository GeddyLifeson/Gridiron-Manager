import { describe, expect, it } from 'vitest';
import {
  ageClockStart, ageClockYear, collegeRules, eligibilityStatus, modelsFor, redshirtWatch, satOutChance, seasonUsed, withSeason,
} from '../../src/college/index.ts';
import { RULES, SEASONS_RULES, day, rec, ruleSet, season } from './helpers.ts';
import { PROB_FLOOR } from '@gm/schema';

describe('the redshirt line (T5.2.1 acceptance, seasons model)', () => {
  it('a 2026 enrollee who plays 4 regular-season games and 2 playoff games keeps the season', () => {
    expect(seasonUsed(season(2026, 4, 2), SEASONS_RULES)).toBe(false);
    const r = rec({ seasons: [season(2026, 4, 2)] });
    const st = eligibilityStatus(r, 2027, SEASONS_RULES);
    expect(st.results[0]!.used).toBe(0);
    expect(st.lastSeason).toBe(2030);
  });
  it('a fifth regular-season game uses it', () => {
    expect(seasonUsed(season(2026, 5, 0), SEASONS_RULES)).toBe(true);
    const st = eligibilityStatus(rec({ seasons: [season(2026, 5)] }), 2027, SEASONS_RULES);
    expect(st.results[0]!.used).toBe(1);
  });
  it('postseason games count only when the rule set says so', () => {
    const counting = collegeRules(ruleSet({ 'eligibility.model': 'seasons', 'eligibility.postseason_counts': true }));
    expect(seasonUsed(season(2026, 4, 2), counting)).toBe(true);
  });
  it('the warning shows before the game that would burn the redshirt', () => {
    const r = rec();
    expect(redshirtWatch(r, 2026, 3, SEASONS_RULES)).toMatchObject({ applies: true, gamesBeforeUse: 1, nextGameUsesSeason: false });
    expect(redshirtWatch(r, 2026, 4, SEASONS_RULES)).toMatchObject({ applies: true, gamesBeforeUse: 0, nextGameUsesSeason: true });
    expect(redshirtWatch(r, 2026, 5, SEASONS_RULES).applies).toBe(false);
  });
  it('four seasons in five years: a player who used four is done; the clock ends after five', () => {
    const four = rec({ firstEnrollYear: 2020, seasons: [2020, 2021, 2022, 2023].map((y) => season(y, 10)) });
    expect(eligibilityStatus(four, 2024, SEASONS_RULES)).toMatchObject({ eligible: false, reason: 'seasons_used' });
    const slow = rec({ firstEnrollYear: 2020, seasons: [season(2020, 10)] });
    expect(eligibilityStatus(slow, 2024, SEASONS_RULES).eligible).toBe(true);
    expect(eligibilityStatus(slow, 2025, SEASONS_RULES)).toMatchObject({ eligible: false, reason: 'clock_expired' });
  });
});

describe('the age clock (T5.2.1 clock start detail)', () => {
  it('turning 19 before September 1 starts that fall; on or after starts the next', () => {
    expect(ageClockYear(day(2008, 8, 31), RULES)).toBe(2027);
    expect(ageClockYear(day(2008, 9, 1), RULES)).toBe(2028);
    expect(ageClockYear(day(2008, 2, 29), RULES)).toBe(2027);
  });
  it('full-time enrollment or competing earlier starts it earlier', () => {
    expect(ageClockStart(rec({ birthDay: day(2008, 10, 1), firstEnrollYear: 2026 }), RULES)).toBe(2026);
    expect(ageClockStart(rec({ birthDay: day(2008, 10, 1), firstEnrollYear: 2029, firstCompetedYear: 2027 }), RULES)).toBe(2027);
  });
  it('a fall 2027 enrollee is judged by the age model alone: five years, no redshirt line', () => {
    const r = rec({ birthDay: day(2008, 6, 1), firstEnrollYear: 2027, seasons: [season(2027, 12), season(2028, 12), season(2029, 12), season(2030, 12)] });
    expect(modelsFor(r, 2031, RULES)).toEqual(['age']);
    expect(eligibilityStatus(r, 2031, RULES)).toMatchObject({ eligible: true, governing: 'age', lastSeason: 2031, seasonsLeft: 1 });
    expect(eligibilityStatus(r, 2032, RULES)).toMatchObject({ eligible: false, reason: 'clock_expired' });
    expect(redshirtWatch(rec({ birthDay: day(2008, 6, 1), firstEnrollYear: 2027 }), 2027, 4, RULES).applies).toBe(false);
  });
});

describe('the 2026 transition: better of both (T5.2.1 correction)', () => {
  it('an on-time enrollee: both end in the same year, the age model governs and no redshirt watch shows', () => {
    const r = rec({ birthDay: day(2005, 5, 1), firstEnrollYear: 2024, seasons: [season(2024, 2), season(2025, 12)] });
    const st = eligibilityStatus(r, 2026, RULES);
    expect(st).toMatchObject({ eligible: true, governing: 'age', lastSeason: 2028 });
    expect(redshirtWatch(r, 2026, 2, RULES).applies).toBe(false);
  });
  it('a delayed enrollee whose age clock started early keeps the seasons model and its redshirt watch', () => {
    const r = rec({ birthDay: day(2004, 1, 10), firstEnrollYear: 2025, seasons: [season(2025, 12)] });
    const st = eligibilityStatus(r, 2026, RULES);
    expect(st.results.map((x) => [x.model, x.lastSeason])).toEqual([['seasons', 2028], ['age', 2027]]);
    expect(st).toMatchObject({ governing: 'seasons', lastSeason: 2028 });
    expect(redshirtWatch(r, 2026, 4, RULES).nextGameUsesSeason).toBe(true);
  });
  it('a player who used his final season in 2025-26 gets nothing more', () => {
    const r = rec({ birthDay: day(2003, 3, 1), firstEnrollYear: 2022, seasons: [2022, 2023, 2024, 2025].map((y) => season(y, 12)) });
    expect(modelsFor(r, 2026, RULES)).toEqual(['seasons']);
    expect(eligibilityStatus(r, 2026, RULES)).toMatchObject({ eligible: false, reason: 'seasons_used' });
  });
  it('a 2024 redshirt who never played under the old count gains nothing he should not: age model caps at five years', () => {
    const r = rec({ birthDay: day(2005, 5, 1), firstEnrollYear: 2023, seasons: [season(2023, 3), season(2024, 12), season(2025, 12)] });
    expect(eligibilityStatus(r, 2027, RULES).lastSeason).toBe(2027);
    expect(eligibilityStatus(r, 2028, RULES).eligible).toBe(false);
  });
});

describe('other ends of eligibility', () => {
  it('declaring for the draft ends it (T8.5.1 rule 5)', () => {
    expect(eligibilityStatus(rec({ declared: true }), 2026, RULES)).toMatchObject({ eligible: false, reason: 'declared', seasonsLeft: 0 });
  });
  it('two-year college seasons count against the clock by switch (T6.3.2 rule 1)', () => {
    const r = rec({ firstEnrollYear: 2023, seasons: [season(2023, 10, 0, true), season(2024, 10, 0, true)] });
    expect(eligibilityStatus(r, 2025, SEASONS_RULES).results[0]!.used).toBe(2);
    const off = collegeRules(ruleSet({ 'eligibility.model': 'seasons', 'eligibility.juco_seasons_count': false }));
    expect(eligibilityStatus(r, 2025, off).results[0]!.used).toBe(0);
  });
  it('withSeason records the first competition year', () => {
    const r = withSeason(rec({ firstEnrollYear: 2026 }), season(2026, 1));
    expect(r.firstCompetedYear).toBe(2026);
    expect(withSeason(rec(), season(2026, 0)).firstCompetedYear).toBeNull();
  });
});

describe('the player\'s say at the line (T5.2.2)', () => {
  const base = { origin: 'generated' as const, governing: 'seasons' as const, regularGamesSoFar: 4, satisfaction: 0.1, hasMarket: true, brokenPromises: 1, loyalty: 0.2, positionCoachTie: 0.2 };
  it('an unhappy player with a market can draw from game three to the line', () => {
    expect(satOutChance(base, SEASONS_RULES)).toBeGreaterThan(0);
    expect(satOutChance({ ...base, regularGamesSoFar: 2 }, SEASONS_RULES)).toBeGreaterThan(0);
    expect(satOutChance({ ...base, regularGamesSoFar: 1 }, SEASONS_RULES)).toBe(0);
    expect(satOutChance({ ...base, regularGamesSoFar: 5 }, SEASONS_RULES)).toBe(0);
  });
  it('broken promises raise it; loyalty and a strong tie lower it', () => {
    expect(satOutChance({ ...base, brokenPromises: 2 }, SEASONS_RULES)).toBeGreaterThan(satOutChance(base, SEASONS_RULES));
    expect(satOutChance({ ...base, loyalty: 1, positionCoachTie: 1 }, SEASONS_RULES)).toBeLessThan(satOutChance(base, SEASONS_RULES));
  });
  it('nothing under the age model or for an imported person; only the floor for a content player', () => {
    expect(satOutChance({ ...base, governing: 'age' }, RULES)).toBe(0);
    expect(satOutChance({ ...base, satisfaction: 0.9 }, SEASONS_RULES)).toBe(PROB_FLOOR);
    expect(satOutChance({ ...base, origin: 'imported' }, SEASONS_RULES)).toBe(0);
  });
});
