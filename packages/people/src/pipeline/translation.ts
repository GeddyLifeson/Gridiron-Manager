// Translation rates (T11.4.1): the measured odds that a drafted player becomes a pro starter, read from fact
// rows, and the calibration check that a simulated world must pass (J15.10.1, Q2). Nothing here feeds an
// attribute: the rates are targets for the whole pipeline (true ability, scouting error, development) and a
// reference table for the coaching school (N5).
import { hasRate, isProvisional, rate } from './facts.ts';
import { p } from './params.ts';

/** Position groups of the T11.4.1 table. */
export const TRANSLATION_GROUPS = ['QB', 'RB', 'WR', 'TE', 'OL', 'IDL', 'EDGE', 'LB', 'DB'] as const;
export type TranslationGroup = (typeof TRANSLATION_GROUPS)[number];

export const ROUND_BANDS = ['r1', 'r2_3', 'r4_7'] as const;
export type RoundBand = (typeof ROUND_BANDS)[number];

/** Groups that have a pick-supply row (T11.4.1 "pick supply per draft"), specialists included. */
export const SUPPLY_GROUPS = [...TRANSLATION_GROUPS, 'K', 'P'] as const;
export type SupplyGroup = (typeof SUPPLY_GROUPS)[number];

const ROUND_METRICS = ['starter3', 'starter5', 'probowl', 'neverPlayed'] as const;
const GROUP_METRICS = ['starter3', 'starter5', 'neverStarted'] as const;
export type RoundMetric = (typeof ROUND_METRICS)[number];
export type GroupMetric = (typeof GROUP_METRICS)[number];

/** Rounds 2 and 3 form one band, 4 to 7 another (T11.4.1 position table). Rounds past 7 join the last band. */
export function roundBand(round: number): RoundBand {
  if (!(round >= 1)) throw new Error(`round ${round} is not a draft round`);
  if (round < 2) return 'r1';
  if (round < 4) return 'r2_3';
  return 'r4_7';
}

/** Odds shown to the user beside a pick (N5 reference table). */
export interface TranslationOdds {
  readonly starter3: number;
  readonly starter5: number;
  readonly neverStarted: number;
  /** Real picks behind the cell. */
  readonly sample: number;
  /** True when the rows are short of Verified (Q6.3.1): the table prints PROVISIONAL. */
  readonly provisional: boolean;
}

export function translationOdds(round: number, group: TranslationGroup): TranslationOdds {
  const k = `group.${group}.${roundBand(round)}`;
  return {
    starter3: rate(`${k}.starter3`),
    starter5: rate(`${k}.starter5`),
    neverStarted: rate(`${k}.neverStarted`),
    sample: rate(`${k}.n`),
    provisional: isProvisional(`${k}.starter3`) || isProvisional(`${k}.starter5`) || isProvisional(`${k}.neverStarted`),
  };
}

/** By-round targets, all positions (T11.4.1 first table). */
export function roundTarget(round: number, metric: RoundMetric): number {
  return rate(`round.${round}.${metric}`);
}

/** Expected share of picks reaching `starter3` at a round, used to judge players against their slot (T11.5.1). */
export function expectedStarter3(round: number, group: TranslationGroup | null): number {
  return group === null ? roundTarget(round, 'starter3') : translationOdds(round, group).starter3;
}

/** Starting pick supply per draft by group, for draft class generation (T11.4.1). Labels overlap in the source. */
export function pickSupply(): Readonly<Record<SupplyGroup, number>> {
  const out = {} as Record<SupplyGroup, number>;
  for (const g of SUPPLY_GROUPS) out[g] = rate(`supply.${g}`);
  return out;
}

/** Share of a draft class at each group, from the supply rows. Sums to 1. */
export function pickSupplyShares(): Readonly<Record<SupplyGroup, number>> {
  const s = pickSupply();
  let total = 0;
  for (const g of SUPPLY_GROUPS) total += s[g];
  const out = {} as Record<SupplyGroup, number>;
  for (const g of SUPPLY_GROUPS) out[g] = s[g] / total;
  return out;
}

/** One drafted player's finished pro career, as the world simulation recorded it (X2). */
export interface DraftOutcome {
  readonly round: number;
  readonly group: TranslationGroup | null;
  readonly seasonsAsPrimaryStarter: number;
  readonly proBowls: number;
  readonly gamesPlayed: number;
}

export interface CalibrationRow {
  readonly id: string;
  readonly target: number;
  /** Simulated share, or null when the simulation produced no picks in the cell. */
  readonly simulated: number | null;
  readonly simulatedSample: number;
  readonly realSample: number;
  readonly tolerance: number;
  readonly pass: boolean;
  readonly provisional: boolean;
}

