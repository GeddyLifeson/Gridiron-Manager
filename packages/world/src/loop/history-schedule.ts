// A schedule for the history run, where the number of teams changes from season to season (teams are
// founded and fold: lifecycle.ts). The C2 schedule formula is built for a fixed league of divisions and
// cannot place a league of 4 clubs in 1921 or 21 in 1926, so the past uses this rotation instead:
//
// - Regular season: each competition's active teams meet in a round robin (circle method) in a seeded
//   order, as many weeks as the level's regular-season games. With fewer teams than weeks, the rounds
//   repeat, as early leagues did. With an odd count one team rests each week.
// - Postseason: single elimination among the best records (win share, then point margin, then the team
//   id), the field size from the level's league rules (two when the rules name none); top seeds take the byes. The last game decides the
//   title. A tied postseason game goes to the higher seed (the engine plays overtime; a tie is the
//   leftover case).
//
// Today's numbers apply to the whole span (Marlon 2026-11-26: the rules have always been the rules).
// Everything is a pure function of the world: the same world gives the same games.
import { stream } from '@gm/engine-core';
import type { CompetitionRecord } from '@gm/schema';
import { activeTeamIds } from './lifecycle.ts';
import type { LiveWorld, SchedulePort, ScheduledGame } from './types.ts';

export const STREAM_HISTORY_SCHEDULE = 'world.history_schedule';
/** Game ids: competition id times this, plus week times `WEEK_SPAN`, plus the game's place in the week. */
const COMP_SPAN = 100_000;
const WEEK_SPAN = 1_000;

export interface HistoryScheduleBinding {
  /** Regular-season games per team in a competition (the level's `schedule.regular_season_games`). */
  readonly regularGames: (c: CompetitionRecord) => number;
  /** Postseason field (the level's `playoff.field_size`). Absent or below 2 means a title game between the two best records. */
  readonly postseasonField: (c: CompetitionRecord) => number | undefined;
}

/** The seeded order of a competition's active teams for one season. */
export function seasonOrder(world: LiveWorld, c: CompetitionRecord): number[] {
  const ids = activeTeamIds(world, [...c.teamIds].sort((a, b) => a - b));
  const s = stream(world.seed, STREAM_HISTORY_SCHEDULE, [world.date.seasonYear, c.id]);
  return ids.map((id) => ({ id, k: s.uniform() })).sort((a, b) => a.k - b.k || a.id - b.id).map((x) => x.id);
}

/** Round `r` of the circle method over `ids` (a bye slot is added for an odd count): pairs, home first. */
export function circleRound(ids: readonly number[], r: number): [number, number][] {
  const list: (number | null)[] = ids.length % 2 === 0 ? [...ids] : [...ids, null];
  const n = list.length;
  if (n < 2) return [];
  const rounds = n - 1, k = r % rounds;
  const rot = [list[0]!, ...list.slice(1).map((_, i) => list[1 + ((i + k) % rounds)]!)];
  const out: [number, number][] = [];
  for (let i = 0; i < n / 2; i++) {
    const a = rot[i], b = rot[n - 1 - i];
    if (a === null || b === null || a === undefined || b === undefined) continue;
    // Alternate home sides by round so no team is always at home.
    out.push((r + i) % 2 === 0 ? [a, b] : [b, a]);
  }
  return out;
}

/** Postseason rounds for a field of `f` teams. */
export function roundsFor(f: number): number {
  let r = 0;
  while ((1 << r) < f) r++;
  return r;
}

interface Line { wins: number; losses: number; ties: number; margin: number }

