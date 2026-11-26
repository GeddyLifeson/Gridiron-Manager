// The seat's football desk in a played season (plan item 2b): the team's playbook (G3), the week's game plan
// and call sheets (G6, G7), the install board (G5) and the console setup the sheets feed (G-60). It keeps the
// state the G-67 and G-68 commands return and builds the read-model inputs the football screens read, so
// the screens show the season's own team and an edit on the call sheet is the sheet the console calls from.
//
// What the season does not carry yet is passed as "none", never made up:
// - Readiness and practice: no knowledge book or practice plan runs in the season yet (practice desk, PR 285),
//   so the staff have no readiness estimate (null), nothing is practised, and the week has no team reps.
// - Scouting: no opponent board yet (G-66 in the week loop), so the plan's looks column is empty.
// - Head coach card: no K3 chart is built for the seat yet, so there is no card (null).
// - Players on the install board: the season's rosters are placeholder depth slots, not people (G-17).
import { defenseDesigner as dd, gameplan as gp, playbook as pb } from '@gm/football-content';
import { knowledge, week as leagueWeek } from '@gm/league';
import { resolveRuleSet } from '@gm/rules-data';
import type { RuleSet } from '@gm/schema';
import { runGameplanCommand, type GameplanCommand, type GameplanState } from '../commands/gameplan/index.ts';
import { runInstallCommand, type InstallCommand, type InstallState } from '../commands/install/index.ts';
import { runPlaybookCommand, type PlaybookCommand, type PlaybookState } from '../commands/playbook/index.ts';
import type { ConsoleConfig } from '../commands/game-calling/index.ts';
import { contentBook, type ContentBook } from '../coach-calling/content.ts';
import { buildGameplanView, sheetReview, type GameplanInput, type GameplanUnit } from '../read-models/gameplan/model.ts';
import type { GameplanView } from '../read-models/gameplan/types.ts';
import { buildInstallView, type InstallInput, type InstallUnitInput } from '../read-models/install/model.ts';
import type { InstallView } from '../read-models/install/types.ts';
import { buildPlaybookView, type PlaybookInput } from '../read-models/playbook/model.ts';
import type { PlaybookFilter, PlaybookView } from '../read-models/playbook/types.ts';
import { defenseDesignerView, type DefenseDesignerCore, type DefenseDesignerView, type RunFamilyId } from '../read-models/defense-designer/index.ts';
import { consoleConfigFor, staffDraft, type DraftUnit } from '../sheet-bridge/index.ts';

export type DeskSide = pb.Book;
export type InstallMode = InstallView['mode'];

export interface FootballDeskOptions {
  readonly teamId: number;
  readonly ruleSetId: string;
  readonly level: 'pro' | 'college';
  /** The user's job (G3.4.3 access table). Default: head coach, the seat the career root plays. */
  readonly holder?: pb.Holder;
  /**
   * K2.1.4 preparation of the coordinator who drafts each side, as a z value. ASSUMPTION until the staff people
   * are in the season: an average coordinator (z 0), the same value the console's staff setup uses.
   */
  readonly staffPreparationZ?: number;
}

/** What a command did, for the screen's message line: the notes on success, the refusal and its rule otherwise. */
export type DeskResult = { readonly ok: true; readonly notes: readonly string[]; readonly file?: string } | { readonly ok: false; readonly refusal: string; readonly rule?: string };

const DRAFT_UNITS: readonly DraftUnit[] = ['offense', 'defense'];
const USER_ID = 'user';
/** Sheet game id while the seat's next game is not known yet (a bye week ahead of it). */
const NEXT_GAME = 'next';
/** PLACEHOLDER until the depth chart feeds the special-teams unit: fakes and two-point plays use 11 personnel (as the staff console setup). */
const PLACEHOLDER_SPECIAL_PERSONNEL = '11';

/** The content book cut to the plays of the team's playbook, so the staff draft only calls plays the book holds. */
export function bookContent(book: pb.Playbook, all: ContentBook = contentBook()): ContentBook {
  const has = (id: string) => book.plays.has(id) && book.plays.get(id)!.status !== 'retired';
  return {
    plays: new Map([...all.plays].filter(([id]) => has(id))),
    defense: new Map([...all.defense].filter(([id]) => has(id))),
  };
}

