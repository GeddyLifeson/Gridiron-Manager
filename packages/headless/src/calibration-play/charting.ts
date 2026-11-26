// Charted fields of real plays (WP-26; J11.9.1, J15.4.2). Two public collections chart what the base
// play-by-play does not: the nflverse participation file (personnel, box count, pass rushers, pressure,
// coverage) and the FTN charting file (play action, motion, and a second box count and rusher count).
// Both are joined to the play-by-play on game id and play id. Conventions below were read off the
// 2022 to 2024 files and the nflreadr data dictionaries (see data/README.md for the counts):
//   - number_of_pass_rushers is charted on dropbacks. 0 on a dropback, and the two values 44 and 45, are
//     not rushers counts (no real play has none or 44); they are read as "not charted".
//   - defenders_in_box of 0 is likewise "not charted"; 1 to 11 are counts.
//   - 2022 participation rows hold NA outside pass plays; 2023 and 2024 hold 0.
//   - offense_personnel is "n RB, n TE, n WR" in 2022 and a full position list in 2023 and 2024
//     (C, G, T, QB, RB, FB, TE, WR). A fullback counts as a back. The code is backs then tight ends and is
//     read only when backs + tight ends + receivers = 5 (the eligible count of stats.personnel.eligibleCount).
//   - defense_coverage_type: COVER_0, COVER_1, COVER_2, COVER_3, COVER_4, COVER_6, 2_MAN map to the row's
//     families; COVER_9, COMBO, BLOWN and PREVENT map to `other`.
//   - FTN is_play_action and is_motion are TRUE or FALSE for every play the FTN file holds.
import type { PlayByPlayRow } from '@gm/schema';
import { readFileSync } from 'node:fs';
import { readCsv } from './csv.ts';

export const PARTICIPATION_COLUMNS: readonly string[] = [
  'nflverse_game_id', 'play_id', 'offense_personnel', 'defenders_in_box', 'number_of_pass_rushers', 'was_pressure', 'defense_coverage_type',
];
export const FTN_COLUMNS: readonly string[] = ['nflverse_game_id', 'nflverse_play_id', 'n_defense_box', 'n_pass_rushers', 'is_motion', 'is_play_action'];

/** Charted facts of one play; null where the collection holds no usable value. */
export interface ChartedPlay {
  readonly personnelCode: string | null;
  readonly boxCount: number | null;
  readonly rushers: number | null;
  readonly pressure: boolean | null;
  readonly coverageFamily: PlayByPlayRow['coverageFamily'];
  /** Null when the FTN file has no record of the play. */
  readonly playAction: boolean | null;
  readonly motion: boolean | null;
}

/** Same play as the second chart saw it (FTN's own box and rusher counts), for the cross-check only. */
export interface SecondChart { readonly boxCount: number | null; readonly rushers: number | null }

const knownBool = (v: string | undefined): boolean | null => (v === 'TRUE' || v === 'true' || v === 'True' || v === '1' ? true : v === 'FALSE' || v === 'false' || v === 'False' || v === '0' ? false : null);
const count = (v: string | undefined, max: number): number | null => {
  if (v === undefined || v === '' || v === 'NA') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= max ? n : null;
};

const COVERAGE: Readonly<Record<string, NonNullable<PlayByPlayRow['coverageFamily']>>> = {
  COVER_0: 'cover0', COVER_1: 'cover1', COVER_2: 'cover2', COVER_3: 'cover3', COVER_4: 'cover4', COVER_6: 'cover6', '2_MAN': 'two_man',
  COVER_9: 'other', COMBO: 'other', BLOWN: 'other', PREVENT: 'other',
};

