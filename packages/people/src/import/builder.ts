// The built-in pack builder (D13.6.1 inputs): reads the CSV layout of the project's `data/people/` folder
// (README schema, built by tools/build_people.py from nflverse and cfbfastR-data) and writes a people pack.
// It runs on the user's own machine: the shipped game holds no real person (A6.3.2). Image and contract
// columns are never read (X14.4.1, U6.1.1 rule 1); headshot URLs in the source rows are ignored.
// Pure: the caller parses the files and hands rows in; a tool writes the pack files out.
import type { PackData, PackManifest, PackRow, PackTable } from '../pack/index.ts';
import { PACK_SCHEMA_ID, PACK_SCHEMA_VERSION, TABLE_BY_NAME } from '../pack/index.ts';

export type SourceRow = Readonly<Record<string, string>>;

export interface ProjectDataRows {
  nflPlayers?: readonly SourceRow[];
  nflPlayerSeasons?: readonly SourceRow[];
  nflSnapCounts?: readonly SourceRow[];
  nflHeadCoachSeasons?: readonly SourceRow[];
  nflOfficials?: readonly SourceRow[];
  collegePlayers?: readonly SourceRow[];
  collegeRosterSeasons?: readonly SourceRow[];
  /** CollegeFootballData coaches, already converted by `cfbdCoachRows` (needs a key; absent until Marlon provides one). */
  cfbdCoaches?: { people: PackRow[]; coachingSeasons: PackRow[] };
}

export interface BuildOptions {
  packId: string;
  name: string;
  version: string;
  author: string;
  /** Latest season the data describes (the world starts after it). */
  snapshotSeason: number;
  teamNames: 'plain' | 'omitted';
  /** Keep pro players whose last season is at least this (default: the snapshot season). */
  proMinLastSeason?: number;
  /** Keep college players whose last roster season is at least this (default: the snapshot season). */
  collegeMinLastSeason?: number;
  includeOfficials?: boolean;
  includeHeadCoaches?: boolean;
}

/** Statistic columns carried into `player_seasons` (the ones U3.1.3 production signals and the prior block read). */
export const STAT_COLUMNS: readonly string[] = [
  'attempts', 'completions', 'passing_yards', 'passing_tds', 'passing_interceptions', 'passing_epa',
  'carries', 'rushing_yards', 'rushing_tds', 'targets', 'receptions', 'receiving_yards', 'receiving_tds',
  'def_tackles_solo', 'def_sacks', 'def_qb_hits', 'def_interceptions', 'def_pass_defended',
  'fg_made', 'fg_att', 'pt_att', 'pt_net_yards',
];

const nonEmpty = (v: string | undefined) => v !== undefined && v !== '' && v !== 'NA' && v !== 'nan';
const intText = (v: string | undefined) => (nonEmpty(v) && Number.isFinite(Number(v)) ? String(Math.round(Number(v))) : '');
const numText = (v: string | undefined) => (nonEmpty(v) && Number.isFinite(Number(v)) ? String(Number(v)) : '');
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Splits "First Last Jr." into parts; the last word that is not a suffix is the last name. */
export function splitName(full: string): { first: string; last: string; suffix: string } {
  const parts = full.trim().split(/\s+/);
  const SUFFIX = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v']);
  let suffix = '';
  if (parts.length > 2 && SUFFIX.has(parts[parts.length - 1]!.toLowerCase())) suffix = parts.pop()!;
  const last = parts.length > 1 ? parts.pop()! : parts[0]!;
  return { first: parts.join(' ') || last, last, suffix };
}

function table(name: string, rows: PackRow[]): PackTable {
  const spec = TABLE_BY_NAME.get(name)!;
  const schemaCols = spec.columns.map((c) => c.name);
  const extra = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) if (!schemaCols.includes(k)) extra.add(k);
  const columns = [...schemaCols.filter((c) => rows.some((r) => nonEmpty(r[c]))), ...[...extra].sort()];
  for (const c of spec.columns) if (c.required && !columns.includes(c.name)) columns.splice(spec.columns.indexOf(c), 0, c.name);
  return { name, columns, rows };
}

