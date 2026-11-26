// Windows and relevance weights (G8.1.1 window choice, H2.1.1 rules 1 to 5 and edge case), the
// breakdown job list (H2.1.1) and cut-ups as saved queries (H2.1.3).
import { param } from './params.ts';
import { CUTS } from './cuts.ts';
import type { ChartedPlay } from './types.ts';

export type SelfWindow =
  | { readonly kind: 'lastGames'; readonly games?: number }
  | { readonly kind: 'season'; readonly season: number }
  | { readonly kind: 'career' };

/** Distinct games of the rows in schedule order. */
export function gamesOf(plays: readonly ChartedPlay[]): { gameId: number; gameOrder: number; season: number }[] {
  const m = new Map<number, { gameId: number; gameOrder: number; season: number }>();
  for (const p of plays) if (!m.has(p.gameId)) m.set(p.gameId, { gameId: p.gameId, gameOrder: p.gameOrder, season: p.season });
  return [...m.values()].sort((a, b) => a.season - b.season || a.gameOrder - b.gameOrder || a.gameId - b.gameId);
}

/** G8.1.1: last N games (default the last three), a season, or the career; every row weight 1. */
export function selfScoutWindow(plays: readonly ChartedPlay[], w: SelfWindow = { kind: 'lastGames' }): ChartedPlay[] {
  let keep: (p: ChartedPlay) => boolean;
  if (w.kind === 'career') keep = () => true;
  else if (w.kind === 'season') keep = (p) => p.season === w.season;
  else {
    const n = w.games ?? param('self.defaultWindowGames');
    const ids = new Set(gamesOf(plays).slice(-n).map((g) => g.gameId));
    keep = (p) => ids.has(p.gameId);
  }
  return plays.filter(keep).map((p) => ({ ...p, weight: 1 }));
}

export interface RelevanceContext {
  /** Team being scouted; rows of other teams are the caller's previous team (H2.2.2). */
  readonly teamId: number;
  readonly season: number;
  /** First game (gameOrder in `season`) under a new play caller, when the caller changed mid-season. */
  readonly callerChangeAtOrder?: number | null;
}

/**
 * H2.1.1 rule 4 weights: 1.0 for the last 4 games, 0.7 earlier this season, 0.4 last season, 0.5 for
 * the caller's previous team. Edge case: games before a mid-season caller change get 0.3 for call
 * tendencies (this weight; personnel views read the rows unweighted). Older seasons are dropped.
 */
export function relevanceWeights(plays: readonly ChartedPlay[], ctx: RelevanceContext): ChartedPlay[] {
  const thisSeason = gamesOf(plays.filter((p) => p.teamId === ctx.teamId && p.season === ctx.season));
  const recent = new Set(thisSeason.slice(-param('weight.recentGames')).map((g) => g.gameId));
  const out: ChartedPlay[] = [];
  for (const p of plays) {
    let w: number;
    if (p.teamId !== ctx.teamId) w = param('weight.previousTeam');
    else if (p.season === ctx.season) w = recent.has(p.gameId) ? param('weight.recent') : param('weight.earlierSeason');
    else if (p.season === ctx.season - 1) w = param('weight.lastSeason');
    else continue;
    if (p.teamId === ctx.teamId && ctx.callerChangeAtOrder != null && (p.season < ctx.season || p.gameOrder < ctx.callerChangeAtOrder)) {
      w = Math.min(w, param('weight.beforeCallerChange'));
    }
    out.push({ ...p, weight: w });
  }
  return out;
}

// ---- H2.1.1 breakdown jobs ----

export interface BreakdownStaff { readonly staffId: number; readonly speed: number; readonly hoursAvailable: number }
export interface BreakdownJob {
  readonly gameId: number;
  readonly side: 'offense' | 'defense';
  readonly staffId: number | null;
  readonly hours: number;
  /** Hours of that staff member's queue when this job is done. */
  readonly doneAtHours: number | null;
  readonly finished: boolean;
}

function clampSpeed(s: number): number {
  return Math.min(param('scope.speedMax'), Math.max(param('scope.speedMin'), s));
}

/**
 * Assigns each (game, side) to the staff member who would finish it first. A job finishes when it
 * fits inside his hours before the game-plan day; the rest are late (H2.1.1 rule 3, acceptance 1).
 */