/** Full practice days of a normal week from the level's shipped week template (H1.1.1). */
export function normalPracticeDays(rules: RuleSet): number {
  const has = new Set(rules.keys());
  const set = leagueWeek.defaultSet((k) => { if (!has.has(k)) return undefined; try { return rules.num(k); } catch { return undefined; } });
  const prep = leagueWeek.prepDays(null, 0);
  const kinds = leagueWeek.kindSequence(set, prep, leagueWeek.weekShape(prep, false, false));
  const practice = new Set(Object.entries(set.kinds).filter(([, blocks]) => blocks.some((b) => b.type === 'practice')).map(([k]) => k));
  return kinds.filter((k) => practice.has(k)).length;
}

/**
 * Install units of a side from the book (G5.1.1 over G1.7.1). A part is a unit; a play is a unit that needs
 * its parts. Offense learning units per group follow the G1.7.1 starting values: a formation 1 for each
 * group that aligns (receivers, tight ends, backs), a protection 3 for the line, back and quarterback, a run
 * scheme 3 for the line and 1 for the back, a concept 2 for the quarterback, a tag 1 for the receivers, and
 * a play made of known parts still 1 for the quarterback. Defense (G2 gives no per-group split): ASSUMPTION,
 * a front for the line and linebackers, a coverage for the linebackers and secondary, a pressure for all
 * three, 1 unit each.
 */
export function installUnits(book: pb.Playbook, words: pb.WordList, side: DeskSide): InstallUnitInput[] {
  const OFFENSE: Readonly<Record<string, Readonly<Record<string, number>>>> = {
    formation: { WR: 1, TE: 1, RB: 1 }, protection: { OL: 1, RB: 1, QB: 1 }, run: { OL: 3, RB: 1 }, concept: { QB: 2 }, tag: { WR: 1 },
  };
  const DEFENSE: Readonly<Record<string, Readonly<Record<string, number>>>> = {
    front: { DL: 1, LB: 1 }, coverage: { LB: 1, DB: 1 }, pressure: { DL: 1, LB: 1, DB: 1 },
  };
  const table = side === 'offense' ? OFFENSE : side === 'defense' ? DEFENSE : {};
  const word = (id: string) => words.entries.get(id)?.word ?? book.parts.get(id)?.words.descriptive ?? id;
  const items = (partId: string, perGroup: Readonly<Record<string, number>>): Record<string, string[]> =>
    Object.fromEntries(Object.entries(perGroup).map(([g, n]) => [g, Array.from({ length: n }, (_, i) => `${partId}#${g}${i + 1}`)]));
  const parts = new Map<string, InstallUnitInput>();
  const plays: InstallUnitInput[] = [];
  for (const play of book.plays.values()) {
    if (play.book !== side || play.status === 'retired') continue;
    const needs: string[] = [];
    const partIds = [...Object.values(play.parts), ...play.tags];
    for (const id of partIds) {
      const part = book.parts.get(id);
      if (!part) continue;
      const per = table[part.type];
      if (!per) continue;
      needs.push(id);
      if (!parts.has(id)) parts.set(id, { id, label: word(id), kind: 'part', items: items(id, per), requires: [] });
    }
    const call = pb.renderCall(book, words, pb.familyTemplate(side, 'descriptive'), { playId: play.id, tags: [] }).text;
    plays.push({ id: play.id, label: call, kind: 'play', items: side === 'offense' ? { QB: [`${play.id}#QB1`] } : {}, requires: needs });
  }
  return [...parts.values(), ...plays];
}

interface Week {
  readonly gameId: string | null;
  readonly plans: Record<DraftUnit, GameplanState>;
}

export class FootballDesk {
  readonly options: FootballDeskOptions;
  readonly rules: RuleSet;
  readonly holder: pb.Holder;
  private readonly killPartId: string | null;
  private book: PlaybookState;
  private week: Week;
  private readonly install: Record<DeskSide, InstallState> = {
    offense: { placed: {}, alwaysUp: [], listed: [] },
    defense: { placed: {}, alwaysUp: [], listed: [] },
    special_teams: { placed: {}, alwaysUp: [], listed: [] },
  };
  private stamp = 0;
  /** Last game's sheets as exported text, per unit. */
  private readonly lastWeek: Partial<Record<DraftUnit, string>> = {};
  private seq = 0;
  /** Bumps on every change, so a host can redraw. */
  version = 0;
  /** The last command's result, for the screen's message line. */
  last: DeskResult | null = null;

