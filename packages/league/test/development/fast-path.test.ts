// The one-copy developYear must give exactly the block the step-by-step reference gives (same draws, same
// arithmetic): the world's history hash depends on it.
import { describe, expect, it } from 'vitest';
import { POSITION_FAMILIES, defaultYearPlan } from '../../src/development/index.ts';
import { developYear, developYearByStep } from '../../src/development/season.ts';
import { MATH, N, makePlayer, rng } from './helpers.ts';

describe('developYear fast path', () => {
  it('equals the step-by-step reference for every family, age, role and load', () => {
    for (const f of POSITION_FAMILIES) {
      for (const age of [17, 19, 22, 25, 29, 33, 38]) {
        for (let i = 0; i < 3; i++) {
          let a = makePlayer(rng(5, 'fast', f, age, i), { family: f, ageYears: age });
          let b = a;
          for (let y = 0; y < 3; y++) {
            const role = (i + y) % 2 === 0 ? 'starter' : 'backup';
            const heavy = y === 1;
            const facets = { work_habits: 20 + i * 30, coachability: 80 - i * 25 };
            const plan = defaultYearPlan(N, role);
            a = developYear(N, MATH, { position: f, ageYears: age + y, playing: a, facets }, plan, (k) => rng(9, f, age, i, y, k), heavy);
            b = developYearByStep(N, MATH, { position: f, ageYears: age + y, playing: b, facets }, plan, (k) => rng(9, f, age, i, y, k), heavy);
            expect(a).toStrictEqual(b);
          }
        }
      }
    }
  });

  it('honours coaching points, teaching and freshness like the reference', () => {
    const f = POSITION_FAMILIES[0]!;
    const p = makePlayer(rng(6, 'fast2'), { family: f, ageYears: 23 });
    const ids = Object.keys(p.attributes).sort();
    const plan = defaultYearPlan(N, 'starter').map((w, i) => ({
      ...w, coachingPoints: [ids[i]!, 'decision_risk'] as never, teaching: { [ids[i + 3]!]: 1.4 } as never, freshness: 0.7 + i * 0.1,
    }));
    const who = { position: f, ageYears: 23, playing: p, facets: {} };
    expect(developYear(N, MATH, who, plan, (k) => rng(7, k))).toStrictEqual(developYearByStep(N, MATH, who, plan, (k) => rng(7, k)));
  });
});
