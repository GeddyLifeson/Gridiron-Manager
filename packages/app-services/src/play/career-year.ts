// The career year (H1, C4, X12.1; playtest finding offseason.no_real_world): one live world that keeps
// running after the new-game history, with the user's season played through the season session. Each week
// the season session plays its step (the seat's game on the console or delegated), then the world runs its
// weekly pass. When the season is over the world runs its season point: development and aging, the Hall of
// Fame, the yearly cohorts, leaving and death; the `moves` slot runs the draft, free agency and the
// off-screen recruiting week (T4) through the year. The next season then starts from the same world.
//
// One league, not two: the seat's competition is taken out of the world's schedule and the games the
// season session played are written into the world's results instead (`results`, read by the season
// summary, the draft order and the record book). Every other competition plays through the world's own
// schedule and the real game. Team ids differ between the two (the season session numbers the content
// teams, the world its generated teams); both carry the content key, which joins them.
//
// Decisions (DECISIONS.md CY-01 to CY-05): pass and run play counts of the injected games are 0 (the
// season session keeps box scores, not play kinds); the seat team stays the start's team (job moves belong
// to the coaching market); the season seed is derived from the world seed and the year.
import { deriveSeed, seedToHex } from '@gm/engine-core';
import { loop, season as seasons, turnover } from '@gm/world';
import { bindSystems, type BoundSystems } from '../newgame/binding.ts';
import type { AppWorldContent } from '../newgame/content.ts';
import { SeasonPlay, contentKeyOfWorldTeam, type SeasonPlaySave } from './season-session.ts';
import { decodePlain, encodePlain } from './plain.ts';
import { PracticeDesk, practiceRules, type PracticeDeskSave, type PracticeRecord } from './practice-desk.ts';
import { RecruitingDesk, type RecruitingDeskSave } from './recruiting-desk.ts';
import { ScoutingDesk, type ScoutingDeskSave } from './scouting-desk.ts';

export interface CareerYearOptions {
  /** The world after the history run (newgame `startCareer`). It is kept and changed in place. */
  readonly world: loop.LiveWorld;
  /** The season content (the same the season session reads). */
  readonly content: seasons.LeagueContent;
  /** World team id of the user's team. */
  readonly seatTeamId: number;
  /** The game port for the world's own games. Default: the real game (`season.historyGamePort`). */
  readonly games?: loop.GamePort;
  /** World content binding (tests pass a trimmed one). Default: the app's content. */
  readonly worldContent?: AppWorldContent;
  /** Play resolver of the seat's season games. Default: the season session's (the tick engine); tests pass `reference`. */
  readonly resolver?: seasons.RealResolver;
}

export interface CareerYearSave {
  readonly version: 1;
  readonly seatTeamId: number;
  /** The packed world (loop.packWorld), maps and sets encoded as plain JSON. */
  readonly world: unknown;
  readonly season: SeasonPlaySave;
  /** Game ids of the season session already written into the world's results. */
  readonly injected: readonly number[];
  /** The week's practice plans and the practice history (absent in saves from before the desks). */
  readonly practice?: PracticeDeskSave;
  /** The staff's belief store about the team's own players. */
  readonly scouting?: ScoutingDeskSave;
  /** The user's queued recruiting acts and their record (college careers). */
  readonly recruiting?: RecruitingDeskSave;
}

/** What the office shows for the year: where the world and the season stand. */
export interface CareerYearView {
  readonly seasonYear: number;
  readonly worldWeek: number;
  readonly worldWeeks: number;
  readonly seasonStage: seasons.SeasonStage;
  readonly seatTeamId: number;
  readonly seasons: number;
  readonly people: number;
  readonly worldHash: string;
}

/** The level of the seat team's competition, and its rule set (newgame RULE_SET_OF_LEVEL). */
const RULE_SET: Readonly<Record<string, string>> = { pro: 'pro_2026', college: 'college_2026' };

/** Season seed of a year: derived from the world seed only, so a replayed world plays the same season. */
export function seasonSeedHex(world: loop.LiveWorld, year: number): string {
  return seedToHex(deriveSeed(world.seed, 'career.season', [year]));
}

export class CareerYear {
  readonly world: loop.LiveWorld;
  readonly seatTeamId: number;
  readonly seatCompetitionId: number;
  season: SeasonPlay;
  private readonly content: seasons.LeagueContent;
  private readonly resolver: seasons.RealResolver | undefined;
  private readonly bound: BoundSystems;
  private readonly injected = new Set<number>();
  /** Season-session team id to world team id, for the seat's competition. Rebuilt with each season. */
  private teamMap = new Map<number, number>();
  /** The week's practices of the seat team (H3). */
  practice: PracticeDesk;
  /** The staff's observations of its own players (D6). */
  scouting: ScoutingDesk = new ScoutingDesk();
  /** The user's own recruiting acts (T4, college careers). */
  recruiting: RecruitingDesk = new RecruitingDesk();
  /** Practices and seat games folded into the scouting desk by the last pass. */
  private lastPass: { practices: readonly PracticeRecord[]; gamesSeen: number } = { practices: [], gamesSeen: 0 };

