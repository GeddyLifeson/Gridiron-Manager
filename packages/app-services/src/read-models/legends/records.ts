// X3.4.1 record book view. Game, season and career records, individual and team, per competition and
// team, regular season and postseason kept apart. Counting records need no minimum. Rate records need a
// qualifying minimum stated per team game for a season (so seasons of different length compare fairly)
// and a total for a career. Each list shows the top entries with
// ties sharing a rank. Qualifier values sit in records.json and cite facts/legends.json. Two tabs per X14.2.2: "This world" and "All time including imported careers".
// Vacated results stay visible in a footnote but leave the "This world" ranking. Reversals apply at read
// time. Record-set events are emitted by the awards module (G-43); this view only reads.
import type { awards } from '@gm/league';
import recordsJson from './records.json' with { type: 'json' };
import { param } from './params.ts';

type GameLine = awards.GameLine;

export type RecordScope = 'game' | 'season' | 'career';
export interface Qualifier { readonly value: number; readonly factId: string }
export interface RecordCategory {
  readonly id: string;
  readonly label: string;
  readonly statistic: string;
  readonly per?: string;
  readonly holder: 'player' | 'team';
  /** Season minimum per team game (rate records), citing its row in facts/legends.json. */
  readonly seasonMinimum?: Qualifier;
  /** Career minimum total (rate records), citing its row in facts/legends.json. */
  readonly careerMinimum?: Qualifier;
}
export const RECORD_CATEGORIES: readonly RecordCategory[] = (recordsJson as unknown as { categories: RecordCategory[] }).categories;

export interface RecordFilter { readonly competitionId?: number; readonly teamId?: number; readonly postseason?: boolean }

export interface RecordRow {
  readonly rank: number;
  readonly holderId: number;
  readonly value: number;
  readonly teamId: number;
  readonly seasonYear: number;
  readonly gameId: number | null;
  /** Imported prior career (X14.2.2), shown only on the all-time tab. */
  readonly imported: boolean;
}

export interface RecordList {
  readonly categoryId: string;
  readonly scope: RecordScope;
  readonly postseason: boolean;
  /** The qualifier applied: per team game for a season, total for a career, null for a counting record. */
  readonly minimum: { readonly per: string; readonly value: number; readonly perTeamGame: boolean; readonly factId: string } | null;
  readonly thisWorld: readonly RecordRow[];
  readonly allTime: readonly RecordRow[];
  /** Marks that rest on a vacated result (X3.4.1 rule 5). */
  readonly vacated: readonly RecordRow[];
}

/** An imported prior career mark (people pack, X14.2.1). */
export interface PriorMark { readonly holderId: number; readonly value: number; readonly teamId: number; readonly seasonYear: number }

interface Acc { holder: number; num: number; den: number; teamId: number; season: number; gameId: number | null; vacated: boolean; teamSeasons: Set<string> }

function teamGames(lines: readonly GameLine[], postseason: boolean): Map<string, number> {
  const g = new Map<string, Set<number>>();
  for (const l of lines) {
    if (l.postseason !== postseason) continue;
    const k = `${l.teamId}:${l.season}`;
    (g.get(k) ?? g.set(k, new Set()).get(k)!).add(l.gameId);
  }
  return new Map([...g].map(([k, s]) => [k, s.size]));
}

/** Ranks best first; equal values share a rank (1, 1, 3); ties list by date (X3.4.1 edge case). */
export function rankRows(rows: readonly Omit<RecordRow, 'rank'>[], size: number): RecordRow[] {
  const sorted = [...rows].sort((a, b) => b.value - a.value || a.seasonYear - b.seasonYear || a.holderId - b.holderId);
  const out: RecordRow[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i]!;
    const prev = out[i - 1];
    const rank = prev && prev.value === r.value ? prev.rank : i + 1;
    if (rank > size) break;
    out.push({ ...r, rank });
  }
  return out;
}

export function recordList(cat: RecordCategory, scope: RecordScope, lines: readonly GameLine[], opts: {
  readonly filter?: RecordFilter; readonly vacatedGameIds?: ReadonlySet<number>; readonly prior?: readonly PriorMark[];
} = {}): RecordList {
  const f = opts.filter ?? {};
  const post = f.postseason === true;
  const size = param('legends.records.list_size');
  const vac = opts.vacatedGameIds ?? new Set<number>();
  const games = teamGames(lines, post);
  const acc = new Map<string, Acc>();
  for (const l of lines) {
    if (l.postseason !== post) continue;
    if (f.competitionId !== undefined && l.competitionId !== f.competitionId) continue;
    if (f.teamId !== undefined && l.teamId !== f.teamId) continue;
    const v = l.totals[cat.statistic];
    if (v === undefined) continue;
    const who = cat.holder === 'team' ? l.teamId : l.personId;
    const k = scope === 'game' ? `${who}:${l.gameId}` : scope === 'season' ? `${who}:${l.season}` : `${who}`;
    const a = acc.get(k) ?? acc.set(k, { holder: who, num: 0, den: 0, teamId: l.teamId, season: l.season, gameId: scope === 'game' ? l.gameId : null, vacated: false, teamSeasons: new Set() }).get(k)!;
    a.num += v;
    if (cat.per) a.den += l.totals[cat.per] ?? 0;
    a.season = Math.max(a.season, l.season);
    a.teamId = l.teamId;
    a.teamSeasons.add(`${l.teamId}:${l.season}`);
    if (vac.has(l.gameId)) a.vacated = true;
  }

  let minimum: RecordList['minimum'] = null;
  if (cat.per && scope === 'season' && cat.seasonMinimum) minimum = { per: cat.per, value: cat.seasonMinimum.value, perTeamGame: true, factId: cat.seasonMinimum.factId };
  if (cat.per && scope === 'career' && cat.careerMinimum) minimum = { per: cat.per, value: cat.careerMinimum.value, perTeamGame: false, factId: cat.careerMinimum.factId };

  const clean: Omit<RecordRow, 'rank'>[] = [], tainted: Omit<RecordRow, 'rank'>[] = [];
  for (const a of acc.values()) {
    if (cat.per) {
      if (scope === 'game' || a.den <= 0) continue;
      if (minimum) {
        const need = minimum.perTeamGame ? minimum.value * [...a.teamSeasons].reduce((n, ts) => n + (games.get(ts) ?? 0), 0) : minimum.value;
        if (a.den < need) continue;
      }
    }
    const row = { holderId: a.holder, value: cat.per ? a.num / a.den : a.num, teamId: a.teamId, seasonYear: a.season, gameId: a.gameId, imported: false };
    (a.vacated ? tainted : clean).push(row);
  }
  const prior = (scope === 'career' ? opts.prior ?? [] : []).map((p) => ({ ...p, gameId: null, imported: true }));
  return {
    categoryId: cat.id, scope, postseason: post, minimum,
    thisWorld: rankRows(clean, size),
    allTime: rankRows([...clean, ...prior], size),
    vacated: rankRows(tainted, size),
  };
}

/** Every list of the book for the scopes that apply to each category. Rate records have no game scope. */
export function recordBook(lines: readonly GameLine[], opts: Parameters<typeof recordList>[3] = {}): RecordList[] {
  const out: RecordList[] = [];
  for (const cat of RECORD_CATEGORIES) {
    for (const scope of ['game', 'season', 'career'] as const) {
      if (cat.per && scope === 'game') continue;
      out.push(recordList(cat, scope, lines, opts));
    }
  }
  return out;
}
