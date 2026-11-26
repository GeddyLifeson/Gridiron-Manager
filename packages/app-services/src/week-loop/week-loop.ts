// The seat's game week (H1.1.3): the week runner that moves the head coach from the last game to the next
// kickoff. It holds the coming step's `Week` (league week builder, G-69), advances it with the one H1.1.3
// loop (next block, next decision, next day, to game day) and runs each block as the week's work:
//
//   film_self      self-scout of the team's own film (G8, N2.3.1) the first time; later ones review film
//   game_planning  first: the opponent breakdown and the staff scouting report (H2.1, H2.5.1, K3.1.1);
//                  second: the game plan's staff-drafted call sheets (G-68 sheet bridge); later: review
//   meetings, walkthrough, practice   install exposures (H1.2.2) and the week's available team reps
//   media          the press sessions held (H7; the press conference screen asks the questions)
//   travel         the trip leg (H8)
//   game           every control stops in front of it: the game belongs to area I
//
// The opponent's film comes from the season's film archive, the same store the AI staffs read (K3.1.1, K9.1.1):
// charted with the staff's tagging error, weighted by H2.1.1 relevance, cut by the staff's hours. Nothing about
// the opponent reaches the report that the opponent did not put on film.
//
// At game day `finish()` hands the season the week's record (the runner's `seatWeek` port), and
// `consoleConfig()` gives the console the week's sheets: the user's own where he set one, the staff's draft
// otherwise. Everything here is deterministic: streams are scoped [season, week, team] (K3.6.1 rule 5).
import { calendar, practice, week as weekly } from '@gm/league';
import { tendencies } from '@gm/models';
import { preparation } from '@gm/coach-ai';
import { gameplan as gp } from '@gm/football-content';
import { season as seasons } from '@gm/world';
import { seedFromHex, stream } from '@gm/engine-core';
import { resolveRuleSet } from '@gm/rules-data';
import type { RandomStream } from '@gm/schema';
import type { SeasonPlay, SeatGame } from '../play/season-session.ts';
import type { ConsoleConfig } from '../commands/game-calling/index.ts';
import { consoleConfigFor } from '../sheet-bridge/config.ts';
import { bookMenu, staffDraft, type DraftUnit, type StaffDraft } from '../sheet-bridge/staff.ts';
import { P } from './params.ts';

type ChartedPlay = tendencies.ChartedPlay;
type Block = weekly.Block;

export const WEEK_LOOP_STREAMS = ['scouting', 'press'] as const;
export type WeekLoopStream = (typeof WEEK_LOOP_STREAMS)[number];

/** PLACEHOLDER until the depth chart feeds special teams: fakes and two-point plays use 11 personnel (as game-day setup). */
const PLACEHOLDER_SPECIAL_PERSONNEL = '11';

/** The staff who work the week, until generated staffs play (K6): average, from the parameter file. */
export interface WeekStaff {
  readonly taggerSkill: number;
  readonly disguise: number;
  readonly preparationZ: Readonly<Record<DraftUnit, number>>;
  readonly evaluationZ: number;
  readonly tellHours: number;
  readonly qc: readonly tendencies.BreakdownStaff[];
}

export function averageStaff(): WeekStaff {
  const qc: tendencies.BreakdownStaff[] = [];
  for (let i = 0; i < P('staff.qcCount'); i++) qc.push({ staffId: i + 1, speed: P('staff.qcSpeed'), hoursAvailable: P('staff.qcHours') });
  return {
    taggerSkill: P('staff.taggerSkill'), disguise: P('staff.disguise'),
    preparationZ: { offense: P('staff.preparationZ'), defense: P('staff.preparationZ') },
    evaluationZ: P('staff.evaluationZ'), tellHours: P('staff.tellHours'), qc,
  };
}

