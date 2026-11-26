// coach.finance (O4.6.2, E6): net worth over time from the E6 balance sheets (`wealth.netWorth`: assets minus
// debts, O4.6.2 acceptance 1), income by source, taxes by place, spending, holdings by class with risk, value
// and last year's return, advisers and their fees, offers waiting for an answer, the plan (saving rate and risk
// level) and a projection that always shows a range (O4.6.2 rule 2). The range comes from the wealth market
// model's means and spreads (E6.4); money never touches football state (O4.6.2 acceptance 2), and this
// builder reads no football table.
import { wealth } from '@gm/career';
import { param } from './params.ts';
import { t } from './text.ts';
import type { FinanceView, MoneyRange } from './types.ts';

type AssetClass = wealth.AssetClass;
const CLASSES: readonly AssetClass[] = ['cash', 'bonds', 'index', 'realEstate', 'singleStocks'];
const SPENDING: readonly wealth.EntryCategory[] = ['rent', 'mortgage_interest', 'living', 'debt_interest', 'fees'];
const INCOME: readonly wealth.EntryCategory[] = ['pay', 'other_income'];
const TAX: readonly wealth.EntryCategory[] = ['withholding', 'tax_settlement'];

export interface FinanceInput {
  readonly rights: readonly string[];
  readonly currency: string;
  /** Month-end (or year-end) balance sheets, oldest first, each with the date text it is shown under. */
  readonly sheets: readonly { readonly date: string; readonly sheet: wealth.BalanceSheet }[];
  /** This year's ledger entries (E6.6). */
  readonly entries: readonly wealth.LedgerEntry[];
  /** Last market year's returns after fees, or null before the first year closes. */
  readonly lastYear: wealth.YearReturns | null;
  readonly advisers: readonly { readonly name: string; readonly feeShare: number }[];
  readonly offers: readonly { readonly id: string; readonly kind: string; readonly terms: string; readonly deadline: string }[];
  readonly settings: Pick<wealth.CoachMoneySettings, 'riskLevel' | 'savingsRate'>;
  /** Yearly take-home pay he would save from, for the projection (E6.2). */
  readonly yearlyTakeHomeCents: number;
  readonly model?: Readonly<Record<AssetClass, wealth.ClassModel>>;
}

const round1 = (x: number): number => Math.round(x * 10) / 10;

/** Sums of signed amounts by a key, shown as positive figures, largest first. */
function byKey(entries: readonly wealth.LedgerEntry[], cats: readonly wealth.EntryCategory[], key: (e: wealth.LedgerEntry) => string): { key: string; cents: number }[] {
  const m = new Map<string, number>();
  for (const e of entries) if (cats.includes(e.category)) m.set(key(e), (m.get(key(e)) ?? 0) + e.amountCents);
  return [...m].map(([k, v]) => ({ key: k, cents: Math.abs(v) })).filter((r) => r.cents > 0).sort((a, b) => b.cents - a.cents || (a.key < b.key ? -1 : 1));
}

/** Mean and spread of one year's return for a mix (E6.4 rule 2: one market draw plus each class's own noise). */
export function mixModel(weights: Readonly<Partial<Record<AssetClass, number>>>, model: Readonly<Record<AssetClass, wealth.ClassModel>>): { mean: number; sd: number } {
  let mean = 0, common = 0, own = 0;
  for (const c of CLASSES) {
    const w = weights[c] ?? 0;
    if (w === 0) continue;
    const m = model[c];
    mean += w * (m.mean - m.fee);
    common += w * m.sd * m.correlation;
    own += w * w * m.sd * m.sd * (1 - m.correlation * m.correlation);
  }
  return { mean, sd: Math.sqrt(common * common + own) };
}

/**
 * The projection range: invested money and yearly savings grown at the mix's mean return, and at the mean less
 * and plus `projectionZ` spreads of an n-year average return (spread / sqrt(n), years independent).
 */
export function projectRange(startCents: number, savingCents: number, years: number, mix: { mean: number; sd: number }, z: number): MoneyRange {
  const grow = (r: number): number => {
    let w = startCents;
    for (let i = 0; i < years; i++) w = w * (1 + r) + savingCents;
    return Math.round(w);
  };
  const half = years > 0 ? (z * mix.sd) / Math.sqrt(years) : 0;
  return { lowCents: grow(mix.mean - half), midCents: grow(mix.mean), highCents: grow(mix.mean + half) };
}

export function buildFinanceView(x: FinanceInput): FinanceView {
  const model = x.model ?? wealth.marketModel();
  const last = x.sheets.length ? x.sheets[x.sheets.length - 1]!.sheet : null;
  const holdings: FinanceView['holdings'][number][] = [];
  if (last) {
    const ret = (c: AssetClass): number => (x.lastYear ? round1(x.lastYear[c] * 100) : 0);
    if (last.cash > 0) holdings.push({ name: t('class.cash'), risk: t('classRisk.cash'), valueCents: last.cash, returnPct: ret('cash') });
    for (const c of CLASSES) {
      const v = last.taxable[c] ?? 0;
      if (v > 0) holdings.push({ name: t(`class.${c}`), risk: t(`classRisk.${c}`), valueCents: v, returnPct: ret(c) });
    }
    for (const c of CLASSES) {
      const v = last.retirement[c] ?? 0;
      if (v > 0) holdings.push({ name: t('class.retirement', { name: t(`class.${c}`) }), risk: t(`classRisk.${c}`), valueCents: v, returnPct: ret(c) });
    }
    for (const h of last.homes) holdings.push({ name: t('class.home'), risk: t('classRisk.home'), valueCents: h.valueCents, returnPct: 0 });
  }
  let projection: FinanceView['projection'] = null;
  if (last) {
    const invested = wealth.accountBalance(last, 'cash') + wealth.accountBalance(last, 'taxable') + wealth.accountBalance(last, 'retirement');
    const weights: Partial<Record<AssetClass, number>> = {};
    for (const [c, share] of Object.entries(wealth.targetAllocation(x.settings.riskLevel)) as [AssetClass, number][]) weights[c] = share;
    const years = param('careerScreens.projectionYears');
    const saving = Math.max(0, Math.round(x.yearlyTakeHomeCents * x.settings.savingsRate));
    projection = { years, range: projectRange(invested, saving, years, mixModel(weights, model), param('careerScreens.projectionZ')) };
  }
  return {
    rights: [...x.rights],
    currency: x.currency,
    netWorth: x.sheets.map((s) => ({ date: s.date, cents: wealth.netWorth(s.sheet) })),
    income: byKey(x.entries, INCOME, (e) => e.source).map((r) => ({ source: r.key, cents: r.cents })),
    taxes: byKey(x.entries, TAX, (e) => e.source).map((r) => ({ place: r.key, cents: r.cents })),
    spending: byKey(x.entries, SPENDING, (e) => t(`spend.${e.category}`)).map((r) => ({ item: r.key, cents: r.cents })),
    holdings,
    advisers: x.advisers.map((a) => ({ name: a.name, feeLine: t('adviser.fee', { pct: round1(a.feeShare * 100) }) })),
    offers: x.offers.map((o) => ({ ...o })),
    plan: { savingRatePct: round1(x.settings.savingsRate * 100), risk: t(`plan.risk.${x.settings.riskLevel}`) },
    projection,
  };
}
