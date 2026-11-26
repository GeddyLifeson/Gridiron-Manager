// The staff's payoff estimates from charted film, the box ranking they drive, and the college box-size table.
// Charted rows below are TEST FILM (made-up results), not rates.
import { describe, expect, it } from 'vitest';
import { seedFromHex, streamSource } from '@gm/engine-core';
import { gameplan as gp } from '@gm/football-content';
import type { tendencies } from '@gm/models';
import { contentBook } from '../../src/coach-calling/index.ts';
import { rankBox, staffDraft, staffEstimates, stateOf, yardageEpa } from '../../src/sheet-bridge/index.ts';

const book = contentBook();
const noise = (tag = 'a') => streamSource(seedFromHex('5eed'))('coachPrep', [1, 1, 7, tag]);

let n = 0;
/** TEST FILM: one own offensive row. */
const row = (concept: string, down: number, distanceYd: number, yards: number, o: Partial<tendencies.ChartedPlay> = {}): tendencies.ChartedPlay => ({
  ref: `9:${n}`, gameId: 9, gameOrder: 1, season: 1, index: n++, teamId: 7, opponentId: 8, side: 'offense', callerId: null, source: 'own',
  down, distanceYd, yardsToGoalYd: 60, hash: 'middle', quarter: 1, clockTenths: 6000, scoreDiff: 0, afterEvent: 'none',
  personnel: '11', formation: null, strength: null, motion: null, shotgun: true, tempo: 'huddle',
  playKind: 'run', runDirection: null, concept, protection: null,
  front: null, rushers: 4, boxCount: 7, coverageFamily: 'cover3', pressureDesign: null,
  yards, success: null, forced: false, lookOnly: false, ...o,
});
const times = <T>(k: number, f: () => T): T[] => Array.from({ length: k }, f);

const entry = (playId: string, situationIds: string[]): gp.MenuEntry => ({ id: `m.${playId}`, side: 'offense', call: { playId, tags: [] }, situationIds, targetReps: 2 });
/** TEST PLAN: two calls the coordinator picked for first and 10 and for third and short. */
const PLAN = [entry('run_inside_zone_right', ['first_10', 'third_short']), entry('run_power_right', ['first_10', 'third_short'])];
/** TEST FILM: zone does well on first down and badly on third and short; power the other way round. */
const FILM = [
  ...times(20, () => row('run_inside_zone_right', 1, 10, 7)), ...times(20, () => row('run_inside_zone_right', 3, 2, 0)),
  ...times(20, () => row('run_power_right', 1, 10, 1)), ...times(20, () => row('run_power_right', 3, 2, 4)),
];
const calls = PLAN.map((m) => ({ callId: m.id, unit: 'offense' as const, conceptFamily: 'run', kind: 'run', tags: [], fits: m.situationIds, readiness: 1, carryOver: false, pairings: [] }));
const byConcept = (p: tendencies.ChartedPlay) => (p.concept ? [`m.${p.concept}`] : []);
const est = (film: readonly tendencies.ChartedPlay[], preparationZ = 0, tag = 'a') => staffEstimates({
  unit: 'offense', calls, callsOf: byConcept, film, teamId: 7, lookOf: (p) => p.coverageFamily, looks: ['cover3'],
  situationIds: ['first_10', 'third_short'], preparationZ, noise: noise(tag),
});

describe('yardage EPA of a charted row (baseline N2.2.1 model)', () => {
  it('more yards is worth more; a touchdown more than a first down; a failed fourth down worth less than a failed third down', () => {
    const g = (yards: number, o: Partial<tendencies.ChartedPlay> = {}) => yardageEpa(row('x', 1, 10, yards, o))!;
    expect(g(10)).toBeGreaterThan(g(4));
    expect(g(4)).toBeGreaterThan(g(0));
    expect(g(60)).toBeGreaterThan(g(30));
    expect(yardageEpa(row('x', 4, 2, 0))!).toBeLessThan(yardageEpa(row('x', 3, 2, 0))!);
    expect(yardageEpa(row('x', 1, 10, 3, { forced: true }))).toBeNull();
  });
  it('reads the half clock and situation of a row', () => {
    const s = stateOf(row('x', 3, 2, 0, { quarter: 2, clockTenths: 900 }));
    expect(s.halfSecondsLeft).toBe(90);
    expect(gp.situationMatches(gp.CATALOGUE_BY_ID.get('third_short')!.situation!, s)).toBe(true);
    expect(gp.situationMatches(gp.CATALOGUE_BY_ID.get('two_minute')!.situation!, s)).toBe(true);
  });
});