  constructor(o: FootballDeskOptions) {
    this.options = o;
    this.rules = resolveRuleSet(o.ruleSetId);
    this.holder = o.holder ?? { job: 'head_coach' };
    const { book, killPartId } = pb.starterBook(String(o.teamId));
    this.killPartId = killPartId;
    this.book = { book, words: pb.defaultWordList(book, 'descriptive'), links: [], history: pb.emptyHistory() };
    this.week = this.freshWeek(null);
  }

  get playbook(): pb.Playbook { return this.book.book; }
  get gameId(): string | null { return this.week.gameId; }

  template(side: DeskSide): pb.Template { return pb.familyTemplate(side, 'descriptive', side === 'offense' ? this.killPartId : null); }

  /** Coach-to-player radio cutoff in seconds from the rule set; null where the level has no radio. */
  cutoffS(): number | null {
    return this.rules.bool('comm.c2p_allowed') ? this.rules.num('comm.c2p_cutoff_seconds') : null;
  }

  /** The staff's draft of a side's sheet for a game, from the week's plan (Marlon's ruling 2026-11-26 07:06 UTC). */
  private draft(unit: DraftUnit, gameId: string, menu: readonly gp.MenuEntry[]): gp.Sheet {
    return staffDraft({
      unit, gameId, menu, preparationZ: this.options.staffPreparationZ ?? 0, level: this.options.level, book: bookContent(this.book.book),
    }).sheet;
  }

  private freshWeek(gameId: string | null): Week {
    const plan = (unit: DraftUnit): GameplanState => ({
      menu: [], approval: { state: 'draft' }, matchups: [], proposal: null,
      sheet: this.draft(unit, gameId ?? NEXT_GAME, []), card: null,
    });
    return { gameId, plans: { offense: plan('offense'), defense: plan('defense') } };
  }

  /**
   * Opens the game week for the seat's next game: a new game gets a new plan and the staff's sheets drafted
   * for it; the same game keeps every edit. Null means the coming step has no game for the seat (a bye, or
   * the season has not reached its first game): the staff draft for the next game they will play, and that
   * plan, edits included, becomes the game's when it is known.
   */
  prepare(gameId: string | null): void {
    if (gameId === this.week.gameId) return;
    if (this.week.gameId === null && gameId !== null) {
      const own = (st: GameplanState): GameplanState => ({ ...st, sheet: { ...st.sheet, gameId } });
      this.week = { gameId, plans: { offense: own(this.week.plans.offense), defense: own(this.week.plans.defense) } };
    } else {
      // The game just prepared for is last week's now: its sheets are kept as files to start the next from (G-68).
      if (this.week.gameId !== null) {
        for (const unit of DRAFT_UNITS) {
          const r = this.runGameplan(unit, { kind: 'export_sheet' });
          if (r.ok && r.file !== undefined) this.lastWeek[unit] = r.file;
        }
      }
      this.week = this.freshWeek(gameId);
    }
    this.version++;
  }

  /** True once a game's sheet for this unit is kept (a game has been prepared for before this one). */
  hasLastWeek(unit: GameplanUnit): boolean { return unit !== 'special_teams' && this.lastWeek[unit] !== undefined; }

  /** Starts this game's sheet from last game's: layout, entries, scripts, audibles and notes (start_from_sheet). */
  startFromLastWeek(unit: GameplanUnit): DeskResult {
    const text = unit === 'special_teams' ? undefined : this.lastWeek[unit];
    if (text === undefined) return this.changed({ ok: false, refusal: 'no sheet from last week is kept', rule: 'G7.1.1' });
    return this.runGameplan(unit, { kind: 'start_from_sheet', text });
  }

  private changed(r: DeskResult): DeskResult { this.last = r; this.version++; return r; }

  // ---------------------------------------------------------------- game plan and call sheet (G-68)

