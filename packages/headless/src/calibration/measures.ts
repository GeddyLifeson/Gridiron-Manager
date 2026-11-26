// Calibration measures (WP-13; J15, Q2.1.1, J14.6.1). A target row's `filter` starts with a measure
// name, `<name>(<args>)@<quantile points>: <words>`. Every measure turns a sample of finished games into
// a list of observations, one per counted unit (team game, game, drive, attempt, carry, snap). The
// target kind then reads that list: rate and mean take its mean, sd its sample standard deviation,
// quantiles its quantiles. So one definition serves every kind, and a row's value can be recomputed
// from the observations alone (Q2.3.1 acceptance).
//
// Measures read only called values from the play-by-play row and the game summary (D14, J11.9.1), the
// same columns the real-data scripts read. Where the row or summary has no field for a measure, the
// measure returns null and the report prints NOT MEASURABLE; it never guesses.
import type { GameSummary, PlayByPlayRow, DriveRecord } from '@gm/schema';
import { foulStatLabel } from '@gm/rules-data';

/** What the harness measures: finished games of one rule set (J14.6.1 league mode). */
export interface CalibrationSample {
  readonly summaries: readonly GameSummary[];
  readonly plays: readonly PlayByPlayRow[];
}

export interface ParsedMeasure {
  /** Family name, for example `kick.fieldGoalPct`. `none` and `ordering` are reserved. */
  readonly name: string;
  readonly args: readonly string[];
  /** Quantile points in percent, from `@5,10,...`; null when the filter has none. */
  readonly quantiles: readonly number[] | null;
}

/** Splits a filter into its measure part. `game.marginAtMost(8): words` gives name, args ['8']. */
export function parseMeasure(filter: string): ParsedMeasure {
  const cut = filter.indexOf(': ');
  const head = (cut >= 0 ? filter.slice(0, cut) : filter).trim();
  const at = head.indexOf('@');
  const body = at >= 0 ? head.slice(0, at) : head;
  const quantiles = at >= 0 ? head.slice(at + 1).split(',').map((s) => Number(s)) : null;
  const open = body.indexOf('(');
  if (open < 0) return { name: body, args: [], quantiles };
  if (!body.endsWith(')')) throw new Error(`measure "${head}": unclosed argument list`);
  const args = body.slice(open + 1, -1).split(',').map((s) => s.trim());
  return { name: body.slice(0, open), args, quantiles };
}

/** Observations for one measure, or null when the sample shape cannot support it. */
export type Observations = number[] | null;
type MeasureFn = (s: Indexed, args: readonly string[]) => Observations;

// ---------- play classification (one place, so every measure counts the same plays) ----------

const ATTEMPT_RESULTS = new Set(['pass_complete', 'pass_incomplete', 'interception']);

