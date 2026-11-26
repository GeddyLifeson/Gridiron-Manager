// The season session the app runs a season with (H1, I, C2 to C4; handoff "Let the player start and play a
// game", item A). It holds one season of the shipped competitions, built by @gm/world season from the
// repository's data files, and plays it step by step: every game the head coach seat is not in goes through
// the real game (reference resolver, officiating, statistics, chart caller on both sides); the seat's game is
// played on the calling console (`GameCallingSession`) and its result joins the season like any other.
//
// The seat's game of the coming step is found by a dry run of the pure runner: `stepSeason` with a stand-in
// port that only records the seat's game context, its state thrown away. That gives the exact fixture, seed
// and side the real step will hand the port, for regular weeks and postseason rounds alike.
//
// Persistence: the state is plain data, so `save()` keeps it as it is, plus the seat's game outcomes, the only
// input that does not follow from the seed. `replay` rebuilds the season from the seed and those outcomes and
// must reach the same hash chain (Q1.3.1 season replay).
//
// Not here yet: the seat's week (H1 calendar, `seatWeek`), AI preparation (K3), the user's own call sheet
// (G-68 bridge) and generated rosters. The teams are the real game's neutral placeholder rosters.
import { season as seasons } from '@gm/world';
import type { DriveRecord, GameInput, PersonRecord, PlayRecord, SimPlayer } from '@gm/schema';
import { GameCallingSession, type GameSessionOptions, type LineupFor } from '../commands/game-calling/index.ts';
import { seatTeamFromDepth, simPlayerFromPerson, type SeatDepth } from './seat-depth.ts';

type GameContext = seasons.GameContext;
type GameOutcome = seasons.GameOutcome;
type SeasonState = seasons.SeasonState;

export interface SeasonPlayOptions {
  /** `pro_2026` or `college_2026`: the rule set and the competition built for it. */
  readonly ruleSetId: string;
  readonly seasonYear: number;
  /** 16 lower-case hex digits: the season seed every game seed derives from (J13.2.1). */
  readonly seedHex: string;
  /** World-data key of the team the user coaches. */
  readonly seatTeamKey: string;
  /** Play resolver of every game: the tick engine by default (world season real game); `reference` for fast harnesses. */
  readonly resolver?: seasons.RealResolver;
}

/** What the host supplies to put the seat's game on the console: the console setup and the key map. */
export type GameHost = Pick<GameSessionOptions, 'console' | 'resolve'>
  & Partial<Pick<GameSessionOptions, 'keyIntervalMs' | 'startMs' | 'liveMs' | 'bookLine' | 'flowOptions' | 'firstPersonnel'>>;

/** The seat's game in the coming step. */
export interface SeatGame {
  readonly context: GameContext;
  readonly side: 0 | 1;
  readonly opponentId: number;
  readonly opponentKey: string;
  readonly home: boolean;
}

export interface SeasonPlaySave {
  readonly version: 1;
  readonly options: SeasonPlayOptions;
  readonly state: SeasonState;
  /** The seat's game outcomes by game id: the season's only input that does not come from the seed. */
  readonly seatOutcomes: readonly { readonly gameId: number; readonly outcome: GameOutcome }[];
}

/** Stand-in result of a dry run: one point for the home side, so no postseason game is tied. Never kept. */
const DRY: GameOutcome = { points: [1, 0], touchdowns: [0, 0], overtime: false, stateHash: '', plays: 0, lines: [] };

/** One row of the standings table. */
export interface StandingRow {
  readonly teamId: number;
  readonly key: string;
  readonly name: string;
  readonly conferenceId: number;
  readonly divisionId: number;
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  readonly pointsFor: number;
  readonly pointsAgainst: number;
}

