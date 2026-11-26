// What a finished season leaves for the season-level calibration rows (Q1.7.2: spread of team wins,
// spread of player statistics, record frequency), the season replay check (Q1.3.1) and the history
// log. Counts only: every rate and spread is computed by the harness from these.
import { chainHash } from './seeds.ts';
import type { SeasonSpec, SeasonState, TeamId } from './types.ts';

export interface TeamSeasonLine {
  readonly teamId: TeamId;
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  readonly pointsFor: number;
  readonly pointsAgainst: number;
  /** Regular-season games against teams of the competition and against guests from outside it. */
  readonly gamesInside: number;
  readonly gamesOutside: number;
  /** Wins and ties in the games against teams of the competition only. */
  readonly winsInside: number;
  readonly tiesInside: number;
}

export interface PlayerSeasonTotal { readonly playerId: number; readonly teamId: TeamId; readonly statId: string; readonly value: number }

export interface SeasonSummary {
  readonly season: number;
  readonly ruleSetId: string;
  readonly seedHex: string;
  readonly champion: TeamId | null;
  /** Regular season only, in team-id order. */
  readonly teams: readonly TeamSeasonLine[];
  readonly regularGames: number;
  readonly postseasonGames: number;
  readonly conferenceGames: number;
  readonly neutralSiteGames: number;
  readonly overtimeGames: number;
  readonly tiedGames: number;
  readonly plays: number;
  /** Season totals per player and statistic, regular season, sorted by statistic, then player. */
  readonly playerTotals: readonly PlayerSeasonTotal[];
  readonly seatWeeks: number;
  readonly preparations: number;
  /** Q1.3.1 season hash: the game chain plus the standings lines. */
  readonly seasonHash: string;
}

export function summariseSeason(spec: SeasonSpec, state: SeasonState): SeasonSummary {
  const lines = new Map<TeamId, { wins: number; losses: number; ties: number; pointsFor: number; pointsAgainst: number; gamesInside: number; gamesOutside: number; winsInside: number; tiesInside: number }>(
    spec.teams.map((t) => [t.id, { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, gamesInside: 0, gamesOutside: 0, winsInside: 0, tiesInside: 0 }]));
  const totals = new Map<string, PlayerSeasonTotal>();
  let regularGames = 0, postseasonGames = 0, conferenceGames = 0, neutralSiteGames = 0, overtimeGames = 0, tiedGames = 0, plays = 0;
  for (const g of state.games) {
    plays += g.outcome.plays;
    if (g.fixture.phase !== 'regular') { postseasonGames++; continue; }
    regularGames++;
    if (g.fixture.conferenceGame) conferenceGames++;
    if (g.fixture.neutralSite) neutralSiteGames++;
    if (g.outcome.overtime) overtimeGames++;
    const sides = [g.fixture.home, g.fixture.away] as const;
    if (g.outcome.points[0] === g.outcome.points[1]) tiedGames++;
    sides.forEach((teamId, side) => {
      const line = lines.get(teamId);
      if (!line) return;
      const other = side === 0 ? 1 : 0;
      const pf = g.outcome.points[side]!, pa = g.outcome.points[other]!;
      line.pointsFor += pf; line.pointsAgainst += pa;
      if (pf > pa) line.wins++; else if (pf < pa) line.losses++; else line.ties++;
      if (lines.has(sides[other]!)) {
        line.gamesInside++;
        if (pf > pa) line.winsInside++; else if (pf === pa) line.tiesInside++;
      } else line.gamesOutside++;
    });
    for (const l of g.outcome.lines) {
      const key = `${l.statId}|${l.playerId}`;
      const prev = totals.get(key);
      totals.set(key, { playerId: l.playerId, teamId: l.teamId, statId: l.statId, value: (prev?.value ?? 0) + l.value });
    }
  }
  const teams = [...lines.entries()].sort((a, b) => a[0] - b[0]).map(([teamId, l]) => ({ teamId, ...l }));
  const playerTotals = [...totals.values()].sort((a, b) => (a.statId < b.statId ? -1 : a.statId > b.statId ? 1 : a.playerId - b.playerId));
  return {
    season: spec.season, ruleSetId: spec.ruleSetId, seedHex: spec.seedHex, champion: state.champion, teams,
    regularGames, postseasonGames, conferenceGames, neutralSiteGames, overtimeGames, tiedGames, plays, playerTotals,
    seatWeeks: state.seat.length, preparations: state.preparations,
    seasonHash: chainHash(state.chain, teams),
  };
}

/** Season leaders of one statistic, best first. */
export function leaders(summary: SeasonSummary, statId: string, count: number): PlayerSeasonTotal[] {
  return summary.playerTotals.filter((t) => t.statId === statId).sort((a, b) => b.value - a.value || a.playerId - b.playerId).slice(0, count);
}

export interface RecordMark { readonly statId: string; readonly value: number }

/** Single-season records this season broke (C9): the season's best total above the standing mark. */
export function recordsBroken(summary: SeasonSummary, book: readonly RecordMark[]): { statId: string; previous: number; value: number; playerId: number }[] {
  const out: { statId: string; previous: number; value: number; playerId: number }[] = [];
  for (const mark of book) {
    const best = leaders(summary, mark.statId, 1)[0];
    if (best && best.value > mark.value) out.push({ statId: mark.statId, previous: mark.value, value: best.value, playerId: best.playerId });
  }
  return out;
}
