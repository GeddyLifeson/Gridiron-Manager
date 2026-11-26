// The play database (N1.2.1), its filters and saved reel templates (N1.2.2), the opponent breakdown
// window, the user's own charting (N1.2.3) and the staff's guessed overlays (N1.1.2).
// It holds FilmRecords only: what the film filter released for one club.
import { tick } from '@gm/engine-core';
import { param } from './params.ts';
import { emptyAnnotation } from './annotations.ts';
import type { Charter, CoachingField } from './types.ts';
import type { Annotation, FilmRecord, OverlayLine, PlayRow } from './views.ts';

export type DistanceBand = 'short' | 'medium' | 'long';
export type FieldZone = 'backed_up' | 'own_territory' | 'opp_territory' | 'red_zone' | 'goal_line';
export type ResultBand = 'loss' | 'short' | 'medium' | 'explosive';

/** Band edges (yards), design choices for the filter bar. Assumption. */
const SHORT_MAX = 3, MEDIUM_MAX = 6;
const BACKED_UP_MAX = 10, MIDFIELD = 50, RED_ZONE_FROM = 80, GOAL_LINE_FROM = 95;
const RESULT_SHORT_MAX = 4, RESULT_EXPLOSIVE_MIN = 15;
/** Points that a path is sampled at for a guessed overlay, every this many ticks. Assumption. */
const PATH_STEP_TICKS = 5;
const TENTHS_PER_S = 10;

export function distanceBand(d: number | null): DistanceBand | null {
  if (d === null) return null;
  return d <= SHORT_MAX ? 'short' : d <= MEDIUM_MAX ? 'medium' : 'long';
}
export function fieldZone(yardLine: number): FieldZone {
  if (yardLine >= GOAL_LINE_FROM) return 'goal_line';
  if (yardLine >= RED_ZONE_FROM) return 'red_zone';
  if (yardLine >= MIDFIELD) return 'opp_territory';
  return yardLine <= BACKED_UP_MAX ? 'backed_up' : 'own_territory';
}
export function resultBand(gain: number): ResultBand {
  return gain < 0 ? 'loss' : gain <= RESULT_SHORT_MAX ? 'short' : gain < RESULT_EXPLOSIVE_MIN ? 'medium' : 'explosive';
}

/** A filter: every field is optional; a play matches when every given field matches (N1.2.1). */
export interface FilmFilter {
  readonly gameIds?: readonly number[];
  /** Plays in which this team was on the field. */
  readonly teamId?: number;
  /** Plays in which this team had the ball. */
  readonly offenseTeamId?: number;
  readonly odk?: readonly ('O' | 'D' | 'K')[];
  readonly downs?: readonly number[];
  readonly distance?: readonly DistanceBand[];
  readonly zones?: readonly FieldZone[];
  readonly hash?: readonly ('left' | 'middle' | 'right')[];
  readonly formation?: readonly string[];
  readonly motion?: boolean;
  readonly coaching?: Partial<Record<CoachingField, readonly string[]>>;
  readonly results?: readonly ResultBand[];
  readonly personIds?: readonly number[];
  readonly tags?: readonly string[];
  readonly twoMinute?: boolean;
  /** Only each game's first N offensive plays of `offenseTeamId` (the opening script reel). */
  readonly openingPlays?: number;
}

export interface ReelTemplate { readonly id: string; readonly title: string; readonly filter: (team: number) => FilmFilter }

/** Standard reels (N1.2.2): a saved filter plus the sort order (newest game first, then play number). */
export const STANDARD_REELS: readonly ReelTemplate[] = [
  { id: 'third_short', title: 'Third and short', filter: (t) => ({ offenseTeamId: t, downs: [3], distance: ['short'] }) },
  { id: 'third_medium', title: 'Third and medium', filter: (t) => ({ offenseTeamId: t, downs: [3], distance: ['medium'] }) },
  { id: 'third_long', title: 'Third and long', filter: (t) => ({ offenseTeamId: t, downs: [3], distance: ['long'] }) },
  { id: 'red_zone', title: 'Red zone', filter: (t) => ({ offenseTeamId: t, zones: ['red_zone', 'goal_line'] }) },
  { id: 'two_minute', title: 'Two-minute', filter: (t) => ({ offenseTeamId: t, twoMinute: true }) },
  { id: 'early_downs', title: 'First and second down', filter: (t) => ({ offenseTeamId: t, downs: [1, 2] }) },
  { id: 'pressures', title: 'Blitzes and pressures', filter: (t) => ({ teamId: t, coaching: { pressure: ['five_man', 'six_man', 'zone_pressure'] } }) },
  { id: 'opening_script', title: 'Opening scripted plays', filter: (t) => ({ offenseTeamId: t, openingPlays: param('cutup.scriptedPlays') }) },
];

