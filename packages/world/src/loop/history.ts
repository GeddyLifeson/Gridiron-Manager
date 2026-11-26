// X10.3: the history run. The past is produced by playing it: the same weekly and season-point passes
// as live play, every game through the game port (the real engine), every event `source: history_run`.
// There is no separate history generator (X10.3.1 rule 3).
import { param as gparam } from '../generation/params.ts';
import { hash64Hex, utf8 } from '@gm/engine-core';
import { HISTORY_RUN_ENDED } from './events.ts';
import { activeTeamIds, isActive } from './lifecycle.ts';
import { runSeason, unboundSteps, type PassOptions } from './order.ts';
import type { LiveWorld, SchedulePort, SeasonSummary, StaffSeason, WorldSystems } from './types.ts';

export interface HistoryPlan {
  readonly seasons: number;
  readonly schedule: SchedulePort;
  /** Called after each season with its summary (the progress screen). Return 'stop' to start in the season reached. */
  readonly onSeason?: (summary: SeasonSummary, done: number, of: number) => 'continue' | 'stop' | void;
  readonly pass?: Omit<PassOptions, 'source'>;
  /** Seasons already played before a resume from a checkpoint (loop/checkpoint.ts). Default 0. */
  readonly alreadyDone?: number;
}

export interface HistoryRunReport {
  readonly seasonsRun: number;
  readonly stoppedEarly: boolean;
  /** Steps whose owning system was not bound for this run. A real history needs this empty. */
  readonly unbound: readonly { step: string; reason: string }[];
}

/** X10.3.1 rule 2: generated people only. Imported people are placed after the run (X14.4.2). */
export function importedPeople(world: LiveWorld): number[] {
  return [...world.people.values()].filter((p) => p.origin === 'imported').map((p) => p.id).sort((a, b) => a - b);
}

export function runHistory(world: LiveWorld, systems: WorldSystems, plan: HistoryPlan): HistoryRunReport {
  const imported = importedPeople(world);
  if (imported.length > 0) throw new Error(`history run refused: ${imported.length} imported people exist before the run (X10.3.1 rule 2)`);
  let done = plan.alreadyDone ?? 0, stoppedEarly = false;
  if (!Number.isInteger(done) || done < 0 || done > plan.seasons) throw new Error(`history run: alreadyDone ${done} is not between 0 and ${plan.seasons}`);
  for (; done < plan.seasons; ) {
    const summary = runSeason(world, systems, plan.schedule, { ...plan.pass, source: 'history_run' });
    done++;
    if (plan.onSeason?.(summary, done, plan.seasons) === 'stop' && done < plan.seasons) { stoppedEarly = true; break; }
  }
  if (plan.seasons > 0) {
    const r = world.log.emit({
      type: HISTORY_RUN_ENDED, date: world.date, witnesses: { kind: 'none' }, tier: 3, source: 'history_run',
      payload: { seasons: done, stopped_early: stoppedEarly, seed_step: world.seedStep },
    });
    if (!r.ok) throw new Error(`history_run_ended refused: ${r.reason}`);
  }
  return { seasonsRun: done, stoppedEarly, unbound: unboundSteps(systems) };
}

/** X10.3.1 acceptance and the X14.4.2 scan: history-run events that name an imported person. Must be empty. */
export function historyRunScan(world: LiveWorld): number[] {
  const bad: number[] = [];
  for (const e of world.log.rows()) {
    if (e.source !== 'history_run') continue;
    const ids = [...e.actors.map((a) => a.personId), ...e.subjects.filter((s) => s.kind === 'person').map((s) => s.id)];
    if (ids.some((id) => world.people.get(id)?.origin === 'imported')) bad.push(e.id);
  }
  return bad;
}

// ---------- X10.3.2: the validator ----------

/** Bands owned by other leaves (D13.4.1 tenure census, J15 league rates). A band not given is reported as not checked. */
export interface ValidatorBands {
  /** Mean completed head coach tenure in seasons (D13.4.1). */
  readonly headCoachTenureMean?: readonly [number, number];
  /** Points per team per game (J15). */
  readonly pointsPerTeamGame?: readonly [number, number];
  /** Pass plays over pass plus run plays (J15). */
  readonly passRate?: readonly [number, number];
  /** Extra legality problems from the roster and staff modules (C5, T5, S1.2.2), run by the caller. */
  readonly legalityProblems?: (world: LiveWorld) => readonly string[];
}