/** Builds the pack. Every row is a real public fact from the source files; nothing is invented. */
export function buildProjectPack(src: ProjectDataRows, opt: BuildOptions): { pack: PackData; notes: string[] } {
  const notes: string[] = [];
  const people: PackRow[] = [], playing: PackRow[] = [], seasons: PackRow[] = [], coaching: PackRow[] = [], officials: PackRow[] = [];
  const proMin = opt.proMinLastSeason ?? opt.snapshotSeason;
  const colMin = opt.collegeMinLastSeason ?? opt.snapshotSeason;
  const seasonMax = opt.snapshotSeason;

  // ---- pro players ----
  const keptPro = new Map<string, SourceRow>();
  const byPfr = new Map<string, string>();
  for (const r of src.nflPlayers ?? []) {
    const id = r['gsis_id'];
    if (!nonEmpty(id) || !nonEmpty(r['last_name'])) continue;
    if (Number(r['last_season'] || 0) < proMin) continue;
    keptPro.set(id!, r);
    if (nonEmpty(r['pfr_id'])) byPfr.set(r['pfr_id']!, id!);
  }
  const altKeys = new Map<string, string[]>();
  for (const [id, r] of keptPro) {
    const key = `nfl:${id}`;
    people.push({ source_key: key, name_first: r['first_name'] || r['common_first_name'] || '', name_last: r['last_name']!, name_suffix: r['suffix'] ?? '', birth_date: nonEmpty(r['birth_date']) ? r['birth_date']! : '' });
    const tested = ['forty', 'bench', 'vertical', 'broad_jump', 'cone', 'shuttle'].some((c) => nonEmpty(r[c]));
    playing.push({
      source_key: key, position: r['position'] ?? '', height_in: numText(r['height']), weight_lb: numText(r['weight']),
      forty: numText(r['forty']), bench: intText(r['bench']), vertical: numText(r['vertical']), broad_jump: numText(r['broad_jump']),
      cone: numText(r['cone']), shuttle: numText(r['shuttle']), test_year: tested ? intText(r['draft_year'] || r['rookie_season']) : '',
      level: 'pro', years_exp: intText(r['years_of_experience']), draft_year: intText(r['draft_year']), draft_round: intText(r['draft_round']), draft_pick: intText(r['draft_pick']),
    });
  }

  // Snap shares per player-season from per-game percentages (regular season only).
  const teamGames = new Map<string, Set<string>>();
  const snapAgg = new Map<string, { off: number; def: number; st: number; pct: number; team: string }>();
  for (const r of src.nflSnapCounts ?? []) {
    if (r['game_type'] !== 'REG') continue;
    const tk = `${r['team']}|${r['season']}`;
    (teamGames.get(tk) ?? teamGames.set(tk, new Set()).get(tk)!).add(r['game_id']!);
    const gsis = byPfr.get(r['pfr_player_id'] ?? '');
    if (!gsis) continue;
    const k = `${gsis}|${r['season']}`;
    const a = snapAgg.get(k) ?? { off: 0, def: 0, st: 0, pct: 0, team: r['team']! };
    a.off += Number(r['offense_snaps'] || 0); a.def += Number(r['defense_snaps'] || 0); a.st += Number(r['st_snaps'] || 0);
    a.pct += Math.max(Number(r['offense_pct'] || 0), Number(r['defense_pct'] || 0));
    a.team = r['team']!;
    snapAgg.set(k, a);
  }
  for (const r of src.nflPlayerSeasons ?? []) {
    const id = r['player_id']!;
    if (!keptPro.has(id) || Number(r['season']) > seasonMax) continue;
    const row: PackRow = { source_key: `nfl:${id}`, season: intText(r['season']), level: 'pro', organisation: r['team'] ?? '', games: intText(r['games']) };
    for (const c of STAT_COLUMNS) if (nonEmpty(r[c])) row[c] = numText(r[c]);
    const sa = snapAgg.get(`${id}|${r['season']}`);
    if (sa) {
      row['snaps_off'] = String(sa.off); row['snaps_def'] = String(sa.def); row['snaps_st'] = String(sa.st);
      const g = teamGames.get(`${sa.team}|${r['season']}`)?.size ?? 0;
      if (g > 0) row['snap_share'] = String(Math.round((sa.pct / g) * 1000) / 1000);
    }
    seasons.push(row);
  }

  // ---- college players ----
  const rosterBy = new Map<string, SourceRow[]>();
  for (const r of src.collegeRosterSeasons ?? []) (rosterBy.get(r['athlete_id']!) ?? rosterBy.set(r['athlete_id']!, []).get(r['athlete_id']!)!).push(r);
  let merged = 0;
  for (const r of src.collegePlayers ?? []) {
    const id = r['athlete_id']!;
    const gsisHint = r['nfl_gsis_id_by_name_school'];
    const rows = (rosterBy.get(id) ?? []).filter((x) => Number(x['season']) <= seasonMax).sort((a, b) => Number(a['season']) - Number(b['season']));
    // A college player matched to a kept pro player is one person: his college seasons join the pro record.
    if (nonEmpty(gsisHint) && keptPro.has(gsisHint!)) {
      const rookie = Number(keptPro.get(gsisHint!)!['rookie_season'] || 9999);
      if (rows.length > 0 && Number(rows[rows.length - 1]!['season']) < rookie) {
        for (const x of rows) seasons.push({ source_key: `nfl:${gsisHint}`, season: intText(x['season']), level: 'college', organisation: x['team'] ?? '' });
        (altKeys.get(`nfl:${gsisHint}`) ?? altKeys.set(`nfl:${gsisHint}`, []).get(`nfl:${gsisHint}`)!).push(`cfb:${id}`);
        merged++;
        continue;
      }
    }
    if (Number(r['last_season'] || 0) < colMin || !nonEmpty(r['last_name'])) continue;
    const key = `cfb:${id}`;
    const latest = rows[rows.length - 1];
    people.push({ source_key: key, name_first: r['first_name'] ?? '', name_last: r['last_name']!, hometown_city: r['home_city'] ?? '', hometown_region: r['home_state'] ?? '', hometown_country: r['home_country'] ?? '', hometown_lat: numText(latest?.['home_latitude']), hometown_lon: numText(latest?.['home_longitude']) });
    const cls = latest?.['year'] ?? '';
    playing.push({ source_key: key, position: r['position'] ?? '', height_in: numText(r['height_in']), weight_lb: numText(r['weight_lb']), level: 'college', class_year: /^[1-6]$/.test(cls) ? cls : '' });
    for (const x of rows) seasons.push({ source_key: key, season: intText(x['season']), level: 'college', organisation: x['team'] ?? '' });
  }
  if (merged > 0) notes.push(`${merged} college players matched to a kept pro player by name and school (approximate, README) and merged into the pro record`);
  for (const p of people) { const a = altKeys.get(p['source_key']!); if (a) p['alt_keys'] = a.join('|'); }

  // ---- head coaches ----
  if (opt.includeHeadCoaches !== false) {
    const agg = new Map<string, PackRow>();
    const coachKeys = new Set<string>();
    for (const r of src.nflHeadCoachSeasons ?? []) {
      if (r['game_type'] !== 'REG' || Number(r['season']) > seasonMax) continue;
      const key = `nflhc:${slug(r['coach']!)}`;
      const k = `${key}|${r['team']}|${r['season']}`;
      const a = agg.get(k) ?? { source_key: key, season: intText(r['season']), level: 'pro', organisation: r['team'] ?? '', role: 'head coach', games: '0', wins: '0', losses: '0', ties: '0' };
      for (const c of ['games', 'wins', 'losses', 'ties']) a[c] = String(Number(a[c]) + Number(r[c] || 0));
      agg.set(k, a);
      if (!coachKeys.has(key)) {
        coachKeys.add(key);
        const n = splitName(r['coach']!);
        people.push({ source_key: key, name_first: n.first, name_last: n.last, name_suffix: n.suffix });
      }
    }
    coaching.push(...agg.values());
  }
  if (src.cfbdCoaches) {
    people.push(...src.cfbdCoaches.people);
    coaching.push(...src.cfbdCoaches.coachingSeasons.filter((r) => Number(r['season']) <= seasonMax));
  } else notes.push('college head coaches: none (CollegeFootballData key not provided; U1.1.1 gap)');

  // ---- officials ----
  if (opt.includeOfficials !== false) {
    for (const r of src.nflOfficials ?? []) {
      if (!nonEmpty(r['official_id']) || !nonEmpty(r['official_name'])) continue;
      const key = `nfloff:${intText(r['official_id'])}`;
      const n = splitName(r['official_name']!);
      people.push({ source_key: key, name_first: n.first, name_last: n.last, name_suffix: n.suffix });
      const pos = (r['positions'] ?? '').split('|')[0] ?? '';
      // The source gives first and last season and a career game count, not per-season games: two dated rows, no invented seasons.
      const first = intText(r['first_season']), last = intText(r['last_season']);
      if (first) officials.push({ source_key: key, season: first, position: pos });
      if (last && last !== first && Number(last) <= seasonMax) officials.push({ source_key: key, season: last, position: pos });
    }
  }

  const manifest: PackManifest = {
    schema_id: PACK_SCHEMA_ID, schema_version: PACK_SCHEMA_VERSION, pack_id: opt.packId, name: opt.name, version: opt.version, author: opt.author,
    contains: 'real', source_statement: 'Built on the user\'s machine from the project data folder (nflverse-data releases, CC-BY style; sportsdataverse cfbfastR-data rosters). Football facts only.',
    snapshot_date: `${opt.snapshotSeason}-12-31`, team_names: opt.teamNames, redistribution: 'no',
    seasons_covered: 'pro players 1999 on, snaps 2012 on, college rosters 2010 on, pro head coaches 1999 on',
  };
  const tables: Record<string, PackTable> = { people: table('people', people), playing: table('playing', playing) };
  if (seasons.length) tables['player_seasons'] = table('player_seasons', seasons);
  if (coaching.length) tables['coaching_seasons'] = table('coaching_seasons', coaching);
  if (officials.length) tables['official_seasons'] = table('official_seasons', officials);
  return { pack: { manifest, tables }, notes };
}
