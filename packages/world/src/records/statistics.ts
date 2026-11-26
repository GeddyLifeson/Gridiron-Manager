// Weekly step 4, statistics and records (X3.4.1, C9.2.1, E5.6.2). A record is checked when its statistic is
// finalized, never by polling: game records after each game, season and coach-career records in the
// season's last week, after its last game. Books start empty (C9.2.1 rule 3) and keep the top entries of
// each list (X3.4.1 rule 4). Regular season and postseason are kept apart (X3.4.1 rule 1).
//
// The world's games carry team scores only (GameResult), so the books here are team and coach books. Player
// records wait on player lines from the game port, which today plays placeholder rosters (headless
// real-week.ts); the record definitions in league.awards are ready for them.
import { awards } from '@gm/league';
import type { WorldDate, WorldTier } from '@gm/schema';
import { holderOf, HEAD_COACH } from '../compliance/binding.ts';
import type { GameResult, LiveWorld, SchedulePort, StepContext, StepHandler } from '../loop/types.ts';
import content from './content.json' with { type: 'json' };
import { TEAM_SEASON } from './events.ts';
import { param } from './params.ts';

export type RecordScope = 'game' | 'postseason_game' | 'season' | 'coach_career';
export type BookKind = 'competition' | 'team' | 'level';
export interface WorldRecordDef { readonly id: string; readonly statistic: string; readonly scope: RecordScope; readonly books: readonly BookKind[] }
export interface RecordsContent {
  readonly franchiseSuffix: string;
  readonly records: readonly WorldRecordDef[];
  readonly coachMilestone: string;
}
export const RECORDS_CONTENT = content as unknown as RecordsContent;

/** `LiveWorld.systemState` key of the record state. */
export const RECORDS_KEY = 'records';

/** One entry of a book: who holds it, the value, and when. Plain data (folded into `worldHash`). */
export interface Entry { readonly holder: number; readonly value: number; readonly season: number; readonly gameId: number | null; readonly teamId: number }

/** One team's running season (regular season games only, plus postseason flags). */
export interface TeamSeason {
  games: number; wins: number; losses: number; ties: number; pointsFor: number; pointsAgainst: number; postseason: boolean; title: boolean;
}
export interface CoachCareer { wins: number; titles: number }

export interface RecordsState {
  /** Book key (`recordId|c<competition>`, `recordId|t<team>`, `recordId|l<level>`) to its entries, best first. */
  readonly books: Record<string, Entry[]>;
  /** Team id to its season so far; cleared when the season is finalized. */
  readonly season: Record<string, TeamSeason>;
  /** Coach id to level to career totals at the level. */
  readonly coaches: Record<string, Record<string, CoachCareer>>;
  /** Season last finalized, so a second pass in the same week cannot finalize twice. */
  finalized: number | null;
}

export function emptyRecords(): RecordsState { return { books: {}, season: {}, coaches: {}, finalized: null }; }

export function recordsOf(world: LiveWorld): RecordsState {
  let s = world.systemState.get(RECORDS_KEY) as RecordsState | undefined;
  if (!s) { s = emptyRecords(); world.systemState.set(RECORDS_KEY, s); }
  return s;
}

export function bookKey(recordId: string, kind: BookKind, id: number | string): string {
  return `${recordId}|${kind === 'competition' ? 'c' : kind === 'team' ? 't' : 'l'}${id}`;
}

/** Record id as written on the `record_set` row: franchise books carry the suffix (X4.1.1 team record term). */
export function rowRecordId(def: WorldRecordDef, kind: BookKind, c: RecordsContent = RECORDS_CONTENT): string {
  return kind === 'team' ? `${def.id}${c.franchiseSuffix}` : def.id;
}

/** The book's mark, or null for an empty book. */
export function markOf(state: RecordsState, key: string): Entry | null { return state.books[key]?.[0] ?? null; }

/**
 * Put an entry into a book. Returns the previous mark's value when the entry is a new mark (a tie is not a
 * record; an empty book takes any value above 0, C9.2.1 rule 3 as league.awards `breaks`), else undefined.
 */