export class FilmLibrary {
  private readonly records = new Map<string, FilmRecord>();
  private readonly notes = new Map<string, Annotation>();
  private readonly gameOrder = new Map<number, number>();

  constructor(readonly teamId: number) {}

  /** Adds or replaces a record the film filter released for this club. `order` sorts games, larger is newer. */
  add(r: FilmRecord, gameOrder = r.gameId): void {
    this.records.set(r.playId, r);
    this.gameOrder.set(r.gameId, gameOrder);
  }

  get(playId: string): FilmRecord | undefined { return this.records.get(playId); }
  get size(): number { return this.records.size; }
  all(): FilmRecord[] { return [...this.records.values()]; }

  annotation(playId: string): Annotation { return this.notes.get(playId) ?? emptyAnnotation(playId); }
  setAnnotation(a: Annotation): void { this.notes.set(a.playId, a); }

  /** The user's own chart replaces the staff's for that field on that play (N1.2.3). Never on the club's own unit. */
  setUserChart(playId: string, field: CoachingField, value: string): void {
    const r = this.records.get(playId);
    if (!r) throw new Error(`no film of play ${playId}`);
    if (r.coaching.sources[field] === 'call') throw new Error(`${field} on play ${playId} is the club's own call`);
    this.records.set(playId, { ...r, coaching: { values: { ...r.coaching.values, [field]: value }, sources: { ...r.coaching.sources, [field]: 'user' } } });
  }

  private sortKey = (a: FilmRecord, b: FilmRecord) =>
    (this.gameOrder.get(b.gameId)! - this.gameOrder.get(a.gameId)!) || a.playNumber - b.playNumber;

  /** Plays matching a filter, newest game first, then by play number (N1.2.1, N1.2.2). */
  query(f: FilmFilter): FilmRecord[] {
    let opening: Set<string> | null = null;
    if (f.openingPlays !== undefined && f.offenseTeamId !== undefined) {
      opening = new Set();
      const byGame = new Map<number, FilmRecord[]>();
      for (const r of this.records.values()) {
        if (r.teams[r.situation.offenseSide] !== f.offenseTeamId || r.base.odk === 'K') continue;
        const list = byGame.get(r.gameId) ?? [];
        list.push(r);
        byGame.set(r.gameId, list);
      }
      for (const list of byGame.values()) list.sort((a, b) => a.playNumber - b.playNumber).slice(0, f.openingPlays).forEach((r) => opening!.add(r.playId));
    }
    const out: FilmRecord[] = [];
    for (const r of this.records.values()) if (this.matches(r, f) && (!opening || opening.has(r.playId))) out.push(r);
    return out.sort(this.sortKey);
  }

  matches(r: FilmRecord, f: FilmFilter): boolean {
    const b = r.base;
    if (f.gameIds && !f.gameIds.includes(r.gameId)) return false;
    if (f.teamId !== undefined && r.teams[0] !== f.teamId && r.teams[1] !== f.teamId) return false;
    if (f.offenseTeamId !== undefined && r.teams[r.situation.offenseSide] !== f.offenseTeamId) return false;
    if (f.odk && !f.odk.includes(b.odk)) return false;
    if (f.downs && (b.down === null || !f.downs.includes(b.down))) return false;
    if (f.distance) { const d = distanceBand(b.distance); if (!d || !f.distance.includes(d)) return false; }
    if (f.zones && !f.zones.includes(fieldZone(b.yardLine))) return false;
    if (f.hash && !f.hash.includes(b.hash)) return false;
    if (f.formation && (b.offFormation === null || !f.formation.includes(b.offFormation))) return false;
    if (f.motion !== undefined && (b.motionDirection !== null && b.motionDirection !== 'none') !== f.motion) return false;
    if (f.results && !f.results.includes(resultBand(b.gainLoss))) return false;
    if (f.twoMinute && !((b.quarter === 2 || b.quarter === 4) && r.clockTenths <= param('reel.twoMinuteS') * TENTHS_PER_S)) return false;
    if (f.coaching) {
      for (const [k, want] of Object.entries(f.coaching) as [CoachingField, readonly string[]][]) {
        const v = r.coaching.values[k];
        if (v === null || !want.includes(v)) return false;
      }
    }
    if (f.personIds && !f.personIds.some((p) => r.slots.some((s) => s.personId === p))) return false;
    if (f.tags) {
      const a = this.annotation(r.playId);
      if (!f.tags.every((t) => a.tags.includes(t) || (a.causeTags as readonly string[]).includes(t.toLowerCase()))) return false;
    }
    return true;
  }

