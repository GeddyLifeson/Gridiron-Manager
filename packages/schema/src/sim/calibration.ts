// Simulation contract, part 12: calibration target rows (J15.1.1, Q2.1.1, Q2.3.1).
// J15.1.1 and Q2.1.1 give two row shapes. Contract decision D-10 merges them: the row points at a
// fact-register row (Q2.1.1 `factId`, Q6), which holds the sources, and the status is computed from
// those sources, never typed (Q6.1.2). The J15.1.1 fields that the register does not hold (definition,
// tier, tolerance, rule-set dependence) stay on the row.
import { z } from 'zod';
import { pub } from '../field.ts';
import { FactStatus } from '../facts.ts';

export const TargetLayer = z.enum(['contest', 'play', 'game', 'season', 'career', 'decision_rate']);
export const TargetKind = z.enum(['rate', 'mean', 'sd', 'quantiles', 'ordering']);
/** Only Verified targets may be `certify` (J15.1.1). The loader rejects any other. */
export const TargetTier = z.enum(['certify', 'tune', 'watch']);

export const CalibrationTarget = z.object({
  /** Stable id, for example `game.pointsPerTeam` or `pass.completionPct`. */
  id: pub(z.string().regex(/^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9_]+)+$/)),
  /** Rule set id the row belongs to. A college row is never filled from a pro value (Q2.1.1). */
  ruleSetId: pub(z.string()),
  /** Bible leaf that states the number, for example J15.2.1. */
  leaf: pub(z.string()),
  layer: pub(TargetLayer),
  kind: pub(TargetKind),
  quantity: pub(z.string()),
  unit: pub(z.string()),
  /** Situation filter in words and as the exact measure name the harness implements. */
  filter: pub(z.string()),
  /** Names the script and filter that produced the real number. A target without one is not a target (J15.1.1). */
  definition: pub(z.string()),
  /** The number, the quantile vector, or (for ordering rows) the ordered list of measure names. */
  value: pub(z.union([z.number(), z.array(z.number()), z.array(z.string())]), 'ratio'),
  /** Real-data sample size, for the real-data standard error (J15.1.2). */
  n: pub(z.number().int().positive(), 'count').nullable(),
  seasons: pub(z.string()),
  tolerance: pub(z.object({ type: pub(z.enum(['rel', 'abs', 'band', 'poisson'])), value: pub(z.number().min(0), 'ratio'), low: pub(z.number(), 'ratio').nullable(), high: pub(z.number(), 'ratio').nullable() })),
  /** Register row of domain `measured-rate` (Q6.1.1). Null only for a row with no source: then `tier` must be `watch` and the report prints MISSING SOURCE. */
  factId: pub(z.string().regex(/^F-[a-z-]+-\d{4}$/)).nullable(),
  tier: pub(TargetTier),
  ruleSetDependent: pub(z.boolean()),
  note: pub(z.string()).nullable(),
}).strict();
export type CalibrationTarget = z.infer<typeof CalibrationTarget>;

export const CalibrationTargetFile = z.object({
  ruleSetId: pub(z.string()),
  version: pub(z.string()),
  targets: pub(z.array(CalibrationTarget)),
}).strict();
export type CalibrationTargetFile = z.infer<typeof CalibrationTargetFile>;

/** J15.1.1: a `certify` target must be Verified; a target with no fact row may only be `watch`. Returns problems. */
export function targetTierProblems(t: CalibrationTarget, status: FactStatus | null): string[] {
  const out: string[] = [];
  if (t.tier === 'certify' && status !== 'Verified') out.push(`${t.id}: tier certify needs status Verified, found ${status ?? 'no fact row'}`);
  if (t.factId === null && t.tier !== 'watch') out.push(`${t.id}: a target with no fact row may only be tier watch`);
  return out;
}

/** One line of the calibration report (J15.10.1). PROVISIONAL is printed for every row that is not Verified. */
export const TargetResult = z.object({
  id: pub(z.string()),
  real: pub(z.union([z.number(), z.array(z.number()), z.array(z.string())]), 'ratio'),
  simulated: pub(z.union([z.number(), z.array(z.number()), z.array(z.string())]), 'ratio').nullable(),
  signedError: pub(z.number(), 'ratio').nullable(),
  toleranceUsed: pub(z.number(), 'ratio').nullable(),
  status: pub(FactStatus).nullable(),
  tier: pub(TargetTier),
  provisional: pub(z.boolean()),
  pass: pub(z.boolean()).nullable(),
}).strict();
export type TargetResult = z.infer<typeof TargetResult>;
