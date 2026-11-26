// C9.2.1 record books as queries and E5.6.2 coach records. A record definition is content; every book is
// computed from public game lines and coach seasons that the log holds. No record is stored by hand.
// Imported real careers sit in a separate prior list and never mix with marks set in the world (X14).
import content from './records.json' with { type: 'json' };
import { HONOUR, honourDraft, type DraftMeta, type HonourDraft } from './events.ts';
import { scoreEvent } from './notability.ts';
import { param } from './params.ts';
import type { Aggregate, GameLine, Origin, PersonId, TeamId } from './types.ts';

export type RecordScope = 'game' | 'season' | 'career' | 'postseason_game' | 'postseason_career';
export interface RecordDef {
  readonly id: string;
  readonly statistic: string;
  /** Rate records: statistic / per, needing at least `minimum` of `per`. */
  readonly per?: string;
  readonly minimum?: number;
  readonly scope: RecordScope;
  readonly holder: 'player' | 'team';
  readonly aggregate?: Aggregate;
  readonly direction?: 'most' | 'fewest';
}
export interface RecordsContent { readonly records: readonly RecordDef[]; readonly milestones: Readonly<Record<string, readonly number[]>> }
export const RECORDS_CONTENT = content as unknown as RecordsContent;

export interface BookEntry {
  readonly holderId: number;
  readonly value: number;
  /** Season of the mark (last season for a career mark). */
  readonly season: number;
  readonly gameId: number | null;
  /** Games in that season for the holder's team, so a longer season is visible beside the mark (C9.2.1 edge case). */
  readonly seasonGames: number | null;
}
export interface RecordBook {
  readonly def: RecordDef;
  readonly entries: readonly BookEntry[];
  /** Imported prior careers, display only (X14, C9.2.1 rule 4). */
  readonly prior: readonly BookEntry[];
}

export interface BookFilter {
  readonly competitionId?: number;
  readonly teamId?: TeamId;
  readonly beforeSeason?: number;
}

function combine(agg: Aggregate, a: number | undefined, b: number): number {
  return a === undefined ? b : agg === 'max' ? Math.max(a, b) : a + b;
}

/** Team lines: the sum of player lines per team-game, or a team line where the caller gives one (personId 0). */
function keyOf(def: RecordDef, l: GameLine): string {
  const who = def.holder === 'team' ? l.teamId : l.personId;
  if (def.scope === 'game' || def.scope === 'postseason_game') return `${who}:${l.gameId}`;
  if (def.scope === 'season') return `${who}:${l.season}`;
  return `${who}`;
}

/** Games per team per season, from the lines themselves. */
export function seasonGames(lines: readonly GameLine[]): Map<string, number> {
  const games = new Map<string, Set<number>>();
  for (const l of lines) {
    if (l.postseason) continue;
    const k = `${l.teamId}:${l.season}`;
    const s = games.get(k) ?? new Set<number>();
    s.add(l.gameId);
    games.set(k, s);
  }
  return new Map([...games].map(([k, s]) => [k, s.size]));
}

/**
 * Computes a book from game lines. Everything played in the world ranks, imported people included.
 * `prior` holds imported real careers from the people pack (X14.1.1 plain facts); it is carried beside the
 * book for display and never ranked with it. Entries are best first, ties by earlier season then holder id.
 */
