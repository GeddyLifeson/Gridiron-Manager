// Fixture rows for the tendency tests. Values are test fixtures, not facts.
import type { ChartedPlay } from '../../src/tendencies/index.ts';

let seq = 0;
export function play(o: Partial<ChartedPlay> = {}): ChartedPlay {
  seq++;
  const gameId = o.gameId ?? 1;
  return {
    ref: o.ref ?? `${gameId}:${seq}`, gameId, gameOrder: o.gameOrder ?? gameId, season: 1, index: seq,
    teamId: 10, opponentId: 20, side: 'offense', callerId: 7, source: 'own',
    down: 1, distanceYd: 10, yardsToGoalYd: 60, hash: 'middle', quarter: 1, clockTenths: 6000, scoreDiff: 0, afterEvent: 'none',
    personnel: '11', formation: 'trips_right', strength: 'right', motion: null, shotgun: true, tempo: 'huddle',
    playKind: 'run', runDirection: 'right', concept: 'inside_zone', protection: null,
    front: null, rushers: null, boxCount: null, coverageFamily: null, pressureDesign: null,
    yards: 4, success: true, forced: false, lookOnly: false,
    ...o,
  };
}

/** `n` rows of one kind and `m` of another, from one formation, spread over games 1..3. */
export function split(runs: number, passes: number, o: Partial<ChartedPlay> = {}): ChartedPlay[] {
  const out: ChartedPlay[] = [];
  for (let i = 0; i < runs; i++) out.push(play({ playKind: 'run', gameId: 1 + (i % 3), ...o }));
  for (let i = 0; i < passes; i++) out.push(play({ playKind: 'dropback_pass', runDirection: null, gameId: 1 + (i % 3), ...o }));
  return out;
}

export function defense(o: Partial<ChartedPlay> = {}): ChartedPlay {
  return play({ side: 'defense', playKind: 'dropback_pass', runDirection: null, front: 'over', rushers: 4, boxCount: 6, coverageFamily: 'cover3', ...o });
}
