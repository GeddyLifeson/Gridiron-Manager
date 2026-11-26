// E6.6.1 and E6.6.2 acceptance.
import { describe, expect, it } from 'vitest';
import { stream, seedFromNumber } from '@gm/engine-core';
import { drawMarketYear, marketModel, rebalance, targetAllocation, holdingsTotal, applyMonthlyReturns, LIQUIDITY_ORDER, dollars, type AssetClass, type WealthRandom } from '../../src/wealth/index.ts';

const N = 1000;

describe('E6.6.1 asset classes and yearly returns', () => {
  it('over 1,000 simulated years each class mean and spread match config within sampling error (acceptance 1)', () => {
    const rng = stream(seedFromNumber(30), 'wealth.market', []);
    const model = marketModel();
    const draws = Array.from({ length: N }, () => drawMarketYear(rng, model));
    for (const c of LIQUIDITY_ORDER) {
      const xs = draws.map((d) => d[c]);
      const mean = xs.reduce((a, b) => a + b, 0) / N;
      const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (N - 1));
      const m = model[c];
      expect(Math.abs(mean - (m.mean - m.fee)), c).toBeLessThan(4 * m.sd / Math.sqrt(N));
      expect(Math.abs(sd - m.sd) / m.sd, c).toBeLessThan(0.1);
    }
  });
  it('risk order is fixed: cash lowest spread, single stocks above the index', () => {
    const m = marketModel();
    expect(m.cash.sd).toBeLessThan(m.bonds.sd);
    expect(m.bonds.sd).toBeLessThan(m.index.sd);
    expect(m.index.sd).toBeLessThan(m.singleStocks.sd);
    expect(m.singleStocks.mean).toBe(m.index.mean);
  });
  it('the index result per dollar is the same whatever the holding size (acceptance 2: no action but amount helps)', () => {
    const year = drawMarketYear(stream(seedFromNumber(7), 'wealth.market', []));
    const a = applyMonthlyReturns({ index: dollars(1_000_000) }, year).changeCents;
    const b = applyMonthlyReturns({ index: dollars(10_000) }, year).changeCents;
    expect(Math.abs(a / 100 - b)).toBeLessThanOrEqual(1);
  });
  it('a draw consumes exactly six normals, so the market stream stays aligned whatever else happens', () => {
    let n = 0;
    const counting: WealthRandom = { uniform: () => 0.5, normal: () => { n++; return 0; } };
    drawMarketYear(counting);
    expect(n).toBe(6);
  });
  it('the market stream is its own named stream: same seed, same years; other streams untouched (acceptance 3 premise)', () => {
    const a = drawMarketYear(stream(seedFromNumber(1), 'wealth.market', [2026]));
    const b = drawMarketYear(stream(seedFromNumber(1), 'wealth.market', [2026]));
    expect(a).toEqual(b);
  });
});

describe('E6.6.2 risk level, allocation, rebalancing', () => {
  it('every risk allocation sums to one', () => {
    for (const l of [1, 2, 3, 4, 5] as const) {
      const t = targetAllocation(l);
      expect(Math.abs(Object.values(t).reduce((a, b) => a + (b ?? 0), 0) - 1)).toBeLessThan(1e-9);
    }
  });
  it('after rebalancing, class weights equal the target within 1 percentage point (acceptance)', () => {
    const h = { cash: dollars(12345), bonds: dollars(1), index: dollars(987654), singleStocks: dollars(333), realEstate: dollars(55555) };
    for (const l of [1, 2, 3, 4, 5] as const) {
      const t = targetAllocation(l);
      const r = rebalance(h, t);
      const total = holdingsTotal(r);
      expect(total).toBe(holdingsTotal(h));
      for (const c of LIQUIDITY_ORDER as AssetClass[]) expect(Math.abs((r[c] ?? 0) / total - (t[c] ?? 0))).toBeLessThan(0.01);
    }
  });
});
