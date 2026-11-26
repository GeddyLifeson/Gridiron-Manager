import { describe, expect, it } from 'vitest';
import { DMATH, seedFromHex, stream } from '@gm/engine-core';
import { generator } from '@gm/people';
import { CONTENT, generation, setup, trimmed } from '../fixtures.ts';

// T12.2.1: founding gives college programs different talent. Fit and sources: research/tuning/talent-spread.md.
describe('program strength at founding (T12.2.1)', () => {
  const shares = generation.rosterTierShares(3);

  it('keeps the national tier mix and moves blue chips to strong programs', () => {
    const n = 20000;
    const count = (z: number) => {
      const s = stream(seedFromHex('00000000000000b1'), 'test.tier', [Math.round(z * 100) + 1000]);
      const c = [0, 0, 0, 0, 0];
      for (let i = 0; i < n; i++) c[generation.tierFromProgram(s, z, shares) - 1]!++;
      return c.map((x) => x / n);
    };
    const mid = count(0);
    const strong = count(generation.param('talent.programZCap'));
    const weak = count(-2);
    // A program at z 0 sits near the national mix only for the low tiers; rho moves the top tiers to strong programs.
    expect(strong[3]! + strong[4]!).toBeGreaterThan(0.3);
    expect(weak[3]! + weak[4]!).toBeLessThan(0.002);
    expect(mid[0]! + mid[1]!).toBeGreaterThan(0.5);
    // Averaged over a normal spread of programs the shares come back (Gauss-Hermite style check on a grid).
    const zs = Array.from({ length: 41 }, (_, i) => -4 + i * 0.2);
    const w = zs.map((z) => DMATH.exp(-z * z / 2));
    const tw = w.reduce((a, b) => a + b, 0);
    const rho = generation.param('talent.programRho');
    const blue = zs.reduce((a, z, i) => a + (w[i]! / tw) * (1 - generator.normalCdf((generator.normalInv(1 - shares[3]! - shares[4]!, DMATH) - rho * z) / DMATH.sqrt(1 - rho * rho), DMATH)), 0);
    expect(blue).toBeCloseTo(shares[3]! + shares[4]!, 3);
  });

  it('ranks by prestige, caps the top, and gives the pros no strength', () => {
    const s = setup({ seedHex: '00000000000000a1', size: 'standard' });
    const seed = seedFromHex(s.seedHex);
    const built = generation.buildStructures(s, seed, CONTENT);
    const z = generation.programStrength(seed, CONTENT, built);
    const top = built.competitions.find((c) => c.name === 'college_top')!;
    const second = built.competitions.find((c) => c.name === 'college_second')!;
    const pro = built.competitions.find((c) => c.level === 'pro')!;
    for (const id of pro.teamIds) expect(z.has(id)).toBe(false);
    const zt = top.teamIds.map((id) => z.get(id)!);
    const zs = second.teamIds.map((id) => z.get(id)!);
    expect(Math.min(...zt)).toBeGreaterThan(Math.max(...zs));
    expect(Math.max(...zt)).toBe(generation.param('talent.programZCap'));
    const byId = new Map(built.teams.map((t) => [t.id, t]));
    for (const a of top.teamIds) for (const b of top.teamIds) if (byId.get(a)!.prestige > byId.get(b)!.prestige) expect(z.get(a)!).toBeGreaterThanOrEqual(z.get(b)!);
    // A small world keeps the full world's rank scale: its top programs have the same strength.
    const small = generation.buildStructures({ ...s, size: 'small' }, seed, CONTENT);
    const zSmall = generation.programStrength(seed, CONTENT, small);
    const topSmall = small.competitions.find((c) => c.name === 'college_top')!;
    expect(Math.min(...topSmall.teamIds.map((id) => zSmall.get(id)!))).toBeCloseTo(Math.min(...zt), 9);
  });

  it('a trimmed world with one division still ranks its schools', () => {
    const content = trimmed();
    const s = setup();
    const seed = seedFromHex(s.seedHex);
    const built = generation.buildStructures(s, seed, content);
    const z = generation.programStrength(seed, content, built);
    expect([...z.values()].length).toBe(content.college.schools.length);
  });
});