/** What the Today screen shows for the season (O1, H1): where the season is and the seat's next game. */
export interface SeasonToday {
  readonly seatTeamId: number;
  readonly seatTeamKey: string;
  readonly seatTeamName: string;
  readonly record: { readonly wins: number; readonly losses: number; readonly ties: number };
  readonly stage: seasons.SeasonStage;
  /** League week of the coming step (regular), or postseason round number from 1. */
  readonly week: number;
  readonly round: number;
  readonly standings: readonly StandingRow[];
  /** The seat's game in the coming step, or null. */
  readonly nextGame: {
    readonly gameId: number; readonly opponentId: number; readonly opponentKey: string; readonly opponentName: string;
    readonly home: boolean; readonly neutralSite: boolean; readonly phase: 'regular' | 'postseason'; readonly week: number;
    readonly dayIndex: number | null; readonly kickoffMinute: number | null; readonly postKey: string | null;
  } | null;
  /** Steps until the seat's next game: 0 when it is in the coming step, null when none is scheduled. */
  readonly weeksToGame: number | null;
  readonly seasonOver: boolean;
  readonly champion: { readonly teamId: number; readonly key: string; readonly name: string } | null;
}

/** Display name of every team key in the content: pro city and nickname, college school name. */
function teamNames(content: seasons.LeagueContent): Map<string, string> {
  const out = new Map<string, string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pro = content.proLeague as any, college = content.college as any;
  for (const c of pro?.league?.clubs ?? []) out.set(c.id, `${c.city} ${c.nickname}`);
  for (const s of college?.schools ?? []) out.set(s.id, s.name);
  return out;
}

/** What `fromWorld` reads of a generated world (@gm/world loop LiveWorld): its teams and their public identity. */
export interface WorldTeams {
  readonly teams: readonly { readonly id: number; readonly identity: { readonly name: string; readonly abbreviation: string } }[];
  /** The world's people and date: when present, the seat's players play with their own ratings. */
  readonly people?: ReadonlyMap<number, PersonRecord>;
  readonly date?: { readonly seasonYear: number };
}

export interface WorldSeasonOptions {
  readonly ruleSetId: string;
  readonly seasonYear: number;
  readonly seedHex: string;
  /** Team id in the world's team table. */
  readonly seatTeamId: number;
  readonly resolver?: seasons.RealResolver;
}

/**
 * Content key of a world team. The world generator builds every team from the same content files (club and
 * school ids), keeping the content name and abbreviation as the team's identity, so the pair finds the key.
 */
