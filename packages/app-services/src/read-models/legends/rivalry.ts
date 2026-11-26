// X3.3.2 rivalry pages: series between two teams, as a query over game results. A rivalry exists when a
// team-level `rival` edge exists (X7.1.1 rule 3 or U4 seeding); the caller checks the edge, this builds
// the page. Contents: series record, first and most recent meeting, current and longest streaks, largest
// margin each way, meetings by venue, the top games by X4 score, and each head coach's record in the
// series. Vacated results are dropped (X2.1.3). A series that stopped (conference change) keeps its page,
// marked with the last meeting.
import { param } from './params.ts';
import { byNotability, reversedIds, scoreOf, DEFAULT_TYPES, type EventRow, type GameScore, type LegendsTypes, type PersonId, type TeamId } from './types.ts';

export interface Streak { readonly teamId: TeamId | null; readonly games: number }
export interface Margin { readonly gameId: number; readonly eventId: number; readonly margin: number; readonly seasonYear: number }

export interface RivalryPage {
  readonly teamA: TeamId;
  readonly teamB: TeamId;
  readonly winsA: number;
  readonly winsB: number;
  readonly ties: number;
  readonly first: { readonly eventId: number; readonly seasonYear: number } | null;
  readonly last: { readonly eventId: number; readonly seasonYear: number } | null;
  readonly current: Streak;
  /** Longest run of consecutive wins by one side (a tie breaks a run). */
  readonly longest: Streak;
  readonly largestA: Margin | null;
  readonly largestB: Margin | null;
  readonly byVenue: readonly { readonly venueId: number | null; readonly meetings: number; readonly winsA: number; readonly winsB: number; readonly ties: number }[];
  readonly topGameEventIds: readonly number[];
  readonly coaches: readonly { readonly personId: PersonId; readonly teamId: TeamId; readonly wins: number; readonly losses: number; readonly ties: number }[];
  /** Generated trophy name key seeded by U4, if any. */
  readonly trophyKey: string | null;
}

export interface RivalryOptions {
  /** The head coach of a team on a game's date, from staff stints (trees.staffSeasonsFrom). */
  readonly headCoachOf?: (teamId: TeamId, seasonYear: number) => PersonId | null;
  readonly trophyKey?: string | null;
  readonly types?: LegendsTypes;
}

export function seriesGames(rows: readonly EventRow[], a: TeamId, b: TeamId, types: LegendsTypes = DEFAULT_TYPES): GameScore[] {
  const rev = reversedIds(rows, types);
  const out: GameScore[] = [];
  for (const e of rows) {
    if (e.type !== types.gameResult || rev.has(e.id)) continue;
    const g = scoreOf(e);
    if (g && ((g.homeTeamId === a && g.awayTeamId === b) || (g.homeTeamId === b && g.awayTeamId === a))) out.push(g);
  }
  return out.sort((x, y) => x.seasonYear - y.seasonYear || x.dayIndex - y.dayIndex || x.eventId - y.eventId);
}

/** Points for and against from one side's view. */
function sideScore(g: GameScore, team: TeamId): { us: number; them: number } {
  return g.homeTeamId === team ? { us: g.homeScore, them: g.awayScore } : { us: g.awayScore, them: g.homeScore };
}

export function rivalryPage(rows: readonly EventRow[], teamA: TeamId, teamB: TeamId, opts: RivalryOptions = {}): RivalryPage {
  const types = opts.types ?? DEFAULT_TYPES;
  const games = seriesGames(rows, teamA, teamB, types);
  let winsA = 0, winsB = 0, ties = 0;
  let run: Streak = { teamId: null, games: 0 };
  let longest: Streak = { teamId: null, games: 0 };
  let largestA: Margin | null = null, largestB: Margin | null = null;
  const venues = new Map<number | null, { venueId: number | null; meetings: number; winsA: number; winsB: number; ties: number }>();
  const coaches = new Map<string, { personId: number; teamId: number; wins: number; losses: number; ties: number }>();
  for (const g of games) {
    const { us, them } = sideScore(g, teamA);
    const winner = us > them ? teamA : us < them ? teamB : null;
    const v = venues.get(g.venueId) ?? venues.set(g.venueId, { venueId: g.venueId, meetings: 0, winsA: 0, winsB: 0, ties: 0 }).get(g.venueId)!;
    v.meetings++;
    if (winner === teamA) { winsA++; v.winsA++; } else if (winner === teamB) { winsB++; v.winsB++; } else { ties++; v.ties++; }
    run = winner === null ? { teamId: null, games: 0 } : run.teamId === winner ? { teamId: winner, games: run.games + 1 } : { teamId: winner, games: 1 };
    if (run.games > longest.games) longest = run;
    const margin = Math.abs(us - them);
    const m: Margin = { gameId: g.gameId, eventId: g.eventId, margin, seasonYear: g.seasonYear };
    if (winner === teamA && (!largestA || margin > largestA.margin)) largestA = m;
    if (winner === teamB && (!largestB || margin > largestB.margin)) largestB = m;
    if (opts.headCoachOf) {
      for (const team of [teamA, teamB]) {
        const c = opts.headCoachOf(team, g.seasonYear);
        if (c === null) continue;
        const k = `${c}:${team}`;
        const r = coaches.get(k) ?? coaches.set(k, { personId: c, teamId: team, wins: 0, losses: 0, ties: 0 }).get(k)!;
        if (winner === null) r.ties++; else if (winner === team) r.wins++; else r.losses++;
      }
    }
  }
  const byEvent = new Map(rows.map((e) => [e.id, e] as const));
  const scored = games.map((g) => byEvent.get(g.eventId)!).filter((e) => e.notability !== null).sort(byNotability);
  const first = games[0], last = games[games.length - 1];
  return {
    teamA, teamB, winsA, winsB, ties,
    first: first ? { eventId: first.eventId, seasonYear: first.seasonYear } : null,
    last: last ? { eventId: last.eventId, seasonYear: last.seasonYear } : null,
    current: run, longest, largestA, largestB,
    byVenue: [...venues.values()].sort((x, y) => y.meetings - x.meetings || (x.venueId ?? 0) - (y.venueId ?? 0)),
    topGameEventIds: scored.slice(0, param('legends.rivalry.top_games')).map((e) => e.id),
    coaches: [...coaches.values()].sort((x, y) => x.teamId - y.teamId || x.personId - y.personId),
    trophyKey: opts.trophyKey ?? null,
  };
}