function standings(world: LiveWorld, c: CompetitionRecord, ids: readonly number[]): number[] {
  const line = new Map<number, Line>(ids.map((id) => [id, { wins: 0, losses: 0, ties: 0, margin: 0 }]));
  for (const g of world.results) {
    if (g.competitionId !== c.id || g.kind !== 'regular') continue;
    const h = line.get(g.homeTeamId), a = line.get(g.awayTeamId);
    if (!h || !a) continue;
    h.margin += g.homePoints - g.awayPoints; a.margin += g.awayPoints - g.homePoints;
    if (g.homePoints === g.awayPoints) { h.ties++; a.ties++; } else if (g.homePoints > g.awayPoints) { h.wins++; a.losses++; } else { a.wins++; h.losses++; }
  }
  const share = (l: Line): number => { const n = l.wins + l.losses + l.ties; return n === 0 ? 0 : (l.wins + l.ties / 2) / n; };
  return [...ids].sort((x, y) => share(line.get(y)!) - share(line.get(x)!) || line.get(y)!.margin - line.get(x)!.margin || x - y);
}

/** The seeds alive at postseason round `k` (0 is the field), best seed first. */
function alive(world: LiveWorld, c: CompetitionRecord, regular: number, field: readonly number[], k: number): number[] {
  let teams = [...field];
  for (let r = 0; r < k; r++) {
    const pairs = bracketRound(teams);
    const playing = new Set(pairs.flat());
    const next = teams.filter((t) => !playing.has(t));
    for (const [hi, lo] of pairs) {
      const g = world.results.find((x) => x.competitionId === c.id && x.week === regular + r && x.kind === 'postseason'
        && ((x.homeTeamId === hi && x.awayTeamId === lo) || (x.homeTeamId === lo && x.awayTeamId === hi)));
      if (!g) throw new Error(`history schedule: postseason game ${hi} v ${lo} in week ${regular + r} has no result`);
      const hiPts = g.homeTeamId === hi ? g.homePoints : g.awayPoints, loPts = g.homeTeamId === hi ? g.awayPoints : g.homePoints;
      next.push(loPts > hiPts ? lo : hi);
    }
    teams = next.sort((a, b) => field.indexOf(a) - field.indexOf(b));
  }
  return teams;
}

/** One postseason round over the seeds alive (best first): top seeds rest until the count is a power of two; best plays worst. */
function bracketRound(teams: readonly number[]): [number, number][] {
  const n = teams.length;
  if (n < 2) return [];
  const size = 1 << roundsFor(n);
  const byes = size - n;
  const playing = teams.slice(byes);
  const out: [number, number][] = [];
  for (let i = 0; i < playing.length / 2; i++) out.push([playing[i]!, playing[playing.length - 1 - i]!]);
  return out;
}

export function historySchedule(b: HistoryScheduleBinding): SchedulePort {
  const fieldOf = (world: LiveWorld, c: CompetitionRecord): number => {
    const n = activeTeamIds(world, c.teamIds).length;
    const f = b.postseasonField(c) ?? 0;
    return Math.min(n, Math.max(2, f));
  };
  return {
    weeksInSeason: (world) => {
      let weeks = 0;
      for (const c of world.competitions) {
        if (activeTeamIds(world, c.teamIds).length < 2) continue;
        const f = fieldOf(world, c);
        weeks = Math.max(weeks, b.regularGames(c) + roundsFor(f));
      }
      return weeks;
    },
    gamesOn: (world, week) => {
      const out: ScheduledGame[] = [];
      for (const c of world.competitions) {
        const order = seasonOrder(world, c);
        if (order.length < 2) continue;
        const regular = b.regularGames(c);
        const base = c.id * COMP_SPAN + week * WEEK_SPAN;
        if (week < regular) {
          circleRound(order, week).forEach(([h, a], i) => out.push({ gameId: base + i + 1, competitionId: c.id, homeTeamId: h, awayTeamId: a, kind: 'regular', title: false }));
          continue;
        }
        const f = fieldOf(world, c);
        const k = week - regular;
        if (k >= roundsFor(f)) continue;
        const field = standings(world, c, order).slice(0, f);
        const pairs = bracketRound(alive(world, c, regular, field, k));
        const last = k === roundsFor(f) - 1;
        pairs.forEach(([hi, lo], i) => out.push({ gameId: base + i + 1, competitionId: c.id, homeTeamId: hi, awayTeamId: lo, kind: 'postseason', title: last }));
      }
      return out;
    },
  };
}