export function contentKeyOfWorldTeam(content: seasons.LeagueContent, world: WorldTeams, teamId: number): string {
  const team = world.teams.find((t) => t.id === teamId);
  if (!team) throw new Error(`season session: team ${teamId} is not in the world`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pro = content.proLeague as any, college = content.college as any;
  const rows: { id: string; name: string; abbreviation: string }[] = [
    ...(pro?.league?.clubs ?? []).map((c: { id: string; city: string; nickname: string; abbreviation: string }) => ({ id: c.id, name: `${c.city} ${c.nickname}`, abbreviation: c.abbreviation })),
    ...(college?.schools ?? []).map((s: { id: string; name: string; abbreviation: string }) => ({ id: s.id, name: s.name, abbreviation: s.abbreviation })),
  ];
  const hit = rows.filter((r) => r.name === team.identity.name && r.abbreviation === team.identity.abbreviation);
  if (hit.length !== 1) throw new Error(`season session: world team ${teamId} (${team.identity.name}) matches ${hit.length} content teams`);
  return hit[0]!.id;
}

interface OpenGame { readonly context: GameContext; readonly input: GameInput; readonly session: GameCallingSession }

export class SeasonPlay {
  readonly options: SeasonPlayOptions;
  readonly built: seasons.BuiltSeason;
  readonly seatTeamId: number;
  state: SeasonState;
  private readonly port: ReturnType<typeof seasons.realGamePort>;
  private readonly seatOutcomes = new Map<number, GameOutcome>();
  private open: OpenGame | null = null;
  private dry: { state: SeasonState; game: SeatGame | null } | null = null;
  private readonly names: Map<string, string>;

  private constructor(content: seasons.LeagueContent, options: SeasonPlayOptions, state?: SeasonState) {
    this.options = options;
    this.names = teamNames(content);
    this.built = seasons.buildSeason(content, options.ruleSetId, { season: options.seasonYear, seedHex: options.seedHex, seatTeamKey: options.seatTeamKey });
    if (this.built.spec.seatTeamId === null) throw new Error(`season session: no seat team for ${options.seatTeamKey}`);
    this.seatTeamId = this.built.spec.seatTeamId;
    this.port = seasons.realGamePort({ ruleSetId: options.ruleSetId, ...(options.resolver ? { resolver: options.resolver } : {}) });
    this.state = state ?? seasons.createSeason(this.built.spec);
  }

  /** A new season with the user at `seatTeamKey`. */
  static start(content: seasons.LeagueContent, options: SeasonPlayOptions): SeasonPlay {
    return new SeasonPlay(content, options);
  }

  /**
   * A new season for a generated world's seat team (the new-game picker's world). The competition, schedule
   * and teams still come from the content files the world was generated from; the world's own rosters do
   * not reach the games yet (placeholder rosters, see the file header).
   */
  static fromWorld(content: seasons.LeagueContent, world: WorldTeams, o: WorldSeasonOptions): SeasonPlay {
    const play = new SeasonPlay(content, { ruleSetId: o.ruleSetId, seasonYear: o.seasonYear, seedHex: o.seedHex, seatTeamKey: contentKeyOfWorldTeam(content, world, o.seatTeamId), ...(o.resolver ? { resolver: o.resolver } : {}) });
    const people = world.people;
    if (people) {
      const year = world.date?.seasonYear ?? o.seasonYear;
      play.playerOf = (id) => { const p = people.get(id); return p ? simPlayerFromPerson(p, year) : null; };
    }
    return play;
  }

  /** A saved season, continued from its saved state. */
  static restore(content: seasons.LeagueContent, save: SeasonPlaySave): SeasonPlay {
    if (save.version !== 1) throw new Error(`season session: save version ${String(save.version)} is not supported`);
    const play = new SeasonPlay(content, save.options, save.state);
    for (const s of save.seatOutcomes) play.seatOutcomes.set(s.gameId, s.outcome);
    return play;
  }

  /**
   * A saved season rebuilt from its seed and the seat's outcomes alone, played to the saved state's step.
   * Throws when the rebuilt hash chain differs from the saved one.
   */
  static replay(content: seasons.LeagueContent, save: SeasonPlaySave): SeasonPlay {
    if (save.version !== 1) throw new Error(`season session: save version ${String(save.version)} is not supported`);
    const play = new SeasonPlay(content, save.options);
    for (const s of save.seatOutcomes) play.seatOutcomes.set(s.gameId, s.outcome);
    const at = (s: SeasonState) => s.stage === save.state.stage && s.week === save.state.week && s.round === save.state.round;
    while (!at(play.state) && play.state.stage !== 'final') play.state = seasons.stepSeason(play.built.spec, play.state, play.ports(true));
    if (play.state.chain !== save.state.chain) throw new Error(`season session: replay reached chain ${play.state.chain}, the save has ${save.state.chain}`);
    return play;
  }

  /** The play resolver the games run on. */
  get resolverId(): seasons.RealResolver { return this.port.game.resolverId; }

  get stage(): seasons.SeasonStage { return this.state.stage; }
  get champion(): number | null { return this.state.champion; }
  /** The console session of the seat's game while it is open. */
  get game(): GameCallingSession | null { return this.open?.session ?? null; }

  keyOf(teamId: number): string { return this.built.keyOf.get(teamId) ?? String(teamId); }
  nameOf(teamId: number): string { const k = this.keyOf(teamId); return this.names.get(k) ?? k; }

  /** The seat's game in the coming step, or null in a bye week, after elimination or once the season is over. */
  nextSeatGame(): SeatGame | null {
    if (this.dry?.state === this.state) return this.dry.game;
    let context: GameContext | null = null;
    if (this.state.stage !== 'final') {
      seasons.stepSeason(this.built.spec, this.state, {
        playGame: (ctx) => { if (ctx.seatSide !== null) context = ctx; return DRY; },
      });
    }
    const ctx = context as GameContext | null;
    const game: SeatGame | null = ctx === null || ctx.seatSide === null ? null : {
      context: ctx, side: ctx.seatSide, home: ctx.seatSide === 0,
      opponentId: ctx.seatSide === 0 ? ctx.fixture.away : ctx.fixture.home,
      opponentKey: this.keyOf(ctx.seatSide === 0 ? ctx.fixture.away : ctx.fixture.home),
    };
    this.dry = { state: this.state, game };
    return game;
  }

  /**
   * The user's depth chart (the depth chart screen's chart, unit definitions, roster and actives). From the next
   * game on it decides who plays for the seat, on the console and when the staff plays the game; null puts the
   * placeholder eleven back. Not saved with the season: the world keeps the chart.
   */
  seatDepth: SeatDepth | null = null;
  /** Ratings source for chart players when the chart brings none: the world's people (`fromWorld`), else none. */
  playerOf: ((personId: number) => SimPlayer | null) | null = null;
  setDepthChart(d: SeatDepth | null): void {
    this.seatDepth = d === null || d.playerOf || !this.playerOf ? d : { ...d, playerOf: this.playerOf };
  }

  /** The seat's game input for the coming step: the all-AI input, with the seat team from the depth chart when one is set. */
  private seatInput(seat: SeatGame): { input: GameInput; lineup: LineupFor } {
    const input = seasons.fixtureInput(this.port.game, seat.context.fixture, seat.context.seedHex);
    if (this.seatDepth === null) {
      const roster = seasons.chart.depthRoster(input.teams[seat.side].depth);
      return { input, lineup: (unit, personnel) => roster(unit, personnel) };
    }
    const own = seatTeamFromDepth(input.teams[seat.side], this.seatDepth);
    const other = input.teams[seat.side === 0 ? 1 : 0];
    const theirs = new Set(other.players.map((p) => p.playerId));
    const clash = own.team.players.filter((p) => theirs.has(p.playerId)).map((p) => p.playerId);
    if (clash.length) throw new Error(`season session: depth chart ids ${clash.slice(0, 5).join(', ')} are also opponent placeholder ids`);
    const teams = (seat.side === 0 ? [own.team, other] : [other, own.team]) as unknown as GameInput['teams'];
    return { input: { ...input, teams }, lineup: own.lineup };
  }

  /** Puts the seat's game of the coming step on the console. The opponent is the chart caller. */
  openGame(host: GameHost): GameCallingSession {
    if (this.open) throw new Error('season session: a game is already open');
    const seat = this.nextSeatGame();
    if (!seat) throw new Error('season session: the seat has no game in the coming step');
    if (this.seatOutcomes.has(seat.context.fixture.gameId)) throw new Error(`season session: game ${seat.context.fixture.gameId} is already played`);
    const { input, lineup } = this.seatInput(seat);
    const deps = this.port.game.deps(input);
    const session = new GameCallingSession({ ...host, input, deps, userSide: seat.side, lineup });
    session.start();
    this.open = { context: seat.context, input, session };
    return session;
  }

  /** Records the open game once it is final, closes the console session and plays the rest of its step. */
  finishGame(): GameOutcome {
    const g = this.open;
    if (!g) throw new Error('season session: no game is open');
    if (!g.session.final) throw new Error('season session: the game is not final');
    const records: PlayRecord[] = [];
    const drives: DriveRecord[] = [];
    for (const e of g.session.events) {
      if (e.type === 'play_resolved') records.push(e.record);
      else if (e.type === 'drive_ended') drives.push(e.drive);
    }
    const outcome = seasons.outcomeOf(this.port.game, g.context.fixture, g.input, { final: g.session.game, events: g.session.events, records, drives });
    this.seatOutcomes.set(g.context.fixture.gameId, outcome);
    this.open = null;
    this.advance();
    return outcome;
  }

  /** The staff plays the seat's game of the coming step (the chart caller on both sides), then the rest of the step. */
  delegateGame(): GameOutcome {
    if (this.open) throw new Error('season session: a game is open on the console');
    const seat = this.nextSeatGame();
    if (!seat) throw new Error('season session: the seat has no game in the coming step');
    let outcome: GameOutcome;
    if (this.seatDepth === null) outcome = this.port.playGame(seat.context);
    else {
      const { input } = this.seatInput(seat);
      outcome = seasons.outcomeOf(this.port.game, seat.context.fixture, input, this.port.game.simulate(input));
    }
    this.seatOutcomes.set(seat.context.fixture.gameId, outcome);
    this.advance();
    return outcome;
  }

  /** The season's ports: the recorded seat outcome for the seat's game, the real game for every other. */
  private ports(replaying = false): seasons.SeasonPorts {
    return {
      playGame: (ctx) => {
        if (ctx.seatSide === null) return this.port.playGame(ctx);
        const o = this.seatOutcomes.get(ctx.fixture.gameId);
        if (!o) throw new Error(replaying ? `season session: the save has no outcome for the seat's game ${ctx.fixture.gameId}` : `season session: play the seat's game ${ctx.fixture.gameId} first`);
        return o;
      },
    };
  }

  /**
   * Plays the coming step: one regular week or one postseason round, or the close of the season. When the
   * seat has a game in it, that game must be finished (or delegated) first.
   */
  advance(): SeasonState {
    if (this.open) throw new Error('season session: finish the open game first');
    const seat = this.nextSeatGame();
    if (seat && !this.seatOutcomes.has(seat.context.fixture.gameId)) throw new Error(`season session: play the seat's game ${seat.context.fixture.gameId} first`);
    this.state = seasons.stepSeason(this.built.spec, this.state, this.ports());
    return this.state;
  }

  /** Plays steps with no seat game (byes, other teams' rounds) until the seat's next game is up or the season ends. */
  advanceToGame(): SeasonState {
    while (this.state.stage !== 'final' && this.nextSeatGame() === null) this.advance();
    return this.state;
  }

  today(): SeasonToday {
    const sum = this.summary();
    const place = new Map(this.built.spec.teams.map((t) => [t.id, t]));
    const standings: StandingRow[] = sum.teams.map((l) => ({
      teamId: l.teamId, key: this.keyOf(l.teamId), name: this.nameOf(l.teamId),
      conferenceId: place.get(l.teamId)?.conferenceId ?? 0, divisionId: place.get(l.teamId)?.divisionId ?? 0,
      wins: l.wins, losses: l.losses, ties: l.ties, pointsFor: l.pointsFor, pointsAgainst: l.pointsAgainst,
    }));
    const mine = standings.find((r) => r.teamId === this.seatTeamId);
    const seat = this.nextSeatGame();
    const f = seat?.context.fixture;
    let weeksToGame: number | null = seat ? 0 : null;
    if (!seat && this.state.stage === 'regular') {
      const next = this.built.spec.fixtures.filter((x) => x.week >= this.state.week && (x.home === this.seatTeamId || x.away === this.seatTeamId)).reduce((m, x) => Math.min(m, x.week), Infinity);
      weeksToGame = Number.isFinite(next) ? next - this.state.week : null;
    }
    const champ = this.state.champion;
    return {
      seatTeamId: this.seatTeamId, seatTeamKey: this.keyOf(this.seatTeamId), seatTeamName: this.nameOf(this.seatTeamId),
      record: { wins: mine?.wins ?? 0, losses: mine?.losses ?? 0, ties: mine?.ties ?? 0 },
      stage: this.state.stage, week: this.state.stage === 'regular' ? this.state.week : this.state.lastRegularWeek + this.state.round + 1,
      round: this.state.stage === 'regular' ? 0 : this.state.round + 1, standings,
      nextGame: seat && f ? {
        gameId: f.gameId, opponentId: seat.opponentId, opponentKey: seat.opponentKey, opponentName: this.nameOf(seat.opponentId),
        home: seat.home, neutralSite: f.neutralSite, phase: f.phase, week: f.week, dayIndex: f.dayIndex, kickoffMinute: f.kickoffMinute, postKey: f.postKey,
      } : null,
      weeksToGame, seasonOver: this.state.stage === 'final',
      champion: champ === null ? null : { teamId: champ, key: this.keyOf(champ), name: this.nameOf(champ) },
    };
  }

  /** Won-lost lines and season totals so far (regular season). */
  summary(): seasons.SeasonSummary { return seasons.summariseSeason(this.built.spec, this.state); }

  /** The seat's games played so far, oldest first. */
  seatResults(): readonly seasons.PlayedGame[] {
    return this.state.games.filter((g) => g.fixture.home === this.seatTeamId || g.fixture.away === this.seatTeamId);
  }

  save(): SeasonPlaySave {
    return {
      version: 1, options: this.options, state: this.state,
      seatOutcomes: [...this.seatOutcomes].sort((a, b) => a[0] - b[0]).map(([gameId, outcome]) => ({ gameId, outcome })),
    };
  }
}
