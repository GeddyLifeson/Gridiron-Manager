// E6.1.1 the balance sheet and the monthly cycle. Every dollar in or out is a ledger entry; for every
// account, opening balance plus that month's entries equals the closing balance to the cent.
import { param } from './params.ts';
import { holdingsTotal, applyMonthlyReturns, contribute, sellForCash, type Holdings, type YearReturns } from './invest.ts';
import { payMortgage, type Home, type Lease } from './housing.ts';
import { roundCents, type Cents } from './money.ts';
import type { AssetClass } from './params.ts';

export type Account = 'cash' | 'taxable' | 'retirement' | 'real_estate' | 'liabilities';

export type EntryCategory =
  | 'pay' | 'other_income' | 'withholding' | 'tax_settlement' | 'retirement_contribution'
  | 'rent' | 'mortgage_interest' | 'mortgage_principal' | 'living' | 'debt_interest' | 'debt_principal'
  | 'fees' | 'savings_transfer' | 'returns' | 'shortfall_sale' | 'home_purchase' | 'home_sale' | 'revaluation' | 'new_debt';

export interface LedgerEntry {
  readonly month: number;
  readonly account: Account;
  readonly category: EntryCategory;
  /** Signed change to the account's balance; for `liabilities` a positive amount reduces what is owed. */
  readonly amountCents: Cents;
  readonly source: string;
}

export interface Liability {
  readonly id: string;
  readonly kind: 'student' | 'personal' | 'sale_shortfall' | 'tax_due';
  readonly balanceCents: Cents;
  readonly annualRate: number;
  readonly monthlyPaymentCents: Cents;
}

export interface BalanceSheet {
  readonly cash: Cents;
  readonly taxable: Holdings;
  readonly retirement: Holdings;
  readonly homes: readonly Home[];
  readonly leases: readonly Lease[];
  readonly liabilities: readonly Liability[];
  /** Consecutive months that closed short (rule 4; three is a default, E6.6.4). */
  readonly shortMonths: number;
}

export type WealthEvent =
  | { readonly kind: 'cash_shortfall'; readonly month: number; readonly shortCents: Cents }
  | { readonly kind: 'default'; readonly month: number }
  | { readonly kind: 'panic_prompt'; readonly month: number };

export function emptySheet(cash: Cents = 0): BalanceSheet {
  return { cash, taxable: {}, retirement: {}, homes: [], leases: [], liabilities: [], shortMonths: 0 };
}

/** Balance of one account (liabilities as a negative number). */
export function accountBalance(s: BalanceSheet, a: Account): Cents {
  switch (a) {
    case 'cash': return s.cash;
    case 'taxable': return holdingsTotal(s.taxable);
    case 'retirement': return holdingsTotal(s.retirement);
    case 'real_estate': return s.homes.reduce((x, h) => x + h.valueCents, 0);
    case 'liabilities': return -(s.homes.reduce((x, h) => x + h.mortgageBalanceCents, 0) + s.liabilities.reduce((x, l) => x + l.balanceCents, 0));
  }
}

export const ACCOUNTS: readonly Account[] = ['cash', 'taxable', 'retirement', 'real_estate', 'liabilities'];

/** Rule 3: net worth = assets at current value - liabilities. */
export function netWorth(s: BalanceSheet): Cents {
  return ACCOUNTS.reduce((x, a) => x + accountBalance(s, a), 0);
}

export interface MonthInputs {
  readonly month: number;
  /** Wages paid this month (salary, incentives, termination pay after offset, stipend). */
  readonly wagesCents: Cents;
  /** Income with no withholding (outside deals, partner income is added here as household income). */
  readonly otherIncomeCents: Cents;
  readonly withholdingCents: Cents;
  /** Pre-tax plan contribution taken from pay (E6.9.1). */
  readonly retirementContribCents: Cents;
  readonly livingCostCents: Cents;
  readonly feesCents: Cents;
  /** Positive: tax owed at settlement; negative: refund. Zero outside the tax month. */
  readonly taxSettlementCents: Cents;
  /** Share of this month's take-home moved to taxable investments (E6.6.2). */
  readonly savingsRate: number;
  readonly target: Readonly<Partial<Record<AssetClass, number>>>;
  readonly returns: YearReturns;
}

export interface MonthResult {
  readonly sheet: BalanceSheet;
  readonly entries: readonly LedgerEntry[];
  readonly events: readonly WealthEvent[];
  readonly netWorthCents: Cents;
}

