// Adapts the app-services season session (`play.SeasonPlay`) to the career root's port. The console setup
// (sheets, keys, radio cutoff) comes from the host, so the sheet bridge supplies it without this file knowing.
import { presentationLive, TICKS_PER_SECOND, type gameCallingCommands, type play } from '@gm/app-services';
import { rt } from './text.ts';
import { resolveColours, tokenValue } from '../tokens/tokens.ts';
import type { CareerPort, GameSession, LiveField, SeasonToday, StandingRow } from './port.ts';

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
  /** Team colours by content key (home strip primary, away alternate); neutral greys when missing. */
  colours?(teamKey: string): { readonly primary: string; readonly alternate: string } | null;
  /**
   * Where the games the seat does not call are played (P2.1.2): the shell's Web Worker pool. Without one they
   * run in place, which holds the screen for the length of the week.
   */
  readonly pool?: play.WeekPool;
}

/** The theme's own home and away colours for a team the content gives none: presentation only, no team mark (A6). */
const TOKEN_TEAMS = (() => {
  const b = resolveColours('classic');
  const home = tokenValue(b, 'team.home'), away = tokenValue(b, 'team.away');
  return [{ primary: home, alternate: away }, { primary: away, alternate: home }] as const;
})();

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
  let field: LiveField | null = null;
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
    advanceToGameDay: (onProgress) => {
      if (!host.pool) { sp.advanceToGame(); gameDay = sp.nextSeatGame() !== null; return; }
      return sp.advanceToGameIn(host.pool, onProgress).then(() => { gameDay = sp.nextSeatGame() !== null; });
    },
    startGame: (): GameSession => {
      const seat = sp.nextSeatGame();
      if (!seat) throw new Error('career root: no game for the seat this week');
      const me = sp.nameOf(sp.today().seatTeamId), them = sp.nameOf(seat.opponentId);
      sides = seat.side === 0 ? [me, them] : [them, me];
      // The live field: the resolver is tapped for each play's trajectory, and the console holds the next call
      // while the play runs on screen (I2.1.1); with no trajectory (reference resolver) the hold is the host's.
      let tap: presentationLive.LiveTap | null = null;
      const tapped = (r: Parameters<typeof presentationLive.liveTap>[0]) => (tap = presentationLive.liveTap(r)).resolver;
      const shown = (rec: Parameters<ReturnType<typeof presentationLive.liveMsFrom>>[0]) => {
        const ms = tap ? presentationLive.liveMsFrom(tap, TICKS_PER_SECOND)(rec) : 0;
        return ms > 0 ? ms : host.liveMs?.() ?? 0;
      };
      const session = sp.openGame({ console: host.consoleConfig(String(seat.context.fixture.gameId)), resolve: host.resolve, keyIntervalMs: 0, startMs: 0, liveMs: shown, tapResolver: tapped });
      const input = sp.gameInput!;
      const queue = new presentationLive.LivePlayQueue({ tap: tap!, teams: input.teams, ticksPerSecond: TICKS_PER_SECOND, environment: () => input.environment, userSide: seat.side, rules: session.rules });
      const col = (teamId: number, i: 0 | 1) => host.colours?.(sp.keyOf(teamId)) ?? TOKEN_TEAMS[i];
      const home = seat.side === 0 ? sp.today().seatTeamId : seat.opponentId;
      const away = seat.side === 0 ? seat.opponentId : sp.today().seatTeamId;
      field = { take: () => queue.take(session.events), geometry: session.geometry, userSide: seat.side, level: host.level, colours: [col(home, 0), col(away, 1)] };
      return session;
    },
    finishGame: (_session, onProgress) => {
      const done = () => { gameDay = false; field = null; };
      if (!host.pool) { sp.finishGame(); done(); return; }
      return sp.finishGameIn(host.pool, onProgress).then(done);
    },
    liveField: () => field,
    delegateGame: (onProgress) => {
      if (!host.pool) { sp.advanceToGame(); if (sp.nextSeatGame()) sp.delegateGame(); gameDay = false; return; }
      const pool = host.pool;
      return sp.advanceToGameIn(pool, onProgress)
        .then(() => (sp.nextSeatGame() ? sp.delegateGameIn(pool, onProgress) : null))
        .then(() => { gameDay = false; });
    },
    // PLACEHOLDER rosters have no names yet: a player is his jersey slot until generated people play (G-17).
    names: () => ({ playerName: (id: number) => `#${id % 100}`, teamName: (side: 0 | 1) => sides[side] }),
  };
}
