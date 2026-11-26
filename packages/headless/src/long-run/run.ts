// Q1.6.1 30-season run, Q1.6.4 drift over its yearly series, Q1.6.2 protection scan, and the P6.1.1
// 20-season advance measurement. Headless (P2.3.4). The harness owns nothing about how a season is
// played: it advances a `LongRunTarget` pass by pass, checks Q1.2.2 at every week boundary, measures
// time and save size, and reads the yearly series. Failures go back to the owning package.
import { driftReport, type DriftOptions, type DriftReport } from './drift.ts';
import { InvariantChecker, NOT_CHECKED } from './invariants.ts';
import { param } from './params.ts';
import { historyRunHits, inventedFamilyHits, protectedEventHits, protectedTextHits, type ProtectionHit } from './protection.ts';
import { SeriesTracker, UNAVAILABLE, type RecordFall, type SeasonPoint } from './series.ts';
import type { InvariantFailure, LongRunTarget, RosterLimits, SizePort, TextPort, WorldView } from './types.ts';

export interface LongRunOptions {
  readonly target: LongRunTarget;
  readonly seasons?: number;
  /** Save size port (G-83). Default: `canonicalBytes`, a stand-in until the retention save is bound. */
  readonly sizeOf?: SizePort;
  readonly text?: TextPort;
  readonly limits?: RosterLimits;
  /** Career start, for the history-run protection rule (X14.4.2). */
  readonly careerStart?: { seasonYear: number; dayIndex: number };
  /** Stop at the first invariant failure (Q1.2.2 catches the corrupting step; later failures are noise). */
  readonly stopOnFailure?: boolean;
  /** Wall clock in ms. Injected so tests are steady. */
  readonly now?: () => number;
  readonly drift?: DriftOptions;
}

export interface SeasonMeasure { readonly season: number; readonly ms: number; readonly saveBytes: number; readonly people: number; readonly events: number }

export interface LongRunReport {
  readonly completed: boolean;
  readonly seasonsAsked: number;
  readonly seasonsRun: number;
  readonly error: string | null;
  readonly ms: number;
  readonly perSeason: readonly SeasonMeasure[];
  readonly failures: readonly InvariantFailure[];
  readonly protection: readonly ProtectionHit[];
  readonly series: readonly SeasonPoint[];
  readonly recordFalls: readonly RecordFall[];
  readonly drift: DriftReport;
  readonly unboundSteps: readonly { step: string; reason: string }[];
  readonly notChecked: typeof NOT_CHECKED;
  readonly unavailableSeries: typeof UNAVAILABLE;
}

const clock = (): number => performance.now();

/** Stand-in save size until G-83's retention save is bound: UTF-8 bytes of the world's canonical JSON. */
export function canonicalBytes(world: WorldView): number {
  const json = JSON.stringify({
    people: [...world.people.values()], status: [...world.status], jobs: [...world.jobs.values()], rosters: [...world.rosters],
    pools: [...world.pools], seasons: world.seasons, results: world.results, log: world.log.rows(),
  });
  return new TextEncoder().encode(json).length;
}

/** Q1.6.1 for one seed. */
export function runLongRun(opts: LongRunOptions): LongRunReport {
  const { target } = opts;
  const seasons = opts.seasons ?? param('run.seasons');
  const now = opts.now ?? clock;
  const sizeOf = opts.sizeOf ?? canonicalBytes;
  const checker = new InvariantChecker();
  const tracker = new SeriesTracker();
  const failures: InvariantFailure[] = [];
  const protection: ProtectionHit[] = [];
  const perSeason: SeasonMeasure[] = [];
  const eventType = (id: string) => target.eventType(id);
  let error: string | null = null;
  let seasonsRun = 0;
  const t0 = now();

  const checkAt = (at: Parameters<InvariantChecker['check']>[0]['at'], command: string, hashBefore: string): boolean => {
    const f = checker.check({ world: target.view(), at, command, hashBefore, eventType, limits: opts.limits });
    failures.push(...f);
    return !(opts.stopOnFailure && f.length > 0);
  };

  try {
    run: for (let s = 0; s < seasons; s++) {
      const ts = now();
      const season = target.view().date.seasonYear;
      const weeks = target.weeksInSeason();
      while (target.view().week < weeks) {
        const week = target.view().week;
        const before = target.hash();
        target.runWeek();
        if (!checkAt({ kind: 'week', season, week }, `weekly pass ${season} week ${week}`, before)) break run;
      }
      const games = [...target.view().results];
      const before = target.hash();
      target.runSeasonPoint();
      const ok = checkAt({ kind: 'season_point', season }, `season point ${season}`, before);
      const w = target.view();
      tracker.record(w, season, games);
      if (opts.text) protection.push(...protectedTextHits(opts.text(w), w));
      perSeason.push({ season, ms: now() - ts, saveBytes: sizeOf(w), people: w.people.size, events: w.log.rows().length });
      seasonsRun++;
      if (!ok) break;
    }
  } catch (e) {
    error = e instanceof Error ? `${e.message}` : String(e);
  }

  const w = target.view();
  protection.push(...protectedEventHits(w.log.rows(), w.people, eventType), ...inventedFamilyHits(w));
  if (opts.careerStart) protection.push(...historyRunHits(w, opts.careerStart));
  return {
    completed: error === null && seasonsRun === seasons, seasonsAsked: seasons, seasonsRun, error, ms: now() - t0, perSeason,
    failures, protection, series: tracker.points, recordFalls: tracker.recordFalls,
    drift: driftReport(tracker.points, tracker.recordFalls, tracker.recordNames().length, opts.drift),
    unboundSteps: target.unbound(), notChecked: NOT_CHECKED, unavailableSeries: UNAVAILABLE,
  };
}