export interface ValidationResult {
  readonly pass: boolean;
  readonly failures: readonly string[];
  /** Checks that could not run because their band or binding was not given. Never counted as passed. */
  readonly notChecked: readonly string[];
}

/** Completed head coach tenures, in seasons, from the staff seasons kept by the loop. */
export function headCoachTenures(staffSeasons: readonly StaffSeason[], skipSeasons = 0): number[] {
  const byTeam = new Map<number, StaffSeason[]>();
  for (const s of staffSeasons) byTeam.set(s.teamId, [...(byTeam.get(s.teamId) ?? []), s]);
  const out: number[] = [];
  for (const rows of byTeam.values()) {
    rows.sort((a, b) => a.seasonYear - b.seasonYear);
    const first = rows[0]?.seasonYear ?? 0;
    let run = 0, startedAt = first;
    rows.forEach((r, i) => {
      const prev = rows[i - 1];
      if (prev && prev.headCoachId !== r.headCoachId) {
        if (prev.headCoachId !== null && startedAt - first >= skipSeasons) out.push(run);
        run = 0; startedAt = r.seasonYear;
      }
      run++;
    });
  }
  return out;
}

/** Depth of the deepest coaching tree: a head coach, an assistant of his who became a head coach, and so on (X3). */
export function coachingTreeDepth(staffSeasons: readonly StaffSeason[]): number {
  const firstHeadYear = new Map<number, number>();
  for (const s of staffSeasons) if (s.headCoachId !== null) firstHeadYear.set(s.headCoachId, Math.min(firstHeadYear.get(s.headCoachId) ?? s.seasonYear, s.seasonYear));
  // Mentor edges: head coach H had assistant A in year y, and A first became a head coach after y.
  const mentors = new Map<number, Set<number>>();
  for (const s of staffSeasons) {
    if (s.headCoachId === null) continue;
    for (const a of s.staffIds) {
      const y = firstHeadYear.get(a);
      if (y !== undefined && y > s.seasonYear && a !== s.headCoachId) mentors.set(a, (mentors.get(a) ?? new Set()).add(s.headCoachId));
    }
  }
  const depth = new Map<number, number>();
  const depthOf = (id: number, seen: Set<number>): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    let d = 1;
    for (const m of mentors.get(id) ?? []) if (!seen.has(m)) d = Math.max(d, 1 + depthOf(m, new Set(seen).add(id)));
    depth.set(id, d);
    return d;
  };
  let best = 0;
  for (const id of firstHeadYear.keys()) best = Math.max(best, depthOf(id, new Set()));
  return best;
}