export function computeBook(def: RecordDef, lines: readonly GameLine[], filter: BookFilter = {}, prior: readonly BookEntry[] = []): RecordBook {
  const agg: Aggregate = def.aggregate ?? 'sum';
  const post = def.scope === 'postseason_game' || def.scope === 'postseason_career';
  const sg = seasonGames(lines);
  const acc = new Map<string, { holder: number; num: number | undefined; den: number; season: number; gameId: number | null; teamId: number }>();
  for (const l of lines) {
    if (l.postseason !== post) continue;
    if (filter.competitionId !== undefined && l.competitionId !== filter.competitionId) continue;
    if (filter.teamId !== undefined && l.teamId !== filter.teamId) continue;
    if (filter.beforeSeason !== undefined && l.season >= filter.beforeSeason) continue;
    const v = l.totals[def.statistic];
    if (v === undefined) continue;
    const k = keyOf(def, l);
    const cur = acc.get(k) ?? { holder: def.holder === 'team' ? l.teamId : l.personId, num: undefined, den: 0, season: l.season, gameId: null, teamId: l.teamId };
    cur.num = combine(agg, cur.num, v);
    if (def.per) cur.den += l.totals[def.per] ?? 0;
    cur.season = Math.max(cur.season, l.season);
    cur.teamId = l.teamId;
    if (def.scope === 'game' || def.scope === 'postseason_game') cur.gameId = l.gameId;
    acc.set(k, cur);
  }
  const entries: BookEntry[] = [];
  for (const a of acc.values()) {
    if (a.num === undefined) continue;
    if (def.per && (a.den <= 0 || a.den < (def.minimum ?? 0))) continue;
    const value = def.per ? a.num / a.den : a.num;
    const e: BookEntry = { holderId: a.holder, value, season: a.season, gameId: a.gameId, seasonGames: def.scope === 'season' ? sg.get(`${a.teamId}:${a.season}`) ?? null : null };
    entries.push(e);
  }
  const dir = def.direction === 'fewest' ? -1 : 1;
  const order = (x: BookEntry, y: BookEntry) => dir * (y.value - x.value) || x.season - y.season || x.holderId - y.holderId;
  return { def, entries: entries.sort(order), prior: [...prior].sort(order) };
}

/** The mark to beat, or null for an empty book (a world with no history starts empty, C9.2.1 rule 3). */
export function mark(book: RecordBook): BookEntry | null { return book.entries[0] ?? null; }

/** Is `value` a new mark? Equal to the mark is a tie, not a record. */
export function breaks(book: RecordBook, value: number): boolean {
  const m = mark(book);
  if (!m) return value > 0;
  return book.def.direction === 'fewest' ? value < m.value : value > m.value;
}

export interface RecordWatch { readonly recordId: string; readonly personId: PersonId; readonly needed: number; readonly markValue: number; readonly kind: 'team' | 'level' }

/**
 * C9.2.1 rule 5 and I7: a sideline note when a player is close to a notable mark. Fires only when the
 * record would score at or above the watch threshold, and the player is within the margin of the mark.
 */
export function recordWatch(book: RecordBook, kind: 'team' | 'level', personId: PersonId, current: number): RecordWatch | null {
  const m = mark(book);
  if (!m || book.def.direction === 'fewest' || book.def.per) return null;
  if (scoreEvent(HONOUR.record, 'honors', { record: kind }) < param('records.watchNotability')) return null;
  const needed = m.value - current;
  if (needed <= 0 || needed > m.value * param('records.watchMargin')) return null;
  return { recordId: book.def.id, personId, needed, markValue: m.value, kind };
}

export function recordDraft(book: RecordBook, entry: BookEntry, previous: number, meta: DraftMeta): HonourDraft {
  return honourDraft(HONOUR.record, meta, entry.holderId, 'holder', { recordId: book.def.id, value: entry.value, previous, seasonGames: entry.seasonGames ?? 0 });
}

/** New marks set in `season`: compares the book before the season with the book through it. */
export function newRecords(def: RecordDef, lines: readonly GameLine[], season: number, filter: BookFilter = {}): { entry: BookEntry; previous: number }[] {
  const before = computeBook(def, lines, { ...filter, beforeSeason: season });
  const through = computeBook(def, lines, { ...filter, beforeSeason: season + 1 });
  const prev = mark(before);
  const top = mark(through);
  if (!top || top.season !== season) return [];
  if (prev && !breaks(before, top.value)) return [];
  return [{ entry: top, previous: prev?.value ?? 0 }];
}

// ---------------------------------------------------------------------------------------------------
// E5.6.2 coach records

/** One coach season at one team, from the log (results, postseason, titles). */
export interface CoachSeasonRow {
  readonly personId: PersonId;
  readonly season: number;
  /** Level key of the competition (data, never compared to a literal level word). */
  readonly level: string;
  readonly teamId: TeamId;
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  readonly postseasonWins: number;
  readonly title: boolean;
  /** Age at season's end. */
  readonly age: number;
  /** Wins vacated by a compliance penalty (removed from tables and flagged, E5.6.2 edge case). */
  readonly vacatedWins?: number;
  readonly origin?: Origin;
}