export interface SuiteOptions extends Omit<LongRunOptions, 'target'> {
  readonly seeds: readonly string[];
  readonly makeTarget: (seedHex: string) => LongRunTarget;
  /** Cores of the machine the suite ran on, for the 16-core budget (Q1.6.1). */
  readonly cores: number;
}

export interface SuiteVerdict {
  readonly seeds: readonly { readonly seedHex: string; readonly report: LongRunReport }[];
  readonly checks: readonly { readonly check: string; readonly pass: boolean; readonly detail: string }[];
  readonly pass: boolean;
}

/** Q1.6.1 acceptance over the seed set, plus Q1.6.4 drift and Q1.6.2 protection per seed. */
export function runStabilitySuite(opts: SuiteOptions): SuiteVerdict {
  const seeds = opts.seeds.map((seedHex) => ({ seedHex, report: runLongRun({ ...opts, target: opts.makeTarget(seedHex) }) }));
  const budgetMs = param('budget.runMinutes') * 60_000;
  const budgetBytes = param('budget.saveBytesAtEnd');
  const checks: { check: string; pass: boolean; detail: string }[] = [];
  for (const { seedHex, report: r } of seeds) {
    const end = r.perSeason[r.perSeason.length - 1];
    checks.push({ check: `${seedHex} completes`, pass: r.completed, detail: r.completed ? `${r.seasonsRun} seasons` : `stopped after ${r.seasonsRun}: ${r.error ?? 'invariant failure'}` });
    checks.push({ check: `${seedHex} invariants`, pass: r.failures.length === 0, detail: r.failures.length === 0 ? 'zero failures' : `${r.failures.length} failures, first: ${r.failures[0]!.invariant} at ${r.failures[0]!.command}: ${r.failures[0]!.detail}` });
    checks.push({ check: `${seedHex} run time`, pass: r.ms <= budgetMs, detail: `${(r.ms / 60_000).toFixed(2)} min on ${opts.cores} cores (budget ${param('budget.runMinutes')} min on ${param('budget.runCores')})` });
    checks.push({ check: `${seedHex} save size`, pass: (end?.saveBytes ?? 0) < budgetBytes, detail: `${end?.saveBytes ?? 0} bytes at season ${r.seasonsRun} (budget ${budgetBytes})` });
    checks.push({ check: `${seedHex} protection`, pass: r.protection.length === 0, detail: r.protection.length === 0 ? 'zero protected events' : `${r.protection.length} hits, first: ${r.protection[0]!.detail}` });
    const bad = r.drift.series.filter((s) => !s.pass && !s.ignored);
    checks.push({ check: `${seedHex} drift`, pass: r.drift.pass, detail: r.drift.pass ? `${r.drift.series.length} series flat; records ${r.drift.records.reason}` : `${bad.length} series drift (${bad.slice(0, 3).map((s) => `${s.series}: ${s.reason}`).join(' | ')}); records ${r.drift.records.reason}` });
  }
  return { seeds, checks, pass: checks.every((c) => c.pass) };
}

export interface AdvanceMeasure {
  readonly seasonsMeasured: number;
  readonly msPerSeason: number;
  readonly projectedMinutes: number;
  readonly targetSeasons: number;
  readonly budgetMinutes: number;
  readonly withinBudget: boolean;
  readonly note: string;
}

/**
 * P6.1.1: the 20-season advance. Runs `seasons` seasons (all 20 when asked) and projects to 20 from the
 * mean season time. The result is only as real as the game port bound into the target: with a test
 * double it measures the loop, not the engine, and the note says which.
 */
export function measureAdvance(target: LongRunTarget, seasons: number, now: () => number = clock, portLabel = 'bound game port'): AdvanceMeasure {
  const t0 = now();
  for (let s = 0; s < seasons; s++) {
    const weeks = target.weeksInSeason();
    while (target.view().week < weeks) target.runWeek();
    target.runSeasonPoint();
  }
  const ms = now() - t0;
  const targetSeasons = param('budget.advanceSeasons');
  const msPerSeason = seasons > 0 ? ms / seasons : 0;
  const projectedMinutes = (msPerSeason * targetSeasons) / 60_000;
  return {
    seasonsMeasured: seasons, msPerSeason, projectedMinutes, targetSeasons, budgetMinutes: param('budget.advanceMinutes'),
    withinBudget: projectedMinutes <= param('budget.advanceMinutes'),
    note: `${seasons === targetSeasons ? 'measured' : `projected from ${seasons} seasons`} with ${portLabel}; unbound steps: ${target.unbound().map((u) => u.step).join(', ') || 'none'}`,
  };
}

/** The G-81 loop functions the target needs, passed in so this package does not import the world package. */
export interface LoopFns<W, S> {
  runWeek(world: W, systems: S): void;
  runSeasonPoint(world: W, systems: S): unknown;
  worldHash(world: W, deep?: boolean): string;
  unboundSteps(systems: S): { step: string; reason: string }[];
}

/**
 * A `LongRunTarget` over the G-81 loop. The composition root calls it with `@gm/world`'s loop namespace,
 * the bound systems and schedule, and the event type registry of the world.
 */
export function loopTarget<W extends WorldView, S>(
  world: W, systems: S, schedule: { weeksInSeason(world: W): number }, fns: LoopFns<W, S>,
  eventType: LongRunTarget['eventType'],
): LongRunTarget {
  return {
    view: () => world,
    weeksInSeason: () => schedule.weeksInSeason(world),
    runWeek: () => fns.runWeek(world, systems),
    runSeasonPoint: () => { fns.runSeasonPoint(world, systems); },
    hash: () => fns.worldHash(world, false),
    eventType,
    unbound: () => fns.unboundSteps(systems),
  };
}