function toleranceFor(realSample: number): number {
  return realSample >= p('calibration.bigSampleN') ? p('calibration.tolBigSample') : p('calibration.tolSmallSample');
}

function hit(o: DraftOutcome, metric: RoundMetric | GroupMetric): boolean {
  if (metric === 'starter3') return o.seasonsAsPrimaryStarter >= 3;
  if (metric === 'starter5') return o.seasonsAsPrimaryStarter >= 5;
  if (metric === 'probowl') return o.proBowls >= 1;
  if (metric === 'neverPlayed') return o.gamesPlayed === 0;
  return o.seasonsAsPrimaryStarter === 0;
}

function share(xs: readonly DraftOutcome[], metric: RoundMetric | GroupMetric): number | null {
  if (xs.length === 0) return null;
  let n = 0;
  for (const o of xs) if (hit(o, metric)) n += 1;
  return n / xs.length;
}

function cell(id: string, key: string, xs: readonly DraftOutcome[], metric: RoundMetric | GroupMetric, realSample: number): CalibrationRow {
  const target = rate(key);
  const simulated = share(xs, metric);
  const tolerance = toleranceFor(realSample);
  const diff = simulated === null ? Infinity : simulated - target;
  return {
    id, target, simulated, simulatedSample: xs.length, realSample, tolerance,
    pass: diff <= tolerance && diff >= -tolerance, provisional: isProvisional(key),
  };
}

export interface CalibrationReport {
  readonly rows: readonly CalibrationRow[];
  /** T11.4.1: every by-round row within tolerance. */
  readonly byRoundPass: boolean;
  /** T11.4.1: first-round quarterback Starter 5 between 43 and 67 percent. */
  readonly qb1Starter5Pass: boolean;
  /** Rounds the rule set has but the real table lacks (pick count follows C7, not a constant here). */
  readonly roundsWithoutTarget: readonly number[];
}

/**
 * The T11.4.1 calibration check over simulated drafts (20 or more seasons). `rounds` is the rule value
 * `league_rules.draft.rounds`, passed in by the caller. Rows for rounds the real table lacks are listed, not
 * failed: the target table is the real league's.
 */
export function calibrationReport(outcomes: readonly DraftOutcome[], rounds: number): CalibrationReport {
  const rows: CalibrationRow[] = [];
  const missing: number[] = [];
  let byRoundPass = true;
  for (let r = 1; r <= rounds; r += 1) {
    if (!hasRound(r)) { missing.push(r); continue; }
    const xs = outcomes.filter((o) => o.round === r);
    const realN = rate(`round.${r}.n`);
    for (const m of ROUND_METRICS) {
      const row = cell(`round.${r}.${m}`, `round.${r}.${m}`, xs, m, realN);
      rows.push(row);
      if (!row.pass) byRoundPass = false;
    }
  }
  for (const g of TRANSLATION_GROUPS) {
    for (const b of ROUND_BANDS) {
      const xs = outcomes.filter((o) => o.group === g && o.round <= rounds && roundBand(o.round) === b);
      const realN = rate(`group.${g}.${b}.n`);
      for (const m of GROUP_METRICS) rows.push(cell(`group.${g}.${b}.${m}`, `group.${g}.${b}.${m}`, xs, m, realN));
    }
  }
  const qb1 = share(outcomes.filter((o) => o.group === 'QB' && o.round === 1), 'starter5');
  const qb1Starter5Pass = qb1 !== null && qb1 >= p('calibration.qb1Starter5Low') && qb1 <= p('calibration.qb1Starter5High');
  return { rows, byRoundPass, qb1Starter5Pass, roundsWithoutTarget: missing };
}

function hasRound(r: number): boolean {
  return hasRate(`round.${r}.starter3`);
}

/** T11.5.1 acceptance: yearly coach movement between levels within 50 percent of the starting targets. */
export function movementCheck(simulatedPerYear: { readonly collegeToPro: number; readonly proToCollege: number }): {
  readonly collegeToPro: boolean; readonly proToCollege: boolean;
} {
  const tol = p('calibration.movementTolerance');
  const ok = (sim: number, target: number) => sim >= target * (1 - tol) && sim <= target * (1 + tol);
  return {
    collegeToPro: ok(simulatedPerYear.collegeToPro, rate('movement.collegeToPro')),
    proToCollege: ok(simulatedPerYear.proToCollege, rate('movement.proToCollege')),
  };
}
