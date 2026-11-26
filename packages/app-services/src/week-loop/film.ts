// The league's film archive (H2.6.1, P5 "league game archive", N2.3.1 store). Every game of the season is
// filmed when it is played: the seat's own and every other. A full play record is about 1.4 MB of JSON
// (measured 2026-11-26: 164 records, 1,461,738 bytes, pro week 1), so the archive keeps a compact charting
// row per scrimmage snap, and the exact film of a non-seat game is rebuilt on demand by playing it again
// from its context (the game is a pure function of it, J13), checked against the stored final state hash.
//
// One packed row holds the play-level fields `tendencies.chartGame` reads, seen from the snapping offense.
// Either team's charted rows (both sides of the ball) unpack from the same rows: only team id, side and
// score difference depend on whose rows they are. Lengths are kept in hundredths of a yard (0.36 inch),
// and success is computed before packing from the exact values, so rounding never flips a success mark.
// Ints are zigzag varints in base64: about 30 bytes a row, 4 to 6 KB a game.
import type { FieldGeometry, PlayRecord, Side } from '@gm/schema';
import { tendencies } from '@gm/models';

type ChartedPlay = tendencies.ChartedPlay;

export const FILM_VERSION = 1;

/** One game in the archive. Plain data: it is saved as it is and crosses a worker boundary unchanged. */
export interface PackedGame {
  readonly v: typeof FILM_VERSION;
  readonly gameId: number;
  readonly season: number;
  /** League week of a regular game; for a postseason game, the last regular week plus the round. */
  readonly week: number;
  readonly phase: 'regular' | 'postseason';
  /** Home, away. */
  readonly teams: readonly [number, number];
  /** Final state hash of the game (J13.5.1): a rebuilt film must reach it. */
  readonly stateHash: string;
  readonly snaps: number;
  /** String table for the coded fields. */
  readonly strings: readonly string[];
  /** Zigzag varints in base64, FIELDS per snap. */
  readonly rows: string;
}

/** Field order of a packed row. */
export const FIELDS = [
  'index', 'offenseSide', 'down', 'distance', 'yardsToGoal', 'hash', 'quarter', 'clockTenths', 'scoreDiff', 'afterEvent',
  'personnel', 'formation', 'strength', 'motion', 'shotgun', 'tempo', 'playKind', 'runDirection', 'concept', 'protection',
  'front', 'rushers', 'boxCount', 'coverageFamily', 'pressureDesign', 'yards', 'success', 'forced', 'lookOnly',
] as const;
const F = Object.fromEntries(FIELDS.map((f, i) => [f, i])) as Record<(typeof FIELDS)[number], number>;
const HASHES: readonly tendencies.Hash[] = ['left', 'middle', 'right'];
const HUNDREDTHS = 100;

// ---- varint codec (pure; no platform base64) ----
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = new Map([...B64].map((c, i) => [c, i]));

export function encodeInts(ints: readonly number[]): string {
  const bytes: number[] = [];
  for (const n of ints) {
    if (!Number.isSafeInteger(n)) throw new Error(`film: ${n} is not an integer`);
    let z = n >= 0 ? n * 2 : -n * 2 - 1;
    while (z >= 0x80) { bytes.push((z % 0x80) | 0x80); z = Math.floor(z / 0x80); }
    bytes.push(z);
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!, b = bytes[i + 1], c = bytes[i + 2];
    out += B64[a >> 2]! + B64[((a & 3) << 4) | ((b ?? 0) >> 4)]!;
    out += b === undefined ? '=' : B64[((b & 15) << 2) | ((c ?? 0) >> 6)]!;
    out += c === undefined ? '=' : B64[c & 63]!;
  }
  return out;
}

export function decodeInts(text: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 4) {
    const q = [0, 1, 2, 3].map((k) => (text[i + k] === '=' ? -1 : B64_INDEX.get(text[i + k]!) ?? -2));
    if (q.some((x) => x === -2)) throw new Error('film: bad base64');
    bytes.push((q[0]! << 2) | (q[1]! >> 4));
    if (q[2]! >= 0) bytes.push(((q[1]! & 15) << 4) | (q[2]! >> 2));
    if (q[3]! >= 0) bytes.push(((q[2]! & 3) << 6) | q[3]!);
  }
  const out: number[] = [];
  let z = 0, mul = 1;
  for (const b of bytes) {
    z += (b & 0x7f) * mul;
    if (b & 0x80) { mul *= 0x80; continue; }
    out.push(z % 2 === 0 ? z / 2 : -(z + 1) / 2);
    z = 0; mul = 1;
  }
  return out;
}