export interface CoachTotals {
  readonly personId: PersonId; readonly games: number; readonly wins: number; readonly losses: number; readonly ties: number;
  readonly winShare: number; readonly postseasonWins: number; readonly titles: number; readonly seasons: number;
  readonly vacated: number; readonly longestWinningRun: number; readonly longestTenure: number;
  readonly youngestTitleAge: number | null; readonly oldestTitleAge: number | null;
}

/** Career totals per coach at one level. `tieValue` is the rule `standings.tie_win_value`. */
export function coachTotals(rows: readonly CoachSeasonRow[], level: string, tieValue: number): CoachTotals[] {
  const by = new Map<PersonId, CoachSeasonRow[]>();
  for (const r of rows) if (r.level === level) by.set(r.personId, [...(by.get(r.personId) ?? []), r]);
  const out: CoachTotals[] = [];
  for (const [personId, rs] of by) {
    const s = [...rs].sort((a, b) => a.season - b.season);
    let wins = 0, losses = 0, ties = 0, post = 0, titles = 0, vacated = 0, run = 0, bestRun = 0, tenure = 0, bestTenure = 0;
    let youngest: number | null = null, oldest: number | null = null;
    let prev: CoachSeasonRow | null = null;
    for (const r of s) {
      const v = r.vacatedWins ?? 0;
      wins += r.wins - v; losses += r.losses; ties += r.ties; post += r.postseasonWins; vacated += v;
      if (r.title) { titles += 1; youngest = youngest === null ? r.age : Math.min(youngest, r.age); oldest = oldest === null ? r.age : Math.max(oldest, r.age); }
      const winning = r.wins - v > r.losses;
      const consecutive = prev !== null && r.season === prev.season + 1;
      run = winning ? (consecutive ? run + 1 : 1) : 0;
      tenure = prev !== null && consecutive && prev.teamId === r.teamId ? tenure + 1 : 1;
      bestRun = Math.max(bestRun, run); bestTenure = Math.max(bestTenure, tenure);
      prev = r;
    }
    const games = wins + vacated + losses + ties;
    const counted = wins + losses + ties;
    out.push({
      personId, games, wins, losses, ties, winShare: counted > 0 ? (wins + tieValue * ties) / counted : 0, postseasonWins: post,
      titles, seasons: s.length, vacated, longestWinningRun: bestRun, longestTenure: bestTenure, youngestTitleAge: youngest, oldestTitleAge: oldest,
    });
  }
  return out.sort((a, b) => a.personId - b.personId);
}

export type CoachTable = 'wins' | 'winShare' | 'postseasonWins' | 'titles' | 'longestWinningRun' | 'longestTenure' | 'youngestTitle' | 'oldestTitle';

/**
 * One E5.6.2 table, best first. Win share needs the minimum games (rule 3). With the people pack loaded,
 * real coaches' real totals stand in the table as prior history (rule 1): pass them as `prior`; they rank
 * and are flagged so pages can mark them. They are never summed with in-world totals.
 */
export function coachTable(totals: readonly CoachTotals[], table: CoachTable, prior: readonly CoachTotals[] = []): { personId: PersonId; value: number; prior: boolean }[] {
  const minGames = param('records.coachWinShareMinGames');
  const pick = (t: CoachTotals): number | null => {
    switch (table) {
      case 'winShare': return t.games >= minGames ? t.winShare : null;
      case 'youngestTitle': return t.youngestTitleAge;
      case 'oldestTitle': return t.oldestTitleAge;
      default: return t[table];
    }
  };
  const dir = table === 'youngestTitle' ? -1 : 1;
  return [...totals.map((t) => ({ personId: t.personId, value: pick(t), prior: false })), ...prior.map((t) => ({ personId: t.personId, value: pick(t), prior: true }))]
    .filter((x): x is { personId: PersonId; value: number; prior: boolean } => x.value !== null && (table !== 'titles' || x.value > 0))
    .sort((a, b) => dir * (b.value - a.value) || a.personId - b.personId);
}

/** Milestones crossed this season (100th win and so on). */
export function milestonesCrossed(statistic: string, before: number, after: number, c: RecordsContent = RECORDS_CONTENT): number[] {
  return (c.milestones[statistic] ?? []).filter((m) => before < m && after >= m);
}

export function milestoneDraft(personId: PersonId, statistic: string, value: number, meta: DraftMeta): HonourDraft {
  return honourDraft(HONOUR.milestone, meta, personId, 'holder', { statistic, value });
}
