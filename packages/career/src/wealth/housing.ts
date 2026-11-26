// E6.4 Housing in each job: rent or buy (E6.4.1), selling after a firing and carrying two homes (E6.4.2).
// Housing never touches football (rule 6); it reaches only cash, net worth and E8's household view.
import { param, type LifestyleTier } from './params.ts';
import { dollars, roundCents, compound, type Cents } from './money.ts';
import type { WealthRandom } from './invest.ts';

export interface LocationPrices {
  /** Multipliers on the tier bases for this place (U4 generated locations carry them). */
  readonly homePriceIndex: number;
  readonly rentIndex: number;
}

export interface Home {
  readonly id: string;
  readonly valueCents: Cents;
  readonly mortgageBalanceCents: Cents;
  readonly monthlyPaymentCents: Cents;
  readonly annualRate: number;
  readonly monthsLeft: number;
}

export interface Lease { readonly id: string; readonly monthlyRentCents: Cents; readonly monthsLeft: number }

export function monthlyRent(tier: LifestyleTier, loc: LocationPrices): Cents {
  return dollars(param(`tierRent.${tier}`) * loc.rentIndex);
}

export function homePrice(tier: LifestyleTier, loc: LocationPrices): Cents {
  return dollars(param(`tierHome.${tier}`) * loc.homePriceIndex);
}

/** Level payment on a fixed-rate loan: P r / (1 - (1 + r)^-n). */
export function mortgagePayment(principal: Cents, annualRate: number, months: number): Cents {
  if (principal <= 0) return 0;
  const r = annualRate / 12;
  if (r === 0) return roundCents(principal / months);
  return roundCents((principal * r) / (1 - 1 / compound(r, months)));
}

export interface BuyQuote {
  readonly priceCents: Cents;
  readonly downCents: Cents;
  readonly closingCents: Cents;
  /** Cash that leaves the account on purchase (E6.4.1 acceptance). */
  readonly upfrontCents: Cents;
  readonly loanCents: Cents;
  readonly monthlyPaymentCents: Cents;
  readonly qualifies: boolean;
  readonly affordable: boolean;
}

export function quoteBuy(tier: LifestyleTier, loc: LocationPrices, grossMonthlyIncome: Cents, cash: Cents, annualRate = param('mortgageRate')): BuyQuote {
  const price = homePrice(tier, loc);
  const down = roundCents(price * param('downPaymentShare'));
  const closing = roundCents(price * param('closingCostShare'));
  const loan = price - down;
  const payment = mortgagePayment(loan, annualRate, param('mortgageTermMonths'));
  const qualifies = payment <= grossMonthlyIncome * param('mortgageQualifyingShare');
  return { priceCents: price, downCents: down, closingCents: closing, upfrontCents: down + closing, loanCents: loan, monthlyPaymentCents: payment, qualifies, affordable: cash >= down + closing };
}

/** Buy: refused when the payment exceeds the qualifying share or cash is short. */
export function buyHome(id: string, q: BuyQuote, annualRate = param('mortgageRate')): { home: Home; cashOutCents: Cents } {
  if (!q.qualifies) throw new Error('wealth: payment exceeds the qualifying share of income');
  if (!q.affordable) throw new Error('wealth: not enough cash for the down payment and closing costs');
  return {
    home: { id, valueCents: q.priceCents, mortgageBalanceCents: q.loanCents, monthlyPaymentCents: q.monthlyPaymentCents, annualRate, monthsLeft: param('mortgageTermMonths') },
    cashOutCents: q.upfrontCents,
  };
}

/** One month of amortisation. Returns the interest and principal parts of the payment. */
export function payMortgage(h: Home): { home: Home; interestCents: Cents; principalCents: Cents; paidCents: Cents } {
  if (h.mortgageBalanceCents <= 0) return { home: h, interestCents: 0, principalCents: 0, paidCents: 0 };
  const interest = roundCents((h.mortgageBalanceCents * h.annualRate) / 12);
  const pay = Math.min(h.monthlyPaymentCents, h.mortgageBalanceCents + interest);
  const principal = pay - interest;
  return {
    home: { ...h, mortgageBalanceCents: h.mortgageBalanceCents - principal, monthsLeft: Math.max(0, h.monthsLeft - 1) },
    interestCents: interest, principalCents: principal, paidCents: pay,
  };
}