export interface FilmContext {
  readonly gameId: number;
  readonly season: number;
  readonly week: number;
  readonly phase: 'regular' | 'postseason';
  readonly teams: readonly [number, number];
  readonly geometry: FieldGeometry;
  /** N2.2.3 coaching success shares (`ep.defaultDefinitions()`). */
  readonly success: tendencies.GameChartContext['success'];
}

/**
 * Packs one game's play records. Every scrimmage snap becomes one row, taken from the home team's
 * charting (offense rows are its snaps, defense rows the away team's), so the rows are exactly what
 * `chartGame` reads for either team.
 */
export function packFilm(records: readonly PlayRecord[], ctx: FilmContext): PackedGame {
  const chartCtx: tendencies.GameChartContext = { teamIds: ctx.teams, gameOrder: 0, season: ctx.season, geometry: ctx.geometry, success: ctx.success };
  const rows = tendencies.chartGame(records, 0, chartCtx);
  const strings: string[] = [];
  const index = new Map<string, number>();
  const s = (v: string | null): number => {
    if (v === null) return -1;
    let i = index.get(v);
    if (i === undefined) { i = strings.length; strings.push(v); index.set(v, i); }
    return i;
  };
  const len = (yd: number) => Math.round(yd * HUNDREDTHS);
  const ints: number[] = [];
  for (const p of rows) {
    const offenseSide: Side = p.side === 'offense' ? 0 : 1;
    const row = new Array<number>(FIELDS.length);
    row[F.index] = p.index; row[F.offenseSide] = offenseSide; row[F.down] = p.down;
    row[F.distance] = len(p.distanceYd); row[F.yardsToGoal] = len(p.yardsToGoalYd); row[F.hash] = HASHES.indexOf(p.hash);
    row[F.quarter] = p.quarter; row[F.clockTenths] = p.clockTenths;
    // Home rows: offense rows have the home score first; defense rows are the away offense's snaps.
    row[F.scoreDiff] = p.side === 'offense' ? p.scoreDiff : 0 - p.scoreDiff;
    row[F.afterEvent] = s(p.afterEvent);
    row[F.personnel] = s(p.personnel); row[F.formation] = s(p.formation); row[F.strength] = s(p.strength); row[F.motion] = s(p.motion);
    row[F.shotgun] = p.shotgun ? 1 : 0; row[F.tempo] = s(p.tempo);
    row[F.playKind] = s(p.playKind); row[F.runDirection] = s(p.runDirection); row[F.concept] = s(p.concept); row[F.protection] = s(p.protection);
    row[F.front] = s(p.front); row[F.rushers] = p.rushers ?? -1; row[F.boxCount] = p.boxCount ?? -1;
    row[F.coverageFamily] = s(p.coverageFamily); row[F.pressureDesign] = s(p.pressureDesign);
    row[F.yards] = len(p.yards); row[F.success] = p.success === null ? 2 : p.success ? 1 : 0;
    row[F.forced] = p.forced ? 1 : 0; row[F.lookOnly] = p.lookOnly ? 1 : 0;
    ints.push(...row);
  }
  const last = records[records.length - 1];
  return {
    v: FILM_VERSION, gameId: ctx.gameId, season: ctx.season, week: ctx.week, phase: ctx.phase, teams: ctx.teams,
    stateHash: last ? last.stateHash : '', snaps: rows.length, strings, rows: encodeInts(ints),
  };
}

export interface UnpackOptions {
  /** The team's game number in its own schedule (H2.1.1 windows count by it). */
  readonly gameOrder: number;
  /** Play caller of the team on offense and on defense, when known. */
  readonly callers?: { readonly offense: number | null; readonly defense: number | null };
  readonly sides?: readonly tendencies.ChartSide[];
}