/** Personnel code "BT" (backs, tight ends) from a participation string, or null when it does not describe five eligibles. */
export function personnelFromParticipation(s: string | undefined): string | null {
  if (s === undefined || s === '' || s === 'NA') return null;
  let backs = 0, tight = 0, wide = 0;
  for (const part of s.split(', ')) {
    const m = /^(\d+) ([A-Z]+)$/.exec(part.trim());
    if (!m) continue;
    const n = Number(m[1]);
    if (m[2] === 'RB' || m[2] === 'FB') backs += n;
    else if (m[2] === 'TE') tight += n;
    else if (m[2] === 'WR') wide += n;
  }
  return backs + tight + wide === 5 && backs <= 9 && tight <= 9 ? `${backs}${tight}` : null;
}

export interface ChartCounts {
  readonly participationRows: number;
  readonly ftnRows: number;
}

export interface ChartSeason {
  readonly season: number;
  readonly byPlay: ReadonlyMap<string, ChartedPlay>;
  readonly second: ReadonlyMap<string, SecondChart>;
  readonly counts: ChartCounts;
}

export const playKey = (gameId: string, playId: string): string => `${gameId}|${playId}`;

/** Reads one season's participation and FTN files into per-play charts. */
export function readChartSeason(participationPath: string, ftnPath: string, season: number): ChartSeason {
  const part = new Map<string, Omit<ChartedPlay, 'playAction' | 'motion'>>();
  const ftn = new Map<string, { playAction: boolean | null; motion: boolean | null } & SecondChart>();
  const a = readCsv(readFileSync(participationPath), PARTICIPATION_COLUMNS, (c) => {
    const pressure = knownBool(c['was_pressure']);
    part.set(playKey(c['nflverse_game_id']!, c['play_id']!), {
      personnelCode: personnelFromParticipation(c['offense_personnel']), boxCount: count(c['defenders_in_box'], 11), rushers: count(c['number_of_pass_rushers'], 11),
      pressure, coverageFamily: COVERAGE[c['defense_coverage_type'] ?? ''] ?? null,
    });
  });
  if (a.missing.length) throw new Error(`${participationPath}: missing columns ${a.missing.join(', ')}`);
  const b = readCsv(readFileSync(ftnPath), FTN_COLUMNS, (c) => {
    ftn.set(playKey(c['nflverse_game_id']!, c['nflverse_play_id']!), {
      playAction: knownBool(c['is_play_action']), motion: knownBool(c['is_motion']), boxCount: count(c['n_defense_box'], 11), rushers: count(c['n_pass_rushers'], 11),
    });
  });
  if (b.missing.length) throw new Error(`${ftnPath}: missing columns ${b.missing.join(', ')}`);
  const byPlay = new Map<string, ChartedPlay>();
  for (const [k, p] of part) {
    const f = ftn.get(k);
    byPlay.set(k, { ...p, playAction: f?.playAction ?? null, motion: f?.motion ?? null });
  }
  for (const [k, f] of ftn) if (!byPlay.has(k)) byPlay.set(k, { personnelCode: null, boxCount: null, rushers: null, pressure: null, coverageFamily: null, playAction: f.playAction, motion: f.motion });
  const second = new Map<string, SecondChart>([...ftn].map(([k, f]) => [k, { boxCount: f.boxCount, rushers: f.rushers }]));
  return { season, byPlay, second, counts: { participationRows: a.rows, ftnRows: b.rows } };
}

/** Applies a play's chart to a row. The base row's neutral values stay wherever the chart has nothing. */
export function applyChart(row: PlayByPlayRow, chart: ChartedPlay | undefined): PlayByPlayRow {
  if (chart === undefined) return row;
  // A dropback is charted when both its rusher count and its pressure flag are known; otherwise neither is
  // set, so "rushers is not null" means "charted" on real rows and on simulated rows alike.
  const chartedDropback = row.dropback && chart.rushers !== null && chart.pressure !== null;
  return {
    ...row,
    personnelCode: chart.personnelCode,
    boxCount: chart.boxCount,
    rushers: chartedDropback ? chart.rushers : null,
    pressure: chartedDropback ? chart.pressure === true : false,
    coverageFamily: row.dropback ? chart.coverageFamily : null,
    playAction: chart.playAction === true,
    motion: chart.motion === true,
  };
}