export function enter(state: RecordsState, key: string, e: Entry): number | null | undefined {
  const list = state.books[key] ?? [];
  const mark = list[0] ?? null;
  const isRecord = mark === null ? e.value > 0 : e.value > mark.value;
  const limit = param('book.listLength');
  const last = list[list.length - 1];
  // A tie with the last listed entry shares its rank and is kept (X3.4.1 rule 4).
  if (list.length < limit || (last && e.value >= last.value)) {
    list.push(e);
    list.sort((a, b) => b.value - a.value || a.season - b.season || (a.gameId ?? 0) - (b.gameId ?? 0) || a.holder - b.holder);
    const cut = list[limit - 1];
    state.books[key] = cut ? list.filter((x, i) => i < limit || x.value === cut.value) : list;
  }
  return isRecord ? (mark?.value ?? null) : undefined;
}

function levelOf(world: LiveWorld, teamId: number): { level: string; competitionId: number } {
  const t = world.teams.find((x) => x.id === teamId);
  const c = t && world.competitions.find((x) => x.id === t.competitionId);
  if (!t || !c) throw new Error(`records: team ${teamId} has no competition`);
  return { level: c.level, competitionId: c.id };
}

interface Emit { (recordId: string, holderTeam: number | null, holderPerson: number | null, value: number, previous: number | null, seasonGames: number, competitionId: number, tier: WorldTier, date: WorldDate): void }

function emitter(ctx: StepContext): Emit {
  return (recordId, teamId, personId, value, previous, seasonGames, competitionId, tier, date) => {
    const actor = personId ?? (teamId === null ? null : holderOf(ctx.world, teamId, HEAD_COACH));
    ctx.emit({
      type: awards.HONOUR.record, date, competitionId, teamId, witnesses: { kind: 'public' }, tier,
      actors: actor === null ? [] : [{ personId: actor, role: personId === null ? 'head_coach' : 'holder' }],
      subjects: [...(teamId === null ? [] : [{ kind: 'team' as const, id: teamId }]), ...(actor === null ? [] : [{ kind: 'person' as const, id: actor }])],
      payload: { recordId, value, previous: previous ?? 0, seasonGames },
    });
  };
}

function gameValues(r: GameResult, side: 'home' | 'away'): Record<string, number> {
  const pf = side === 'home' ? r.homePoints : r.awayPoints, pa = side === 'home' ? r.awayPoints : r.homePoints;
  return { points: pf, margin: pf - pa };
}

/** Fold one game into the team seasons and check the game books. Returns the number of records set. */
function recordGame(ctx: StepContext, state: RecordsState, r: GameResult, emit: Emit, c: RecordsContent): number {
  let set = 0;
  const post = r.kind === 'postseason';
  for (const side of ['home', 'away'] as const) {
    const teamId = side === 'home' ? r.homeTeamId : r.awayTeamId;
    const v = gameValues(r, side);
    const s = state.season[teamId] ??= { games: 0, wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, postseason: false, title: false };
    if (post) {
      s.postseason = true;
      if (r.title && v.margin! > 0) s.title = true;
    } else {
      s.games++; s.pointsFor += v.points!; s.pointsAgainst += v.points! - v.margin!;
      if (v.margin! > 0) s.wins++; else if (v.margin! < 0) s.losses++; else s.ties++;
    }
    const tier = ctx.tierOfTeam(teamId);
    for (const def of c.records) {
      if (def.scope !== (post ? 'postseason_game' : 'game')) continue;
      const value = v[def.statistic];
      if (value === undefined) throw new Error(`records: game statistic ${def.statistic} unknown`);
      for (const kind of def.books) {
        const key = bookKey(def.id, kind, kind === 'team' ? teamId : r.competitionId);
        const prev = enter(state, key, { holder: teamId, value, season: r.seasonYear, gameId: r.gameId, teamId });
        if (prev !== undefined) { emit(rowRecordId(def, kind, c), teamId, null, value, prev, s.games, r.competitionId, tier, ctx.world.date); set++; }
      }
    }
  }
  return set;
}