/** X10.3.2: reject a history that is dull or broken. Starting bounds, written for a 30-season run. */
export function validateHistory(world: LiveWorld, bands: ValidatorBands = {}): ValidationResult {
  const failures: string[] = [];
  const notChecked: string[] = [];
  const seasons = world.seasons;
  if (seasons.length === 0) return { pass: true, failures, notChecked: ['history length 0: nothing to validate (X10.3.2 edge case)'] };
  const decade = gparam('validate.decade');

  // Champions: at least 3 different per level per full decade, and no team above 60 percent of titles.
  for (const comp of world.competitions) {
    // Only seasons in which the competition had two teams to play can have a champion (teams found and fold).
    const played = seasons.filter((s) => activeTeamIds(world, comp.teamIds, s.seasonYear).length >= 2);
    const titles = played.map((s) => s.champions[comp.id]).filter((t): t is number => t !== undefined);
    if (titles.length < played.length) failures.push(`competition ${comp.id}: ${played.length - titles.length} seasons have no champion`);
    for (let i = 0; i + decade <= titles.length; i += decade) {
      const distinct = new Set(titles.slice(i, i + decade)).size;
      if (distinct < gparam('validate.championsPerDecade')) failures.push(`competition ${comp.id}: ${distinct} different champions in seasons ${i + 1} to ${i + decade}`);
    }
    const counts = new Map<number, number>();
    for (const t of titles) counts.set(t, (counts.get(t) ?? 0) + 1);
    const top = Math.max(0, ...counts.values());
    if (titles.length >= decade && top / titles.length > gparam('validate.maxTitleShare')) failures.push(`competition ${comp.id}: one team holds ${top} of ${titles.length} titles`);
  }

  // Head coach tenure inside the D13.4.1 band (the first seasons are left out, X10.2.2 rule 6).
  const tenures = headCoachTenures(world.staffSeasons, gparam('calibration.skipSeasons'));
  if (!bands.headCoachTenureMean) notChecked.push('head coach tenure band (D13.4.1) not given');
  else if (tenures.length === 0) failures.push('no completed head coach tenure: the job market did not move');
  else {
    const mean = tenures.reduce((a, b) => a + b, 0) / tenures.length;
    const [lo, hi] = bands.headCoachTenureMean;
    if (mean < lo || mean > hi) failures.push(`mean head coach tenure ${mean.toFixed(2)} seasons is outside ${lo} to ${hi}`);
  }

  // A coaching tree of depth 3 (from the history length where X10.1.1 says one can exist).
  if (seasons.length >= gparam('validate.treeDepthSeasons')) {
    const d = coachingTreeDepth(world.staffSeasons);
    if (d < gparam('validate.treeDepth')) failures.push(`deepest coaching tree is ${d}, needs ${gparam('validate.treeDepth')}`);
  }

  // At least one team rivalry per conference.
  const teamById = new Map(world.teams.map((t) => [t.id, t]));
  for (const c of world.conferences.filter((x) => x.kind === 'conference')) {
    const members = new Set(activeTeamIds(world, c.teamIds));
    if (members.size < 2) continue;
    const has = [...members].some((id) => teamById.get(id)!.rivalTeamIds.some((r) => members.has(r)));
    if (!has) failures.push(`conference ${c.id} (${c.name}) has no rivalry`);
  }

  // Rosters and staffs legal.
  for (const t of world.teams) {
    if (!isActive(world, t.id)) continue;
    if ((world.rosters.get(t.id) ?? []).length === 0) failures.push(`team ${t.id} has no players`);
  }
  const lastStaff = world.staffSeasons.filter((s) => s.seasonYear === seasons[seasons.length - 1]!.seasonYear);
  for (const s of lastStaff) if (s.headCoachId === null) failures.push(`team ${s.teamId} ended the run with no head coach`);
  if (bands.legalityProblems) failures.push(...bands.legalityProblems(world));
  else notChecked.push('roster and staff limits (C5, T5, S1.2.2) not bound');

  // League scoring and pass rates inside the J15 bands.
  const games = seasons.reduce((a, s) => a + s.games, 0), points = seasons.reduce((a, s) => a + s.points, 0);
  const pass = seasons.reduce((a, s) => a + s.passPlays, 0), run = seasons.reduce((a, s) => a + s.runPlays, 0);
  if (!bands.pointsPerTeamGame) notChecked.push('scoring band (J15) not given');
  else if (games === 0) failures.push('no games were played');
  else {
    const ppg = points / (games + games);
    if (ppg < bands.pointsPerTeamGame[0] || ppg > bands.pointsPerTeamGame[1]) failures.push(`points per team game ${ppg.toFixed(2)} is outside ${bands.pointsPerTeamGame[0]} to ${bands.pointsPerTeamGame[1]}`);
  }
  if (!bands.passRate) notChecked.push('pass rate band (J15) not given');
  else if (pass + run > 0) {
    const rate = pass / (pass + run);
    if (rate < bands.passRate[0] || rate > bands.passRate[1]) failures.push(`pass rate ${rate.toFixed(3)} is outside ${bands.passRate[0]} to ${bands.passRate[1]}`);
  } else failures.push('no plays were counted');

  // No population pool empty.
  const last = seasons[seasons.length - 1]!;
  for (const [name, n] of Object.entries(last.pools)) if (n === 0) failures.push(`population pool ${name} is empty`);
  if (Object.keys(last.pools).length === 0) notChecked.push('population pools: none tracked');

  return { pass: failures.length === 0, failures, notChecked };
}

