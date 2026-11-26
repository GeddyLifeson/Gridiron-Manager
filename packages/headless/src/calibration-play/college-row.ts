// College play-by-play as `PlayByPlayRow` (WP-26; Q2.1.1: no college cell is filled from a pro value).
// Source: the cfbfastR play-by-play release of sportsdataverse-data (`cfbfastR_cfb_pbp`, CSV per season,
// no key needed), regular season, games between two top-subdivision teams. Conventions below were read off
// the 2023 to 2025 files themselves (counts in data/README.md), not written from memory:
//   - A scrimmage play is a row with `rush` = 1 or `pass` = 1. `Penalty` rows (no-play fouls, false starts,
//     and a second row of an enforced foul), `Timeout` rows and kick rows are not plays here. 53 of 99,255 rows
//     in 2024 are flagged `penalty_no_play`; they are dropped. Rows repeat a (game, play number) pair 45 times
//     in 2024; the first is kept.
//   - `pass` = 1 covers completions, incompletions, sacks and interceptions; `sack`, `completion` and `int` flag them.
//   - On a play with an accepted foul `yards_gained` includes the foul yards; the play's own yards are
//     `yards_gained - yds_penalty` (checked on rows where `yds_rushed` or `yds_receiving` is present).
//   - Kneel-downs and spikes are found only in `play_text` ("kneel", "spike"); they become kneel and spike rows.
//   - Scrambles are coded as ordinary rushes (63 of 50,418 rushes in 2024 say "scrambles"), so `scramble` is
//     false everywhere and no scramble cell is built.
//   - The file holds no air yards, pass direction, run direction, shotgun, personnel, box, rushers, coverage,
//     pressure, play action or motion. Those row fields stay neutral and no cell may read them.
import type { PlayByPlayRow } from '@gm/schema';
import { readFileSync } from 'node:fs';
import { readCsv, type CsvRecord } from './csv.ts';
import type { SeasonRows } from './files.ts';

export const COLLEGE_COLUMNS: readonly string[] = [
  'game_id', 'game_play_number', 'season_type', 'home_team_division', 'away_team_division', 'home_team', 'pos_team', 'period', 'clock_minutes',
  'clock_seconds', 'play_type', 'play_text', 'down', 'distance', 'yards_to_goal', 'yards_gained', 'yds_penalty', 'rush', 'pass', 'completion', 'sack',
  'int', 'rush_td', 'pass_td', 'penalty_flag', 'penalty_declined', 'penalty_no_play', 'firstD_by_yards', 'firstD_by_penalty', 'fumble_vec',
  'Goal_To_Go', 'pos_team_score', 'def_pos_team_score', 'drive_number',
];

const flag = (v: string | undefined): boolean => v === 'True' || v === 'TRUE' || v === 'true' || v === '1' || v === '1.0';
const num = (v: string | undefined): number | null => {
  if (v === undefined || v === '' || v === 'NA') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** One college row as a `PlayByPlayRow`, or null when it is not a counted scrimmage play. Side 0 is the home team. */
export function rowFromCollege(c: CsvRecord, ids: { gameId: number; playIndex: number }): PlayByPlayRow | null {
  const rush = flag(c['rush']), pass = flag(c['pass']);
  if (!rush && !pass) return null;
  if (flag(c['penalty_no_play'])) return null;
  const type = c['play_type'] ?? '';
  if (type.startsWith('Two Point') || type.startsWith('Defensive 2pt')) return null;
  const text = (c['play_text'] ?? '').toLowerCase();
  const sack = pass && flag(c['sack']);
  const interception = pass && (flag(c['int']) || type.startsWith('Interception'));
  const fumbleLost = type.startsWith('Fumble Recovery (Opponent)');
  const complete = pass && flag(c['completion']);
  const kneel = rush && /\bkneel/.test(text);
  const spike = pass && /\bspike/.test(text);
  const resultType: PlayByPlayRow['resultType'] = kneel ? 'kneel' : spike ? 'spike' : sack ? 'sack' : interception ? 'interception' : fumbleLost ? 'fumble_lost' : pass ? (complete ? 'pass_complete' : 'pass_incomplete') : 'run';
  const accepted = flag(c['penalty_flag']) && !flag(c['penalty_declined']);
  const raw = num(c['yards_gained']) ?? 0;
  const penaltyYards = accepted ? (num(c['yds_penalty']) ?? 0) : 0;
  const yards = raw - penaltyYards;
  const down = num(c['down']);
  const seconds = (num(c['clock_minutes']) ?? 0) * 60 + (num(c['clock_seconds']) ?? 0);
  const toGoal = num(c['yards_to_goal']) ?? 0;
  const touchdown = flag(c['rush_td']) || flag(c['pass_td']);
  return {
    gameId: ids.gameId, playIndex: ids.playIndex, driveNumber: Math.max(0, Math.trunc(num(c['drive_number']) ?? 0)),
    period: Math.max(1, Math.trunc(num(c['period']) ?? 1)), clockTenths: Math.max(0, Math.round(seconds * 10)),
    offense: c['pos_team'] === c['home_team'] ? 0 : 1, playKind: 'scrimmage', down: down !== null && down >= 1 ? down : null, distanceYd: num(c['distance']),
    ballOnYd: 100 - toGoal, yardsToGoalYd: toGoal, goalToGo: flag(c['Goal_To_Go']),
    scoreOffense: Math.max(0, num(c['pos_team_score']) ?? 0), scoreDefense: Math.max(0, num(c['def_pos_team_score']) ?? 0),
    resultType, noPlay: false, offenseKind: null, kickKind: null,
    dropback: pass && !spike, scramble: false, shotgun: false, noHuddle: false, playAction: false, motion: false, personnelCode: null,
    yardsGained: sack ? Math.min(0, yards) : yards, airYd: null, yardsAfterCatch: complete && fumbleLost ? 0 : null, passLocation: null, runLocation: null,
    rushers: null, boxCount: null, coverageFamily: null, pressure: false, sack, interception, fumbleLost, touchdown,
    firstDown: flag(c['firstD_by_yards']) || flag(c['firstD_by_penalty']), kickDistanceYd: null,
    penalties: [], snapToSnapTenths: null, epBefore: null, epAfter: null, textKey: 'public', textParams: {},
  };
}

/** Reads one college season file (regular season, two top-subdivision teams), rows in file order per game. */
export function readCollegeSeason(path: string, season: number, firstGameId: number): SeasonRows {
  const byGame = new Map<string, { id: number; n: number; seen: Set<string> }>();
  const rows: PlayByPlayRow[] = [];
  const { missing } = readCsv(readFileSync(path), COLLEGE_COLUMNS, (c) => {
    if (c['season_type'] !== 'regular' || c['home_team_division'] !== 'fbs' || c['away_team_division'] !== 'fbs') return;
    let g = byGame.get(c['game_id']!);
    if (!g) { g = { id: firstGameId + byGame.size, n: 0, seen: new Set() }; byGame.set(c['game_id']!, g); }
    const row = rowFromCollege(c, { gameId: g.id, playIndex: g.n + 1 });
    if (!row) return;
    const key = c['game_play_number'] ?? '';
    if (key !== '' && g.seen.has(key)) return;
    g.seen.add(key);
    g.n++;
    rows.push(row);
  });
  if (missing.length) throw new Error(`${path}: missing columns ${missing.join(', ')}`);
  return { season, games: byGame.size, rows };
}