  private weekInstall(): gp.WeekInstall {
    const n = knowledge.knowledgeNumbers();
    // G5.2.1 daily limit times the normal week's full practice days (H1.1.1). Reps: no practice plan yet (PR 285).
    return { shortWeek: false, capacityUnits: knowledge.num(n, 'install.dailyLimit') * normalPracticeDays(this.rules), today: 0, repsFrom: () => 0, projectReadiness: () => 0 };
  }

  /** The read-model input for a unit's plan and sheet; special teams have no plan sheet (G7 menu groups), so null. */
  gameplanSource(unit: GameplanUnit): Omit<GameplanInput, 'teamId' | 'unit' | 'selectedSituation' | 'paper' | 'keyHints'> | null {
    if (unit === 'special_teams') return null;
    const s = this.week.plans[unit];
    return {
      holder: this.holder, book: this.book.book, words: this.book.words, template: this.template(unit), cutoffS: this.cutoffS(), rules: this.rules,
      menu: s.menu, board: { cells: [], stale: false, callerChanged: false }, week: this.weekInstall(), themes: [], sequences: [], culled: 0,
      approval: s.approval, matchups: s.matchups, proposal: s.proposal, repsAssigned: () => 0, repsAvailable: 0, qbDislikes: new Set<string>(),
      sheet: s.sheet, card: s.card, table: gp.leagueReference(this.options.level),
      readiness: () => null, timesCalled: () => 0, practiced: () => false, needsDoubtful: () => null, audibleReps: () => 0,
    };
  }

  gameplanView(unit: GameplanUnit, o: { readonly situation: string | null; readonly paper: gp.Paper; readonly keyHints: boolean }): GameplanView | null {
    const s = this.gameplanSource(unit);
    return s ? buildGameplanView({ ...s, teamId: this.options.teamId, unit, selectedSituation: o.situation, paper: o.paper, keyHints: o.keyHints }) : null;
  }

  runGameplan(unit: GameplanUnit, cmd: GameplanCommand): DeskResult {
    const src = this.gameplanSource(unit);
    if (!src || unit === 'special_teams') return this.changed({ ok: false, refusal: 'special teams calls come from the call menu, not a plan sheet', rule: 'G7' });
    const input: GameplanInput = { ...src, teamId: this.options.teamId, unit, selectedSituation: null, paper: 'letter', keyHints: true };
    const r = runGameplanCommand(this.week.plans[unit], {
      holder: this.holder, unit, at: ++this.stamp, userId: USER_ID, review: (sheet) => sheetReview({ ...input, sheet }),
    }, cmd);
    if (!r.ok) return this.changed({ ok: false, refusal: r.refusal, rule: r.rule });
    this.week.plans[unit] = r.state;
    return this.changed(r.file === undefined ? { ok: true, notes: r.notes } : { ok: true, notes: r.notes, file: r.file });
  }

  /** A new plan entry for a book play in a situation (O3.4.1 "add to plan"), with an id the replay repeats. */
  planEntry(unit: DraftUnit, playId: string, situationIds: readonly string[]): gp.MenuEntry {
    return { id: `plan.${unit}.${++this.seq}`, side: unit, call: { playId, tags: [] }, situationIds: [...situationIds], targetReps: 0 };
  }

  /** A new sheet entry for a book play (O3.4.2 "add to box"). */
  sheetEntry(playId: string): gp.Entry { return { id: `entry.${++this.seq}`, call: { playId, tags: [] } }; }

  /** The user's sheets for the console: what he sees on the call sheet screen is what he calls from (G-60). */
  sheets(): Readonly<Record<DraftUnit, gp.Sheet>> { return { offense: this.week.plans.offense.sheet, defense: this.week.plans.defense.sheet }; }

  /** The console setup for the seat's game from the desk's sheets (G-60 ConsoleConfig through the sheet bridge). */
  consoleConfig(gameId: string, bindings: readonly { readonly context: string; readonly keys: readonly string[] }[]): ConsoleConfig {
    this.prepare(gameId);
    return consoleConfigFor({
      rules: this.rules, gameId, bindings, sheets: this.sheets(), level: this.options.level,
      staffPreparationZ: { offense: this.options.staffPreparationZ ?? 0, defense: this.options.staffPreparationZ ?? 0 },
      special: { personnelOf: () => PLACEHOLDER_SPECIAL_PERSONNEL },
    }).config;
  }