export interface WeekLoopOptions {
  /** The user's role in the week; blocks he leads are his (H1.4.2). Default head coach. */
  readonly role?: weekly.LeaderRole;
  readonly staff?: WeekStaff;
  /** The user's game plan menus (G6). A side without one: the staff draft from the whole book (sheet bridge). */
  readonly plan?: Partial<Record<DraftUnit, readonly gp.MenuEntry[]>>;
  /** H2.1.1: games of the opponent to break down. Default the last 4. */
  readonly breakdownGames?: number;
  /** Extra pending items of the week (H5 injury calls, H6 roster deadlines, L9 events). */
  readonly items?: readonly weekly.PendingItem[];
  /**
   * Runs one practice or walkthrough block for real (G-65, the career's practice desk) and returns its record,
   * kept on the block's report. Without it the week counts the block's exposures and team reps only.
   */
  readonly runPractice?: (block: Block, info: { readonly gMinus: number; readonly delegated: boolean }) => unknown;
}

export type WeekReport =
  | { readonly kind: 'self_scout'; readonly blockId: string; readonly delegated: boolean; readonly games: number; readonly plays: number; readonly strong: number }
  | { readonly kind: 'scouting'; readonly blockId: string; readonly delegated: boolean; readonly gamesCharted: readonly number[]; readonly partial: boolean; readonly strong: number }
  | { readonly kind: 'sheets'; readonly blockId: string; readonly delegated: boolean; readonly boxes: Readonly<Record<DraftUnit, number>>; readonly entries: Readonly<Record<DraftUnit, number>> }
  | { readonly kind: 'film_review' | 'plan_review'; readonly blockId: string; readonly delegated: boolean }
  | { readonly kind: 'meeting'; readonly blockId: string; readonly delegated: boolean; readonly type: string; readonly gMinus: number }
  | { readonly kind: 'walkthrough'; readonly blockId: string; readonly delegated: boolean; readonly gMinus: number; readonly record?: unknown }
  | { readonly kind: 'practice'; readonly blockId: string; readonly delegated: boolean; readonly gMinus: number; readonly minutes: number; readonly teamReps: number; readonly record?: unknown }
  | { readonly kind: 'media'; readonly blockId: string; readonly delegated: boolean; readonly session: string | null; readonly gMinus: number }
  | { readonly kind: 'travel'; readonly blockId: string; readonly delegated: boolean; readonly gMinus: number; readonly minutes: number }
  | { readonly kind: 'block'; readonly blockId: string; readonly delegated: boolean; readonly type: string };

/** The opponent study the week produced (H2.5.1): the K3.1.1 report the AI staffs build, for the user's staff. */
export interface OpponentStudy {
  readonly opponentId: number;
  /** Opponent games in the archive this season, oldest first (H2.6.1: every league game, after its delay). */
  readonly gamesAvailable: readonly number[];
  /** Games asked for (H2.1.1), newest last. */
  readonly gamesWanted: readonly number[];
  readonly report: preparation.ScoutingReport;
  /** H2.5.1 edge case: breakdown jobs ran late, the report is partial. */
  readonly partial: boolean;
  readonly lateHours: number;
  /** H2.1.1 rule 5: week 1 has no film of this season. */
  readonly noFilmThisSeason: boolean;
}

export interface SelfScout {
  readonly window: tendencies.SelfWindow;
  readonly games: readonly number[];
  readonly plays: readonly ChartedPlay[];
  readonly tables: readonly { readonly side: 'offense' | 'defense'; readonly measure: string; readonly cuts: readonly string[]; readonly cells: readonly tendencies.TendencyCell[] }[];
  readonly strong: readonly (tendencies.TendencyCell & { readonly side: 'offense' | 'defense' })[];
}

/** What the seat's week hands to its game (the runner's `preparation` for the seat side): small, plain data. */
export interface SeatPreparation {
  readonly opponentId: number;
  readonly gamesCharted: readonly number[];
  readonly drafted: readonly DraftUnit[];
  readonly installWarning: boolean;
}

const OFFENSE_MEASURES = ['runPass', 'playKind', 'concept'] as const;
const DEFENSE_MEASURES = ['pressure', 'coverage', 'manZone', 'front'] as const;
const MEETINGS: ReadonlySet<string> = new Set(['team_meeting', 'unit_meeting', 'position_meeting']);
const PRACTICE_TEMPO: Readonly<Record<weekly.Contact, string>> = { none: 'jog', thud: 'thud', live: 'live', tackling: 'live' };

