// T9.6.1 college pay bands: draws a salary for a role at a program tier, in cents, inflated from the
// 2025 base year. K8 and E2 price offers from these bands (T9.6.1 AI use).
import type { RandomStream } from '@gm/schema';
import bandsJson from './pay-bands.json' with { type: 'json' };
import { P } from './params.ts';
import type { PayRole, ProgramTier } from './types.ts';

type Band = readonly [minUsd: number, maxUsd: number, weight: number];
interface Cell { readonly bands: readonly Band[]; readonly basis: string }

const ROLES = bandsJson.roles as unknown as Readonly<Record<PayRole, Readonly<Record<ProgramTier, Cell>>>>;
const CENTS = 100;

export function payCell(role: PayRole, tier: ProgramTier): Cell {
  return ROLES[role][tier];
}

/** Price level of a year against the 2025 base (multiplied out, no platform pow). */
export function inflationFactor(year: number): number {
  const rate = P('pay.inflation_per_year');
  let f = 1;
  const n = year - P('pay.base_year');
  for (let i = 0; i < Math.abs(n); i++) f = n > 0 ? f * (1 + rate) : f / (1 + rate);
  return f;
}

/** Whole cents, deterministic for a given stream position: one pick and one uniform. */
export function drawSalaryCents(role: PayRole, tier: ProgramTier, year: number, rng: RandomStream): number {
  const cell = payCell(role, tier);
  const band = cell.bands[rng.pick(cell.bands.map((b) => b[2]))]!;
  const usd = band[0] + (band[1] - band[0]) * rng.uniform();
  return Math.round(usd * inflationFactor(year) * CENTS);
}

/** The band edges of a role at a tier in a year's dollars (for offers and screens). */
export function bandRangeCents(role: PayRole, tier: ProgramTier, year: number): { readonly min: number; readonly max: number } {
  const cell = payCell(role, tier);
  const f = inflationFactor(year) * CENTS;
  return { min: Math.round(Math.min(...cell.bands.map((b) => b[0])) * f), max: Math.round(Math.max(...cell.bands.map((b) => b[1])) * f) };
}
