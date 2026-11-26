// X13.3.1 the measurement protocol, as pure logic: what may be thinned and in what order, when three
// measurements agree, which configuration ships, and how two reports differ. Taking the timings needs a
// clock, so the runner lives outside the core (headless); it hands its numbers to this file.
//
// Under A3.1.1 row 20 and MA-66 only recording may be thinned. Steps that would change the simulation
// (short memory, weekly stress, a lighter game method) are listed below and refused.
import { param } from './params.ts';

/** What a configuration may give up: stored detail only. In the order of least user-visible loss (rule 2). */
export const THINNING_ORDER = ['trajectories_non_user_games', 'play_events_outside_tier1'] as const;
export type ThinningStep = (typeof THINNING_ORDER)[number];

/** Steps that would change outcomes. Never applied (A3.1.1 row 20). */
export const RULED_OUT_STEPS: Readonly<Record<string, string>> = {
  short_memory_outside_tier1: 'drops X6 memory, which changes how people act',
  weekly_stress_outside_tier2: 'coarsens X5 needs and stress',
  full_engine_other_level: 'a lighter game method (X13.3.2 Option B, rejected)',
  fitted_result_model: 'a lighter game method (X13.3.2 Option B, rejected)',
  injuries_from_rates: 'replaces injuries from play with a rate draw',
  calling_from_tendencies: 'replaces full AI planning and calling',
  development_at_season_points: 'coarsens D7 and D8 development',
};

export interface TierConfig {
  readonly id: string;
  /** Applied thinning steps. The baseline has none: everything recorded as tier 1 (rule 1). */
  readonly thinned: readonly string[];
}

/** The ladder of rule 2: the baseline, then one more step each time. */
export function configLadder(): TierConfig[] {
  const out: TierConfig[] = [{ id: 'baseline', thinned: [] }];
  THINNING_ORDER.forEach((_, i) => out.push({ id: `thin-${i + 1}`, thinned: THINNING_ORDER.slice(0, i + 1) }));
  return out;
}

export function configProblems(c: TierConfig): string[] {
  const out: string[] = [];
  const allowed: readonly string[] = THINNING_ORDER;
  for (const s of c.thinned) {
    if (RULED_OUT_STEPS[s] !== undefined) out.push(`config ${c.id}: step ${s} is ruled out: ${RULED_OUT_STEPS[s]} (A3.1.1 row 20)`);
    else if (!allowed.includes(s)) out.push(`config ${c.id}: unknown step ${s}`);
  }
  const idx = c.thinned.map((s) => allowed.indexOf(s)).filter((i) => i >= 0);
  if (idx.some((v, i) => v !== i)) out.push(`config ${c.id}: steps must be applied in order, one at a time (X13.3.1 rule 2)`);
  return out;
}

/** The numbers of a report (X13.3.1 outputs). Times in ms, sizes in MB. */
export const METRICS = ['leagueWeekMs', 'seasonTurnoverMs', 'hiringCycleMs', 'worldGenerationMs', 'peakMemoryMb', 'saveSizeMb', 'loadMs'] as const;
export type Metric = (typeof METRICS)[number];

/** Rule 4: the harness timer, an operating-system measurement of the same run, and a second run or machine. */
export interface Triple { readonly harness: number; readonly os: number; readonly second: number }

export function median3(t: Triple): number {
  return [t.harness, t.os, t.second].sort((a, b) => a - b)[1]!;
}
/** Max minus min over the median. 0 when all three are 0. */
export function spread(t: Triple): number {
  const v = [t.harness, t.os, t.second];
  const m = median3(t);
  return m === 0 ? (Math.max(...v) === 0 ? 0 : Number.POSITIVE_INFINITY) : (Math.max(...v) - Math.min(...v)) / m;
}
export function agrees(t: Triple, tolerance = param('measure.spread')): boolean {
  return [t.harness, t.os, t.second].every((x) => Number.isFinite(x) && x >= 0) && spread(t) <= tolerance;
}

export interface MeasuredNumber { readonly value: number; readonly spread: number; readonly accepted: boolean; readonly triple: Triple }