/** Rule 3: home value changes once a year by the location's housing draw. */
export function revalueHome(h: Home, yearReturn: number): Home {
  return { ...h, valueCents: roundCents(h.valueCents * (1 + yearReturn)) };
}

export function signLease(id: string, tier: LifestyleTier, loc: LocationPrices): Lease {
  return { id, monthlyRentCents: monthlyRent(tier, loc), monthsLeft: param('leaseMonths') };
}

/** Rule 4: leaving early costs two months' rent (none once the lease has run out). */
export function breakLeaseCost(l: Lease): Cents {
  return l.monthsLeft > 0 ? l.monthlyRentCents * param('leaseBreakMonthsRent') : 0;
}

export interface WhatIfRow { readonly years: number; readonly buyNetCostCents: Cents; readonly rentCostCents: Cents }

/** Rule 5: buying against renting at 1, 3 and 5 years, plain arithmetic at an expected yearly
 *  appreciation. Net cost of buying = upfront + payments - (sale price less selling costs - balance left). */
export function rentVsBuy(q: BuyQuote, rentMonthly: Cents, expectedAppreciation: number, annualRate = param('mortgageRate'), horizons: readonly number[] = [1, 3, 5]): WhatIfRow[] {
  return horizons.map((years) => {
    let home: Home = { id: 'what-if', valueCents: q.priceCents, mortgageBalanceCents: q.loanCents, monthlyPaymentCents: q.monthlyPaymentCents, annualRate, monthsLeft: param('mortgageTermMonths') };
    let paid = 0;
    for (let m = 0; m < years * 12; m++) {
      const r = payMortgage(home);
      home = r.home;
      paid += r.paidCents;
    }
    const value = roundCents(q.priceCents * compound(expectedAppreciation, years));
    const net = value - roundCents(value * param('sellingCostShare')) - home.mortgageBalanceCents;
    return { years, buyNetCostCents: q.upfrontCents + paid - net, rentCostCents: rentMonthly * years * 12 };
  });
}

export type MarketState = 'hot' | 'normal' | 'slow';

export interface SaleResult {
  readonly salePriceCents: Cents;
  readonly sellingCostCents: Cents;
  /** Price less selling costs less the mortgage. Negative means the coach owes the difference (rule 6). */
  readonly proceedsCents: Cents;
  /** Debt created when the sale does not cover the mortgage (E6.6.4). */
  readonly shortfallDebtCents: Cents;
  readonly closesInMonths: number;
}

function saleAt(h: Home, price: Cents, months: number): SaleResult {
  const cost = roundCents(price * param('sellingCostShare'));
  const proceeds = price - cost - h.mortgageBalanceCents;
  return { salePriceCents: price, sellingCostCents: cost, proceedsCents: proceeds, shortfallDebtCents: proceeds < 0 ? -proceeds : 0, closesInMonths: months };
}

/** Rule 2: sell now at the market factor, closing in two months. */
export function sellNow(h: Home, market: MarketState): SaleResult {
  return saleAt(h, roundCents(h.valueCents * param(`sellNowFactor.${market}`)), param('sellNowMonths'));
}

/** Rule 3: list and wait. One draw per month; a sale is at full value. Consumes exactly one uniform. */
export function listedMonth(h: Home, market: MarketState, rng: WealthRandom): SaleResult | undefined {
  return rng.uniform() < param(`listSaleChance.${market}`) ? saleAt(h, h.valueCents, 0) : undefined;
}

/** Rule 4: rent it out. Monthly income net of management, averaged over a vacancy month a year. */
export function rentOutMonthly(tier: LifestyleTier, loc: LocationPrices): Cents {
  const gross = monthlyRent(tier, loc) * param('rentOutShare');
  const net = gross * (1 - param('rentOutManagementShare'));
  return roundCents((net * (12 - param('rentOutVacancyMonthsPerYear'))) / 12);
}

/** Rule 5: months of runway while carrying two homes. */
export function runwayMonths(cash: Cents, monthlyNetFlow: Cents): number {
  if (monthlyNetFlow >= 0) return Number.POSITIVE_INFINITY;
  return Math.floor(cash / -monthlyNetFlow);
}
