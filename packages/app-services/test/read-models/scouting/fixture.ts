// Scouting read-model fixtures: charted plays for HOME (own call log) and AWAY (HOME's staff charting),
// and the observer fixture world with positions, depth charts and HOME's estimates of AWAY's players.
// Every count, grade and estimate here is a made-up test number, not a football fact.
import type { tendencies as td } from '@gm/models';
import { scouting as sc } from '@gm/people';
import { fixtureTables, HOME, AWAY, HOME_PLAYERS, AWAY_PLAYERS } from '../../observer/fixture-world.ts';

export const SEASON = 2030;
const DATE = { seasonYear: SEASON, dayIndex: 10 };

let seq = 0;
export function play(o: Partial<td.ChartedPlay> = {}): td.ChartedPlay {
  seq++;
  const gameId = o.gameId ?? 1;
  return {
    ref: o.ref ?? `${gameId}:${seq}`, gameId, gameOrder: o.gameOrder ?? gameId, season: SEASON, index: seq,
    teamId: HOME, opponentId: AWAY, side: 'offense', callerId: 1, source: 'own',
    down: 1, distanceYd: 10, yardsToGoalYd: 60, hash: 'middle', quarter: 1, clockTenths: 6000, scoreDiff: 0, afterEvent: 'none',
    personnel: '11', formation: 'trips_right', strength: 'right', motion: null, shotgun: true, tempo: 'huddle',
    playKind: 'run', runDirection: 'right', concept: 'inside_zone', protection: null,
    front: null, rushers: null, boxCount: null, coverageFamily: null, pressureDesign: null,
    yards: 4, success: true, forced: false, lookOnly: false,
    ...o,
  };
}

/** HOME's own log (same refs on every call, so a rebuild is identical): five games, first downs 3 runs to 1 pass, third-and-long all passes. */
export function homeLog(): td.ChartedPlay[] {
  seq = 0;
  const out: td.ChartedPlay[] = [];
  for (let g = 1; g <= 5; g++) {
    for (let i = 0; i < 6; i++) out.push(play({ gameId: g, playKind: 'run' }));
    for (let i = 0; i < 2; i++) out.push(play({ gameId: g, playKind: 'dropback_pass', runDirection: null }));
    for (let i = 0; i < 3; i++) out.push(play({ gameId: g, down: 3, distanceYd: 9, playKind: 'dropback_pass', runDirection: null }));
  }
  return out;
}

/** AWAY as HOME's staff charted it, plus one 'own' AWAY row that must never be shown (a truth leak). */
export function awayCharted(): td.ChartedPlay[] {
  seq = 1000;
  const out: td.ChartedPlay[] = [];
  for (let g = 11; g <= 14; g++) {
    for (let i = 0; i < 5; i++) out.push(play({ gameId: g, teamId: AWAY, opponentId: HOME, source: 'charted', formation: 'ace', playKind: 'dropback_pass', runDirection: null }));
    for (let i = 0; i < 3; i++) out.push(play({ gameId: g, teamId: AWAY, opponentId: HOME, source: 'charted', formation: 'ace', playKind: 'run' }));
  }
  out.push(play({ gameId: 14, teamId: AWAY, opponentId: HOME, source: 'own', formation: 'secret_truth_formation' }));
  return out;
}

/** Positions for the report (AWAY: two linemen, two defensive backs, a passer, an edge). */
export const POSITIONS: Readonly<Record<number, string>> = {
  101: 'QB', 102: 'OT', 103: 'CB', 104: 'RB', 105: 'S', 106: 'IOL',
  107: 'OT', 108: 'IOL', 109: 'CB', 110: 'S', 111: 'QB', 112: 'EDGE',
};

export function tables(): Record<string, unknown[]> {
  const t = fixtureTables();
  const people = (t.people as Record<string, unknown>[]).map((p) => {
    const pos = POSITIONS[p.id as number];
    return pos ? { ...p, playing: { ...(p.playing as object), position: pos } } : p;
  });
  // HOME has no PersonView rows for AWAY players: its grades of them come from the estimate store.
  const personViews = (t.personViews as { observerTeamId: number; personId: number }[]).filter((v) => !(v.observerTeamId === HOME && AWAY_PLAYERS.includes(v.personId)));
  const depthCharts = [
    { teamId: AWAY, unitId: 'off:base', roles: { LT: [107], LG: [108], QB: [111] }, rotation: [] },
    { teamId: AWAY, unitId: 'def:base', roles: { CB1: [109], FS: [110], DE: [112] }, rotation: [] },
    { teamId: AWAY, unitId: 'st:punt', roles: { PP: [108] }, rotation: [] },
    { teamId: HOME, unitId: 'off:base', roles: { QB: [101, 104], LT: [102], LG: [106] }, rotation: [] },
    { teamId: HOME, unitId: 'def:base', roles: { CB1: [103], FS: [105] }, rotation: [] },
  ];
  return { ...t, people, personViews, depthCharts };
}

const STAFF: sc.Contributor = { id: 21, line: 'own_staff' };

/** A watched estimate (the club's belief, never the truth). */
export function estimate(mean: number, variance = 25, evidenceCount = 120): sc.Estimate {
  return { mean, variance, noiseVariance: variance, evidenceCount, lastEvidence: DATE, agedTo: DATE, contributors: [STAFF], publicOnly: false };
}

const group = (g: string, mean: number, variance?: number): Record<string, sc.Estimate> =>
  Object.fromEntries(groupIds(g).map((a) => [a, estimate(mean, variance)]));
const groupIds = (g: string): readonly string[] => ({
  ol_pass: ['pass_set', 'anchor', 'mirror', 'hand_use_in_protection', 'stunt_pickup'],
  coverage: ['press_technique', 'backpedal_and_transition', 'man_coverage_off', 'zone_coverage'],
  qb: ['arm_strength', 'accuracy_short', 'accuracy_deep'],
  edge: ['speed_rush_and_bend', 'speed_to_power'],
} as Record<string, string[]>)[g]!;

/** HOME's book on AWAY's players. 107 out-grades 108 in protection; 109 out-grades 110 in coverage. */
export const AWAY_BOOK: Readonly<Record<number, Record<string, sc.Estimate>>> = {
  107: { ...group('ol_pass', 60), pass_set: estimate(66) },
  108: group('ol_pass', 45),
  109: group('coverage', 70),
  110: group('coverage', 55),
  111: group('qb', 75),
  112: group('edge', 50),
};

export const store = (book: Readonly<Record<number, Record<string, sc.Estimate>>> = AWAY_BOOK) =>
  (clubId: number, personId: number) => (clubId === HOME ? book[personId] ?? null : null);

export { HOME, AWAY, HOME_PLAYERS, AWAY_PLAYERS };
