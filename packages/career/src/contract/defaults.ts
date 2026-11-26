// contract_defaults.<tier>.<seat> and pay_bands.<tier> (E3.1.1, E3.2.1, E3.3, E3.8.1), read from defaults.json.
// Every cell has a basis; a contract reads the block for its tier, never a hard-coded level value.
import defaultsJson from './defaults.json' with { type: 'json' };
import { dollars, type Cents } from '../wealth/index.ts';
import type { BuyoutForm, ContractTier, GuaranteeForm, MarketFloor, ResignationWindow, SeatClass, TriggerId } from './types.ts';

export type Basis = 'fact' | 'bible' | 'assumption';
interface Cell<T> { readonly v: T; readonly basis: Basis; readonly leaf: string; readonly facts?: readonly string[]; readonly note?: string }

export interface DefaultsBlock {
  readonly termYears: Cell<{ min: number; default: number; max: number }>;
  readonly guarantee: Cell<{ form: GuaranteeForm; min: number; median: number; max: number; months: number }>;
  readonly offset: Cell<{ onShare: number; footballRelatedShare: number; marketFloor: MarketFloor }>;
  readonly buyout: Cell<{ forms: Partial<Record<BuyoutForm, number>>; shareOfFiredAmount: { min: number; max: number }; releaseHeldByClub: boolean }>;
  readonly resignationWindow: Cell<ResignationWindow>;
  readonly bonus: Cell<{ form: 'share_of_pay' | 'flat_ladder' | 'none'; ladder: string | null; capShare: number; capUsd: number }>;
  readonly cureDays: Cell<number>;
  readonly maxUnpaidSuspensionDays: Cell<number>;
  readonly reportNewJobDays: Cell<number>;
  readonly maxUnexpiredYears: Cell<number | null>;
  readonly payPeriods: Cell<readonly number[]>;
  readonly agentFeeShare: Cell<{ min: number; default: number; max: number }>;
}

export interface Ladder {
  readonly basis: Basis; readonly leaf: string; readonly unit: 'share_of_pay' | 'usd';
  readonly triggers: Partial<Record<TriggerId, number>>; readonly winThresholdFrom?: number;
}

export interface PayBandRow { readonly low: number; readonly typicalLow: number; readonly typicalHigh: number; readonly high: number; readonly basis: Basis; readonly leaf: string; readonly facts?: readonly string[] }

interface DefaultsFile {
  readonly blocks: Readonly<Record<string, DefaultsBlock>>;
  readonly ladders: Readonly<Record<string, Ladder>>;
  readonly payBands: Readonly<Record<ContractTier, Readonly<Record<string, PayBandRow>>>>;
}

export const CONTRACT_DEFAULTS = defaultsJson as unknown as DefaultsFile;

export function blockKey(tier: ContractTier, seat: SeatClass): string {
  return `${tier}.${seat}`;
}

export function defaultsBlock(tier: ContractTier, seat: SeatClass, file: DefaultsFile = CONTRACT_DEFAULTS): DefaultsBlock {
  const b = file.blocks[blockKey(tier, seat)];
  if (!b) throw new Error(`contract: no contract_defaults block ${blockKey(tier, seat)}`);
  return b;
}

export function ladder(id: string, file: DefaultsFile = CONTRACT_DEFAULTS): Ladder {
  const l = file.ladders[id];
  if (!l) throw new Error(`contract: no incentive ladder ${id}`);
  return l;
}

/** Every cell of every block and band, for the basis audit test. */
export function allCells(file: DefaultsFile = CONTRACT_DEFAULTS): { path: string; basis: Basis; facts: readonly string[] }[] {
  const out: { path: string; basis: Basis; facts: readonly string[] }[] = [];
  for (const [k, b] of Object.entries(file.blocks)) for (const [f, c] of Object.entries(b) as [string, Cell<unknown>][]) out.push({ path: `${k}.${f}`, basis: c.basis, facts: c.facts ?? [] });
  for (const [k, l] of Object.entries(file.ladders)) out.push({ path: `ladders.${k}`, basis: l.basis, facts: [] });
  for (const [t, rows] of Object.entries(file.payBands)) for (const [r, row] of Object.entries(rows)) out.push({ path: `payBands.${t}.${r}`, basis: row.basis, facts: row.facts ?? [] });
  return out;
}

/** Pay band in cents for a tier and rung, scaled by the league revenue index (E3.2.1). A rung without its own
 *  row reads the nearest row below it; rung 0 (off every staff) pays nothing. */
export interface PayBand { readonly lowCents: Cents; readonly medianCents: Cents; readonly highCents: Cents; readonly typicalLowCents: Cents; readonly typicalHighCents: Cents; readonly basis: Basis }

export function payBand(tier: ContractTier, rung: number, revenueIndex = 1, file: DefaultsFile = CONTRACT_DEFAULTS): PayBand {
  const rows = file.payBands[tier];
  const keys = Object.keys(rows).map(Number).filter((k) => k <= rung).sort((a, b) => b - a);
  const row = keys.length ? rows[String(keys[0])] : undefined;
  if (!row) return { lowCents: 0, medianCents: 0, highCents: 0, typicalLowCents: 0, typicalHighCents: 0, basis: 'assumption' };
  const s = (usd: number): Cents => dollars(usd * revenueIndex);
  return { lowCents: s(row.low), typicalLowCents: s(row.typicalLow), typicalHighCents: s(row.typicalHigh), medianCents: s((row.typicalLow + row.typicalHigh) / 2), highCents: s(row.high), basis: row.basis };
}

export type BandPosition = 'below_band' | 'bottom' | 'middle' | 'top' | 'above_band';

/** E3.2.1 "near the bottom for a first-time head coach", "top of the market". */
export function bandPosition(salaryCents: Cents, band: PayBand, bottomShare: number, topShare: number): BandPosition {
  if (salaryCents < band.lowCents) return 'below_band';
  if (salaryCents > band.highCents) return 'above_band';
  const span = band.highCents - band.lowCents;
  const x = span > 0 ? (salaryCents - band.lowCents) / span : 0.5;
  if (x < bottomShare) return 'bottom';
  if (x > topShare) return 'top';
  return 'middle';
}