export class SeatWeekLoop {
  readonly ctx: seasons.PrepContext;
  readonly game: SeatGame;
  readonly role: weekly.LeaderRole;
  readonly staff: WeekStaff;
  private run: weekly.WeekRun;
  private stop: weekly.StepResult['stop'] | null = null;
  private readonly answered = new Set<string>();
  private readonly gMinusOf: ReadonlyMap<string, number>;
  private readonly seed: ReturnType<typeof seedFromHex>;
  private studyDone: OpponentStudy | null = null;
  private selfDone: SelfScout | null = null;
  private drafts: Record<DraftUnit, StaffDraft> | null = null;
  private readonly userSheets: Partial<Record<DraftUnit, gp.Sheet>> = {};
  private finished = false;

  private constructor(private readonly sp: SeasonPlay, game: SeatGame, private readonly o: WeekLoopOptions) {
    this.game = game;
    this.role = o.role ?? 'head_coach';
    this.staff = o.staff ?? averageStaff();
    const spec = sp.built.spec;
    const fixture = game.context.fixture;
    this.ctx = { season: spec.season, week: sp.stepWeek(), teamId: sp.seatTeamId, fixture, results: sp.state.results, seedHex: spec.seedHex };
    this.seed = seedFromHex(spec.seedHex);
    // The same week the runner's seat port builds (world season/seat.ts runSeatWeek).
    const source = sp.built.seatSource;
    const kickoff = source.kickoff(this.ctx);
    const built = weekly.buildWeek({
      teamId: this.ctx.teamId, weekId: `s${this.ctx.season}w${this.ctx.week}`, previousGameDay: source.previousGameDay(this.ctx), kickoff,
      home: fixture.home === this.ctx.teamId, bye: seasons.comingOffBye(this.ctx), playoff: fixture.phase === 'postseason',
      set: source.set, countable: source.countable,
    });
    const items = [...weekly.leagueItems(calendar.weeklyDeadlines(kickoff, 'game')), ...(source.items?.(this.ctx) ?? []), ...(o.items ?? [])];
    this.run = weekly.startRun(built, items);
    const g = new Map<string, number>();
    for (const d of built.days) for (const b of d.blocks) g.set(b.id, d.gMinus);
    this.gMinusOf = g;
  }

  /** The seat's week for the coming step, or null when the seat has no game in it (a bye, or out of the postseason). */
  static open(sp: SeasonPlay, o: WeekLoopOptions = {}): SeatWeekLoop | null {
    const game = sp.nextSeatGame();
    return game ? new SeatWeekLoop(sp, game, o) : null;
  }

  get week(): weekly.Week { return this.run.week; }
  get isFinished(): boolean { return this.finished; }
  /** Kickoff of the week's game. */
  get kickoff(): calendar.Instant {
    const g = weekly.allBlocks(this.run.week).find((b) => b.type === 'game');
    if (!g) throw new Error('week loop: the week has no game block');
    return g.start;
  }
  /** Where the week's clock stands: the start of the next block to run (the kickoff at game day). */
  now(): calendar.Instant {
    const done = new Set(this.run.week.completed);
    return weekly.allBlocks(this.run.week).find((b) => !done.has(b.id))?.start ?? this.kickoff;
  }
  get weekRun(): weekly.WeekRun { return this.run; }
  get atGameDay(): boolean { return this.stop === 'game_day'; }
  get reports(): readonly WeekReport[] { return this.run.reports as readonly WeekReport[]; }
  get study(): OpponentStudy | null { return this.studyDone; }
  get selfScout(): SelfScout | null { return this.selfDone; }

  private rng(name: WeekLoopStream): RandomStream {
    return stream(this.seed, `weekLoop.${name}`, [this.ctx.season, this.ctx.week, this.ctx.teamId]);
  }

  /** One H1.1.3 control: next block, next decision, next day, or to game day. */
  step(mode: weekly.Mode): { readonly stop: weekly.StepResult['stop']; readonly item: weekly.PendingItem | null } {
    if (this.finished) throw new Error('week loop: the week is finished');
    if (this.stop === 'game_day') return { stop: 'game_day', item: null };
    const r = weekly.step(this.run, mode, (b, info) => this.resolveBlock(b, info.delegated), { userRole: this.role });
    this.run = r.run;
    this.stop = r.stop;
    return { stop: r.stop, item: r.item ?? null };
  }