  // ---------------------------------------------------------------- playbook (G-67)

  playbookSource(side: DeskSide): Omit<PlaybookInput, 'teamId' | 'side' | 'filter'> {
    return {
      book: this.book.book, words: this.book.words, template: this.template(side), holder: this.holder, links: this.book.links,
      // N3 call records and G5.4.1 estimates are not kept by the season yet: no usage shown.
      usage: () => undefined, cutoffS: this.cutoffS(),
      ...(this.book.folders ? { folders: this.book.folders } : {}),
    };
  }

  playbookView(side: DeskSide, filter: PlaybookFilter): PlaybookView {
    return buildPlaybookView({ ...this.playbookSource(side), teamId: this.options.teamId, side, filter });
  }

  runPlaybook(side: DeskSide, cmd: PlaybookCommand): DeskResult {
    const r = runPlaybookCommand(this.book, {
      holder: this.holder, side, validate: () => ({ ok: true, failures: [] }), stamp: ++this.stamp, newId: `pb.${++this.seq}`, userId: USER_ID,
    }, cmd);
    if (!r.ok) return this.changed({ ok: false, refusal: r.refusal });
    this.book = r.state;
    return this.changed(r.file === undefined ? { ok: true, notes: r.notes } : { ok: true, notes: r.notes, file: r.file });
  }

  // ---------------------------------------------------------------- install board (G5)

  private installDays(mode: InstallMode): InstallInput['days'] {
    if (mode === 'camp') {
      const n = knowledge.knowledgeNumbers();
      return knowledge.defaultCampCycle(n).map((d, i) => ({ id: `camp${i + 1}`, label: d.install === null ? `Camp ${i + 1}, situational` : `Camp ${i + 1}, install ${d.install}` }));
    }
    return Array.from({ length: normalPracticeDays(this.rules) }, (_, i) => ({ id: `practice${i + 1}`, label: `Practice ${i + 1}` }));
  }

  installSource(side: DeskSide, mode: InstallMode): Omit<InstallInput, 'teamId' | 'side' | 'mode'> {
    const s = this.install[side];
    return {
      holder: this.holder, days: this.installDays(mode), units: installUnits(this.book.book, this.book.words, side), placed: s.placed,
      players: [], estimate: () => null, difficulty: () => 1, alwaysUp: s.alwaysUp,
    };
  }

  installView(side: DeskSide, mode: InstallMode): InstallView {
    return buildInstallView({ ...this.installSource(side, mode), teamId: this.options.teamId, side, mode });
  }

  runInstall(side: DeskSide, mode: InstallMode, cmd: InstallCommand): DeskResult {
    const src = this.installSource(side, mode);
    const r = runInstallCommand(this.install[side], {
      holder: this.holder, side, units: src.units, days: src.days.filter((d) => !d.removed).map((d) => d.id), newId: `install.${++this.seq}`, userId: USER_ID,
    }, cmd);
    if (!r.ok) return this.changed({ ok: false, refusal: r.refusal });
    this.install[side] = r.state;
    return this.changed({ ok: true, notes: r.notes });
  }

  // ---------------------------------------------------------------- defensive call designer (G-91)

  /** The calls the designer opens: the designer's own drawn calls (G2, football-content DESIGNER_CALLS). */
  designerCalls(): readonly { readonly id: string; readonly name: string }[] {
    return dd.DESIGNER_CALLS.map((c) => ({ id: c.id, name: c.name }));
  }

  /** O3.2.1 view of a designer call against a scout look; unknown ids fall back to the first call and look. */
  defenseDesigner(q: { readonly callId: string | null; readonly lookId: string | null; readonly slot: string | null; readonly family: RunFamilyId }): DefenseDesignerView {
    const call = dd.DESIGNER_CALLS.find((c) => c.id === q.callId) ?? dd.DESIGNER_CALLS[0]!;
    const look = dd.LOOKS.find((l) => l.id === q.lookId) ?? dd.LOOKS[0]!;
    return defenseDesignerView(dd as unknown as DefenseDesignerCore, { call, lookId: look.id, rules: this.rules, selectedSlot: q.slot, family: q.family, hours: null });
  }
}
