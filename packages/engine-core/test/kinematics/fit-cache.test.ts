// G-97: the remembered sprint fit and the resolved-parameter memory return exactly what the plain code returns.
import { describe, expect, it } from 'vitest';
import { fitSprint, fitSprintUncached } from '../../src/kinematics/movement-params.ts';
import { PARAMS, kinParams } from '../../src/kinematics/params.ts';
import { paramTableFromFiles } from '../../src/tick/param-util.ts';

describe('sprint fit cache (G-97)', () => {
  const table = paramTableFromFiles([PARAMS]);
  const p = kinParams(table);
  it('returns the same fit as the uncached code, bit for bit, on first and later calls', () => {
    for (let forty = 4.2; forty < 5.6; forty += 0.07) for (const split of [1.45, 1.6, 1.82]) {
      const plain = fitSprintUncached(forty, split, p);
      expect(fitSprint(forty, split, p)).toEqual(plain);
      expect(fitSprint(forty, split, p)).toEqual(plain);
    }
  });
  it('keys the fit on the sub-step and the tau bounds too', () => {
    const a = fitSprint(4.6, 1.6, p, 0.05), b = fitSprint(4.6, 1.6, p, 0.025);
    expect(a).toEqual(fitSprintUncached(4.6, 1.6, p, 0.05));
    expect(b).toEqual(fitSprintUncached(4.6, 1.6, p, 0.025));
    const narrow = { ...p, tauMaxS: 0.4 };
    expect(fitSprint(4.6, 1.6, narrow)).toEqual(fitSprintUncached(4.6, 1.6, narrow));
  });
  it('still returns correct fits after the cache fills and is emptied', () => {
    for (let i = 0; i < 9000; i++) fitSprint(4.2 + i * 1e-4, 1.6, p);
    expect(fitSprint(4.6, 1.6, p)).toEqual(fitSprintUncached(4.6, 1.6, p));
  }, 120_000);
});

describe('resolved parameters (G-97)', () => {
  it('reads a table once and gives the same values, keys and key order as the rows', () => {
    const table = paramTableFromFiles([PARAMS]);
    const p = kinParams(table);
    expect(kinParams(table)).toBe(p);
    expect(Object.keys(p)).toEqual(PARAMS.params.map((r) => r.name.slice('kinematics.'.length)));
    for (const r of PARAMS.params) expect(p[r.name.slice('kinematics.'.length)]).toBe(r.value);
    const other = paramTableFromFiles([PARAMS]);
    expect(kinParams(other)).not.toBe(p);
    expect(kinParams(other)).toEqual(p);
  });
});
