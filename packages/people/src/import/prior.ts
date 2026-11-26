// Real history as plain facts (U2.2.1, X14.2.1): the prior career block, organisation display names, the
// imported statistics totals, and the dates. Nothing here writes an X2 event (X14.2.1 rule 1).
import type { PackData, PackRow } from '../pack/index.ts';

export type PackLevel = 'pro' | 'college';
export type PriorRole = 'player' | 'head coach' | 'coordinator' | 'position coach' | 'staff' | 'official';

export interface PriorSeason {
  season: number;
  level: PackLevel | null;
  role: PriorRole;
  /** Display text: the real name when the pack says `team_names: plain`, else "Prior club A" (X14.2.1 rule 3). */
  organisation: string;
  games: number | null;
  starts: number | null;
  wins: number | null;
  losses: number | null;
  ties: number | null;
  /** Statistic columns the pack carries for the season (numbers only). */
  stats: Record<string, number>;
}

/** X14.2.1 outputs: read-only after import. */
export interface PriorCareer {
  seasons: PriorSeason[];
  /** "Record incomplete before <year>" (X14.2.1 edge case), or null when the pack covers the whole career. */
  incompleteBefore: number | null;
  draft: { year: number; round: number | null; pick: number | null } | null;
}

const NUM = (v: string | undefined): number | null => (v === undefined || v === '' ? null : Number(v));

function rowsByKey(pack: PackData, table: string): Map<string, PackRow[]> {
  const m = new Map<string, PackRow[]>();
  for (const r of pack.tables[table]?.rows ?? []) {
    const k = r['source_key']!;
    const list = m.get(k);
    if (list) list.push(r); else m.set(k, [r]);
  }
  return m;
}

/** Rows of every per-person table, grouped by source key, built once per pack. */
export interface PackIndex {
  people: Map<string, PackRow>;
  playing: Map<string, PackRow>;
  playerSeasons: Map<string, PackRow[]>;
  coachingSeasons: Map<string, PackRow[]>;
  officialSeasons: Map<string, PackRow[]>;
  overrides: Map<string, PackRow[]>;
  statColumns: string[];
}

export function indexPack(pack: PackData): PackIndex {
  const one = (t: string) => new Map((pack.tables[t]?.rows ?? []).map((r) => [r['source_key']!, r] as const));
  const ps = pack.tables['player_seasons'];
  const base = new Set(['source_key', 'season', 'level', 'organisation', 'games', 'starts', 'snaps_off', 'snaps_def', 'snaps_st']);
  return {
    people: one('people'),
    playing: one('playing'),
    playerSeasons: rowsByKey(pack, 'player_seasons'),
    coachingSeasons: rowsByKey(pack, 'coaching_seasons'),
    officialSeasons: rowsByKey(pack, 'official_seasons'),
    overrides: rowsByKey(pack, 'overrides'),
    statColumns: (ps?.columns ?? []).filter((c) => !base.has(c)),
  };
}

/** Letters A, B, ..., Z, AA, AB, ... for the nth organisation (0-based). */
export function clubLetters(n: number): string {
  let s = '';
  let k = n;
  do { s = String.fromCharCode(65 + (k % 26)) + s; k = Math.floor(k / 26) - 1; } while (k >= 0);
  return s;
}

/**
 * Organisation display names for one pack (X14.2.1 rule 3). With `team_names: plain` the pack's text is shown
 * as is. Otherwise each organisation gets "Prior club <letters>", assigned once for the whole pack in order of
 * first appearance (season, then level, then the organisation text as a tie order), so two people who shared
 * a club always show the same letter. The real text is never shown in that case.
 */
export function organisationNamer(pack: PackData): (org: string) => string {
  if (pack.manifest.team_names === 'plain') return (org) => org;
  const first = new Map<string, string>();
  for (const t of ['player_seasons', 'coaching_seasons']) {
    for (const r of pack.tables[t]?.rows ?? []) {
      const org = r['organisation'] ?? '';
      if (!org) continue;
      const key = `${r['season']!.padStart(6, '0')}|${r['level'] ?? ''}|${org}`;
      const prev = first.get(org);
      if (prev === undefined || key < prev) first.set(org, key);
    }
  }
  const ordered = [...first.entries()].sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  const name = new Map(ordered.map(([org], i) => [org, `Prior club ${clubLetters(i)}`] as const));
  return (org) => (org ? name.get(org) ?? 'Prior club' : 'Prior club');
}

/**
 * The prior career block of one person. Only seasons before the world start are shown (U2.2.1 rule 4);
 * later seasons stay with the career-curve dial (`futureSeasons`).
 */