  /** The user's answer to a pending item; the clock records it when it reaches the item. */
  choose(itemId: string, value: string): void {
    this.run = weekly.choose(this.run, itemId, value);
    this.answered.add(itemId);
  }

  /** What "to game day" will hand to staff (H1.1.3 confirmation). */
  delegationPreview(): { blocks: readonly string[]; defaults: readonly string[] } {
    return weekly.delegationPreview(this.run, this.role);
  }

  /** "To game day": the user's blocks go to staff, open items take their defaults (H1.1.3, H1.4.2). */
  toGameDay(): void {
    const r = this.step('game');
    if (r.stop !== 'game_day') throw new Error(`week loop: the week ended at ${r.stop}, not at game day`);
  }

  /** The user's own sheet for a side (edited before kickoff); the console uses it instead of the staff's draft. */
  setSheet(unit: DraftUnit, sheet: gp.Sheet): void {
    if (this.finished) throw new Error('week loop: the week is finished');
    this.userSheets[unit] = sheet;
  }

  /** The staff's drafts, once the game-plan day has run (or the week is finished). */
  get staffDrafts(): Readonly<Record<DraftUnit, StaffDraft>> | null { return this.drafts; }

  // ---- block work ----

  private resolveBlock(b: Block, delegated: boolean): WeekReport {
    const gMinus = this.gMinusOf.get(b.id) ?? 0;
    const base = { blockId: b.id, delegated };
    switch (b.type) {
      case 'film_self': {
        if (this.selfDone) return { kind: 'film_review', ...base };
        const s = this.buildSelfScout();
        return { kind: 'self_scout', ...base, games: s.games.length, plays: s.plays.length, strong: s.strong.length };
      }
      case 'game_planning': {
        if (!this.studyDone) {
          const s = this.buildStudy();
          return { kind: 'scouting', ...base, gamesCharted: s.report.gamesCharted, partial: s.partial, strong: s.report.strong.length };
        }
        if (!this.drafts) {
          const d = this.buildDrafts();
          const count = (u: DraftUnit, f: (bx: gp.Sheet['boxes'][number]) => number) => d[u].sheet.boxes.reduce((n, bx) => n + f(bx), 0);
          return {
            kind: 'sheets', ...base,
            boxes: { offense: count('offense', () => 1), defense: count('defense', () => 1) },
            entries: { offense: count('offense', (bx) => bx.entries.length), defense: count('defense', (bx) => bx.entries.length) },
          };
        }
        return { kind: 'plan_review', ...base };
      }
      case 'walkthrough': {
        const record = this.o.runPractice?.(b, { gMinus, delegated });
        return { kind: 'walkthrough', ...base, gMinus, ...(record === undefined ? {} : { record }) };
      }
      case 'practice': {
        const tempo = PRACTICE_TEMPO[b.contact ?? 'none'];
        const teamReps = Math.floor(b.minutes * P('install.teamMinuteShare') * practice.P(`rate_${tempo}`));
        const record = this.o.runPractice?.(b, { gMinus, delegated });
        return { kind: 'practice', ...base, gMinus, minutes: b.minutes, teamReps, ...(record === undefined ? {} : { record }) };
      }
      case 'media': return { kind: 'media', ...base, session: b.session ?? null, gMinus };
      case 'travel': return { kind: 'travel', ...base, gMinus, minutes: b.minutes };
      default:
        if (MEETINGS.has(b.type)) return { kind: 'meeting', ...base, type: b.type, gMinus };
        return { kind: 'block', ...base, type: b.type };
    }
  }

  /** G8 self-scout over the team's own film (G8.1.1 default window: the last games). */
  private buildSelfScout(window: tendencies.SelfWindow = { kind: 'lastGames' }): SelfScout {
    const own = this.sp.film.teamRows(this.ctx.teamId, { season: this.ctx.season });
    const plays = tendencies.selfScoutWindow(own, window);
    const tables = this.tables(plays);
    const strong = tables.flatMap((t) => t.cells.filter((c) => c.band === 'strong' || c.mark === 'strong').map((c) => ({ ...c, side: t.side })))
      .sort((a, b) => b.calls - a.calls || (a.measure + a.key < b.measure + b.key ? -1 : 1));
    this.selfDone = { window, games: tendencies.gamesOf(plays).map((g) => g.gameId), plays, tables, strong };
    return this.selfDone;
  }

