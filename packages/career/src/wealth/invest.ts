// E6.6.1 asset classes and yearly returns; E6.6.2 allocation and rebalancing.
// Randomness comes from a world stream the caller passes in (an @gm/engine-core Stream fits this
// interface). The market stream is its own named stream, independent of every football stream (rule 7).
import tablesJson from './tables.json' with { type: 'json' };
import { factNumber } from './facts.ts';
import { param, RISK_ALLOCATIONS, LIQUIDITY_ORDER, type AssetClass } from './params.ts';
import { roundCents, type Cents } from './money.ts';

export interface WealthRandom {
  /** Uniform in [0, 1). */
  uniform(): number;
  /** Standard normal. */
  normal(): number;
}

export interface ClassModel { readonly mean: number; readonly sd: number; readonly correlation: number; readonly fee: number }

/** Return model per class. Means and spreads from facts (Damodaran 1928-2025, 1 of 3); correlations,
 *  the single-stock spread and fees are design constants in params.ts. */
export function marketModel(file = tablesJson): Readonly<Record<AssetClass, ClassModel>> {
  const m = file.market;
  const stocksMean = factNumber(m.stocks.mean);
  const stocksSd = factNumber(m.stocks.sd);
  return {
    cash: { mean: factNumber(m.bills.mean), sd: factNumber(m.bills.sd), correlation: param('billCorrelation'), fee: 0 },
    bonds: { mean: factNumber(m.bonds.mean), sd: factNumber(m.bonds.sd), correlation: param('bondCorrelation'), fee: 0 },
    index: { mean: stocksMean, sd: stocksSd, correlation: 1, fee: param('indexFundFee') },
    // Rule 4: same mean as the index, wider spread, no stock-picking edge.
    singleStocks: { mean: stocksMean, sd: stocksSd * param('singleStockSdMultiplier'), correlation: param('singleStockCorrelation'), fee: 0 },
    realEstate: { mean: factNumber(m.realEstate.mean), sd: factNumber(m.realEstate.sd), correlation: param('realEstateCorrelation'), fee: 0 },
  };
}

export type YearReturns = Readonly<Record<AssetClass, number>>;

/** One market year shared by every coach (rule 2): one market draw, then each class's own noise.
 *  Always consumes exactly six normals, in class order, so the stream stays aligned. */
export function drawMarketYear(rng: WealthRandom, model = marketModel()): YearReturns {
  const z = rng.normal();
  const out = {} as Record<AssetClass, number>;
  for (const c of LIQUIDITY_ORDER) {
    const m = model[c];
    const e = rng.normal();
    const mix = m.correlation * z + Math.sqrt(Math.max(0, 1 - m.correlation * m.correlation)) * e;
    out[c] = m.mean + m.sd * mix - m.fee;
  }
  return out;
}

export type Holdings = Readonly<Partial<Record<AssetClass, Cents>>>;

export function holdingsTotal(h: Holdings): Cents {
  return LIQUIDITY_ORDER.reduce((a, c) => a + (h[c] ?? 0), 0);
}

/** Monthly share of the yearly draw (E6.1.1 rule 2). Returns the new holdings and the change per class. */
export function applyMonthlyReturns(h: Holdings, year: YearReturns): { holdings: Holdings; changeCents: Cents } {
  const out: Partial<Record<AssetClass, Cents>> = {};
  let change = 0;
  for (const c of LIQUIDITY_ORDER) {
    const v = h[c] ?? 0;
    if (v === 0) continue;
    const d = roundCents((v * year[c]) / 12);
    out[c] = v + d;
    change += d;
  }
  return { holdings: out, changeCents: change };
}

export function targetAllocation(level: 1 | 2 | 3 | 4 | 5): Readonly<Partial<Record<AssetClass, number>>> {
  return RISK_ALLOCATIONS[level];
}

/** E6.6.2 rule 2: rebalance to target weights. Rounding residue goes to cash so the total is unchanged. */
export function rebalance(h: Holdings, target: Readonly<Partial<Record<AssetClass, number>>>): Holdings {
  const total = holdingsTotal(h);
  const out: Partial<Record<AssetClass, Cents>> = {};
  let placed = 0;
  for (const c of LIQUIDITY_ORDER) {
    if (c === 'cash') continue;
    const w = target[c] ?? 0;
    if (w <= 0) continue;
    const v = roundCents(total * w);
    out[c] = v;
    placed += v;
  }
  out.cash = total - placed;
  return out;
}

/** Add a contribution in proportion to the target. */
export function contribute(h: Holdings, amount: Cents, target: Readonly<Partial<Record<AssetClass, number>>>): Holdings {
  const out: Partial<Record<AssetClass, Cents>> = { ...h };
  let placed = 0;
  for (const c of LIQUIDITY_ORDER) {
    if (c === 'cash') continue;
    const w = target[c] ?? 0;
    if (w <= 0) continue;
    const v = roundCents(amount * w);
    out[c] = (out[c] ?? 0) + v;
    placed += v;
  }
  out.cash = (out.cash ?? 0) + amount - placed;
  return out;
}

/** Sell up to `need` from holdings, most liquid first (E6.1.1 rule 4). */
export function sellForCash(h: Holdings, need: Cents): { holdings: Holdings; raisedCents: Cents } {
  const out: Partial<Record<AssetClass, Cents>> = { ...h };
  let raised = 0;
  for (const c of LIQUIDITY_ORDER) {
    if (raised >= need) break;
    const v = out[c] ?? 0;
    const take = Math.min(v, need - raised);
    out[c] = v - take;
    raised += take;
  }
  return { holdings: out, raisedCents: raised };
}

/** E6.6.2 rule 3: after a year worse than the threshold the user is asked whether to sell. */
export function panicPrompt(year: YearReturns): boolean {
  return year.index <= param('panicThreshold');
}
