// E6.9.2 target number and security status; E6.3.1 lifestyle tiers.
import { describe, expect, it } from 'vitest';
import { security, monthlyLivingCost, chooseTier, tickTier, dollars, param, TIERS } from '../../src/wealth/index.ts';

describe('E6.9.2 security status', () => {
  const spend = dollars(100000);
  it('target = yearly spending / safe withdrawal rate (3.9%, 2 of 3)', () => {
    expect(security({ investableCents: 0, guaranteedPvCents: 0, yearlySpendingCents: spend }).targetCents).toBe(Math.round(spend / 0.039));
  });
  it('statuses at each threshold', () => {
    const target = Math.round(spend / 0.039);
    const at = (have: number) => security({ investableCents: have, guaranteedPvCents: 0, yearlySpendingCents: spend }).status;
    expect(at(target)).toBe('secure');
    expect(at(Math.ceil(target / 2))).toBe('comfortable');
    expect(at(spend * 3)).toBe('short_runway');
    expect(at(spend / 2)).toBe('insecure');
  });
  it('guaranteed income counts toward security', () => {
    expect(security({ investableCents: 0, guaranteedPvCents: dollars(5_000_000), yearlySpendingCents: spend }).status).toBe('secure');
  });
});

describe('E6.3.1 lifestyle tiers', () => {
  it('monthly cost equals the formula for every tier and location in a test grid (acceptance)', () => {
    for (const t of TIERS) for (const col of [0.84, 1, 1.16]) for (const h of [{ partner: false, children: 0 }, { partner: true, children: 2 }]) {
      const f = 1 + (h.partner ? 0.5 : 0) + 0.3 * h.children;
      expect(monthlyLivingCost(t, col, h)).toBe(Math.round(param(`tierBase.${t}`) * col * f * 100));
    }
  });
  it('a downward change takes effect on the configured delay; upward is immediate (acceptance)', () => {
    let s = chooseTier({ tier: 'affluent' }, 'modest');
    for (let i = 0; i < param('tierDownDelayMonths') - 1; i++) { s = tickTier(s); expect(s.tier).toBe('affluent'); }
    s = tickTier(s);
    expect(s.tier).toBe('modest');
    expect(chooseTier(s, 'lavish').tier).toBe('lavish');
  });
});