/** A down that counts: from scrimmage, not wiped out by a penalty (J11.9.1: no-play rows carry no statistics). */
export function isCountedScrimmage(r: PlayByPlayRow): boolean { return r.playKind === 'scrimmage' && !r.noPlay; }
export function isKneel(r: PlayByPlayRow): boolean { return r.offenseKind === 'kneel' || r.resultType === 'kneel'; }
export function isSpike(r: PlayByPlayRow): boolean { return r.offenseKind === 'spike' || r.resultType === 'spike'; }
/** Offense ran a play (not a kick) from scrimmage. */
function isOffensePlay(r: PlayByPlayRow): boolean { return isCountedScrimmage(r) && r.kickKind === null; }
/** "Pass and run plays": the J15 denominator. Kneel-downs and spikes out, sacks and scrambles in. */
export function isPassOrRun(r: PlayByPlayRow): boolean { return isOffensePlay(r) && !isKneel(r) && !isSpike(r); }
/** Dropback: a called pass or a scramble (J15.3.2), spikes out. */
export function isDropback(r: PlayByPlayRow): boolean { return isPassOrRun(r) && r.dropback; }
/** Pass play in the public play-type sense: attempts and sacks; scrambles count as runs. */
export function isPassPlay(r: PlayByPlayRow): boolean { return isDropback(r) && !r.scramble; }
/** Pass attempt: a pass play that was not a sack (spikes are excluded by isPassOrRun). */
export function isAttempt(r: PlayByPlayRow): boolean { return isPassPlay(r) && !r.sack; }
/** Completion. A completed pass the receiver then fumbles away still counts (it carries yards after catch). */
export function isCompletion(r: PlayByPlayRow): boolean {
  return isAttempt(r) && (r.resultType === 'pass_complete' || (r.resultType === 'fumble_lost' && r.yardsAfterCatch !== null));
}
/** Carry, public play type run: designed runs and scrambles in, kneel-downs out. */
export function isCarry(r: PlayByPlayRow): boolean { return isPassOrRun(r) && (!r.dropback || r.scramble); }
/** Official rushing attempt: carries plus kneel-downs. */
function isOfficialCarry(r: PlayByPlayRow): boolean { return isOffensePlay(r) && !isSpike(r) && (!r.dropback || r.scramble || isKneel(r)); }
function isDesignedRun(r: PlayByPlayRow): boolean { return isPassOrRun(r) && !r.dropback; }
function isPassTouchdown(r: PlayByPlayRow): boolean { return r.touchdown && isCompletion(r) && !r.fumbleLost; }
function isRushTouchdown(r: PlayByPlayRow): boolean { return r.touchdown && isCarry(r) && !r.fumbleLost; }
/** Converted: first down or touchdown on the play. */
function converted(r: PlayByPlayRow): boolean { return r.firstDown || (r.touchdown && !r.interception && !r.fumbleLost); }
/** Yards to go as a whole number, the public convention: inches count as 1. */
export function yardsToGoInt(r: PlayByPlayRow): number | null {
  if (r.distanceYd === null) return null;
  return Math.max(1, Math.ceil(r.distanceYd - 1e-9));
}
/** Air yards to the nearest yard, the public convention, for depth bins. */
function airInt(r: PlayByPlayRow): number | null { return r.airYd === null ? null : Math.round(r.airYd); }
function isFieldGoal(r: PlayByPlayRow): boolean { return isCountedScrimmage(r) && r.kickKind === 'field_goal'; }
function isPunt(r: PlayByPlayRow): boolean { return isCountedScrimmage(r) && r.kickKind === 'punt'; }
function isKickoff(r: PlayByPlayRow): boolean { return !r.noPlay && (r.kickKind === 'kickoff' || r.kickKind === 'onside_kick'); }
function isTry(r: PlayByPlayRow): boolean { return r.playKind === 'try' && !r.noPlay; }
function isKickedTry(r: PlayByPlayRow): boolean { return isTry(r) && r.kickKind === 'try_kick'; }
function isTwoPointTry(r: PlayByPlayRow): boolean { return isTry(r) && r.kickKind === null; }
type FourthChoice = 'punt' | 'fieldGoal' | 'go';
function fourthChoice(r: PlayByPlayRow): FourthChoice | null {
  if (!isCountedScrimmage(r) || r.down !== 4) return null;
  if (r.kickKind === 'punt') return 'punt';
  if (r.kickKind === 'field_goal') return 'fieldGoal';
  if (isPassOrRun(r)) return 'go';
  return null;
}

// ---------- indexing ----------

interface DriveKey { readonly gameId: number; readonly driveNumber: number }
interface Indexed {
  readonly s: CalibrationSample;
  readonly playsByGame: Map<number, PlayByPlayRow[]>;
  /** Drives from the summaries with the plays of each drive, matched on (gameId, driveNumber). */
  readonly drives: { readonly key: DriveKey; readonly drive: DriveRecord; readonly plays: PlayByPlayRow[] }[];
}

