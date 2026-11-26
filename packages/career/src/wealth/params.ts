// Design constants of the wealth module (game build plan section 2: PARAMS with basis bible or assumption).
// "bible" means the leaf states the number as a starting value; every one of those is a placeholder the
// bible itself marks as unsourced. "assumption" means this module chose it because the leaf names the
// parameter but gives no number. None of these is a real-world fact; real-world numbers live in facts.json.
import type { ParamFile, TuningParam } from '@gm/schema';

type Row = readonly [name: string, value: number, min: number, max: number, unit: string, basis: 'bible' | 'assumption', leaf: string];

const MODULE = 'career.wealth';

const ROWS: readonly Row[] = [
  // E6.1.1 cycle
  ['shortfallDefaultMonths', 3, 1, 12, 'months', 'bible', 'E6.1.1'],
  ['taxSettlementMonth', 4, 1, 12, 'month', 'assumption', 'E6.2.1'],
  // E6.3.1 lifestyle tiers (monthly USD, bible placeholders)
  ['tierBase.bare', 1400, 0, 1e6, 'USD/month', 'bible', 'E6.3.1'],
  ['tierBase.modest', 3500, 0, 1e6, 'USD/month', 'bible', 'E6.3.1'],
  ['tierBase.comfortable', 8000, 0, 1e6, 'USD/month', 'bible', 'E6.3.1'],
  ['tierBase.affluent', 20000, 0, 1e6, 'USD/month', 'bible', 'E6.3.1'],
  ['tierBase.lavish', 55000, 0, 1e6, 'USD/month', 'bible', 'E6.3.1'],
  ['householdPartnerAdd', 0.5, 0, 2, 'ratio', 'bible', 'E6.3.1'],
  ['householdChildAdd', 0.3, 0, 2, 'ratio', 'bible', 'E6.3.1'],
  ['tierDownDelayMonths', 3, 0, 12, 'months', 'bible', 'E6.3.1'],
  // E6.4.1 housing: the leaf names tier_home_base and tier_rent_base but gives no value.
  ['tierRent.bare', 900, 0, 1e6, 'USD/month', 'assumption', 'E6.4.1'],
  ['tierRent.modest', 1600, 0, 1e6, 'USD/month', 'assumption', 'E6.4.1'],
  ['tierRent.comfortable', 3000, 0, 1e6, 'USD/month', 'assumption', 'E6.4.1'],
  ['tierRent.affluent', 6000, 0, 1e6, 'USD/month', 'assumption', 'E6.4.1'],
  ['tierRent.lavish', 15000, 0, 1e6, 'USD/month', 'assumption', 'E6.4.1'],
  ['tierHome.bare', 250000, 0, 1e8, 'USD', 'assumption', 'E6.4.1'],
  ['tierHome.modest', 400000, 0, 1e8, 'USD', 'assumption', 'E6.4.1'],
  ['tierHome.comfortable', 750000, 0, 1e8, 'USD', 'assumption', 'E6.4.1'],
  ['tierHome.affluent', 1500000, 0, 1e8, 'USD', 'assumption', 'E6.4.1'],
  ['tierHome.lavish', 4000000, 0, 1e8, 'USD', 'assumption', 'E6.4.1'],
  ['downPaymentShare', 0.2, 0, 1, 'ratio', 'bible', 'E6.4.1'],
  ['closingCostShare', 0.03, 0, 0.2, 'ratio', 'bible', 'E6.4.1'],
  ['mortgageTermMonths', 360, 12, 480, 'months', 'bible', 'E6.4.1'],
  ['mortgageQualifyingShare', 0.3, 0, 1, 'ratio', 'bible', 'E6.4.1'],
  ['mortgageRate', 0.065, 0, 0.3, 'ratio/yr', 'assumption', 'E6.4.1'],
  ['leaseMonths', 12, 1, 36, 'months', 'bible', 'E6.4.1'],
  ['leaseBreakMonthsRent', 2, 0, 12, 'months', 'bible', 'E6.4.1'],
  // E6.4.2 selling after a firing
  ['sellingCostShare', 0.06, 0, 0.2, 'ratio', 'bible', 'E6.4.2'],
  ['sellNowMonths', 2, 0, 12, 'months', 'bible', 'E6.4.2'],
  ['sellNowFactor.hot', 1.0, 0, 2, 'ratio', 'bible', 'E6.4.2'],
  ['sellNowFactor.normal', 0.97, 0, 2, 'ratio', 'bible', 'E6.4.2'],
  ['sellNowFactor.slow', 0.92, 0, 2, 'ratio', 'bible', 'E6.4.2'],
  ['listSaleChance.hot', 0.6, 0, 1, 'probability/month', 'bible', 'E6.4.2'],
  ['listSaleChance.normal', 0.35, 0, 1, 'probability/month', 'bible', 'E6.4.2'],
  ['listSaleChance.slow', 0.15, 0, 1, 'probability/month', 'bible', 'E6.4.2'],
  ['rentOutShare', 0.8, 0, 2, 'ratio', 'bible', 'E6.4.2'],
  ['rentOutManagementShare', 0.1, 0, 1, 'ratio', 'bible', 'E6.4.2'],
  ['rentOutVacancyMonthsPerYear', 1, 0, 12, 'months/yr', 'bible', 'E6.4.2'],
  // E6.6.1 and E6.6.2 investments
  ['indexFundFee', 0.001, 0, 0.05, 'ratio/yr', 'bible', 'E6.6.1'],
  ['singleStockSdMultiplier', 2, 1, 5, 'ratio', 'assumption', 'E6.6.1'],
  ['singleStockCorrelation', 0.6, 0, 1, 'ratio', 'assumption', 'E6.6.1'],
  ['bondCorrelation', 0.1, -1, 1, 'ratio', 'assumption', 'E6.6.1'],
  ['billCorrelation', 0, -1, 1, 'ratio', 'assumption', 'E6.6.1'],
  ['realEstateCorrelation', 0.2, -1, 1, 'ratio', 'assumption', 'E6.6.1'],
  ['emergencyReserveMonths', 6, 0, 24, 'months', 'bible', 'E6.6.2'],
  ['panicThreshold', -0.2, -1, 0, 'ratio', 'assumption', 'E6.6.2'],
  // E6.9.2 security status
  ['securityComfortableShare', 0.5, 0, 1, 'ratio', 'bible', 'E6.9.2'],
  ['shortRunwayYears', 1, 0, 10, 'years', 'bible', 'E6.9.2'],
  ['shortRunwayTopYears', 5, 0, 30, 'years', 'bible', 'E6.9.2'],
];