/** The season's last week: season books, coach careers, milestones, and each team's `team_season_finished`. */
function finalizeSeason(ctx: StepContext, state: RecordsState, emit: Emit, c: RecordsContent): { records: number; milestones: number; teams: number } {
  const { world } = ctx;
  const year = world.date.seasonYear;
  let records = 0, milestones = 0;
  const teamIds = Object.keys(state.season).map(Number).sort((a, b) => a - b);
  for (const teamId of teamIds) {
    const s = state.season[teamId]!;
    const { level, competitionId } = levelOf(world, teamId);
    const tier = ctx.tierOfTeam(teamId);
    const coach = holderOf(world, teamId, HEAD_COACH);
    ctx.emit({
      type: TEAM_SEASON, date: world.date, competitionId, teamId, witnesses: { kind: 'public' }, tier,
      actors: coach === null ? [] : [{ personId: coach, role: 'head_coach' }], subjects: [{ kind: 'team', id: teamId }],
      payload: {
        season: year, games: s.games, wins: s.wins, losses: s.losses, ties: s.ties, points_for: s.pointsFor, points_against: s.pointsAgainst,
        winning: s.wins > s.losses, postseason: s.postseason, title: s.title,
      },
    });
    const seasonValues: Record<string, number> = { wins: s.wins, points: s.pointsFor };
    for (const def of c.records) {
      if (def.scope !== 'season') continue;
      const value = seasonValues[def.statistic];
      if (value === undefined) throw new Error(`records: season statistic ${def.statistic} unknown`);
      for (const kind of def.books) {
        const key = bookKey(def.id, kind, kind === 'team' ? teamId : competitionId);
        const prev = enter(state, key, { holder: teamId, value, season: year, gameId: null, teamId });
        if (prev !== undefined) { emit(rowRecordId(def, kind, c), teamId, null, value, prev, s.games, competitionId, tier, world.date); records++; }
      }
    }
    if (coach === null) continue;
    // E5.6.2: a coach's record at a level is the sum of his seasons there (ties and vacated wins aside).
    const byLevel = state.coaches[coach] ??= {};
    const career = byLevel[level] ??= { wins: 0, titles: 0 };
    const before = career.wins;
    career.wins += s.wins; career.titles += s.title ? 1 : 0;
    for (const m of awards.milestonesCrossed(c.coachMilestone, before, career.wins)) {
      ctx.emit({
        type: awards.HONOUR.milestone, date: world.date, competitionId, teamId, witnesses: { kind: 'public' }, tier,
        actors: [{ personId: coach, role: 'holder' }], subjects: [{ kind: 'person', id: coach }], payload: { statistic: c.coachMilestone, value: m },
      });
      milestones++;
    }
    const careerValues: Record<string, number> = { wins: career.wins, titles: career.titles };
    for (const def of c.records) {
      if (def.scope !== 'coach_career') continue;
      const value = careerValues[def.statistic];
      if (value === undefined) throw new Error(`records: coach statistic ${def.statistic} unknown`);
      for (const kind of def.books) {
        const key = bookKey(def.id, kind, level);
        // One entry per coach: his line replaces his older one. Adding to a mark he already holds is not a
        // new record; passing another coach's mark is.
        const old = markOf(state, key);
        state.books[key] = (state.books[key] ?? []).filter((e) => e.holder !== coach);
        enter(state, key, { holder: coach, value, season: year, gameId: null, teamId });
        const now = markOf(state, key);
        if (now?.holder === coach && old?.holder !== coach && value > 0 && (old === null || value > old.value)) {
          emit(rowRecordId(def, kind, c), null, coach, value, old?.value ?? null, s.games, competitionId, tier, world.date); records++;
        }
      }
    }
  }
  for (const k of Object.keys(state.season)) delete state.season[k];
  state.finalized = year;
  return { records, milestones, teams: teamIds.length };
}

export interface StatisticsBinding {
  /** The schedule the games step reads: the step finalizes the season in its last week. */
  readonly schedule: Pick<SchedulePort, 'weeksInSeason'>;
  readonly content?: RecordsContent;
}

/** Weekly step 4 (X12.1.1): this week's games into the books, and the season's books in its last week. */
export function statisticsStep(b: StatisticsBinding): StepHandler {
  const c = b.content ?? RECORDS_CONTENT;
  return (ctx) => {
    const { world } = ctx;
    const state = recordsOf(world);
    const emit = emitter(ctx);
    let gameRecords = 0, games = 0;
    for (const r of world.results) {
      if (r.week !== world.week || r.seasonYear !== world.date.seasonYear) continue;
      gameRecords += recordGame(ctx, state, r, emit, c);
      games++;
    }
    const last = b.schedule.weeksInSeason(world) - 1;
    const fin = world.week >= last && state.finalized !== world.date.seasonYear ? finalizeSeason(ctx, state, emit, c) : null;
    return { games, gameRecords, seasonRecords: fin?.records ?? 0, milestones: fin?.milestones ?? 0, seasonsClosed: fin?.teams ?? 0 };
  };
}