  private tables(plays: readonly ChartedPlay[]): SelfScout['tables'] {
    const out: { side: 'offense' | 'defense'; measure: string; cuts: string[]; cells: tendencies.TendencyCell[] }[] = [];
    for (const cuts of [[], ['downDistance']]) {
      for (const measure of OFFENSE_MEASURES) out.push({ side: 'offense', measure, cuts, cells: tendencies.tendencyTable(plays, { cuts, measure }) });
      for (const measure of DEFENSE_MEASURES) out.push({ side: 'defense', measure, cuts, cells: tendencies.tendencyTable(plays, { cuts, measure }) });
    }
    return out;
  }

  /** Hours the staff had before the first game-plan block: the advance work plus the days since the week began. */
  private hoursUntilPlanDay(): number {
    const blocks = weekly.allBlocks(this.run.week);
    const plan = blocks.find((b) => b.type === 'game_planning') ?? blocks.find((b) => b.type === 'game');
    const first = blocks[0];
    if (!plan || !first) return P('breakdown.advanceHours');
    const minutes = (plan.start.day - first.start.day) * calendar.MINUTES_PER_DAY + (plan.start.minute - first.start.minute);
    return P('breakdown.advanceHours') + Math.max(0, minutes) / 60;
  }

  /** H2.1 breakdown and the H2.5.1 report, built by the K3.1.1 builder the AI staffs use. */
  private buildStudy(): OpponentStudy {
    const opponentId = this.game.opponentId;
    const season = this.ctx.season;
    // H2.6.1 rule 1 (pro) and the college default: every earlier game is available by the coming week (12 or 24
    // hours after the final whistle). The archive holds only games already played, so this week's are not in it.
    const film = this.sp.film.teamRows(opponentId, { season });
    const gamesAvailable = tendencies.gamesOf(film).map((g) => g.gameId);
    const wanted = this.o.breakdownGames ?? P('breakdown.games');
    const depth = { ...preparation.prepDepth({ preparationZ: this.staff.preparationZ.defense, evaluationZ: this.staff.evaluationZ, tellHours: this.staff.tellHours }), gamesWanted: wanted };
    const hours = this.hoursUntilPlanDay();
    const gamesWanted = gamesAvailable.slice(Math.max(0, gamesAvailable.length - wanted));
    const { lateHours } = tendencies.breakdownJobs([...gamesWanted].reverse(), ['offense', 'defense'], this.staff.qc, hours);
    const disguise = this.staff.disguise;
    const report = preparation.buildScoutingReport({
      opponentId, season, film, staff: this.staff.qc, hoursUntilPlanDay: hours,
      charting: { tagger: { skill: this.staff.taggerSkill }, disguise: () => disguise },
    }, depth, this.rng('scouting'));
    this.studyDone = {
      opponentId, gamesAvailable, gamesWanted, report, partial: report.gamesCharted.length < gamesWanted.length, lateHours,
      noFilmThisSeason: gamesAvailable.length === 0,
    };
    return this.studyDone;
  }

  /** The staff's sheets from the week's plan (sheet bridge, Marlon's ruling 2026-11-26 07:06). */
  private buildDrafts(): Record<DraftUnit, StaffDraft> {
    const gameId = String(this.game.context.fixture.gameId);
    const draft = (unit: DraftUnit) => staffDraft({
      unit, gameId, menu: this.o.plan?.[unit] ?? bookMenu(unit), preparationZ: this.staff.preparationZ[unit], evaluationZ: this.staff.evaluationZ,
    });
    this.drafts = { offense: draft('offense'), defense: draft('defense') };
    return this.drafts;
  }

  /** The sheets the game will use: the user's own where set, else the staff's draft. */
  sheets(): Record<DraftUnit, gp.Sheet> {
    const d = this.drafts ?? this.buildDrafts();
    return { offense: this.userSheets.offense ?? d.offense.sheet, defense: this.userSheets.defense ?? d.defense.sheet };
  }