export const PARAMS: ParamFile = {
  module: MODULE,
  version: 'g30.1',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf]): TuningParam => ({
    name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE, basis, leaf,
    constrainedBy: basis === 'bible' ? `${leaf} acceptance (placeholder, needs research)` : `${leaf} acceptance (assumption, needs research)`,
    status: 'starting',
  })),
};

const VALUES = new Map(PARAMS.params.map((p) => [p.name.slice(MODULE.length + 1), p.value] as const));

/** Read one design constant by its short name; throws on an unknown name. */
export function param(name: string): number {
  const v = VALUES.get(name);
  if (v === undefined) throw new Error(`wealth: unknown parameter ${name}`);
  return v;
}

/** E6.6.2 rule 1: allocation for each risk level. Levels 1, 3 and 5 are the bible's starting values;
 *  2 and 4 are assumptions halfway between their neighbours. */
export const RISK_ALLOCATIONS: Readonly<Record<1 | 2 | 3 | 4 | 5, Readonly<Partial<Record<AssetClass, number>>>>> = {
  1: { cash: 0.6, bonds: 0.4 },
  2: { cash: 0.35, bonds: 0.35, index: 0.3 },
  3: { cash: 0.1, bonds: 0.3, index: 0.6 },
  4: { cash: 0.075, bonds: 0.15, index: 0.675, singleStocks: 0.05, realEstate: 0.05 },
  5: { cash: 0.05, index: 0.75, singleStocks: 0.1, realEstate: 0.1 },
};

/** E6.6.1 rule 1, the liquid classes held in taxable and retirement accounts. Private deals and owned
 *  businesses (E6.6.3) are not in this package's acceptance and are held as `private_holdings` later. */
export type AssetClass = 'cash' | 'bonds' | 'index' | 'singleStocks' | 'realEstate';

/** Order in which a shortfall sells holdings (E6.1.1 rule 4: most liquid first). */
export const LIQUIDITY_ORDER: readonly AssetClass[] = ['cash', 'bonds', 'index', 'singleStocks', 'realEstate'];

export type LifestyleTier = 'bare' | 'modest' | 'comfortable' | 'affluent' | 'lavish';
export const TIERS: readonly LifestyleTier[] = ['bare', 'modest', 'comfortable', 'affluent', 'lavish'];