  /** Rows for the list with small diagrams (N1.2.1 output). */
  rows(f: FilmFilter): PlayRow[] {
    return this.query(f).map((r) => ({
      playId: r.playId, gameId: r.gameId, playNumber: r.playNumber, teams: r.teams, base: r.base, coaching: r.coaching,
      clockTenths: r.clockTenths,
      tags: [...this.annotation(r.playId).tags, ...this.annotation(r.playId).causeTags],
      slotsPersonIds: r.slots.map((s) => s.personId),
    }));
  }

  /** Plays whose coaching set is not yet charted, among a list (N1.2.2 "plays still uncharted"). */
  unchartedCount(playIds: readonly string[]): number {
    return playIds.filter((id) => { const r = this.records.get(id); return !!r && Object.values(r.coaching.sources).includes('uncharted'); }).length;
  }

  /**
   * The staff's guessed assignment for one opponent player (N1.1.2): drawn only when the club holds at
   * least the minimum other plays from that formation and personnel; the line is the same role's path
   * on the newest matching play, dashed and labelled with who drew it. Confidence rises per matching
   * play over the charter's base up to his ceiling.
   */
  guessedLine(playId: string, slot: number, charter: Charter, ceiling = 1): { line: OverlayLine; confidence: number; matches: number } | null {
    const r = this.records.get(playId);
    if (!r) return null;
    const me = r.slots.find((s) => s.slot === slot);
    if (!me || (r.viewerSide !== null && me.side === r.viewerSide)) return null;
    const formation = r.base.offFormation, personnel = r.coaching.values.personnel;
    const offense = r.teams[r.situation.offenseSide];
    const matching = this.all().filter((o) => o.playId !== playId && o.teams[o.situation.offenseSide] === offense &&
      o.base.offFormation === formation && o.coaching.values.personnel === personnel && o.slots.some((s) => s.role === me.role && s.side === me.side))
      .sort(this.sortKey);
    if (matching.length < param('guess.minMatchingPlays')) return null;
    const src = matching[0]!;
    const srcSlot = src.slots.find((s) => s.role === me.role && s.side === me.side)!.slot;
    const frames = tick.decodeTrajectory(src.trajectory);
    const points = frames.filter((_, i) => i % PATH_STEP_TICKS === 0).map((f) => ({ x: f.x[srcSlot]!, y: f.y[srcSlot]! }));
    const confidence = Math.min(ceiling, charter.accuracy + param('guess.perMatchGain') * matching.length);
    return { line: { slot, words: `Staff guess from ${matching.length} plays in the same formation and personnel`, points, author: `staff:${charter.personId}` }, confidence, matches: matching.length };
  }
}

/** One opponent game the club may break down. `week` counts from 1 in its season. */
export interface OpponentGame { readonly gameId: number; readonly season: number; readonly week: number }

/**
 * Which opponent games the staff breaks down by default (N1.2.1): the last games of this season,
 * extended back when there are too few or the coordinator asks; last season's film is added in the
 * first weeks of a season.
 */
export function breakdownWindow(games: readonly OpponentGame[], season: number, week: number, coordinatorAsks = false): number[] {
  const sorted = [...games].sort((a, b) => b.season - a.season || b.week - a.week);
  const current = sorted.filter((g) => g.season === season && g.week < week);
  const want = coordinatorAsks || current.length < param('breakdown.defaultGames') ? param('breakdown.extendedGames') : param('breakdown.defaultGames');
  const chosen = current.slice(0, want).map((g) => g.gameId);
  if (week <= param('breakdown.priorSeasonWeeks') || chosen.length < want) {
    for (const g of sorted) { if (chosen.length >= want) break; if (g.season === season - 1) chosen.push(g.gameId); }
  }
  return chosen;
}
