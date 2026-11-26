// The career record's head coach lines (E5.5.1) and the world's records tables (E5.6.2). Games count for
// whoever was head coach on the day; an acting coach gets the games of a suspended one (E5.5.1 edge case).
// Lines are kept per competition and summed per level key, never across levels (E5.5.1 rule 3). The record
// is append-only and rebuilt exactly from the same games (E5.6.2 acceptance).
import type { WorldDate } from '@gm/schema';
import { dateBefore } from './audiences.ts';
import { paramWith, type Overrides } from './params.ts';

export interface GameResult {
  /** The game's log event id, so every figure links to its row (E5.5.2 rule 2). */
  readonly eventId: number;
  readonly date: WorldDate;
  readonly teamId: number;
  readonly competitionId: number;
  readonly result: 'win' | 'loss' | 'tie';
  readonly postseason: boolean;
  readonly title: boolean;
}

/** A spell as head coach (interim spells included, E2.6.3). `to` null while current; inclusive both ends. */
export interface HeadSpell {
  readonly personId: number;
  readonly teamId: number;
  readonly from: WorldDate;
  readonly to: WorldDate | null;
}

export interface Totals {
  wins: number;
  losses: number;
  ties: number;
  postseasonWins: number;
  postseasonLosses: number;
  titles: number;
  readonly gameIds: number[];
}

export function emptyTotals(): Totals {
  return { wins: 0, losses: 0, ties: 0, postseasonWins: 0, postseasonLosses: 0, titles: 0, gameIds: [] };
}

export function games(t: Totals): number { return t.wins + t.losses + t.ties; }

/** Win share with ties as half (the usual convention is not a number this module states; it is arithmetic). */
export function winShare(t: Totals): number {
  const g = games(t);
  return g === 0 ? 0 : (t.wins + t.ties / 2) / g;
}

export interface RecordInput {
  readonly spells: readonly HeadSpell[];
  readonly games: readonly GameResult[];
  /** Game event id to the acting head coach (suspension, C11). */
  readonly acting?: ReadonlyMap<number, number>;
  /** Vacated games (college compliance penalty): removed from the table and flagged (E5.6.2 edge case). */
  readonly vacated?: ReadonlySet<number>;
}

function within(d: WorldDate, s: HeadSpell): boolean {
  return !dateBefore(d, s.from) && (s.to === null || !dateBefore(s.to, d));
}

/** Person id to competition id to totals. */
export type CareerLines = Map<number, Map<number, Totals>>;

export function headCoachLines(input: RecordInput): { lines: CareerLines; vacated: number[] } {
  const lines: CareerLines = new Map();
  const vacated: number[] = [];
  const ordered = [...input.games].sort((a, b) => a.date.seasonYear - b.date.seasonYear || a.date.dayIndex - b.date.dayIndex || a.eventId - b.eventId);
  for (const g of ordered) {
    if (input.vacated?.has(g.eventId)) { vacated.push(g.eventId); continue; }
    const coach = input.acting?.get(g.eventId) ?? input.spells.find((s) => s.teamId === g.teamId && within(g.date, s))?.personId;
    if (coach === undefined) continue;
    let byComp = lines.get(coach);
    if (!byComp) { byComp = new Map(); lines.set(coach, byComp); }
    let t = byComp.get(g.competitionId);
    if (!t) { t = emptyTotals(); byComp.set(g.competitionId, t); }
    if (g.result === 'win') t.wins += 1; else if (g.result === 'loss') t.losses += 1; else t.ties += 1;
    if (g.postseason && g.result === 'win') t.postseasonWins += 1;
    if (g.postseason && g.result === 'loss') t.postseasonLosses += 1;
    if (g.title && g.result === 'win') t.titles += 1;
    t.gameIds.push(g.eventId);
  }
  return { lines, vacated };
}

/** Sum a person's lines per level key (`levelOf(competitionId)`), never across levels. */
export function byLevel(lines: CareerLines, personId: number, levelKeyOf: (competitionId: number) => string): Map<string, Totals> {
  const out = new Map<string, Totals>();
  for (const [comp, t] of lines.get(personId) ?? []) {
    const k = levelKeyOf(comp);
    const acc = out.get(k) ?? emptyTotals();
    acc.wins += t.wins; acc.losses += t.losses; acc.ties += t.ties;
    acc.postseasonWins += t.postseasonWins; acc.postseasonLosses += t.postseasonLosses; acc.titles += t.titles;
    acc.gameIds.push(...t.gameIds);
    out.set(k, acc);
  }
  return out;
}

export type RecordCategory = 'wins' | 'win_share' | 'postseason_wins' | 'titles';
export const RECORD_CATEGORIES: readonly RecordCategory[] = ['wins', 'win_share', 'postseason_wins', 'titles'];

export interface TableRow { readonly personId: number; readonly value: number; readonly rank: number }

function valueOf(t: Totals, c: RecordCategory): number {
  if (c === 'wins') return t.wins;
  if (c === 'win_share') return winShare(t);
  if (c === 'postseason_wins') return t.postseasonWins;
  return t.titles;
}

/**
 * One records table at one level (E5.6.2). Prior history (generated, or a real people pack's totals) is
 * added by the caller as extra lines; real totals are never hard-coded here.
 */
export function recordsTable(lines: CareerLines, level: string, category: RecordCategory, levelKeyOf: (competitionId: number) => string, o?: Overrides): TableRow[] {
  const p = paramWith(o);
  const rows: { personId: number; value: number }[] = [];
  for (const personId of lines.keys()) {
    const t = byLevel(lines, personId, levelKeyOf).get(level);
    if (!t) continue;
    if (category === 'win_share' && games(t) < p('records.winShareMinGames')) continue;
    rows.push({ personId, value: valueOf(t, category) });
  }
  rows.sort((a, b) => b.value - a.value || a.personId - b.personId);
  const out: TableRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const prev = out[i - 1];
    out.push({ ...r, rank: prev && prev.value === r.value ? prev.rank : i + 1 });
  }
  return out;
}

/** People a coach passed between two versions of a table (the "notice when he passes someone"). */
export function passed(before: readonly TableRow[], after: readonly TableRow[], personId: number): number[] {
  const mine = after.find((r) => r.personId === personId);
  const was = before.find((r) => r.personId === personId);
  if (!mine) return [];
  return before
    .filter((r) => r.personId !== personId && (was === undefined || r.value >= was.value))
    .filter((r) => {
      const now = after.find((x) => x.personId === r.personId);
      return now !== undefined && mine.value > now.value;
    })
    .map((r) => r.personId);
}

/** Milestone win counts crossed between two totals (100th win and so on). */
export function milestonesCrossed(winsBefore: number, winsAfter: number, o?: Overrides): number[] {
  const step = paramWith(o)('records.milestoneEvery');
  const out: number[] = [];
  for (let m = (Math.floor(winsBefore / step) + 1) * step; m <= winsAfter; m += step) out.push(m);
  return out;
}