export function breakdownJobs(gameIds: readonly number[], sides: readonly ('offense' | 'defense')[], staff: readonly BreakdownStaff[], hoursUntilPlanDay: number): { jobs: BreakdownJob[]; lateHours: number } {
  const used = new Map(staff.map((s) => [s.staffId, 0]));
  const jobs: BreakdownJob[] = [];
  let lateHours = 0;
  for (const gameId of gameIds) for (const side of sides) {
    let best: { s: BreakdownStaff; done: number; hours: number } | null = null;
    for (const s of staff) {
      const hours = param('scope.hoursPerGameSide') / clampSpeed(s.speed);
      const done = used.get(s.staffId)! + hours;
      if (!best || done < best.done || (done === best.done && s.staffId < best.s.staffId)) best = { s, done, hours };
    }
    if (!best) { jobs.push({ gameId, side, staffId: null, hours: param('scope.hoursPerGameSide'), doneAtHours: null, finished: false }); continue; }
    used.set(best.s.staffId, best.done);
    const cap = Math.min(best.s.hoursAvailable, hoursUntilPlanDay);
    const finished = best.done <= cap;
    if (!finished) lateHours = Math.max(lateHours, best.done - cap);
    jobs.push({ gameId, side, staffId: best.s.staffId, hours: best.hours, doneAtHours: best.done, finished });
  }
  return { jobs, lateHours };
}

/** H2.1.1 acceptance 2: no tendency number from a game that is not in a finished job. */
export function finishedOnly(plays: readonly ChartedPlay[], jobs: readonly BreakdownJob[]): ChartedPlay[] {
  const done = new Set(jobs.filter((j) => j.finished).map((j) => `${j.gameId}|${j.side}`));
  return plays.filter((p) => done.has(`${p.gameId}|${p.side}`));
}

// ---- H2.1.3 cut-ups ----

/** A saved query, not a copy (H2.1.3): cut values that must match, plus the side. */
export interface CutupFilter {
  readonly id: string;
  readonly side: 'offense' | 'defense';
  readonly where: Readonly<Record<string, readonly string[]>>;
  /** Extra condition for cut-ups no single cut expresses (explosives, turnovers, pressures). */
  readonly test?: 'explosive' | 'pressure' | 'third_down' | null;
}

const dd = (id: string, v: string): CutupFilter => ({ id, side: 'offense', where: { downDistance: [v] } });
/** H2.1.3 standard cut-ups (offense side; each has a defensive twin with side 'defense'). */
export const STANDARD_CUTUPS: readonly CutupFilter[] = [
  dd('1st_10', '1st_10'), dd('2nd_long', '2nd_long'), dd('2nd_medium', '2nd_medium'), dd('2nd_short', '2nd_short'),
  dd('3rd_long', '3rd_long'), dd('3rd_medium', '3rd_medium'), dd('3rd_short', '3rd_short'), dd('4th', '4th'),
  { id: 'red_zone', side: 'offense', where: { fieldZone: ['red_zone'] } },
  { id: 'goal_line', side: 'offense', where: { fieldZone: ['goal_line'] } },
  { id: 'backed_up', side: 'offense', where: { fieldZone: ['backed_up'] } },
  { id: 'two_minute', side: 'offense', where: { timeState: ['two_minute'] } },
  { id: 'all_pressures', side: 'defense', where: {}, test: 'pressure' },
  { id: 'third_down_coverage', side: 'defense', where: { down: ['3'] } },
];

export interface ExplosiveLine { readonly runYd: number; readonly passYd: number }

/** Plays matching a cut-up. An empty cut-up is returned with count zero, never hidden (H2.1.3 edge case). */
export function cutup(plays: readonly ChartedPlay[], f: CutupFilter, explosive?: ExplosiveLine): { id: string; count: number; refs: string[] } {
  const where = Object.entries(f.where).map(([k, v]) => { const c = CUTS[k]; if (!c) throw new Error(`unknown cut ${k}`); return [c, new Set(v)] as const; });
  const refs: string[] = [];
  for (const p of plays) {
    if (p.side !== f.side) continue;
    if (where.some(([c, v]) => { const x = c.of(p); return x === null || !v.has(x); })) continue;
    if (f.test === 'pressure' && !(p.rushers !== null && p.rushers >= param('chart.pressureRushers'))) continue;
    if (f.test === 'explosive') {
      if (!explosive) throw new Error('explosive cut-up needs the N2.2.3 thresholds');
      const pass = p.playKind !== null && !['run', 'draw', 'qb_run'].includes(p.playKind);
      if (p.yards < (pass ? explosive.passYd : explosive.runYd)) continue;
    }
    refs.push(p.ref);
  }
  return { id: f.id, count: refs.length, refs };
}

/** H2.1.3: watching a cut-up charges coach time by play count (seconds). */
export function watchSeconds(count: number): number {
  return count * param('cutup.secondsPerPlay');
}