function index(s: CalibrationSample): Indexed {
  const playsByGame = new Map<number, PlayByPlayRow[]>();
  for (const r of s.plays) {
    let a = playsByGame.get(r.gameId);
    if (!a) { a = []; playsByGame.set(r.gameId, a); }
    a.push(r);
  }
  const drives: Indexed['drives'] = [];
  for (const g of s.summaries) {
    const gp = playsByGame.get(g.gameId) ?? [];
    for (const d of g.drives) drives.push({ key: { gameId: g.gameId, driveNumber: d.driveNumber }, drive: d, plays: gp.filter((r) => r.driveNumber === d.driveNumber) });
  }
  return { s, playsByGame, drives };
}

// ---------- small helpers ----------

const bit = (b: boolean): number => (b ? 1 : 0);
function obsOf(rows: readonly PlayByPlayRow[], keep: (r: PlayByPlayRow) => boolean, value: (r: PlayByPlayRow) => number): number[] {
  const out: number[] = [];
  for (const r of rows) if (keep(r)) out.push(value(r));
  return out;
}
function num(a: string | undefined, what: string): number {
  const v = Number(a);
  if (a === undefined || a === '' || !Number.isFinite(v)) throw new Error(`measure argument ${what}: "${a}" is not a number`);
  return v;
}
function inBin(v: number | null, lo: number, hi: number): boolean { return v !== null && v >= lo && v <= hi; }
/** One observation per team game: f(side, summary, plays of that game). */
function perTeamGame(x: Indexed, f: (side: 0 | 1, g: GameSummary, plays: readonly PlayByPlayRow[]) => number): number[] {
  const out: number[] = [];
  for (const g of x.s.summaries) {
    const plays = x.playsByGame.get(g.gameId) ?? [];
    out.push(f(0, g, plays), f(1, g, plays));
  }
  return out;
}
function perGame(x: Indexed, f: (g: GameSummary, plays: readonly PlayByPlayRow[]) => number): number[] {
  return x.s.summaries.map((g) => f(g, x.playsByGame.get(g.gameId) ?? []));
}
const count = (rows: readonly PlayByPlayRow[], keep: (r: PlayByPlayRow) => boolean): number => { let n = 0; for (const r of rows) if (keep(r)) n++; return n; };
const margin = (g: GameSummary): number => g.finalScore[0] - g.finalScore[1];
function driveResultSet(arg: string | undefined): Set<string> { return new Set((arg ?? '').split('+')); }
function penaltiesOn(r: PlayByPlayRow): PlayByPlayRow['penalties'] { return r.penalties; }
/** A snap of either side's unit for pre-snap foul rates: every scrimmage down, no-play rows included (that is where pre-snap fouls live). */
function isSnapRow(r: PlayByPlayRow): boolean { return r.playKind === 'scrimmage' && r.kickKind === null; }
function hasRedZoneSnap(plays: readonly PlayByPlayRow[]): boolean { return plays.some((r) => r.playKind === 'scrimmage' && !r.noPlay && r.yardsToGoalYd <= 20); }

// ---------- the catalogue ----------