/** The team's own charted rows of one archived game (source 'own': the true calls). */
export function unpackFilm(g: PackedGame, teamId: number, o: UnpackOptions): ChartedPlay[] {
  if (g.v !== FILM_VERSION) throw new Error(`film: game ${g.gameId} has film version ${String(g.v)}`);
  const teamSide = g.teams[0] === teamId ? 0 : g.teams[1] === teamId ? 1 : -1;
  if (teamSide < 0) throw new Error(`film: team ${teamId} did not play game ${g.gameId}`);
  const opponentId = g.teams[teamSide === 0 ? 1 : 0];
  const ints = decodeInts(g.rows);
  if (ints.length !== g.snaps * FIELDS.length) throw new Error(`film: game ${g.gameId} rows are damaged`);
  const str = (i: number): string | null => (i < 0 ? null : g.strings[i] ?? null);
  const sides = o.sides ?? ['offense', 'defense'];
  const out: ChartedPlay[] = [];
  for (let r = 0; r < g.snaps; r++) {
    const x = (f: number) => ints[r * FIELDS.length + f]!;
    const side: tendencies.ChartSide = x(F.offenseSide) === teamSide ? 'offense' : 'defense';
    if (!sides.includes(side)) continue;
    const success = x(F.success);
    out.push({
      ref: `${g.gameId}:${x(F.index)}`, gameId: g.gameId, gameOrder: o.gameOrder, season: g.season, index: x(F.index),
      teamId, opponentId, side,
      callerId: o.callers ? (side === 'offense' ? o.callers.offense : o.callers.defense) : null,
      source: 'own',
      down: x(F.down), distanceYd: x(F.distance) / HUNDREDTHS, yardsToGoalYd: x(F.yardsToGoal) / HUNDREDTHS, hash: HASHES[x(F.hash)]!,
      quarter: x(F.quarter), clockTenths: x(F.clockTenths),
      // Packed from the offense's view: the team's own difference is that, or its negative on defense.
      scoreDiff: side === 'offense' ? x(F.scoreDiff) : 0 - x(F.scoreDiff),
      afterEvent: str(x(F.afterEvent)) as tendencies.AfterEvent,
      personnel: str(x(F.personnel)) ?? '', formation: str(x(F.formation)), strength: str(x(F.strength)), motion: str(x(F.motion)),
      shotgun: x(F.shotgun) === 1, tempo: str(x(F.tempo)) as ChartedPlay['tempo'],
      playKind: str(x(F.playKind)), runDirection: str(x(F.runDirection)) as ChartedPlay['runDirection'],
      concept: str(x(F.concept)), protection: str(x(F.protection)),
      front: str(x(F.front)), rushers: x(F.rushers) < 0 ? null : x(F.rushers), boxCount: x(F.boxCount) < 0 ? null : x(F.boxCount),
      coverageFamily: str(x(F.coverageFamily)), pressureDesign: str(x(F.pressureDesign)),
      yards: x(F.yards) / HUNDREDTHS, success: success === 2 ? null : success === 1,
      forced: x(F.forced) === 1, lookOnly: x(F.lookOnly) === 1,
    });
  }
  return out;
}

/** Schedule order: season, then week (postseason rounds continue the count), then game id. */
export function scheduleOrder(a: PackedGame, b: PackedGame): number {
  return a.season - b.season || a.week - b.week || a.gameId - b.gameId;
}

/** The archive of one season or more, by game id. */
export class FilmArchive {
  private readonly games = new Map<number, PackedGame>();

  static load(games: readonly PackedGame[]): FilmArchive {
    const a = new FilmArchive();
    for (const g of games) a.put(g);
    return a;
  }

  put(g: PackedGame): void {
    if (g.v !== FILM_VERSION) throw new Error(`film: game ${g.gameId} has film version ${String(g.v)}`);
    this.games.set(g.gameId, g);
  }

  has(gameId: number): boolean { return this.games.has(gameId); }
  get(gameId: number): PackedGame | null { return this.games.get(gameId) ?? null; }
  get size(): number { return this.games.size; }

  /** A team's archived games in schedule order. */
  gamesOf(teamId: number, season?: number): PackedGame[] {
    return [...this.games.values()].filter((g) => (g.teams[0] === teamId || g.teams[1] === teamId) && (season === undefined || g.season === season)).sort(scheduleOrder);
  }

  /** Every archived row of a team, both sides, with each game's place in its season's schedule as `gameOrder` (from 1). */
  teamRows(teamId: number, o: { season?: number; sides?: readonly tendencies.ChartSide[] } = {}): ChartedPlay[] {
    const order = new Map<number, number>();
    const out: ChartedPlay[] = [];
    for (const g of this.gamesOf(teamId, o.season)) {
      const n = (order.get(g.season) ?? 0) + 1;
      order.set(g.season, n);
      out.push(...unpackFilm(g, teamId, { gameOrder: n, ...(o.sides ? { sides: o.sides } : {}) }));
    }
    return out;
  }

  /** Plain data for the save, in archive order. */
  save(): PackedGame[] { return [...this.games.values()].sort(scheduleOrder); }

  /** Size of the archive as saved text (UTF-16 code units of the JSON; the text is ASCII, so bytes). */
  savedBytes(): number { return JSON.stringify(this.save()).length; }
}
