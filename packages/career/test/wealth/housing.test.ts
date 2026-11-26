// E6.4.1 and E6.4.2 acceptance.
import { describe, expect, it } from 'vitest';
import { quoteBuy, buyHome, mortgagePayment, payMortgage, sellNow, listedMonth, rentOutMonthly, breakLeaseCost, signLease, rentVsBuy, recordPurchase, recordSale, emptySheet, reconcile, dollars, param, monthlyRent, type Home, type MarketState } from '../../src/wealth/index.ts';

const LOC = { homePriceIndex: 1, rentIndex: 1 };

describe('E6.4.1 rent or buy', () => {
  it('mortgage payment matches the annuity formula', () => {
    const P = 400000, r = 0.065 / 12, n = 360;
    const want = (P * r) / (1 - Math.pow(1 + r, -n));
    expect(Math.abs(mortgagePayment(dollars(P), 0.065, n) / 100 - want)).toBeLessThan(0.01);
  });
  it('the up-front cash shown equals what leaves the cash account on purchase (acceptance)', () => {
    const q = quoteBuy('modest', LOC, dollars(20000), dollars(200000));
    const s0 = emptySheet(dollars(200000));
    const b = buyHome('h1', q);
    const r = recordPurchase(s0, 0, b.home, b.cashOutCents);
    expect(s0.cash - r.sheet.cash).toBe(q.upfrontCents);
    expect(q.upfrontCents).toBe(q.downCents + q.closingCents);
    expect(reconcile(s0, r.sheet, r.entries)).toEqual([]);
  });
  it('a coach whose payment would exceed the qualifying share cannot buy at that tier (acceptance)', () => {
    const q = quoteBuy('lavish', LOC, dollars(10000), dollars(10_000_000));
    expect(q.qualifies).toBe(false);
    expect(() => buyHome('h', q)).toThrow();
  });
  it('the mortgage amortises to zero over its term', () => {
    const q = quoteBuy('modest', LOC, dollars(20000), dollars(200000));
    let h = buyHome('h', q).home;
    for (let i = 0; i < param('mortgageTermMonths'); i++) h = payMortgage(h).home;
    expect(Math.abs(h.mortgageBalanceCents)).toBeLessThan(dollars(5));
  });
  it('leaving a lease early costs two months of rent', () => {
    const l = signLease('l', 'comfortable', LOC);
    expect(breakLeaseCost(l)).toBe(monthlyRent('comfortable', LOC) * 2);
    expect(breakLeaseCost({ ...l, monthsLeft: 0 })).toBe(0);
  });
  it('the what-if panel gives a row per horizon and buying gets relatively cheaper with time', () => {
    const q = quoteBuy('comfortable', LOC, dollars(30000), dollars(500000));
    const rows = rentVsBuy(q, monthlyRent('comfortable', LOC), 0.0438);
    expect(rows.map((x) => x.years)).toEqual([1, 3, 5]);
    const gap = rows.map((x) => x.buyNetCostCents - x.rentCostCents);
    expect(gap[2]!).toBeLessThan(gap[0]!);
  });
});

describe('E6.4.2 selling after a firing and carrying two homes', () => {
  const home: Home = { id: 'h', valueCents: dollars(500000), mortgageBalanceCents: dollars(300000), monthlyPaymentCents: dollars(2000), annualRate: 0.065, monthsLeft: 300 };
  it('proceeds = price x market factor - selling costs - mortgage, in every market (acceptance)', () => {
    for (const m of ['hot', 'normal', 'slow'] as MarketState[]) {
      const s = sellNow(home, m);
      const price = Math.round(500000 * param(`sellNowFactor.${m}`) * 100);
      const cost = Math.round(price * 0.06);
      expect(s.proceedsCents).toBe(price - cost - home.mortgageBalanceCents);
    }
  });
  it('a sale below the mortgage creates a debt for the difference', () => {
    const under = { ...home, mortgageBalanceCents: dollars(495000) };
    const s = sellNow(under, 'slow');
    expect(s.shortfallDebtCents).toBe(-s.proceedsCents);
    const s0 = { ...emptySheet(0), homes: [under] };
    const r = recordSale(s0, 1, 'h', s, 0.1, dollars(500));
    expect(r.sheet.liabilities[0]!.balanceCents).toBe(s.shortfallDebtCents);
    expect(reconcile(s0, r.sheet, r.entries)).toEqual([]);
  });
  it('list and wait sells at full value when the monthly draw lands', () => {
    const yes = listedMonth(home, 'normal', { uniform: () => 0.1, normal: () => 0 });
    const no = listedMonth(home, 'normal', { uniform: () => 0.9, normal: () => 0 });
    expect(yes?.salePriceCents).toBe(home.valueCents);
    expect(no).toBeUndefined();
  });
  it('renting it out pays 80% of local rent less 10% management, with a vacancy month a year', () => {
    const want = Math.round(((monthlyRent('modest', LOC) * 0.8 * 0.9) * 11) / 12);
    expect(rentOutMonthly('modest', LOC)).toBe(want);
  });
});
