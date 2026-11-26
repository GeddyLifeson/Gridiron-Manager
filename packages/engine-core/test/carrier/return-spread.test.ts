// Returner skill response (J8.6.2, Q1.7.3): real returners differ by about 1.4 yd per punt return and 2.0 yd per
// kickoff return per sd, and their fumble rates hardly differ at all (0.10 logit per sd on punts, none on
// kickoffs; nflverse play-by-play 2018 to 2025, 1 of 3). Measured on 312 tick games at 55 v 45 with return vision
// at full strength the engine gave about 3.4 and 4.4 yd per z, so the grade is damped before it reaches the
// run-vision formulas, and the muff slope sits near the real one.
import { describe, expect, it } from 'vitest';
import { P } from './helpers.ts';
import { horizonS, laneNoiseSdYd } from '../../src/carrier/formulas.ts';

describe('returner skill response', () => {
  it('return vision is damped: one z moves the look horizon and lane noise less than run vision does', () => {
    expect(P['ret.visionZScale']).toBeGreaterThan(0.3);
    expect(P['ret.visionZScale']).toBeLessThan(0.8);
    const zRet = P['ret.visionZScale'];
    expect(horizonS(zRet, P) - horizonS(0, P)).toBeLessThan(horizonS(1, P) - horizonS(0, P));
    expect(laneNoiseSdYd(0, P) - laneNoiseSdYd(zRet, P)).toBeLessThan(laneNoiseSdYd(0, P) - laneNoiseSdYd(1, P));
  });

  it('muffs are mostly luck: one z of catching moves the muff log-odds by at most 0.2', () => {
    expect(Math.abs(P['ret.muffPerZ'])).toBeLessThanOrEqual(0.2);
    expect(P['ret.muffPerZ']).toBeLessThan(0);
  });
});