export function priorCareerOf(ix: PackIndex, key: string, worldStartYear: number, orgName: (o: string) => string): { prior: PriorCareer; futureSeasons: PackRow[] } {
  const seasons: PriorSeason[] = [];
  const future: PackRow[] = [];
  for (const r of ix.playerSeasons.get(key) ?? []) {
    const season = Number(r['season']);
    if (season >= worldStartYear) { future.push(r); continue; }
    const stats: Record<string, number> = {};
    for (const c of ix.statColumns) { const v = NUM(r[c]); if (v !== null && Number.isFinite(v)) stats[c] = v; }
    for (const c of ['snaps_off', 'snaps_def', 'snaps_st']) { const v = NUM(r[c]); if (v !== null) stats[c] = v; }
    seasons.push({ season, level: (r['level'] as PackLevel) ?? null, role: 'player', organisation: orgName(r['organisation'] ?? ''), games: NUM(r['games']), starts: NUM(r['starts']), wins: null, losses: null, ties: null, stats });
  }
  for (const r of ix.coachingSeasons.get(key) ?? []) {
    const season = Number(r['season']);
    if (season >= worldStartYear) continue;
    seasons.push({ season, level: (r['level'] as PackLevel) ?? null, role: r['role'] as PriorRole, organisation: orgName(r['organisation'] ?? ''), games: NUM(r['games']), starts: null, wins: NUM(r['wins']), losses: NUM(r['losses']), ties: NUM(r['ties']), stats: {} });
  }
  for (const r of ix.officialSeasons.get(key) ?? []) {
    const season = Number(r['season']);
    if (season >= worldStartYear) continue;
    seasons.push({ season, level: 'pro', role: 'official', organisation: '', games: NUM(r['games']), starts: null, wins: null, losses: null, ties: null, stats: {} });
  }
  seasons.sort((a, b) => a.season - b.season || a.role.localeCompare(b.role) || a.organisation.localeCompare(b.organisation));
  const pl = ix.playing.get(key);
  const draftYear = NUM(pl?.['draft_year']);
  const draft = draftYear === null ? null : { year: draftYear, round: NUM(pl?.['draft_round']), pick: NUM(pl?.['draft_pick']) };
  return { prior: { seasons, incompleteBefore: null, draft }, futureSeasons: future };
}

/**
 * X14.2.1 edge case: "Record incomplete before <year>" when the pack's seasons start after the person's
 * career did. The coverage start is the first season any row of that table holds (the project data: pro
 * players 1999, college 2010, head coaches 1999).
 */
export function coverageStarts(pack: PackData): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of ['player_seasons', 'coaching_seasons', 'official_seasons']) {
    let min = Infinity;
    for (const r of pack.tables[t]?.rows ?? []) min = Math.min(min, Number(r['season']));
    if (Number.isFinite(min)) out[t] = min;
  }
  return out;
}

/** Totals of the numeric statistics shown in "Including prior careers" (X14.2.2), keyed `level.stat`. */
export function importedStatsOf(prior: PriorCareer): Record<string, number> {
  const out: Record<string, number> = {};
  const add = (k: string, v: number | null) => { if (v !== null && Number.isFinite(v)) out[k] = (out[k] ?? 0) + v; };
  for (const s of prior.seasons) {
    const lv = s.level ?? 'unknown';
    const pre = s.role === 'player' ? lv : `${lv}.${s.role.replace(/ /g, '_')}`;
    add(`${pre}.seasons`, 1);
    add(`${pre}.games`, s.games);
    add(`${pre}.starts`, s.starts);
    add(`${pre}.wins`, s.wins);
    add(`${pre}.losses`, s.losses);
    add(`${pre}.ties`, s.ties);
    for (const [k, v] of Object.entries(s.stats)) add(`${pre}.${k}`, v);
  }
  return out;
}

const CUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

/** Day index counted from January 1 (day 0), the convention G-17 uses (CR-G17-2 asks the integrator to confirm). */
export function isoToWorldDate(iso: string): { seasonYear: number; dayIndex: number } {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return { seasonYear: y, dayIndex: CUM[m - 1]! + (d - 1) + (leap && m > 2 ? 1 : 0) };
}

/** Football age: age on September 1 of the season (D1.1.1). Day 243 of a common year is September 1. */
export function footballAge(birth: { seasonYear: number; dayIndex: number }, seasonYear: number): number {
  return seasonYear - birth.seasonYear - (birth.dayIndex > 243 ? 1 : 0);
}
