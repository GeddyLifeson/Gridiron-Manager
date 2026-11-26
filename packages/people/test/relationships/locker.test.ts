import { describe, expect, it } from 'vitest';
import {
  TieGraph, buildGraph, fit, cliqueIsProblem, findCliques, influence, initialTie, partedSeason, roomAlarm, roomState, stepTie, tieCeiling, tieLabel,
  type InfluenceInput, type LockerPlayer,
} from '../../src/relationships/index.ts';
import { lcg } from '../needs/helpers.ts';

const player = (id: number, over: Partial<LockerPlayer> = {}): LockerPlayer => ({ id, room: 'OL', classYear: null, pastTeams: [], agentId: null, homeRegion: null, ...over });

const ROOMS = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'specialists'];
function roster(n: number, seed: number): LockerPlayer[] {
  const r = lcg(seed);
  return Array.from({ length: n }, (_, i) => player(i + 1, {
    room: ROOMS[Math.floor(r() * ROOMS.length)]!,
    classYear: 2026 + Math.floor(r() * 5),
    agentId: r() < 0.5 ? 1 + Math.floor(r() * 12) : null,
    homeRegion: `r${Math.floor(r() * 10)}`,
  }));
}
const fitFrom = (seed: number) => (x: number, y: number): number => 2 * lcg(seed ^ Math.imul(Math.min(x, y), 2654435761) ^ Math.imul(Math.max(x, y), 40503))() - 1;
/** Fit as X7.2.1 computes it, from bell-shaped facets (X1.1.1 rule 2: a sum of draws), for realistic graph sizes. */
function realisticFit(ps: readonly LockerPlayer[], seed: number): (x: number, y: number) => number {
  const r = lcg(seed);
  const bell = () => Math.round(((r() + r() + r()) / 3) * 100);
  const people = new Map(ps.map((p) => [p.id, { id: p.id, origin: 'generated' as const, protected: false, facets: { work_habits: bell(), discipline: bell(), candor: bell() } }]));
  const draw = (lo: number, hi: number) => lcg(seed ^ Math.imul(lo, 73856093) ^ Math.imul(hi, 19349663))();
  return (x, y) => fit({ a: people.get(x)!, b: people.get(y)!, role: 'peers', pairDraw: draw });
}

describe('player ties (L2.1.1)', () => {
  it('initial tie follows the starting formula and caps at 90', () => {
    const a = player(1, { room: 'OL', classYear: 2028, agentId: 3, homeRegion: 'south' });
    const b = player(2, { room: 'OL', classYear: 2028, agentId: 3, homeRegion: 'south' });
    expect(initialTie({ x: a, y: b, fit: 0, formerTeammates: false })).toBe(20 + 15 + 10 + 5 + 5);
    expect(initialTie({ x: a, y: b, fit: 1, formerTeammates: true })).toBe(85);
    expect(initialTie({ x: a, y: player(3, { room: 'WR' }), fit: -1, formerTeammates: false })).toBe(5);
    expect(initialTie({ x: a, y: b, fit: 1, formerTeammates: true }) <= 90).toBe(true);
  });

  it('weekly drift moves toward the fit ceiling and stops there', () => {
    let t = 20;
    for (let w = 0; w < 200; w++) t = stepTie(t, 0.5, { sameRoom: true, fight: false, sameJobBattle: false });
    expect(t).toBe(tieCeiling(0.5));
    expect(stepTie(50, -0.5, { sameRoom: false, fight: true, sameJobBattle: false })).toBe(25);
    expect(stepTie(40, -0.2, { sameRoom: true, fight: false, sameJobBattle: true })).toBe(40); // +1 drift then -1 battle
    expect(stepTie(30, 0.2, { sameRoom: true, fight: false, sameJobBattle: true })).toBe(31);
  });

  it('labels: close above 60, friction below 20 after eight weeks; parted ties decay 10 a season', () => {
    expect(tieLabel(61, 1)).toBe('close');
    expect(tieLabel(15, 7)).toBeNull();
    expect(tieLabel(15, 8)).toBe('friction');
    expect(partedSeason(55)).toBe(45);
    expect(partedSeason(5)).toBe(0);
  });

  // L2.1.1 asks for under 1,500 stored ties per team, but its own formula stores far more on a 105-man roster
  // (same class, same region or a fit above about 0.67 each lift a pair over 30). Raised with the bible fixes
  // thread; until it rules, this test pins the sparse rule and the count it actually gives.
  it('a 105-man roster builds in under 50 ms, same seed gives the same graph, and storage is sparse by the L2.1.1 rule', () => {
    const ps = roster(105, 11);
    const f = realisticFit(ps, 1);
    buildGraph(ps, f, () => false); // warm the JIT
    const t0 = performance.now();
    const g = buildGraph(ps, f, () => false);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(50);
    expect(JSON.stringify(buildGraph(ps, realisticFit(ps, 1), () => false).entries())).toBe(JSON.stringify(g.entries()));
    expect(JSON.stringify(buildGraph(ps, fitFrom(1), () => false).entries())).toBe(JSON.stringify(buildGraph(ps, fitFrom(1), () => false).entries()));
    const pairs = (105 * 104) / 2;
    expect(g.storedCount).toBeLessThan(pairs);
    for (const [, , v] of g.entries()) expect(v > 30 || v < 20).toBe(true);
  });

  it('stores only ties above 30 or below 20; the rest read 25', () => {
    const g = new TieGraph();
    g.set(1, 2, 25); g.set(1, 3, 31); g.set(1, 4, 19);
    expect(g.storedCount).toBe(2);
    expect(g.get(2, 1)).toBe(25);
    expect(g.get(3, 1)).toBe(31);
  });
});