/** Rule 2: on the first of each month, in order: pay, tax, housing, living, debt, fees, contributions,
 *  returns, entries, net worth. Rule 4 shortfall handling closes the month. */
export function closeMonth(s0: BalanceSheet, inp: MonthInputs): MonthResult {
  const m = inp.month;
  const entries: LedgerEntry[] = [];
  const events: WealthEvent[] = [];
  let cash = s0.cash;
  const add = (account: Account, category: EntryCategory, amount: Cents, source: string) => {
    if (amount === 0) return;
    entries.push({ month: m, account, category, amountCents: amount, source });
    if (account === 'cash') cash += amount;
  };

  // 1. Pay and other income.
  add('cash', 'pay', inp.wagesCents, 'employer');
  add('cash', 'other_income', inp.otherIncomeCents, 'outside');
  // 2. Tax withheld; plan contribution moves from pay to the retirement account.
  add('cash', 'withholding', -inp.withholdingCents, 'tax');
  let retirement: Holdings = s0.retirement;
  if (inp.retirementContribCents > 0) {
    add('cash', 'retirement_contribution', -inp.retirementContribCents, 'plan');
    retirement = contribute(retirement, inp.retirementContribCents, inp.target);
    add('retirement', 'retirement_contribution', inp.retirementContribCents, 'plan');
  }
  add('cash', 'tax_settlement', -inp.taxSettlementCents, 'tax');
  // 3. Housing.
  const leases = s0.leases.map((l) => {
    add('cash', 'rent', -l.monthlyRentCents, l.id);
    return { ...l, monthsLeft: Math.max(0, l.monthsLeft - 1) };
  });
  const homes = s0.homes.map((h) => {
    const r = payMortgage(h);
    add('cash', 'mortgage_interest', -r.interestCents, h.id);
    add('cash', 'mortgage_principal', -r.principalCents, h.id);
    add('liabilities', 'mortgage_principal', r.principalCents, h.id);
    return r.home;
  });
  // 4. Living costs.
  add('cash', 'living', -inp.livingCostCents, 'household');
  // 5. Debt service.
  const liabilities = s0.liabilities.map((l) => {
    if (l.balanceCents <= 0) return l;
    const interest = roundCents((l.balanceCents * l.annualRate) / 12);
    const pay = Math.min(l.monthlyPaymentCents, l.balanceCents + interest);
    add('cash', 'debt_interest', -interest, l.id);
    add('cash', 'debt_principal', -(pay - interest), l.id);
    add('liabilities', 'debt_principal', pay - interest, l.id);
    return { ...l, balanceCents: l.balanceCents - (pay - interest) };
  });
  // 6. Fees.
  add('cash', 'fees', -inp.feesCents, 'fees');
  // 7. Scheduled contributions, keeping the emergency reserve in cash (E6.6.2 rule 4).
  let taxable: Holdings = s0.taxable;
  const monthlyCosts = inp.livingCostCents + s0.leases.reduce((x, l) => x + l.monthlyRentCents, 0) + s0.homes.reduce((x, h) => x + h.monthlyPaymentCents, 0);
  const reserve = monthlyCosts * param('emergencyReserveMonths');
  const takeHome = inp.wagesCents + inp.otherIncomeCents - inp.withholdingCents - inp.retirementContribCents;
  const wanted = roundCents(Math.max(0, takeHome) * inp.savingsRate);
  // Savings above what cash flow allows are cut to the feasible amount (E6.6.2 edge case).
  const saving = Math.max(0, Math.min(wanted, cash - reserve));
  if (saving > 0) {
    add('cash', 'savings_transfer', -saving, 'autopilot');
    taxable = contribute(taxable, saving, inp.target);
    add('taxable', 'savings_transfer', saving, 'autopilot');
  }
  // 8. Asset returns, the monthly share of the year's draw.
  const t = applyMonthlyReturns(taxable, inp.returns);
  taxable = t.holdings;
  add('taxable', 'returns', t.changeCents, 'market');
  const r = applyMonthlyReturns(retirement, inp.returns);
  retirement = r.holdings;
  add('retirement', 'returns', r.changeCents, 'market');
  // Rule 4: shortfall sells taxable holdings, most liquid first, then offers the user a choice.
  let shortMonths = 0;
  if (cash < 0) {
    const sold = sellForCash(taxable, -cash);
    taxable = sold.holdings;
    add('taxable', 'shortfall_sale', -sold.raisedCents, 'shortfall');
    add('cash', 'shortfall_sale', sold.raisedCents, 'shortfall');
    if (cash < 0) {
      shortMonths = s0.shortMonths + 1;
      events.push({ kind: 'cash_shortfall', month: m, shortCents: -cash });
      if (shortMonths >= param('shortfallDefaultMonths')) events.push({ kind: 'default', month: m });
    }
  }
  const sheet: BalanceSheet = { cash, taxable, retirement, homes, leases, liabilities, shortMonths };
  return { sheet, entries, events, netWorthCents: netWorth(sheet) };
}