  private constructor(o: CareerYearOptions, season: SeasonPlay | null) {
    this.world = o.world;
    this.content = o.content;
    this.resolver = o.resolver;
    this.seatTeamId = o.seatTeamId;
    const comp = o.world.competitions.find((c) => c.teamIds.includes(o.seatTeamId));
    if (!comp) throw new Error(`career year: team ${o.seatTeamId} is in no competition`);
    this.seatCompetitionId = comp.id;
    const seatComp = comp.id;
    this.practice = new PracticeDesk(() => this.level, () => this.practiceRules());
    this.bound = bindSystems(o.world, {
      games: o.games ?? seasons.historyGamePort(),
      recruiting: true,
      // A college career's own program recruits through the user's desk, not as an AI program.
      recruitingUser: (w) => (turnover.levelOfTeam(w, o.seatTeamId) === 'college' ? this.recruiting.binding(o.seatTeamId) : undefined),
      ...(o.worldContent ? { content: o.worldContent } : {}),
      // The seat's competition is played by the season session; its games are written in, not scheduled.
      // The base schedule reads a view of the world without it (its brackets read results it never scheduled).
      schedule: (base) => {
        const without = (w: loop.LiveWorld): loop.LiveWorld => ({ ...w, competitions: w.competitions.filter((c) => c.id !== seatComp) });
        return {
          weeksInSeason: (w) => base.weeksInSeason(without(w)),
          gamesOn: (w, week) => base.gamesOn(without(w), week),
        };
      },
    });
    this.season = season ?? this.newSeason();
    this.mapTeams();
  }

  /** The career's first year, on the world the new game built. */
  static start(o: CareerYearOptions): CareerYear { return new CareerYear(o, null); }

  /** A saved career year. The world comes back with the same world hash it was saved with. */
  static restore(o: Omit<CareerYearOptions, 'world' | 'seatTeamId'>, save: CareerYearSave): CareerYear {
    if (save.version !== 1) throw new Error(`career year: save version ${String(save.version)} is not supported`);
    const world = loop.unpackWorld(decodePlain(save.world) as loop.PackedWorld, { eventTypes: turnover.TURNOVER_EVENT_TYPES });
    const y = new CareerYear({ ...o, world, seatTeamId: save.seatTeamId }, SeasonPlay.restore(o.content, save.season));
    for (const id of save.injected) y.injected.add(id);
    const s = save.practice;
    if (s) y.practice = PracticeDesk.restore(() => y.level, () => y.practiceRules(), s);
    if (save.scouting) y.scouting = ScoutingDesk.restore(save.scouting);
    if (save.recruiting) y.recruiting = RecruitingDesk.restore(save.recruiting);
    return y;
  }

  get level(): 'pro' | 'college' { return turnover.levelOfTeam(this.world, this.seatTeamId) as 'pro' | 'college'; }
  get ruleSetId(): string { return RULE_SET[this.level] ?? 'pro_2026'; }
  get systems(): loop.WorldSystems { return this.bound.systems; }
  get schedule(): loop.SchedulePort { return this.bound.schedule; }
  /** Practice rule lookup at the seat's level (league rules, week and practice key rows). */
  practiceRules(): (key: string) => number | undefined { return practiceRules((k) => this.bound.binding.rule(this.level, k), this.level); }
  /** What the last weekly pass fed the staff's eye: practices run and seat games seen. */
  get lastWeek(): { readonly practices: readonly PracticeRecord[]; readonly gamesSeen: number } { return this.lastPass; }

  private newSeason(): SeasonPlay {
    const year = this.world.date.seasonYear;
    return SeasonPlay.fromWorld(this.content, this.world, { ruleSetId: this.ruleSetId, seasonYear: year, seedHex: seasonSeedHex(this.world, year), seatTeamId: this.seatTeamId, ...(this.resolver ? { resolver: this.resolver } : {}) });
  }

  private mapTeams(): void {
    // Every world team, not only the seat's competition: a college season has guests from lower levels
    // (playtest results.not_carried), and their games with the seat's league are results too.
    const comp = this.world.competitions.find((c) => c.id === this.seatCompetitionId)!;
    const inSeat = new Set(comp.teamIds);
    const ids = [...comp.teamIds, ...this.world.teams.map((t) => t.id).filter((id) => !inSeat.has(id))];
    const byKey = new Map<string, number>();
    for (const id of ids) {
      let key: string;
      try { key = contentKeyOfWorldTeam(this.content, this.world, id); } catch { continue; /* a team with no content row plays no season-session game */ }
      if (!byKey.has(key)) byKey.set(key, id);
    }
    this.teamMap = new Map();
    for (const t of this.season.built.spec.teams) {
      const w = byKey.get(this.season.keyOf(t.id));
      if (w !== undefined) this.teamMap.set(t.id, w);
    }
  }