const M: Record<string, MeasureFn> = {
  // Game level (J15.2.1, T12.1.1, T12.2.1)
  'game.pointsPerTeam': (x) => perTeamGame(x, (s, g) => g.finalScore[s]),
  'game.totalPoints': (x) => perGame(x, (g) => g.finalScore[0] + g.finalScore[1]),
  'game.homeMargin': (x) => perGame(x, margin),
  'game.homeWin': (x) => perGame(x, (g) => bit(margin(g) > 0)),
  'game.absMargin': (x) => perGame(x, (g) => Math.abs(margin(g))),
  'game.marginAtMost': (x, a) => { const n = num(a[0], 'points'); return perGame(x, (g) => bit(Math.abs(margin(g)) <= n)); },
  'game.marginAtLeast': (x, a) => { const n = num(a[0], 'points'); return perGame(x, (g) => bit(Math.abs(margin(g)) >= n)); },
  'game.overtime': (x) => perGame(x, (g) => bit(g.overtime)),
  'game.tie': (x) => perGame(x, (g) => bit(g.tie)),
  'game.scrimmagePlays': (x) => perGame(x, (_g, p) => count(p, isPassOrRun)),
  'game.scrimmagePlaysPerTeam': (x) => perTeamGame(x, (s, _g, p) => count(p, (r) => r.offense === s && isPassOrRun(r))),
  'game.scrimmagePlaysOfficial': (x) => perGame(x, (_g, p) => count(p, (r) => isOffensePlay(r))),
  'game.turnovers': (x) => perGame(x, (g) => g.teams[0].turnovers + g.teams[1].turnovers),
  'game.sacks': (x) => perGame(x, (g) => g.teams[0].sacksMade + g.teams[1].sacksMade),
  'game.timeoutsUsed': (x) => perGame(x, (g) => g.teams[0].timeoutsUsed + g.teams[1].timeoutsUsed),
  'game.penaltiesAccepted': (x) => perGame(x, (g) => g.teams[0].penaltiesAccepted + g.teams[1].penaltiesAccepted),
  'game.penaltiesAcceptedPerTeam': (x) => perTeamGame(x, (s, g) => g.teams[s].penaltiesAccepted),
  'game.penaltyYards': (x) => perGame(x, (g) => g.teams[0].penaltyYards + g.teams[1].penaltyYards),
  'game.penaltyYardsPerTeam': (x) => perTeamGame(x, (s, g) => g.teams[s].penaltyYards),
  'game.yardsPerPenalty': (x) => { const out: number[] = []; for (const r of x.s.plays) for (const p of penaltiesOn(r)) out.push(p.yards); return out; },
  'game.punts': (x) => perGame(x, (_g, p) => count(p, isPunt)),
  'game.puntsPerTeam': (x) => perTeamGame(x, (s, _g, p) => count(p, (r) => r.offense === s && isPunt(r))),
  'game.kickoffs': (x) => perGame(x, (_g, p) => count(p, isKickoff)),
  'game.twoPointAttempts': (x) => perGame(x, (_g, p) => count(p, isTwoPointTry)),
  'game.fieldGoalAttemptsAtLeast': (x, a) => { const n = num(a[0], 'yards'); return perGame(x, (_g, p) => count(p, (r) => isFieldGoal(r) && r.kickDistanceYd !== null && r.kickDistanceYd >= n)); },
  'game.fieldGoalAttemptsPerTeam': (x) => perTeamGame(x, (s, _g, p) => count(p, (r) => r.offense === s && isFieldGoal(r))),

  // Drives (J15.3.1, T12.5.1)
  'drive.perGame': (x) => perGame(x, (g) => g.drives.length),
  'drive.perTeamGame': (x) => perTeamGame(x, (s, g) => g.drives.filter((d) => d.side === s).length),
  'drive.plays': (x) => x.drives.map((d) => d.drive.plays),
  'drive.yards': (x) => x.drives.map((d) => d.drive.yards),
  'drive.seconds': (x) => x.drives.map((d) => d.drive.clockUsedTenths / 10),
  'drive.pointsTd7Fg3': (x) => x.drives.map((d) => (d.drive.result === 'touchdown' ? 7 : d.drive.result === 'field_goal' ? 3 : 0)),
  'drive.result': (x, a) => { const set = driveResultSet(a[0]); return x.drives.map((d) => bit(set.has(d.drive.result))); },
  'drive.redZoneShare': (x) => x.drives.map((d) => bit(hasRedZoneSnap(d.plays))),
  'drive.redZoneResult': (x, a) => { const set = driveResultSet(a[0]); return x.drives.filter((d) => hasRedZoneSnap(d.plays)).map((d) => bit(set.has(d.drive.result))); },

  // Down, distance, field position (J15.3.2, T12.3.1, T12.4.1)
  'situation.passPlayShare': (x) => obsOf(x.s.plays, isPassOrRun, (r) => bit(isPassPlay(r))),
  'situation.dropbackShare': (x) => obsOf(x.s.plays, isPassOrRun, (r) => bit(r.dropback)),
  'situation.firstAnd10.passPlayShare': (x) => obsOf(x.s.plays, (r) => isPassOrRun(r) && r.down === 1 && yardsToGoInt(r) === 10, (r) => bit(isPassPlay(r))),
  'situation.firstAnd10.dropbackShare': (x) => obsOf(x.s.plays, (r) => isPassOrRun(r) && r.down === 1 && yardsToGoInt(r) === 10, (r) => bit(r.dropback)),
  'situation.shotgunShare': (x) => obsOf(x.s.plays, isPassOrRun, (r) => bit(r.shotgun)),
  'situation.noHuddleShare': (x) => obsOf(x.s.plays, isPassOrRun, (r) => bit(r.noHuddle)),
  'situation.thirdDownConversion': (x) => obsOf(x.s.plays, (r) => isPassOrRun(r) && r.down === 3, (r) => bit(converted(r))),
  'situation.fourthDownConversion': (x) => obsOf(x.s.plays, (r) => isPassOrRun(r) && r.down === 4, (r) => bit(converted(r))),
  'situation.conversion': (x, a) => {
    const down = num(a[0], 'down'), lo = num(a[1], 'from'), hi = num(a[2], 'to');
    return obsOf(x.s.plays, (r) => isPassOrRun(r) && r.down === down && inBin(yardsToGoInt(r), lo, hi), (r) => bit(converted(r)));
  },
  'situation.touchdownPerPlay': (x, a) => {
    const lo = num(a[0], 'from'), hi = num(a[1], 'to');
    return obsOf(x.s.plays, (r) => isPassOrRun(r) && r.yardsToGoalYd >= lo && r.yardsToGoalYd <= hi, (r) => bit(r.touchdown && !r.interception && !r.fumbleLost));
  },
  'situation.fourthDown.share': (x, a) => {
    const want = a[0] as FourthChoice;
    if (want !== 'punt' && want !== 'fieldGoal' && want !== 'go') throw new Error(`situation.fourthDown.share: unknown choice ${a[0]}`);
    const out: number[] = [];
    for (const r of x.s.plays) { const c = fourthChoice(r); if (c) out.push(bit(c === want)); }
    return out;
  },
  'situation.fourthDown.goRate': (x, a) => {
    const lo = num(a[0], 'from'), hi = num(a[1], 'to');
    const out: number[] = [];
    for (const r of x.s.plays) { const c = fourthChoice(r); const y = yardsToGoInt(r); if (c && y !== null && y >= lo && y <= hi) out.push(bit(c === 'go')); }
    return out;
  },
  // Snap-to-snap clock, quarters 1 to 3, by the play that started the interval (J11.4.1).
  'situation.secondsPerPlay': (x, a) => {
    const kind = a[0];
    const keep = kind === 'pass' ? isPassPlay : kind === 'run' ? isCarry : null;
    if (!keep) throw new Error(`situation.secondsPerPlay: unknown play type ${kind}`);
    return obsOf(x.s.plays, (r) => keep(r) && r.period <= 3 && r.snapToSnapTenths !== null, (r) => (r.snapToSnapTenths ?? 0) / 10);
  },
  // Score within 3; not in the last 2:00 of either half nor the last 4:00 of regulation (J15.3.2 row note).
  'situation.neutralPassRate': (x) => obsOf(x.s.plays, (r) => isPassOrRun(r) && Math.abs(r.scoreOffense - r.scoreDefense) <= 3 && r.period <= 4
    && !((r.period === 2 || r.period === 4) && r.clockTenths <= 1200) && !(r.period === 4 && r.clockTenths <= 2400), (r) => bit(r.dropback)),

  // Passing (J15.4.1, T12.3.1)
  'pass.completionPct': (x) => obsOf(x.s.plays, isAttempt, (r) => bit(isCompletion(r))),
  'pass.yardsPerAttempt': (x) => obsOf(x.s.plays, isAttempt, (r) => (isCompletion(r) ? r.yardsGained : 0)),
  'pass.yardsPerCompletion': (x) => obsOf(x.s.plays, isCompletion, (r) => r.yardsGained),
  'pass.airYardsPerAttempt': (x) => obsOf(x.s.plays, (r) => isAttempt(r) && r.airYd !== null, (r) => r.airYd ?? 0),
  'pass.yacPerCompletion': (x) => obsOf(x.s.plays, (r) => isCompletion(r) && r.yardsAfterCatch !== null, (r) => r.yardsAfterCatch ?? 0),
  'pass.touchdownPerAttempt': (x) => obsOf(x.s.plays, isAttempt, (r) => bit(isPassTouchdown(r))),
  'pass.interceptionPerAttempt': (x) => obsOf(x.s.plays, isAttempt, (r) => bit(r.interception)),
  'pass.gainAtLeastShare': (x, a) => { const n = num(a[0], 'yards'); return obsOf(x.s.plays, isAttempt, (r) => bit(isCompletion(r) && r.yardsGained >= n)); },
  'pass.sackRate': (x) => obsOf(x.s.plays, isPassPlay, (r) => bit(r.sack)),
  'pass.sackYards': (x) => obsOf(x.s.plays, (r) => isPassPlay(r) && r.sack, (r) => -r.yardsGained),
  'pass.fumbleLostPerPassPlay': (x) => obsOf(x.s.plays, isPassPlay, (r) => bit(r.fumbleLost)),
  'pass.scrambleShare': (x) => obsOf(x.s.plays, isDropback, (r) => bit(r.scramble)),
  'pass.scrambleYards': (x) => obsOf(x.s.plays, (r) => isDropback(r) && r.scramble, (r) => r.yardsGained),
  'pass.completedGain': (x) => obsOf(x.s.plays, isCompletion, (r) => r.yardsGained),
  'pass.depth.completionPct': (x, a) => { const lo = num(a[0], 'from'), hi = num(a[1], 'to'); return obsOf(x.s.plays, (r) => isAttempt(r) && inBin(airInt(r), lo, hi), (r) => bit(isCompletion(r))); },
  'pass.depth.interceptionPct': (x, a) => { const lo = num(a[0], 'from'), hi = num(a[1], 'to'); return obsOf(x.s.plays, (r) => isAttempt(r) && inBin(airInt(r), lo, hi), (r) => bit(r.interception)); },

  // Pressure (J15.4.2). The simulated pressure flag is J6.2.5's, held fixed.
  'pressure.rate': (x) => obsOf(x.s.plays, isDropback, (r) => bit(r.pressure)),
  'pressure.underPressure.completionPct': (x) => obsOf(x.s.plays, (r) => isAttempt(r) && r.pressure, (r) => bit(isCompletion(r))),
  'pressure.underPressure.yardsPerAttempt': (x) => obsOf(x.s.plays, (r) => isAttempt(r) && r.pressure, (r) => (isCompletion(r) ? r.yardsGained : 0)),
  'pressure.underPressure.sackShare': (x) => obsOf(x.s.plays, (r) => isDropback(r) && r.pressure, (r) => bit(r.sack)),
  'pressure.clean.completionPct': (x) => obsOf(x.s.plays, (r) => isAttempt(r) && !r.pressure, (r) => bit(isCompletion(r))),
  'pressure.clean.yardsPerAttempt': (x) => obsOf(x.s.plays, (r) => isAttempt(r) && !r.pressure, (r) => (isCompletion(r) ? r.yardsGained : 0)),
  'pressure.byRushers.pressureRate': (x, a) => { const lo = num(a[0], 'from'), hi = num(a[1], 'to'); return obsOf(x.s.plays, (r) => isDropback(r) && inBin(r.rushers, lo, hi), (r) => bit(r.pressure)); },
  'pressure.byRushers.sackRate': (x, a) => { const lo = num(a[0], 'from'), hi = num(a[1], 'to'); return obsOf(x.s.plays, (r) => isDropback(r) && inBin(r.rushers, lo, hi), (r) => bit(r.sack)); },

  // Rushing (J15.5.1, T12.3.1)
  'rush.yardsPerCarry': (x) => obsOf(x.s.plays, isCarry, (r) => r.yardsGained),
  'rush.yardsPerCarryOfficial': (x) => obsOf(x.s.plays, isOfficialCarry, (r) => r.yardsGained),
  'rush.yardsPerCarryDesigned': (x) => obsOf(x.s.plays, isDesignedRun, (r) => r.yardsGained),
  'rush.touchdownPerCarry': (x) => obsOf(x.s.plays, isCarry, (r) => bit(isRushTouchdown(r))),
  'rush.fumbleLostPerCarry': (x) => obsOf(x.s.plays, isCarry, (r) => bit(r.fumbleLost)),
  'rush.stuffedShare': (x) => obsOf(x.s.plays, isCarry, (r) => bit(r.yardsGained <= 0)),
  'rush.gainAtLeastShare': (x, a) => { const n = num(a[0], 'yards'); return obsOf(x.s.plays, isCarry, (r) => bit(r.yardsGained >= n)); },
  'rush.gain': (x) => obsOf(x.s.plays, isCarry, (r) => r.yardsGained),
  'rush.directionShare': (x, a) => { const d = a[0]; return obsOf(x.s.plays, (r) => isCarry(r) && r.runLocation !== null, (r) => bit(r.runLocation === d)); },
  'rush.byBox.yardsPerCarry': (x, a) => { const n = num(a[0], 'box count'); return obsOf(x.s.plays, (r) => isCarry(r) && r.boxCount === n, (r) => r.yardsGained); },

  // Kicking (J15.6.1, T12.4.1)
  'kick.fieldGoalPct': (x, a) => { const lo = num(a[0], 'from'), hi = num(a[1], 'to'); return obsOf(x.s.plays, (r) => isFieldGoal(r) && inBin(r.kickDistanceYd, lo, hi), (r) => bit(r.resultType === 'field_goal_good')); },
  'kick.extraPointPct': (x) => obsOf(x.s.plays, isKickedTry, (r) => bit(r.resultType === 'try_good')),
  'kick.twoPointConversionPct': (x) => obsOf(x.s.plays, isTwoPointTry, (r) => bit(r.resultType === 'try_good')),

  // Fouls (J15.7.1). Accepted penalties from the play-by-play, no-play rows included.
  'foul.typePerGame': (x, a) => {
    const label = foulStatLabel(a[0] ?? ''), ids = new Set(label.ids);
    return perGame(x, (_g, p) => {
      let n = 0;
      for (const r of p) for (const f of r.penalties) if (ids.has(f.foulId) && (label.role === undefined || (f.side === r.offense) === (label.role === 'offense'))) n++;
      return n;
    });
  },
  'foul.presnapPer100': (x, a) => {
    const role = a[0], venue = a[1], ids = new Set((a[2] ?? '').split('+'));
    if ((role !== 'offense' && role !== 'defense') || (venue !== 'home' && venue !== 'road')) throw new Error(`foul.presnapPer100: bad role or venue ${role}, ${venue}`);
    const out: number[] = [];
    for (const r of x.s.plays) {
      if (!isSnapRow(r)) continue;
      const side = role === 'offense' ? r.offense : (1 - r.offense);
      if ((venue === 'home') !== (side === 0)) continue;
      let n = 0;
      for (const f of r.penalties) if (f.side === side && ids.has(f.foulId)) n++;
      out.push(100 * n);
    }
    return out;
  },
  'play.fumbleLostPerPlay': (x) => obsOf(x.s.plays, isPassOrRun, (r) => bit(r.fumbleLost)),

  // Scheme shares (J15.8.1; tune or watch only)
  'scheme.personnelShare': (x, a) => { const c = a[0]; return obsOf(x.s.plays, (r) => isPassOrRun(r) && r.personnelCode !== null, (r) => bit(r.personnelCode === c)); },
  'scheme.coverageShare': (x, a) => { const c = a[0]; return obsOf(x.s.plays, (r) => isPassPlay(r) && r.coverageFamily !== null, (r) => bit(r.coverageFamily === c)); },
  'scheme.coverage.completionPct': (x, a) => { const set = new Set((a[0] ?? '').split('+')); return obsOf(x.s.plays, (r) => isAttempt(r) && r.coverageFamily !== null && set.has(r.coverageFamily), (r) => bit(isCompletion(r))); },
  'scheme.coverage.yardsPerDropback': (x, a) => { const set = new Set((a[0] ?? '').split('+')); return obsOf(x.s.plays, (r) => isPassPlay(r) && r.coverageFamily !== null && set.has(r.coverageFamily), (r) => passPlayYards(r)); },
  'scheme.playActionShare': (x) => obsOf(x.s.plays, isDropback, (r) => bit(r.playAction)),
  'scheme.playAction.yardsPerDropback': (x) => obsOf(x.s.plays, (r) => isPassPlay(r) && r.playAction, passPlayYards),
  'scheme.noPlayAction.yardsPerDropback': (x) => obsOf(x.s.plays, (r) => isPassPlay(r) && !r.playAction, passPlayYards),
  'scheme.screenShareOfAttempts': (x) => obsOf(x.s.plays, isAttempt, (r) => bit(r.offenseKind === 'screen')),
  'scheme.screenCompletionPct': (x) => obsOf(x.s.plays, (r) => isAttempt(r) && r.offenseKind === 'screen', (r) => bit(isCompletion(r))),
  'scheme.rpoShareOfPassPlays': (x) => obsOf(x.s.plays, isPassPlay, (r) => bit(r.offenseKind === 'rpo')),
  'scheme.motionShareOfPasses': (x) => obsOf(x.s.plays, isPassPlay, (r) => bit(r.motion)),
  'scheme.motionShareOfPlays': (x) => obsOf(x.s.plays, isPassOrRun, (r) => bit(r.motion)),
};

