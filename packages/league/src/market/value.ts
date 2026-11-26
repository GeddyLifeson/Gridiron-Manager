// C8.3.1 market value: what a player will be paid, from one model read by offers, tenders, extensions
// and pay cuts. Pay is a share of the cap read off the position scale built from the world's current
// contracts, so prices rise with the cap by themselves (rule 5). Inputs are public estimates (D6), never
// true values; each club prices from its own estimate (rule 6) by passing its own percentile.
import neighbourFile from './data/neighbours.json' with { type: 'json' };
import { before, type MarketDates } from './dates.ts';
import { inFirstWave } from './window.ts';
import { addMinutes } from '../calendar/date.ts';
import { MINUTES_PER_HOUR, P } from './params.ts';
import type { Instant } from './types.ts';

export interface ScaleContract { readonly position: string; readonly apyCents: number }

export interface PositionScale {
  readonly position: string;
  /** Shares of the cap, highest first. */
  readonly shares: readonly number[];
  /** Positions the scale was built from (two when pooled). */
  readonly from: readonly string[];
}

const NEIGHBOURS: Readonly<Record<string, string>> = neighbourFile.neighbours;

/** C8.3.1 rule 1 and the pooled-scale edge case. `neighbours` defaults to the module's pairing file. */
export function positionScale(contracts: readonly ScaleContract[], position: string, capCents: number, neighbours: Readonly<Record<string, string>> = NEIGHBOURS): PositionScale {
  const of = (pos: string) => contracts.filter((c) => c.position === pos).map((c) => c.apyCents / capCents);
  let shares = of(position);
  const from = [position];
  const n = neighbours[position];
  if (shares.length < P.pooledScaleMinContracts && n && n !== position) { shares = shares.concat(of(n)); from.push(n); }
  return { position, shares: shares.sort((a, b) => b - a), from };
}

/** Share of the cap at a public percentile (1 = best in the league at the position, 0 = last), interpolated between ranks. */
export function shareAt(scale: PositionScale, percentile: number): number {
  const s = scale.shares;
  if (s.length === 0) return 0;
  const p = Math.min(1, Math.max(0, percentile));
  const pos = (1 - p) * (s.length - 1);
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}

/** C8.3.1 rule 2: demand factor from the number of clubs with need and room at the position. */
export function demandFactor(suitors: number): number {
  const full = P.demandFullSuitorCount;
  const k = Math.min(full, Math.max(1, suitors));
  return P.demandOneSuitor + ((P.demandFullSuitors - P.demandOneSuitor) * (k - 1)) / (full - 1);
}

/** C8.3.1 rule 4: 1 until the first wave ends, then less the first cut and a further cut per market month. */
export function timeFactor(now: Instant, dates: MarketDates): number {
  if (before(now, dates.negotiatingOpen) || inFirstWave(now, dates)) return 1;
  const waveEnd = addMinutes(dates.leagueYearStart, P.firstWaveHours * MINUTES_PER_HOUR);
  const months = Math.floor((now.day - waveEnd.day) / P.daysPerMonth);
  return Math.max(0, 1 - P.timeDiscountFirst - P.timeDiscountPerMonth * Math.max(0, months));
}

export interface ValueInput {
  readonly scale: PositionScale;
  /** Public estimate as a percentile at the position, with its band (D6): low <= mid <= high. */
  readonly percentile: { readonly low: number; readonly mid: number; readonly high: number };
  readonly suitors: number;
  readonly age: number;
  /** Age his position's prime ends (D8 curve). */
  readonly primeEndAge: number;
  /** Productive years the D8 curve expects him to have left. */
  readonly productiveYearsLeft: number;
  readonly injuryFlag: boolean;
  readonly capCents: number;
  /** His minimum salary (C6.4.1): no expected contract is below it (C8.3.1 acceptance). */
  readonly minimumCents: number;
  readonly now: Instant;
  readonly dates: MarketDates;
}

export interface Range { readonly low: number; readonly mid: number; readonly high: number }
export interface ExpectedContract {
  readonly years: number;
  readonly apyCents: Range;
  readonly guaranteeCents: Range;
  readonly guaranteeShare: number;
}

/** C8.3.1 rules 1 to 4: the "expected contract" line (years, average per year, guarantee, each with a range). */
export function expectedContract(v: ValueInput): ExpectedContract {
  return contractAtTime(v, timeFactor(v.now, v.dates));
}

/**
 * The same line with the rule 4 time factor given rather than read from the market dates: for a caller
 * that knows when in the market the deal lands but holds no calendar (1 = the first wave).
 */
export function contractAtTime(v: Omit<ValueInput, 'now' | 'dates'>, time: number): ExpectedContract {
  const k = demandFactor(v.suitors) * time;
  const apy = (p: number) => Math.max(v.minimumCents, Math.round(shareAt(v.scale, p) * v.capCents * k));
  const years = Math.min(P.maxContractYears, Math.max(1, Math.round(v.productiveYearsLeft)));
  const pastPrime = Math.max(0, v.age - v.primeEndAge);
  const raw = (P.guaranteeShareBottom + (P.guaranteeShareTop - P.guaranteeShareBottom) * v.percentile.mid - P.guaranteeAgeDropPerYear * pastPrime)
    * (v.injuryFlag ? P.guaranteeInjuryFactor : 1);
  const guaranteeShare = Math.min(P.guaranteeShareTop, Math.max(0, raw));
  const apyCents = { low: apy(v.percentile.low), mid: apy(v.percentile.mid), high: apy(v.percentile.high) };
  const g = (cents: number) => Math.round(cents * years * guaranteeShare);
  return { years, apyCents, guaranteeCents: { low: g(apyCents.low), mid: g(apyCents.mid), high: g(apyCents.high) }, guaranteeShare };
}

/** Each position's share of total cap spending (C8.3.1 acceptance: stays within 2 points over a 30-year run). */
export function positionSpendShares(contracts: readonly ScaleContract[]): ReadonlyMap<string, number> {
  const total = contracts.reduce((s, c) => s + c.apyCents, 0);
  const by = new Map<string, number>();
  for (const c of contracts) by.set(c.position, (by.get(c.position) ?? 0) + c.apyCents);
  return new Map([...by].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([pos, cents]) => [pos, total === 0 ? 0 : cents / total]));
}