  /**
   * H1.2.2 install map from the week's exposures. Each sheet box is one plan item, taught on the practice day the
   * G5.3.1 catalogue gives its situation (1 = first practice day: normal downs; 2 = third down; 3 = red zone,
   * goal line, two-minute). It counts a meeting, a walkthrough and practice reps from that day to the game.
   */
  install(): weekly.InstallMap & { readonly items: readonly weekly.InstallItem[] } {
    const reports = this.reports;
    const practiceDays = [...new Set(reports.filter((r) => r.kind === 'practice').map((r) => (r as { gMinus: number }).gMinus))].sort((a, b) => b - a);
    const items: weekly.InstallItem[] = [];
    const sheets = this.sheets();
    for (const unit of ['offense', 'defense'] as const) {
      for (const box of sheets[unit].boxes) {
        if (box.entries.length === 0) continue;
        const day = box.catalogueRef ? gp.CATALOGUE_BY_ID.get(box.catalogueRef)?.installDay ?? 1 : 1;
        const installGMinus = practiceDays.length ? practiceDays[Math.min(day, practiceDays.length) - 1]! : 1;
        const from = (r: WeekReport) => 'gMinus' in r && r.gMinus <= installGMinus && r.gMinus >= 1;
        items.push({
          id: `${unit}:${box.id}`,
          // D9 knowledge is not in the season yet, so nothing counts as carried over (DECISIONS.md).
          carryOver: false, installGMinus,
          meeting: reports.some((r) => r.kind === 'meeting' && from(r)),
          walkthrough: reports.some((r) => r.kind === 'walkthrough' && from(r)),
          practiceReps: reports.filter((r) => r.kind === 'practice' && from(r)).length,
        });
      }
    }
    const availableReps = reports.reduce((n, r) => n + (r.kind === 'practice' ? r.teamReps : 0), 0);
    return { ...weekly.installMap(items, availableReps), items };
  }

  /**
   * The console setup for the week's game (G-60 ConsoleConfig): the week's sheets, special teams from the rule set,
   * key hints that skip the console's own keys.
   */
  consoleConfig(bindings: readonly { readonly context: string; readonly keys: readonly string[] }[]): ConsoleConfig {
    return consoleConfigFor({
      rules: resolveRuleSet(this.sp.options.ruleSetId), gameId: String(this.game.context.fixture.gameId), bindings,
      sheets: this.sheets(), staffPreparationZ: this.staff.preparationZ,
      special: { personnelOf: () => PLACEHOLDER_SPECIAL_PERSONNEL },
    }).config;
  }

  /**
   * Closes the week at game day: anything the week's blocks did not build (a short week with no game-plan block)
   * is built now, and the season gets the week's record for its `seatWeek` port.
   */
  finish(): seasons.SeatWeekRecord {
    if (this.finished) throw new Error('week loop: the week is finished');
    if (this.stop !== 'game_day') throw new Error('week loop: the week has not reached game day');
    if (!this.selfDone) this.buildSelfScout();
    if (!this.studyDone) this.buildStudy();
    if (!this.drafts) this.buildDrafts();
    const log = this.run.log;
    const prep: SeatPreparation = {
      opponentId: this.game.opponentId, gamesCharted: this.studyDone!.report.gamesCharted,
      drafted: (['offense', 'defense'] as const).filter((u) => !this.userSheets[u]), installWarning: this.install().warning,
    };
    const rec: seasons.SeatWeekRecord = {
      teamId: this.ctx.teamId, week: this.ctx.week, bye: false,
      blocksRun: log.filter((e) => e.kind === 'block').length,
      blocksDelegated: log.filter((e) => e.kind === 'delegated').length,
      decisions: log.filter((e) => e.kind === 'choice' || e.kind === 'default').map((e) => ({ id: e.id, value: e.value, chosen: this.answered.has(e.id) })),
      reachedGameDay: true, preparation: prep,
    };
    this.sp.setSeatWeek(rec);
    this.finished = true;
    return rec;
  }

  /** What the week screen shows: the schedule, where the clock stopped, and each block's report. */
  view(): { readonly schedule: weekly.WeekScheduleView; readonly stop: string | null; readonly reports: readonly WeekReport[]; readonly opponentId: number; readonly home: boolean } {
    return { schedule: weekly.scheduleView(this.run.week, [], []), stop: this.stop, reports: this.reports, opponentId: this.game.opponentId, home: this.game.home };
  }
}
