import { describe, expect, it } from 'vitest';
import { P, PERIOD_TYPES, cutShort, newPeriod, palette, plannedMinutes, repsInPeriod, tempoMultipliers, transitionMinutes, validatePractice, type Tempo } from '../../src/practice/index.ts';
import { OC, practice, teamPeriod } from './fixtures.ts';

describe('H3.1.1 practice object', () => {
  it('period minutes plus transitions never exceed the block', () => {
    const p = practice([teamPeriod(1, { minutes: 60 }), teamPeriod(2, { minutes: 60, moveField: true })]);
    expect(transitionMinutes(p)).toBe(P('transition_minutes'));
    expect(plannedMinutes(p)).toBe(120 + P('transition_minutes'));
    expect(validatePractice(p, 'pro').map((x) => x.code)).toContain('over_block');
    expect(validatePractice(practice([teamPeriod(1, { minutes: 60 })]), 'pro')).toEqual([]);
  });
  it('refuses broken lengths and numbering, and too many correction flags', () => {
    const p = practice([teamPeriod(1, { minutes: 2.5 }), teamPeriod(3, { corrections: ['a', 'b', 'c'] })]);
    const codes = validatePractice(p, 'pro').map((x) => x.code);
    expect(codes).toEqual(expect.arrayContaining(['bad_minutes', 'numbering', 'too_many_corrections']));
  });
  it('defaults a new period to 5 minutes at thud', () => {
    const per = newPeriod(1, 'individual', OC);
    expect(per.minutes).toBe(P('period_default_minutes'));
    expect(per.tempo).toBe('thud');
  });
  it('weather with no indoor facility loses the periods not yet started', () => {
    const p = practice([teamPeriod(1, { minutes: 10 }), teamPeriod(2, { minutes: 10 }), teamPeriod(3, { minutes: 10 })]);
    const cut = cutShort(p, 15);
    expect(cut.periods.map((x) => x.minutes)).toEqual([10, 5]);
  });
});

describe('H3.1.2 period types', () => {
  it('every configured type is in the palette with its profile; the developmental period is college only', () => {
    expect(palette('college').length).toBe(PERIOD_TYPES.length);
    expect(palette('pro').map((t) => t.id)).not.toContain('developmental');
    for (const t of PERIOD_TYPES) for (const w of [t.knowledge, t.technique, t.load, t.injury]) expect(w).toBeGreaterThanOrEqual(0), expect(w).toBeLessThanOrEqual(P('max_weight'));
  });
});

describe('H3.1.3 tempo and pads', () => {
  it('the same script at walk, jog, thud and live gives load in increasing order and knowledge highest at thud and live', () => {
    const t: Tempo[] = ['walk', 'jog', 'thud', 'live'];
    const m = t.map((x) => tempoMultipliers(x));
    for (let i = 1; i < m.length; i++) expect(m[i]!.load).toBeGreaterThan(m[i - 1]!.load);
    const top = Math.max(...m.map((x) => x.knowledge));
    expect(m[2]!.knowledge).toBe(top);
    expect(m[3]!.knowledge).toBe(top);
    expect(tempoMultipliers('live', true).technique).toBeGreaterThan(tempoMultipliers('live').technique);
  });
});

describe('H3.2.1 rule 1: reps per period', () => {
  it('rep count equals minutes times rate, rounded down', () => {
    const p = practice([]);
    for (const tempo of ['walk', 'jog', 'thud', 'live'] as const) {
      expect(repsInPeriod(teamPeriod(1, { minutes: 7, tempo }), p)).toBe(Math.floor(7 * P(`rate_${tempo}`)));
    }
    expect(repsInPeriod(teamPeriod(1, { minutes: 7, twoMinute: true }), p)).toBe(Math.floor(7 * P('rate_two_minute')));
    expect(repsInPeriod(newPeriod(1, 'individual', OC, { minutes: 10 }), p)).toBe(0);
  });
  it('environment work slows the rep rate (H3.4.1)', () => {
    const plain = repsInPeriod(teamPeriod(1, { minutes: 20 }), practice([]));
    const noisy = repsInPeriod(teamPeriod(1, { minutes: 20 }), practice([], { environment: { indoors: false, noise: true, wetBall: true, silentCount: false, badWeather: false } }));
    expect(noisy).toBe(Math.floor(20 * P('rate_thud') * (1 - 2 * P('environment_rate_slowdown'))));
    expect(noisy).toBeLessThan(plain);
  });
});