  /** World team id of a season-session team, or null when the world has no such team. */
  worldTeamOf(seasonTeamId: number): number | null { return this.teamMap.get(seasonTeamId) ?? null; }

  /**
   * Writes the season session's played games into the world's results, once each. The title game is the
   * last postseason game once the season is final, when its winner is the champion.
   */
  private inject(): number[] {
    const games = this.season.state.games;
    const final = this.season.state.stage === 'final';
    const champion = this.season.state.champion;
    const last = games.at(-1);
    const seat: number[] = [];
    for (const g of games) {
      if (this.injected.has(g.fixture.gameId)) continue;
      if (g === last && !final && g.fixture.phase === 'postseason') continue; // may yet be the title game
      const home = this.worldTeamOf(g.fixture.home), away = this.worldTeamOf(g.fixture.away);
      this.injected.add(g.fixture.gameId);
      if (home === null || away === null) continue;
      const [hp, ap] = g.outcome.points;
      const winner = hp > ap ? g.fixture.home : ap > hp ? g.fixture.away : null;
      const title = final && g === last && g.fixture.phase === 'postseason' && winner !== null && winner === champion;
      this.world.results.push({
        gameId: g.fixture.gameId, competitionId: this.seatCompetitionId, seasonYear: this.world.date.seasonYear, week: this.world.week,
        homeTeamId: home, awayTeamId: away, homePoints: hp, awayPoints: ap, passPlays: 0, runPlays: 0,
        kind: g.fixture.phase === 'postseason' ? 'postseason' : 'regular', title,
      });
      if (home === this.seatTeamId || away === this.seatTeamId) seat.push(g.fixture.gameId);
    }
    return seat;
  }

  private over(): boolean { return this.season.stage === 'final'; }

  /** The world's weekly pass, after the season session's step, while the world's season has weeks left. */
  private worldPass(): void {
    // The week's practice (the user's plans or the staff week), then the staff's eye on it and on the seat's game.
    const practices = this.practice.runWeek(this.world, this.seatTeamId);
    practices.forEach((r, i) => this.scouting.observePractice(this.world, this.seatTeamId, r, i));
    const seen = this.inject();
    for (const id of seen) this.scouting.observeGame(this.world, this.seatTeamId, id);
    this.lastPass = { practices, gamesSeen: seen.length };
    if (this.world.week < this.schedule.weeksInSeason(this.world)) loop.runWeek(this.world, this.systems);
  }

  /**
   * One week with no seat game left to play: the season session's step, then the world's weekly pass.
   * Throws while the seat's game of the week is unplayed. Returns false once the season is over.
   */
  advanceWeek(): boolean {
    if (this.over()) return false;
    this.season.advance();
    this.worldPass();
    return !this.over();
  }

  /** Closes the seat's game played on the console (`season.openGame`): its step, then the world's pass. */
  finishGame(): seasons.GameOutcome {
    const o = this.season.finishGame();
    this.worldPass();
    return o;
  }

  /** The staff runs the week: the seat's game, if it has one, is delegated; then the step and the world's pass. */
  delegateWeek(): boolean {
    if (this.over()) return false;
    if (this.season.nextSeatGame()) this.season.delegateGame(); else this.season.advance();
    this.worldPass();
    return !this.over();
  }

  /**
   * The offseason: once the season session is final, the world plays out its remaining weeks, then its
   * season point (development, aging, cohorts, leaving, the Hall of Fame). The next season starts.
   */
  runOffseason(): loop.SeasonSummary {
    if (this.season.stage !== 'final') throw new Error('career year: the season is not over');
    for (const id of this.inject()) this.scouting.observeGame(this.world, this.seatTeamId, id);
    while (this.world.week < this.schedule.weeksInSeason(this.world)) loop.runWeek(this.world, this.systems);
    const summary = loop.runSeasonPoint(this.world, this.systems, { weeksInSeason: this.schedule.weeksInSeason(this.world) });
    this.injected.clear();
    this.practice.newSeason();
    this.season = this.newSeason();
    this.mapTeams();
    return summary;
  }

  view(): CareerYearView {
    return {
      seasonYear: this.world.date.seasonYear, worldWeek: this.world.week, worldWeeks: this.schedule.weeksInSeason(this.world),
      seasonStage: this.season.stage, seatTeamId: this.seatTeamId, seasons: this.world.seasons.length, people: this.world.people.size,
      worldHash: loop.worldHash(this.world),
    };
  }

  save(): CareerYearSave {
    return { version: 1, seatTeamId: this.seatTeamId, world: encodePlain(loop.packWorld(this.world)), season: this.season.save(), injected: [...this.injected].sort((a, b) => a - b),
      practice: this.practice.save(), scouting: this.scouting.save(), recruiting: this.recruiting.save(),
    };
  }
}
