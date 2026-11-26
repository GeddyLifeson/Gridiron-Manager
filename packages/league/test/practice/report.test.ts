import { describe, expect, it } from 'vitest';
import { P, environmentOptions, filmErrors, gamePrep, grades, missChance, newPeriod, resolvePractice, userTeachingTerm, writeReport, teachingTermOf, competitionCost } from '../../src/practice/index.ts';
import { OC, ctx, practice, rng, script, teamPeriod } from './fixtures.ts';

const scripts = new Map([['s-off', script('s-off', 'offense', ['p1', 'p2'], 400)]]);

describe('H3.5.2 report and film', () => {
  const p = practice([teamPeriod(1, { minutes: 200 })], { blockMinutes: 240 });
  const r = resolvePractice({ practice: p, scripts, ctx: ctx(), teachingTerm: () => 1, rng: rng(4), errorChance: () => 0.2, injuryState: () => 0 });
  it('every mental error in the true record is on film', () => {
    expect(filmErrors(r).length).toBe(r.outcomes.filter((o) => o.assignment === 'wrong').length);
  });
  it('the report differs from the true list at the rate implied by staff skill', () => {
    const film = filmErrors(r);
    const key = (e: { period: number; rep: number; personId: string }) => `${e.period}:${e.rep}:${e.personId}`;
    const truth = new Set(film.map(key));
    const perfect = writeReport(p, r, new Map(), () => 1, rng(9));
    const poor = writeReport(p, r, new Map(), () => 0, rng(9));
    const correct = (rep: typeof perfect) => rep.errors.filter((e) => truth.has(key(e))).length / film.length;
    expect(correct(perfect)).toBeGreaterThan(0.99);
    const reported = new Set(poor.errors.map(key));
    const missing = film.filter((e) => !reported.has(key(e))).length / film.length;
    expect(Math.abs(missing - missChance(0))).toBeLessThan(0.05);
    expect(missChance(1)).toBeGreaterThan(0);
  });
  it('grades shown equal the resolver\'s recorded rep outcomes (H3.3.3)', () => {
    const c = practice([newPeriod(1, 'competition', OC, { minutes: 10, groups: ['WR', 'CB'] })]);
    const res = resolvePractice({ practice: c, scripts, ctx: ctx(), teachingTerm: () => 1, rng: rng(2), injuryState: () => 0 });
    const g = grades(res.outcomes);
    const wr0 = res.outcomes.filter((o) => o.personId === 'WR0');
    expect(g.find((x) => x.personId === 'WR0')).toEqual({ personId: 'WR0', position: 'WR', reps: wr0.length, wins: wr0.filter((o) => o.won).length });
    expect(competitionCost(0.7, 2)).toBeCloseTo(0.2, 9);
  });
  it('open competitions unsettle insecure candidates', () => {
    const res = resolvePractice({ practice: practice([teamPeriod(1)]), scripts, ctx: ctx(), teachingTerm: () => 1, rng: rng(2), openPositions: new Set(['QB']), temperament: (id) => ({ competitiveness: 80, security: id === 'QB1' ? 10 : 60 }) });
    expect(res.unsettled).toEqual(['QB1']);
    expect(res.outcomes.filter((o) => o.position === 'QB').every((o) => o.won !== null)).toBe(true);
  });
});

describe('the user\'s coach term (H3.5.1 rule 3, H3.6.2 rule 1)', () => {
  it('default plan is the constant; choices map linearly onto the range', () => {
    expect(userTeachingTerm(null)).toBe(P('user_term_constant'));
    expect(userTeachingTerm({ drillAimed: 1, pointsCorrect: 1, repsToPlayers: 1 })).toBeCloseTo(P('teaching_term_max'), 9);
    expect(userTeachingTerm({ drillAimed: 0, pointsCorrect: 0, repsToPlayers: 0 })).toBeCloseTo(P('teaching_term_min'), 9);
    expect(teachingTermOf(5)).toBe(P('teaching_term_max'));
  });
});

describe('H3.4.1 environment and H3.4.2 mock game', () => {
  it('noise work reduces the road cadence penalty by the configured share; the mock game cuts substitution errors', () => {
    const noisy = practice([], { environment: { indoors: false, noise: true, wetBall: false, silentCount: false, badWeather: false } });
    const mock = practice([], { mockGame: true });
    const f = gamePrep([noisy, mock]);
    expect(f.noiseReduction).toBe(P('noise_reduction_max'));
    expect(f.wetReduction).toBe(0);
    expect(f.substitutionReduction).toBe(P('mock_sub_error_reduction'));
    expect(gamePrep([practice([])]).substitutionReduction).toBe(0);
  });
  it('no indoor facility: the indoor option is absent', () => {
    expect(environmentOptions(false)).not.toContain('indoors');
    expect(environmentOptions(true)).toContain('indoors');
  });
});
