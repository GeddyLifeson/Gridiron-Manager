// Adapts the app-services season session (`play.SeasonPlay`) to the career root's port. The seat's game week runs
// on the week loop (`weekLoop.SeatWeekLoop`, H1.1.3): the Today controls step it block by block, a day at a time
// or to game day, and at kickoff the loop's sheets (the staff's draft, or the user's own) go to the console when
// the host gives its key bindings. Without them the host's own console setup is used (the quick start's).
import { presentationLive, TICKS_PER_SECOND, weekLoop, type gameCallingCommands, type play } from '@gm/app-services';
import { rt } from './text.ts';
import { resolveColours, tokenValue } from '../tokens/tokens.ts';
import type { AdvanceTarget } from '../screens/home/view.ts';
import type { CareerPort, GameSession, LiveField, SeasonToday, StandingRow, WeekToday } from './port.ts';
import { filmSources, weekSources } from './sources/index.ts';

type ConsoleConfig = gameCallingCommands.ConsoleConfig;
type Resolve = (chord: string, contexts: readonly string[]) => string | undefined;

export interface SeasonPortHost {
  readonly level: 'pro' | 'college';
  readonly seasonYear: number;
  /** The console setup for the seat's game, built when the game opens (the staff's sheet or the user's own). */
  consoleConfig(gameId: string): ConsoleConfig;
  /** The seat's football desk: its week follows the seat's next game, and the football screens read it. */
  readonly football?: play.FootballDesk;
  /** Key bindings for the week's own sheets on the console; without them `consoleConfig` sets the console up. */
  readonly bindings?: readonly { readonly context: string; readonly keys: readonly string[] }[];
  readonly resolve: Resolve;
  /** Real milliseconds a play runs on screen before the next call opens (I2.1.1); the play log shows it meanwhile. */
  liveMs?(): number;
  /** Team colours by content key (home strip primary, away alternate); neutral greys when missing. */
  colours?(teamKey: string): { readonly primary: string; readonly alternate: string } | null;
  /** League rules for the week checks (`weekLoop.weekRules` on the league-rules file); the week screens need them. */
  readonly weekRules?: weekLoop.WeekDeskHost['rules'];
  /** Home venues by team content key (`weekLoop.venuesOf`), for away-week trips (C1.4.1). */
  readonly venues?: ReadonlyMap<string, weekLoop.Venue>;
  /** Market size 1 to 5 by team content key (pro market tier, college size tier), for the press room (H7.2). */
  marketOf?(teamKey: string): number | null;
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

/** Market size when the content gives none: the middle of C1's 1 to 5. */
const MIDDLE_MARKET = 3;

/** Days in a league week: the season steps a week at a time; inside a game week the week loop counts the days. */
const DAYS_PER_WEEK = 7;
const MINUTES_PER_DAY = 24 * 60;

const MODE_OF: Readonly<Record<AdvanceTarget, 'block' | 'day' | 'decision' | 'game'>> = { next_block: 'block', end_of_day: 'day', next_must: 'decision', game_day: 'game' };

export function careerPortFromSeason(sp: play.SeasonPlay, host: SeasonPortHost): CareerPort {
  let sides: [string, string] = ['', ''];
  // The office reaches game day by advancing; until then the coming step's game is a week out (H1 adds the days).
  let gameDay = false;
  let field: LiveField | null = null;
  // The desk's game week is the seat's next game: a new game gets the staff's fresh sheets, the same game keeps edits.
  const syncDesk = () => { if (host.football) { const g = sp.nextSeatGame(); host.football.prepare(g ? String(g.context.fixture.gameId) : null); } };
  // The seat's week for the coming step, opened when the office first advances into it.
  let loop: weekLoop.SeatWeekLoop | null = null;
  const openLoop = (): weekLoop.SeatWeekLoop | null => {
    if (loop) return loop;
    sp.advanceToGame();
    loop = weekLoop.SeatWeekLoop.open(sp);
    return loop;
  };
  /** Runs the week to kickoff and hands the season its record. */
  const closeLoop = () => {
    const l = openLoop();
    if (!l) return;
    if (!l.atGameDay) l.toGameDay();
    if (!l.isFinished) l.finish();
  };
  /** The coming game week for the week screens: opened without playing anything when the seat's game is up. */
  const viewLoop = (): weekLoop.SeatWeekLoop | null => {
    if (loop) return loop;
    if (sp.nextSeatGame() === null) return null;
    loop = weekLoop.SeatWeekLoop.open(sp);
    return loop;
  };
  // An away week's trip: the seat's home venue to the home team's (a neutral site counts as the home team's venue).
  const trip = (l: weekLoop.SeatWeekLoop) => {
    const f = l.game.context.fixture;
    const home = host.venues?.get(sp.keyOf(sp.seatTeamId)), site = host.venues?.get(sp.keyOf(f.home));
    return home && site ? weekLoop.tripBetween(home, site, String(f.gameId), l.kickoff.day) : null;
  };
  // The media screen's room: a stand-in press corps asking about the season's own events (H7.2).
  const pressSession = (l: weekLoop.SeatWeekLoop, blockId: string) => weekLoop.standInSession(l, blockId, {
    level: host.level, coachId: 0, market: host.marketOf?.(sp.keyOf(sp.seatTeamId)) ?? MIDDLE_MARKET, nameOf: (id) => sp.nameOf(id),
  });
  const desk = host.weekRules ? new weekLoop.WeekDesk(viewLoop, { rules: host.weekRules, countable: host.level === 'college', trip, pressSession }) : null;
  const film = new weekLoop.SeatFilmRoom(sp.seatTeamId, sp.options.seedHex);
  let filmView: { geometry: GameSession['geometry']; home: { primary: string; alternate: string }; away: { primary: string; alternate: string } } | null = null;
  let filmTap: presentationLive.LiveTap | null = null;
  const step = (target: AdvanceTarget) => {
    const l = openLoop();
    if (!l) return;
    const r = l.step(MODE_OF[target]);
    // No inbox answers the week's items yet (E7): the clock takes the staff default where it stopped for one.
    if (r.stop === 'decision' && r.item) l.choose(r.item.id, r.item.defaultChoice);
    gameDay = l.atGameDay;
  };
  const week = (): WeekToday | null => {
    if (!loop || loop.isFinished) return null;
    const now = loop.now();
    const done = new Set(loop.week.completed);
    const day = loop.week.days.find((d) => d.blocks.some((b) => b.start.day === now.day));
    const all = loop.week.days.flatMap((d) => d.blocks).filter((b) => b.type !== 'game');
    const mine = (b: (typeof all)[number]) => b.leader === loop!.role;
    const year0 = epochDayOfNewYear(host.seasonYear);
    const preview = new Set(loop.delegationPreview().blocks);
    const label = (type: string) => rt(`root.block.${type}`);
    return {
      dayIndex: Math.max(0, now.day - year0),
      blocks: (day?.blocks ?? []).filter((b) => b.type !== 'game' && b.start.day === now.day)
        .map((b) => ({ blockId: b.id, label: label(b.type), startMinute: b.start.minute, minutes: b.minutes, mine: mine(b), done: done.has(b.id) })),
      minutesLeftThisWeek: all.filter((b) => mine(b) && !done.has(b.id)).reduce((n, b) => n + b.minutes, 0),
      runsWithout: all.filter((b) => preview.has(b.id)).map((b) => ({ blockId: b.id, label: label(b.type), dayIndex: Math.max(0, b.start.day - year0) })),
    };
  };
  const today = (): SeasonToday => {
    syncDesk();
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
    // In the game week the loop's clock counts the days to kickoff; before it, the weeks to the seat's game.
    const inWeek = loop !== null && !loop.isFinished;
    const daysToGame = gameDay ? 0 : inWeek ? Math.max(1, Math.ceil((loop!.kickoff.day * MINUTES_PER_DAY + loop!.kickoff.minute - loop!.now().day * MINUTES_PER_DAY - loop!.now().minute) / MINUTES_PER_DAY)) : ((t.weeksToGame ?? 0) + 1) * DAYS_PER_WEEK;
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
    week,
    advance: (target, onProgress) => {
      if (!host.pool || loop) { step(target); return; }
      return sp.advanceToGameIn(host.pool, onProgress).then(() => step(target));
    },
    advanceToGameDay: (onProgress) => {
      const toGameDay = () => {
        const l = openLoop();
        if (l && !l.atGameDay) l.toGameDay();
        gameDay = sp.nextSeatGame() !== null;
      };
      if (!host.pool || loop) { toGameDay(); return; }
      return sp.advanceToGameIn(host.pool, onProgress).then(toGameDay);
    },
    startGame: (): GameSession => {
      const seat = sp.nextSeatGame();
      if (!seat) throw new Error('career root: no game for the seat this week');
      const me = sp.nameOf(sp.today().seatTeamId), them = sp.nameOf(seat.opponentId);
      sides = seat.side === 0 ? [me, them] : [them, me];
      // The live field: the resolver is tapped for each play's trajectory, and the console holds the next call
      // while the play runs on screen (I2.1.1); with no trajectory (reference resolver) the hold is the host's.
      let tap: presentationLive.LiveTap | null = null;
      // Two taps: the film room keeps every play's trajectory; the live field drops them once shown.
      const tapped = (r: Parameters<typeof presentationLive.liveTap>[0]) => (tap = presentationLive.liveTap((filmTap = presentationLive.liveTap(r)).resolver)).resolver;
      const shown = (rec: Parameters<ReturnType<typeof presentationLive.liveMsFrom>>[0]) => {
        const ms = tap ? presentationLive.liveMsFrom(tap, TICKS_PER_SECOND)(rec) : 0;
        return ms > 0 ? ms : host.liveMs?.() ?? 0;
      };
      const gameId = String(seat.context.fixture.gameId);
      // The football desk's sheets are the ones the user sees and edits on the call sheet: the week calls from them.
      const open = host.football && host.bindings ? openLoop() : null;
      if (open && host.football && !open.isFinished) {
        host.football.prepare(gameId);
        const own = host.football.sheets();
        open.setSheet('offense', own.offense);
        open.setSheet('defense', own.defense);
      }
      closeLoop();
      const consoleSetup = loop && host.bindings ? loop.consoleConfig(host.bindings) : host.consoleConfig(gameId);
      const session = sp.openGame({ console: consoleSetup, resolve: host.resolve, keyIntervalMs: 0, startMs: 0, liveMs: shown, tapResolver: tapped });
      const input = sp.gameInput!;
      const queue = new presentationLive.LivePlayQueue({ tap: tap!, teams: input.teams, ticksPerSecond: TICKS_PER_SECOND, environment: () => input.environment, userSide: seat.side, rules: session.rules });
      const col = (teamId: number, i: 0 | 1) => host.colours?.(sp.keyOf(teamId)) ?? TOKEN_TEAMS[i];
      const home = seat.side === 0 ? sp.today().seatTeamId : seat.opponentId;
      const away = seat.side === 0 ? seat.opponentId : sp.today().seatTeamId;
      field = { take: () => queue.take(session.events), geometry: session.geometry, userSide: seat.side, level: host.level, colours: [col(home, 0), col(away, 1)] };
      return session;
    },
    finishGame: (session, onProgress) => {
      const input = sp.gameInput;
      const t = filmTap;
      if (input && t && session.final) {
        const records = session.events.flatMap((e) => (e.type === 'play_resolved' ? [e.record] : []));
        film.file({ records, geometry: session.geometry, params: session.params, input, trajectory: (n) => t.trajectory(n) });
        const own = host.colours?.(sp.keyOf(sp.seatTeamId)) ?? TOKEN_TEAMS[0];
        filmView = { geometry: session.geometry, home: own, away: TOKEN_TEAMS[1] };
      }
      const done = () => { gameDay = false; field = null; loop = null; filmTap = null; };
      if (!host.pool) { sp.finishGame(); done(); return; }
      return sp.finishGameIn(host.pool, onProgress).then(done);
    },
    routeSources: (redraw) => ({ ...(desk ? weekSources(desk, redraw) : {}), ...filmSources(film, filmView) }),
    liveField: () => field,
    delegateGame: (onProgress) => {
      const done = () => { gameDay = false; loop = null; };
      if (!host.pool) { closeLoop(); if (sp.nextSeatGame()) sp.delegateGame(); done(); return; }
      const pool = host.pool;
      // Bye weeks first, in the pool; then the seat's week to kickoff, then its game and the rest of the step.
      return sp.advanceToGameIn(pool, onProgress)
        .then(() => { closeLoop(); return sp.nextSeatGame() ? sp.delegateGameIn(pool, onProgress) : null; })
        .then(done);
    },
    // PLACEHOLDER rosters have no names yet: a player is his jersey slot until generated people play (G-17).
    names: () => ({ playerName: (id: number) => `#${id % 100}`, teamName: (side: 0 | 1) => sides[side] }),
  };
}
