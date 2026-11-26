// Synthetic packs for the import tests. Every name here is made up (A6.3.2 rule 1: test packs are synthetic).
import type { PackFile } from '../../src/pack/index.ts';

const ENC = new TextEncoder();
export const file = (path: string, text: string): PackFile => ({ path, bytes: ENC.encode(text) });
const csv = (header: string[], rows: (string | number)[][]) => `${header.join(',')}\n${rows.map((r) => r.join(',')).join('\n')}\n`;

export const manifest = (extra: Record<string, unknown> = {}) => JSON.stringify({
  schema_id: 'people_pack', schema_version: 1, pack_id: 'synthetic', name: 'Synthetic test pack', version: '1', author: 'tests',
  contains: 'real', source_statement: 'synthetic rows made by the test suite', team_names: 'omitted', ...extra,
});

export interface SynthOptions { starters?: number; extra?: Record<string, unknown>; overrides?: boolean }

/**
 * A small world's worth of made-up people: a starting quarterback with a full test battery, `starters` linebackers
 * who start every game for three seasons, a one-game reserve, college players, a head coach who coached the
 * quarterback, an official and a stated family link.
 */
export function synthPack(o: SynthOptions = {}): PackFile[] {
  const n = o.starters ?? 40;
  const people: (string | number)[][] = [
    ['q1', 'Testa', 'Quill', '1997-03-14', 'Townville', 'TS'],
    ['r1', 'Ressa', 'Benchley', '2000-10-02', '', ''],
    ['c1', 'Coachy', 'Mentor', '1970-06-01', '', ''],
    ['o1', 'Offy', 'Whistle', '', '', ''],
    ['u1', 'Collie', 'Freshman', '', 'Smalltown', 'SM'],
    ['u2', 'Collie', 'Senior', '', '', ''],
    ['f1', 'Fam', 'Quill', '1999-01-01', '', ''],
  ];
  const playing: (string | number)[][] = [
    ['q1', 'QB', 75, 220, 4.72, '', 31, 115, 7.0, 4.3, 2019, 'pro', '', 5, 2019, 1, 10],
    ['r1', 'LB', 73, 235, '', '', '', '', '', '', '', 'pro', '', 1, '', '', ''],
    ['u1', 'WR', 72, 185, '', '', '', '', '', '', '', 'college', '1', '', '', '', ''],
    ['u2', 'OT', 78, 305, '', '', '', '', '', '', '', 'college', '4', '', '', '', ''],
    ['f1', 'CB', 71, 190, 4.45, '', 37, 124, '', '', 2021, 'pro', '', 3, 2021, 3, 80],
  ];
  const seasons: (string | number)[][] = [
    ['q1', 2022, 'pro', 'Alpha', 17, 17, 0.98, 550, 3800, 25],
    ['q1', 2023, 'pro', 'Alpha', 17, 17, 0.99, 560, 4000, 30],
    ['q1', 2024, 'pro', 'Alpha', 17, 17, 1.0, 580, 4200, 40],
    ['q1', 2025, 'pro', 'Alpha', 17, 17, 1.0, 590, 4300, 45],
    ['r1', 2024, 'pro', 'Beta', 1, 0, 0.02, '', '', ''],
    ['f1', 2023, 'pro', 'Alpha', 17, 10, 0.6, '', '', ''],
    ['f1', 2024, 'pro', 'Alpha', 17, 12, 0.7, '', '', ''],
    ['u1', 2024, 'college', 'Gamma', '', '', '', '', '', ''],
    ['u2', 2023, 'college', 'Gamma', '', '', '', '', '', ''],
    ['u2', 2024, 'college', 'Gamma', '', '', '', '', '', ''],
  ];
  for (let i = 0; i < n; i++) {
    const k = `lb${String(i).padStart(3, '0')}`;
    people.push([k, `Line${i}`, `Backer${i}`, '1996-05-05', '', '']);
    playing.push([k, 'LB', 74, 240, '', '', '', '', '', '', '', 'pro', '', 6, '', '', '']);
    for (const y of [2022, 2023, 2024]) seasons.push([k, y, 'pro', i % 2 ? 'Alpha' : 'Beta', 17, 17, 0.95, '', '', '']);
  }
  const files = [
    file('pack.json', manifest(o.extra)),
    file('people.csv', csv(['source_key', 'name_first', 'name_last', 'birth_date', 'hometown_city', 'hometown_region'], people)),
    file('playing.csv', csv(['source_key', 'position', 'height_in', 'weight_lb', 'forty', 'bench', 'vertical', 'broad_jump', 'cone', 'shuttle', 'test_year', 'level', 'class_year', 'years_exp', 'draft_year', 'draft_round', 'draft_pick'], playing)),
    file('player_seasons.csv', csv(['source_key', 'season', 'level', 'organisation', 'games', 'starts', 'snap_share', 'attempts', 'passing_yards', 'passing_epa'], seasons)),
    file('coaching_seasons.csv', csv(['source_key', 'season', 'level', 'organisation', 'role', 'games', 'wins', 'losses', 'ties'], [
      ['c1', 2023, 'pro', 'Alpha', 'head coach', 17, 10, 7, 0], ['c1', 2024, 'pro', 'Alpha', 'head coach', 17, 12, 5, 0],
    ])),
    file('official_seasons.csv', csv(['source_key', 'season', 'position', 'games'], [['o1', 2015, 'Referee', ''], ['o1', 2024, 'Referee', '']])),
    file('links.csv', csv(['source_key_a', 'source_key_b', 'kind'], [['q1', 'f1', 'family']])),
  ];
  if (o.overrides) files.push(file('overrides.csv', csv(['source_key', 'attribute', 'value'], [['q1', 'arm_strength', 77]])));
  return files;
}