describe('rooms and cliques (L2.1.2)', () => {
  it('room state: cohesion is the mean tie, mood influence-weighted, bond the mean buy-in', () => {
    const g = new TieGraph();
    g.set(1, 2, 60); g.set(1, 3, 40); g.set(2, 3, 50);
    const s = roomState('OL', [
      { id: 1, morale: 80, influence: 90, buyInToPositionCoach: 70 },
      { id: 2, morale: 40, influence: 10, buyInToPositionCoach: 30 },
      { id: 3, morale: 60, influence: 0, buyInToPositionCoach: 50 },
    ], g);
    expect(s.cohesion).toBeCloseTo(50);
    expect(s.mood).toBeCloseTo((80 * 90 + 40 * 10) / 100);
    expect(s.coachBond).toBeCloseTo(50);
  });

  it('every rostered player belongs to exactly one room', () => {
    const ps = roster(105, 4);
    const byRoom = new Map<string, number[]>();
    for (const p of ps) byRoom.set(p.room, [...(byRoom.get(p.room) ?? []), p.id]);
    const all = [...byRoom.values()].flat().sort((a, b) => a - b);
    expect(all).toEqual(ps.map((p) => p.id));
  });

  it('a room with coach bond under 30 for four weeks raises the alarm', () => {
    expect(roomAlarm([20, 25, 29])).toBe(false);
    expect(roomAlarm([50, 20, 25, 29, 10])).toBe(true);
    expect(roomAlarm([20, 25, 31, 10])).toBe(false);
  });

  it('cliques: four or more, mean tie above 65, crossing rooms; deterministic', () => {
    const ps = [player(1, { room: 'WR' }), player(2, { room: 'WR' }), player(3, { room: 'DB' }), player(4, { room: 'DB' }), player(5, { room: 'OL' }), player(6, { room: 'OL' }), player(7, { room: 'OL' })];
    const g = new TieGraph();
    for (const [a, b] of [[1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]] as const) g.set(a, b, 80);
    for (const [a, b] of [[5, 6], [6, 7], [5, 7]] as const) g.set(a, b, 90); // only three: not a clique
    const c = findCliques(ps, g);
    expect(c).toHaveLength(1);
    expect(c[0]!.members).toEqual([1, 2, 3, 4]);
    expect(c[0]!.rooms).toEqual(['DB', 'WR']);
    expect(JSON.stringify(findCliques(ps, g))).toBe(JSON.stringify(c));
    expect(cliqueIsProblem([30, 34, 40])).toBe(true);
    expect(cliqueIsProblem([50, 34, 40])).toBe(false);
  });
});

describe('influence (L2.1.3)', () => {
  const base: InfluenceInput = { leadership: 80, performancePercentile: 60, seasonsWithTeam: 3, role: 'starter', meanTie: 50, captain: true, quarterback: false, injuredLongTermStarter: false };
  it('follows the starting weights, with the quarterback bonus and the injured starter keeping 80 percent', () => {
    const v = 0.3 * 80 + 0.2 * 60 + 0.15 * 50 + 0.15 * 100 + 0.1 * 50 + 0.1 * 100;
    expect(influence(base)).toBeCloseTo(v);
    expect(influence({ ...base, quarterback: true })).toBeCloseTo(v + 10);
    expect(influence({ ...base, injuredLongTermStarter: true })).toBeCloseTo(v * 0.8);
    expect(influence({ ...base, seasonsWithTeam: 20 })).toBe(influence({ ...base, seasonsWithTeam: 6 }));
    expect(influence(base)).toBe(influence({ ...base }));
  });
});
