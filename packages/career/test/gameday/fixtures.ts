// Rule values for tests, as the caller would read them by key. Pro values match packages/rules-data
// (roster.active_limit 48 and so on) and the bible leaves for the requested keys (Rule 4-2-1 ten minutes and 15
// yards, Rule 4-2-2 three minutes, Rule 5-3-3 three designated, Rule 15-1-1(a) designee, nine plays per week).
// The college set has no active limit, no report deadline, no emergency quarterback, no designation, four captains.
import type { GameDayRules } from '../../src/gameday/index.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', '..', '..', 'rules-data', 'data');
type Row = { key: string; value: number | boolean };
const read = (f: string): Map<string, number | boolean> => new Map((JSON.parse(readFileSync(join(root, f), 'utf8')) as { values: Row[] }).values.map((r) => [r.key, r.value]));
const pro = read('pro_2026.json'), proLeague = read('league/proleague_2026.json'), col = read('college_2026.json');
const num = (m: Map<string, number | boolean>, k: string): number => { const v = m.get(k); if (typeof v !== 'number') throw new Error(`missing ${k}`); return v; };
const bool = (m: Map<string, number | boolean>, k: string): boolean => { const v = m.get(k); if (typeof v !== 'boolean') throw new Error(`missing ${k}`); return v; };

export const PRO: GameDayRules = {
  activeLimit: num(proLeague, 'roster.active_limit'),
  activeLimitShortLine: num(proLeague, 'roster.active_limit_short_line'),
  activeMinLinemen: num(proLeague, 'roster.active_min_linemen'),
  elevationsMaxPerGame: num(proLeague, 'roster.elevations_max_per_game'),
  reportDeadlineMin: num(proLeague, 'roster.inactives_due_minutes_before_kickoff'),
  emergencyQbActiveQbs: num(proLeague, 'roster.emergency_qb_active_qbs'),
  emergencyQbFromPracticeSquad: bool(proLeague, 'roster.emergency_qb_from_practice_squad'),
  radioAllowed: bool(pro, 'comm.c2p_allowed'),
  radioOnFieldOffense: num(pro, 'comm.c2p_receivers_offense'),
  radioOnFieldDefense: num(pro, 'comm.c2p_receivers_defense'),
  radioDesignatedOffense: 3,
  radioDesignatedDefense: 3,
  captainsMax: num(pro, 'toss.captains_max'),
  deferAllowed: bool(pro, 'toss.defer_allowed'),
  tossMinutesBefore: 3,
  fieldPresenceMin: 10,
  lateFieldPenaltyYd: 15,
  challengeDesigneeAllowed: true,
  halftimeMin: num(pro, 'clock.halftime_min'),
  endZoneDepthFt: 30,
  officiatingReviewMaxPlays: 9,
};

export const COLLEGE: GameDayRules = {
  ...PRO,
  activeLimit: null, activeLimitShortLine: null, activeMinLinemen: null, elevationsMaxPerGame: 0, reportDeadlineMin: null,
  emergencyQbActiveQbs: 0, emergencyQbFromPracticeSquad: false,
  radioAllowed: bool(col, 'comm.c2p_allowed'), radioOnFieldOffense: num(col, 'comm.c2p_receivers_offense'), radioOnFieldDefense: num(col, 'comm.c2p_receivers_defense'),
  radioDesignatedOffense: 0, radioDesignatedDefense: 0,
  captainsMax: num(col, 'toss.captains_max'), deferAllowed: bool(col, 'toss.defer_allowed'),
  fieldPresenceMin: 0, lateFieldPenaltyYd: 0, challengeDesigneeAllowed: false,
  halftimeMin: num(col, 'clock.halftime_min'), officiatingReviewMaxPlays: 0,
};

/** A deterministic uniform stream (LCG) for tests; the game passes engine-core streams. */
export function stream(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