export interface TierReport {
  readonly config: TierConfig;
  readonly buildHash: string;
  /** The reference machine (P6.2.1) and the world scale the run used, as the runner names them. */
  readonly machine: string;
  readonly scale: Readonly<Record<string, number>>;
  readonly numbers: Readonly<Partial<Record<Metric, MeasuredNumber>>>;
}

export function buildReport(input: { config: TierConfig; buildHash: string; machine: string; scale: Readonly<Record<string, number>>; triples: Readonly<Partial<Record<Metric, Triple>>> }): TierReport {
  const numbers: Partial<Record<Metric, MeasuredNumber>> = {};
  for (const m of METRICS) {
    const t = input.triples[m];
    if (t) numbers[m] = { value: median3(t), spread: spread(t), accepted: agrees(t), triple: t };
  }
  return { config: input.config, buildHash: input.buildHash, machine: input.machine, scale: input.scale, numbers };
}

/** P6 owns the budgets; the caller passes the ones that apply. A metric with no budget is reported only. */
export type Budgets = Readonly<Partial<Record<Metric, number>>>;

export function reportProblems(r: TierReport, budgets: Budgets): string[] {
  const out = configProblems(r.config);
  for (const m of METRICS) {
    const n = r.numbers[m], b = budgets[m];
    if (b === undefined) continue;
    if (!n) out.push(`${m}: not measured`);
    else if (!n.accepted) out.push(`${m}: the three measurements do not agree (spread ${n.spread.toFixed(3)})`);
    else if (n.value > b) out.push(`${m}: ${n.value} is over the budget of ${b}`);
  }
  return out;
}

function overBy(r: TierReport, budgets: Budgets): number {
  let worst = 0;
  for (const m of METRICS) {
    const n = r.numbers[m], b = budgets[m];
    if (b !== undefined && b > 0) worst = Math.max(worst, n ? n.value / b - 1 : Number.POSITIVE_INFINITY);
  }
  return worst;
}

export type ShippingChoice =
  | { readonly kind: 'ship'; readonly report: TierReport }
  /** No configuration meets the budgets: the two nearest go to Marlon (a slower week or a smaller world). Nothing is cut silently. */
  | { readonly kind: 'escalate'; readonly nearest: readonly TierReport[]; readonly options: readonly ['slower_week', 'smaller_world'] };

/**
 * Rule 3: the first configuration in ladder order inside every budget ships. Nothing is thinned beyond
 * what the budgets need. A report with a ruled-out step is never chosen.
 */
export function chooseShipping(reports: readonly TierReport[], budgets: Budgets): ShippingChoice {
  const legal = reports.filter((r) => configProblems(r.config).length === 0);
  const ordered = [...legal].sort((a, b) => a.config.thinned.length - b.config.thinned.length);
  const hit = ordered.find((r) => reportProblems(r, budgets).length === 0);
  if (hit) return { kind: 'ship', report: hit };
  const nearest = [...ordered].sort((a, b) => overBy(a, budgets) - overBy(b, budgets)).slice(0, 2);
  return { kind: 'escalate', nearest, options: ['slower_week', 'smaller_world'] };
}

export interface ReportDiff { readonly metric: Metric; readonly before: number | null; readonly after: number | null; readonly change: number | null }

/** Acceptance: a new report comes with a diff against the last. */
export function diffReports(before: TierReport, after: TierReport): ReportDiff[] {
  return METRICS.map((metric) => {
    const a = before.numbers[metric]?.value ?? null, b = after.numbers[metric]?.value ?? null;
    return { metric, before: a, after: b, change: a !== null && b !== null && a !== 0 ? (b - a) / a : null };
  });
}

/** Rule 5: rerun when a people count, the engine's play time or a budget moved by more than 10 percent. */
export function needsRerun(before: Readonly<Record<string, number>>, now: Readonly<Record<string, number>>): string[] {
  const limit = param('measure.rerunChange');
  const out: string[] = [];
  for (const k of [...new Set([...Object.keys(before), ...Object.keys(now)])].sort()) {
    const a = before[k], b = now[k];
    if (a === undefined || b === undefined) out.push(k);
    else if (a === 0 ? b !== 0 : Math.abs(b - a) / Math.abs(a) > limit) out.push(k);
  }
  return out;
}
