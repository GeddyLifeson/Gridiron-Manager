// File access for the play-level harness (headless is a tool package, so it may read files).
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PlayByPlayRow } from '@gm/schema';
import { isCarry, isKneel, isSpike, isAttempt, isPassPlay, isCountedScrimmage } from '../calibration/measures.ts';
import { readCsv } from './csv.ts';
import { rowFromPublic, PUBLIC_COLUMNS_READ } from './public-row.ts';
import { measureCells } from './cells.ts';
import type { AdapterCheck, BaselineSource, RealBaseline, Tolerances } from './baseline.ts';

const DATA = join(dirname(fileURLToPath(import.meta.url)), 'data');

export function baselinePath(ruleSetId: string): string { return join(DATA, `real-cells.${ruleSetId}.json`); }
export function readTolerances(): Tolerances { return JSON.parse(readFileSync(join(DATA, 'tolerances.json'), 'utf8')) as Tolerances; }
/** The real baseline of a rule set, or null when the level has none. */
export function readBaseline(ruleSetId: string): RealBaseline | null {
  const p = baselinePath(ruleSetId);
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as RealBaseline) : null;
}

export interface SeasonRows { readonly season: number; readonly games: number; readonly rows: PlayByPlayRow[] }

/** Reads one season file of public play-by-play (plain or gzip), regular season only, as rows in file order per game. */
export function readPublicSeason(path: string, season: number, firstGameId: number): SeasonRows {
  const raw = readFileSync(path);
  const bytes = path.endsWith('.gz') ? gunzipSync(raw) : raw;
  const byGame = new Map<string, { id: number; n: number }>();
  const rows: PlayByPlayRow[] = [];
  const { missing } = readCsv(bytes, PUBLIC_COLUMNS_READ, (c) => {
    if (c['season_type'] !== 'REG' || Number(c['season']) !== season) return;
    let g = byGame.get(c['game_id']!);
    if (!g) { g = { id: firstGameId + byGame.size, n: 0 }; byGame.set(c['game_id']!, g); }
    const row = rowFromPublic(c, { gameId: g.id, playIndex: g.n + 1 });
    if (row) { g.n++; rows.push(row); }
  });
  if (missing.length) throw new Error(`${path}: missing columns ${missing.join(', ')}`);
  return { season, games: byGame.size, rows };
}

/** League totals by the official definitions, for the adapter check against team-total collections. */
export function officialTotals(rows: readonly PlayByPlayRow[]): Record<'rush_att' | 'rush_yds' | 'pass_att' | 'sacks', number> {
  const t = { rush_att: 0, rush_yds: 0, pass_att: 0, sacks: 0 };
  for (const r of rows) {
    if (!isCountedScrimmage(r) || r.kickKind !== null) continue;
    if (isCarry(r) || isKneel(r)) { t.rush_att++; t.rush_yds += r.yardsGained; }
    else if (isAttempt(r) || isSpike(r)) t.pass_att++;
    else if (isPassPlay(r) && r.sack) t.sacks++;
  }
  return t;
}

/** Sums team-season rows of a team-totals file (columns season, rush_att, rush_yds, pass_att, sacks) by season. */
export function readTeamTotals(path: string): Map<number, Record<string, number>> {
  const out = new Map<number, Record<string, number>>();
  readCsv(readFileSync(path), ['season', 'rush_att', 'rush_yds', 'pass_att', 'sacks'], (c) => {
    const s = Number(c['season']);
    const t = out.get(s) ?? { rush_att: 0, rush_yds: 0, pass_att: 0, sacks: 0 };
    for (const k of ['rush_att', 'rush_yds', 'pass_att', 'sacks']) t[k] = (t[k] ?? 0) + Number(c[k]);
    out.set(s, t);
  });
  return out;
}

export function buildBaseline(ruleSetId: string, seasons: readonly SeasonRows[], sources: readonly BaselineSource[], totals: readonly { source: string; bySeason: Map<number, Record<string, number>> }[]): RealBaseline {
  const adapterChecks: AdapterCheck[] = [];
  for (const s of seasons) {
    const mine = officialTotals(s.rows);
    for (const q of ['rush_att', 'rush_yds', 'pass_att', 'sacks'] as const) {
      const others = totals.filter((t) => t.bySeason.has(s.season)).map((t) => ({ source: t.source, value: t.bySeason.get(s.season)![q]! }));
      adapterChecks.push({ season: s.season, quantity: q, fromPlayByPlay: mine[q], others, difference: others.length ? mine[q] - others[0]!.value : 0 });
    }
  }
  const rows = seasons.flatMap((s) => s.rows);
  const years = seasons.map((s) => s.season);
  return {
    ruleSetId, seasons: `${Math.min(...years)}-${Math.max(...years)}`, seasonType: 'REG', sources,
    games: seasons.reduce((a, s) => a + s.games, 0), rows: rows.length, adapterChecks, cells: measureCells(rows),
  };
}