/** E6.1.1 acceptance 1: per account, opening + entries = closing. Returns the accounts that do not tie. */
export function reconcile(open: BalanceSheet, close: BalanceSheet, entries: readonly LedgerEntry[]): Account[] {
  return ACCOUNTS.filter((a) => accountBalance(open, a) + entries.filter((e) => e.account === a).reduce((x, e) => x + e.amountCents, 0) !== accountBalance(close, a));
}

/** Once a year: rebalance both accounts to target (E6.6.2 rule 2) and revalue homes (E6.4.1 rule 3). */
export function closeYear(s: BalanceSheet, month: number, target: Readonly<Partial<Record<AssetClass, number>>>, housingReturn: number, rebalanceFn: (h: Holdings, t: Readonly<Partial<Record<AssetClass, number>>>) => Holdings): MonthResult {
  const entries: LedgerEntry[] = [];
  const homes = s.homes.map((h) => {
    const v = roundCents(h.valueCents * (1 + housingReturn));
    if (v !== h.valueCents) entries.push({ month, account: 'real_estate', category: 'revaluation', amountCents: v - h.valueCents, source: h.id });
    return { ...h, valueCents: v };
  });
  const sheet: BalanceSheet = { ...s, homes, taxable: rebalanceFn(s.taxable, target), retirement: rebalanceFn(s.retirement, target) };
  return { sheet, entries, events: [], netWorthCents: netWorth(sheet) };
}

/** Record a purchase: upfront cash leaves, the home and its mortgage arrive. */
export function recordPurchase(s: BalanceSheet, month: number, home: Home, cashOutCents: Cents): MonthResult {
  const entries: LedgerEntry[] = [
    { month, account: 'cash', category: 'home_purchase', amountCents: -cashOutCents, source: home.id },
    { month, account: 'real_estate', category: 'home_purchase', amountCents: home.valueCents, source: home.id },
    { month, account: 'liabilities', category: 'new_debt', amountCents: -home.mortgageBalanceCents, source: home.id },
  ];
  const sheet: BalanceSheet = { ...s, cash: s.cash - cashOutCents, homes: [...s.homes, home] };
  return { sheet, entries, events: [], netWorthCents: netWorth(sheet) };
}

/** Record a sale (E6.4.2): the home and its mortgage leave; proceeds arrive, or a debt for the gap. */
export function recordSale(s: BalanceSheet, month: number, homeId: string, sale: { salePriceCents: Cents; sellingCostCents: Cents; proceedsCents: Cents; shortfallDebtCents: Cents }, debtRate: number, debtPaymentCents: Cents): MonthResult {
  const home = s.homes.find((h) => h.id === homeId);
  if (!home) throw new Error(`wealth: no home ${homeId}`);
  const entries: LedgerEntry[] = [
    { month, account: 'real_estate', category: 'home_sale', amountCents: -home.valueCents, source: homeId },
    { month, account: 'liabilities', category: 'home_sale', amountCents: home.mortgageBalanceCents, source: homeId },
  ];
  let cash = s.cash;
  const liabilities = [...s.liabilities];
  if (sale.proceedsCents >= 0) {
    entries.push({ month, account: 'cash', category: 'home_sale', amountCents: sale.proceedsCents, source: homeId });
    cash += sale.proceedsCents;
  } else {
    entries.push({ month, account: 'liabilities', category: 'new_debt', amountCents: -sale.shortfallDebtCents, source: homeId });
    liabilities.push({ id: `${homeId}-shortfall`, kind: 'sale_shortfall', balanceCents: sale.shortfallDebtCents, annualRate: debtRate, monthlyPaymentCents: debtPaymentCents });
  }
  const sheet: BalanceSheet = { ...s, cash, homes: s.homes.filter((h) => h.id !== homeId), liabilities };
  return { sheet, entries, events: [], netWorthCents: netWorth(sheet) };
}
