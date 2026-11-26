// Adapts the app-services season session (`play.SeasonPlay`) to the career root's port. The console setup
// (sheets, keys, radio cutoff) comes from the host, so the sheet bridge supplies it without this file knowing.
import type { gameCallingCommands, play } from '@gm/app-services';
import { rt } from './text.ts';
import type { CareerPort, GameSession, SeasonToday, StandingRow } from './port.ts';

type ConsoleConfig = gameCallingCommands.ConsoleConfig;
type Resolve = (chord: string, contexts: readonly string[]) => string | undefined;

export interface SeasonPortHost {
  readonly level: 'pro' | 'college';
  readonly seasonYear: number;
  /** The console setup for the seat's game, built when the game opens (the staff's sheet or the user's own). */
  consoleConfig(gameId: string): ConsoleConfig;
  readonly resolve: Resolve;
  /** Real milliseconds a play runs on screen before the next call opens (I2.1.1); the play log shows it meanwhile. */
  liveMs?(): number;
}

/** Days from 1970-01-01 to 1 January of `year` (proleptic Gregorian; integer arithmetic only). */
export function epochDayOfNewYear(year: number): number {
  const y = year - 1;
  return 365 * (year - 1970) + (Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400)) - (Math.floor(1969 / 4) - Math.floor(1969 / 100) + Math.floor(1969 / 400));
}

/** Days in a league week: the season steps a week at a time until the week loop (H1) adds the days. */
const DAYS_PER_WEEK = 7;

export function careerPortFromSeason(sp: play.SeasonPlay, host: SeasonPortHost): CareerPort {
  let sides: [string, string] = ['', ''];
  // The office reaches game day by advancing; until then the coming step's game is a week out (H1 adds the days).
  let gameDay = false;
  const today = (): SeasonToday => {
    const t = sp.today();
    const seat = t.standings.find((r) => r.teamId === t.seatTeamId);
    // The seat's own table: its division in the pro league, its conference in college.
    const same = (r: play.StandingRow) => (seat ? r.conferenceId === seat.conferenceId && (host.level === 'college' || r.divisionId === seat.divisionId) : true);
    const standings: StandingRow[] = t.standings.filter(same)
      .map((r) => ({ teamId: r.teamId, name: r.name, w: r.wins, l: r.losses, t: r.ties, pf: r.pointsFor, pa: r.pointsAgainst, seat: r.teamId === t.seatTeamId }))
      .sort((a, b) => (b.w + b.t / 2) / Math.max(1, b.w + b.l + b.t) - (a.w + a.t / 2) / Math.max(1, a.w + a.l + a.t) || b.w - a.w || (b.pf - b.pa) - (a.pf - a.pa));
    const results = sp.seatResults();
    const last = results[results.length - 1];
    let lastResult: string | null = null;
    if (last) {
      const home = last.fixture.home === t.seatTeamId;
      const us = last.outcome.points[home ? 0 : 1], them = last.outcome.points[home ? 1 : 0];
      const opp = home ? last.fixture.away : last.fixture.home;
      lastResult = rt('root.resultLine', { result: us > them ? rt('root.won') : us < them ? rt('root.lost') : rt('root.tied'), us, them, where: home ? 'vs' : 'at', opponent: sp.nameOf(opp) });
    }
    const n = t.nextGame;
    const daysToGame = gameDay ? 0 : ((t.weeksToGame ?? 0) + 1) * DAYS_PER_WEEK;
    // Fixture days count from 1970-01-01; the office date line counts days of the season year from 1 January.
    const gameDay0 = n?.dayIndex != null ? n.dayIndex - epochDayOfNewYear(host.seasonYear) : null;
    const dayIndex = gameDay0 !== null ? Math.max(0, gameDay0 - daysToGame) : Math.max(0, t.week - 1) * DAYS_PER_WEEK;
    return {
      teamName: t.seatTeamName, level: host.level, seasonYear: host.seasonYear, dayIndex,
      stageLabel: t.stage === 'regular' ? rt('root.week', { week: t.week }) : t.stage === 'postseason' ? rt('root.round', { round: t.round }) : rt('root.seasonOver'),
      record: { w: t.record.wins, l: t.record.losses, t: t.record.ties },
      nextGame: n ? { opponentId: n.opponentId, opponent: n.opponentName, home: n.home, daysToGame } : null,
      lastResult, standings, seasonOver: t.seasonOver, champion: t.champion?.name ?? null,
    };
  };
  return {
    today,
    advanceToGameDay: () => { sp.advanceToGame(); gameDay = sp.nextSeatGame() !== null; },
    startGame: (): GameSession => {
      const seat = sp.nextSeatGame();
      if (!seat) throw new Error('career root: no game for the seat this week');
      const me = sp.nameOf(sp.today().seatTeamId), them = sp.nameOf(seat.opponentId);
      sides = seat.side === 0 ? [me, them] : [them, me];
      return sp.openGame({ console: host.consoleConfig(String(seat.context.fixture.gameId)), resolve: host.resolve, keyIntervalMs: 0, startMs: 0, ...(host.liveMs ? { liveMs: () => host.liveMs!() } : {}) });
    },
    finishGame: () => { sp.finishGame(); gameDay = false; },
    delegateGame: () => { sp.advanceToGame(); if (sp.nextSeatGame()) sp.delegateGame(); gameDay = false; },
    // PLACEHOLDER rosters have no names yet: a player is his jersey slot until generated people play (G-17).
    names: () => ({ playerName: (id: number) => `#${id % 100}`, teamName: (side: 0 | 1) => sides[side] }),
  };
}