/** Yards on a pass play counting sacks as negative and incompletions as zero. */
function passPlayYards(r: PlayByPlayRow): number { return r.sack ? r.yardsGained : isCompletion(r) ? r.yardsGained : 0; }

/** Measure family names the harness implements, sorted. */
export const MEASURE_NAMES: readonly string[] = Object.keys(M).sort();

export function isKnownMeasure(name: string): boolean { return Object.prototype.hasOwnProperty.call(M, name); }

/** Indexes a sample once for many measures. */
export function prepare(s: CalibrationSample): Indexed { return index(s); }
export type PreparedSample = Indexed;

/**
 * Observations for a parsed measure. Returns null for `none` (not measurable from the contract yet).
 * Throws on an unknown measure name: a target the harness cannot read is a fault, not a skip.
 */
export function observe(p: ParsedMeasure, x: PreparedSample): Observations {
  if (p.name === 'none') return null;
  const fn = M[p.name];
  if (!fn) throw new Error(`unknown measure ${p.name}`);
  return fn(x, p.args);
}

// ---------- statistics over observations ----------

export function mean(v: readonly number[]): number | null {
  if (v.length === 0) return null;
  let s = 0;
  for (const x of v) s += x;
  return s / v.length;
}

/** Sample standard deviation (n - 1), the convention of the real-data scripts. */
export function sampleSd(v: readonly number[]): number | null {
  if (v.length < 2) return null;
  const m = mean(v)!;
  let s = 0;
  for (const x of v) s += (x - m) * (x - m);
  return Math.sqrt(s / (v.length - 1));
}

/** Linear-interpolation quantile (the numpy and R type 7 default), p in percent. */
export function quantile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const h = (sorted.length - 1) * (p / 100);
  const lo = Math.floor(h), hi = Math.ceil(h);
  const a = sorted[lo]!, b = sorted[hi]!;
  return a + (h - lo) * (b - a);
}