describe('staff payoff estimates from film', () => {
  it('ranks each call by what the staff saw it do in that situation', () => {
    const e = est(FILM, 2);
    const first = e.bySituation.get('first_10')!, third = e.bySituation.get('third_short')!;
    expect(first.get('m.run_inside_zone_right')!.mean).toBeGreaterThan(first.get('m.run_power_right')!.mean);
    expect(third.get('m.run_power_right')!.mean).toBeGreaterThan(third.get('m.run_inside_zone_right')!.mean);
    expect(e.seen.get('m.run_power_right')).toBe(40);
    expect(e.playsUsed).toBe(80);
  });
  it('is the same for the same film and stream, and shrinks thin film toward the call overall', () => {
    expect([...est(FILM).table.cells.values()]).toEqual([...est(FILM).table.cells.values()]);
    const thin = est([row('run_power_right', 3, 2, 9)], 2).bySituation.get('third_short')!;
    const all = est([row('run_power_right', 3, 2, 9)], 2).table.cells.get('m.run_power_right|cover3')!;
    expect(Math.abs(thin.get('m.run_power_right')!.mean - all.mean)).toBeLessThan(0.5);
  });
  it('a weaker preparer is less sure of every estimate (K3.3.1 rule 4)', () => {
    const sd = (z: number) => est(FILM, z).table.cells.get('m.run_power_right|cover3')!.sd;
    expect(sd(-2)).toBeGreaterThan(sd(2));
  });
  it('ignores other teams, the other side, kneels and rows for no planned call', () => {
    const other = [row('run_power_right', 3, 2, 9, { teamId: 8 }), row('run_power_right', 3, 2, 9, { side: 'defense' }), row('run_power_right', 3, 2, 9, { forced: true }), row('pass_mesh', 3, 2, 9)];
    expect(est(other).playsUsed).toBe(0);
  });
  it('with no film the box keeps the plan order', () => {
    const e = est([]);
    const box = { id: 'b', situationId: 'third_short', priority: 0, entries: [{ callId: 'm.run_power_right', rank: 0 }, { callId: 'm.run_inside_zone_right', rank: 1 }] };
    expect(rankBox(box, calls, e.bySituation.get('third_short'))).toEqual(['m.run_inside_zone_right', 'm.run_power_right']);
  });
});

describe('staff draft ranked by the estimates', () => {
  const draft = (observed: boolean, level: gp.ReferenceLevel = 'pro') => staffDraft({
    unit: 'offense', gameId: 1, menu: PLAN, preparationZ: 2, book, level,
    ...(observed ? { observed: { teamId: 7, film: FILM, noise: noise() } } : {}),
  });
  const box = (d: ReturnType<typeof draft>, sit: string) => d.sheet.boxes.find((b) => b.situationId === sit)?.entries.map((e) => e.call.playId);
  it('puts the call the staff saw work in that situation first', () => {
    const d = draft(true);
    expect(d.rankedBy).toBe('film');
    expect(box(d, 'first_10')![0]).toBe('run_inside_zone_right');
    expect(box(d, 'third_short')![0]).toBe('run_power_right');
  });
  it('without film it says the plan order ranked the boxes', () => {
    const d = draft(false);
    expect(d.rankedBy).toBe('planOrder');
    expect(box(d, 'third_short')![0]).toBe('run_inside_zone_right');
  });
});

describe('college expected snaps (G7.2.3, 2024 FBS table)', () => {
  const college = gp.collegeReference2024();
  it('is the FBS 2024 table: 752 games, 65.6 snaps a team game, tempo unseen', () => {
    expect(college.games).toBe(1504);
    expect(gp.snapsPerGame(college)).toBeCloseTo(65.56, 2);
    expect(college.unseen.has('tempo')).toBe(true);
    expect(gp.leagueReference('college')).toBe(college);
    expect(gp.leagueReference('pro').id).toBe('nflverse-pbp-2024-reg');
  });
  it('gives college its own box sizes: more first-down and fourth-down snaps a game than the pro table', () => {
    const snaps = (id: string, t: gp.ReferenceTable) => gp.expectedSnaps(gp.CATALOGUE_BY_ID.get(id)!.situation!, t).value;
    const pro = gp.proReference2024();
    const down = (d: number): gp.SituationRule => ({ id: `d${d}`, label: '', anyOf: [{ all: [{ on: 'down', in: [d] }] }] });
    expect(snaps('first_10', college)).toBeGreaterThan(snaps('first_10', pro));
    expect(gp.expectedSnaps(down(4), college).value).toBeGreaterThan(gp.expectedSnaps(down(4), pro).value);
    expect(gp.expectedSnaps(down(1), college).value).toBeCloseTo(28.90, 1);
  });
});