export interface BuiltHistory {
  readonly world: LiveWorld;
  readonly report: HistoryRunReport;
  readonly validation: ValidationResult;
  /** 0, or 1 when the first run failed validation and the redo was used. Recorded beside the world code. */
  readonly seedStep: number;
  /** True when both tries failed: the user is told and offered a new seed (X10.3.2). */
  readonly failedTwice: boolean;
  readonly firstTryFailures: readonly string[];
}

/**
 * Build a world, run its history and validate it. On failure the run is redone once with the derived
 * seed (seed plus 1). A run the user stopped early is kept as it stands and is not redone.
 */
export function buildWithHistory(
  make: (seedStep: number) => { world: LiveWorld; systems: WorldSystems; plan: HistoryPlan },
  bands: ValidatorBands = {},
): BuiltHistory {
  let firstTryFailures: readonly string[] = [];
  for (let step = 0; ; step++) {
    const { world, systems, plan } = make(step);
    const report = runHistory(world, systems, plan);
    const validation = validateHistory(world, bands);
    if (validation.pass || report.stoppedEarly || step === 1) {
      return { world, report, validation, seedStep: step, failedTwice: step === 1 && !validation.pass, firstTryFailures };
    }
    firstTryFailures = validation.failures;
  }
}

// ---------- X10.3.3: the time budget ----------

export interface BudgetInput { readonly seasons: number; readonly gamesPerSeason: number; readonly gameMs: number; readonly seasonMs: number }

/** T = S x (G x t_game + t_season), in seconds. */
export function historySeconds(b: BudgetInput): number {
  return (b.seasons * (b.gamesPerSeason * b.gameMs + b.seasonMs)) / 1000;
}

/** The slowest game that still meets the starting target (X10.3.3 example of the arithmetic). */
export function gameMsForTarget(gamesPerSeason: number, seasonMs = 0): number {
  return ((gparam('budget.targetSeconds') * 1000) / gparam('budget.targetSeasons') - seasonMs) / gamesPerSeason;
}

/** Edge case: a slower machine scales the estimate from a short benchmark run at setup. */
export function scaledEstimate(referenceSeconds: number, benchmarkMsHere: number, benchmarkMsReference: number): number {
  return referenceSeconds * (benchmarkMsHere / benchmarkMsReference);
}

/** X10.1.1 acceptance: the estimate is within 25 percent of the measured time. */
export function estimateWithinTolerance(estimateSeconds: number, actualSeconds: number): boolean {
  return Math.abs(estimateSeconds - actualSeconds) <= gparam('budget.estimateTolerance') * actualSeconds;
}

/** Games in one season of this world, for the budget and the setup screen's estimate. */
export function gamesInSeason(world: LiveWorld, schedule: SchedulePort): number {
  let n = 0;
  for (let w = 0; w < schedule.weeksInSeason(world); w++) n += schedule.gamesOn(world, w).length;
  return n;
}

// ---------- Rerun history (Marlon 2026-11-26, the Dwarf Fortress-style world generation) ----------

/**
 * The seed of the n-th rerun of a world: derived from the first seed, so the first seed and the rerun
 * count still name the world. Rerun 0 is the first seed itself.
 */
export function rerunSeedHex(seedHex: string, rerun: number): string {
  if (!Number.isInteger(rerun) || rerun < 0) throw new Error('rerun: a whole number, 0 or more');
  return rerun === 0 ? seedHex : hash64Hex(utf8(`${seedHex}:rerun:${rerun}`));
}

export interface HistoryDraft {
  readonly rerun: number;
  readonly seedHex: string;
  readonly built: BuiltHistory;
}

/**
 * Generate one draft of the past for the player to look over before the career starts. Rerunning asks for
 * the next draft with a fresh seed; the player keeps whichever draft he starts in. Data baked into the
 * game (calibration tables from the master data run) is never touched by a rerun.
 */
export function draftHistory(
  baseSeedHex: string, rerun: number,
  make: (seedHex: string, seedStep: number) => { world: LiveWorld; systems: WorldSystems; plan: HistoryPlan },
  bands: ValidatorBands = {},
): HistoryDraft {
  const seedHex = rerunSeedHex(baseSeedHex, rerun);
  return { rerun, seedHex, built: buildWithHistory((step) => make(seedHex, step), bands) };
}
