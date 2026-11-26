// WP-23 acceptance (build plan row, J1.6.1, J1.3.1, J13, P6.1.1, A3 ruling 22). The plays here run on
// FIXTURE units and on the stand-in quarterback, carrier and foul modules, so they check the assembly
// (order, determinism, the truth record's promises), not football outcomes.
import { describe, expect, it } from 'vitest';
import { deadBallOf, eventsOf, playTruthProblems, type PlayResult, type TruthEvent } from '@gm/schema';
import { canonicalBytes } from '../../src/canonical.ts';
import { PLUG_IDS, createTickResolver, orderEvents, standInPlug, tickResolverParams, PARAMS } from '../../src/tick-resolver/index.ts';
import { fieldGeometry } from '../../src/field/index.ts';
import { CONTENT, RULES, TABLE, playInput, tableWith, type Kind } from './support.ts';

const GEOMETRY = fieldGeometry(RULES);

const KINDS: readonly Kind[] = ['pass', 'run', 'punt', 'field_goal', 'try_kick', 'kickoff', 'onside_kick', 'safety_kick', 'fair_catch_kick'];
const hex = (r: PlayResult): string => Buffer.from(canonicalBytes({ truth: r.truth, deltas: r.deltas, live: r.liveDurationTenths })).toString('hex');
const resolver = createTickResolver({ content: CONTENT });

describe('tick resolver: honesty about stand-ins', () => {
  it('names every missing module and may not produce saved results', () => {
    expect(resolver.id).toBe('tick');
    expect(resolver.report.standIns).toEqual([...PLUG_IDS]);
    expect(resolver.mayProduceSavedResults).toBe(false);
  });
  it('may produce saved results only when all three modules are plugged in', () => {
    const real = PLUG_IDS.map((id) => ({ ...standInPlug(id), version: 'test-real' }));
    expect(createTickResolver({ content: CONTENT, plugs: real }).mayProduceSavedResults).toBe(true);
    const two = createTickResolver({ content: CONTENT, plugs: real.slice(0, 2) });
    expect(two.mayProduceSavedResults).toBe(false);
    expect(two.report.standIns).toEqual(['foulsInjuries']);
    expect(() => createTickResolver({ content: CONTENT, plugs: [real[0]!, real[0]!] })).toThrow();
  });
  it('refuses a call its content set lacks', () => {
    expect(() => createTickResolver({ content: { setup: () => null } }).simulatePlay(playInput())).toThrow(/content set/);
  });
});

describe('tick resolver: the truth record', () => {
  const reasons = new Map<string, number>();
  it('keeps every structural promise on 360 seeded plays of every kind', () => {
    let n = 0;
    for (const kind of KINDS) for (let seed = 1; seed <= 40; seed++) {
      const r = resolver.simulatePlay(playInput({ kind, seed, playNumber: seed, attackDir: seed % 2 === 0 ? 1 : -1, ballX: 30 + (seed % 5) * 12 }));
      expect(playTruthProblems(r.truth), `${kind} seed ${seed}`).toEqual([]);
      const dead = deadBallOf(r.truth);
      reasons.set(dead.reason, (reasons.get(dead.reason) ?? 0) + 1);
      expect(dead.reason, `${kind} seed ${seed}`).not.toBe('engine_fault');
      expect(r.truth.liveDurationTenths).toBe(r.liveDurationTenths);
      if (dead.reason === 'pre_snap_foul') expect(r.liveDurationTenths).toBe(0);
      expect(r.deltas).toHaveLength(22);
      for (const d of r.deltas) { expect(d.energyCost).toBeGreaterThanOrEqual(0); expect(d.energyCost).toBeLessThanOrEqual(1); }
      expect(r.trajectory).toBeNull();
      n++;
    }
    expect(n).toBe(360);
  });
  it('ends plays for more than one reason, each a physical fact', () => {
    expect(reasons.size).toBeGreaterThanOrEqual(4);
    expect(reasons.has('down_by_contact')).toBe(true);
  });
  it('kicks the ball on kick plays and never snaps a free kick', () => {
    for (const kind of ['kickoff', 'onside_kick', 'safety_kick', 'fair_catch_kick'] as const) {
      const r = resolver.simulatePlay(playInput({ kind, seed: 3 }));
      expect(eventsOf(r.truth, 'snap')).toHaveLength(0);
      expect(eventsOf(r.truth, 'kick').map((k) => k.kickKind)).toEqual([kind]);
    }
    let punts = 0, places = 0;
    for (let seed = 1; seed <= 30; seed++) {
      punts += eventsOf(resolver.simulatePlay(playInput({ kind: 'punt', seed })).truth, 'kick').length;
      places += eventsOf(resolver.simulatePlay(playInput({ kind: 'field_goal', seed, ballX: 80 })).truth, 'kick').length;
    }
    expect(punts).toBeGreaterThan(15);
    expect(places).toBeGreaterThan(15);
  });
  it('rules nothing: a place kick ends at the plane of the goal as good or failed', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 120; seed++) {
      const r = resolver.simulatePlay(playInput({ kind: 'field_goal', seed, ballX: 68 }));
      seen.add(deadBallOf(r.truth).reason);
    }
    expect(seen.has('kick_through_uprights')).toBe(true);
    expect(seen.has('kick_failed') || seen.has('kick_hit_goal') || seen.has('loose_ball_at_rest') || seen.has('down_by_contact')).toBe(true);
  });
  it('keeps a trajectory and an explain record only at full detail', () => {
    const r = resolver.simulatePlay(playInput({ detail: 'full', seed: 5 }));
    expect(r.trajectory).not.toBeNull();
    expect((r.trajectory as { tickCount: number }).tickCount).toBeGreaterThan(10);
    expect(r.explain).not.toBeNull();
    expect(playTruthProblems(r.truth)).toEqual([]);
  });
  it('stops at the tick asked for with the play still live (J1.6.1 stopAt)', () => {
    const r = resolver.simulatePlay(playInput({ seed: 1, stopAtTick: 5 }));
    expect(eventsOf(r.truth, 'dead_ball')).toHaveLength(0);
    expect(eventsOf(r.truth, 'snap')).toHaveLength(1);
  });
  it('runs a play snapped with 0:01 left to its end (J1.3.2)', () => {
    const r = resolver.simulatePlay(playInput({ seed: 1, clockTenths: 10 }));
    expect(playTruthProblems(r.truth)).toEqual([]);
    expect(r.liveDurationTenths).toBeGreaterThan(10);
  });
  it('orders events by time, then play events before the dead ball, and drops live events dated after it', () => {
    const dead: TruthEvent = { type: 'dead_ball', t: 2, marginYd: null, marginS: null, visibility: 'open', reason: 'down_by_contact', spot: { x: 1, y: 1 }, side: 0, carrierId: 1 };
    const tackle: TruthEvent = { type: 'tackle_attempt', t: 2, outcome: 'made', carrierId: 1, tacklerIds: [2], spot: { x: 1, y: 1 } };
    const late: TruthEvent = { type: 'boundary', t: 2.05, marginYd: null, marginS: null, visibility: 'open', kind: 'player_out_of_bounds', playerId: 3, spot: { x: 1, y: 0 } };
    const note: TruthEvent = { type: 'detail', t: 2.3, code: 'x', playerIds: [], spot: null, value: null };
    expect(orderEvents([dead, note, late, tackle]).map((e) => e.type)).toEqual(['tackle_attempt', 'dead_ball', 'detail']);
  });
});

describe('tick resolver: determinism (J13)', () => {
  it('gives byte-identical output for the same input, on one resolver or two, in any order of plays', () => {
    const other = createTickResolver({ content: CONTENT });
    for (const kind of KINDS) {
      const a = hex(resolver.simulatePlay(playInput({ kind, seed: 11 })));
      resolver.simulatePlay(playInput({ kind: 'pass', seed: 99 }));
      expect(hex(resolver.simulatePlay(playInput({ kind, seed: 11 }))), kind).toBe(a);
      expect(hex(other.simulatePlay(playInput({ kind, seed: 11 }))), kind).toBe(a);
    }
  });
  it('changes with the seed and with the play number', () => {
    const a = hex(resolver.simulatePlay(playInput({ seed: 11 })));
    expect(hex(resolver.simulatePlay(playInput({ seed: 12 })))).not.toBe(a);
    expect(hex(resolver.simulatePlay(playInput({ seed: 11, playNumber: 2 })))).not.toBe(a);
  });
  it('B7.7.1: a kick fielded and downed in the end zone is the kicking team\'s impetus, not the returner\'s', () => {
    let downedIn = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const t = resolver.simulatePlay(playInput({ kind: 'kickoff', seed })).truth;
      const dead = eventsOf(t, 'dead_ball')[0], kick = eventsOf(t, 'kick')[0];
      if (!dead || !kick || t.endZoneImpetus === null) continue;
      // The kicker has no possession: every possession on a kickoff is the receiving team's.
      const receiving = eventsOf(t, 'possession').filter((e) => e.t <= dead.t);
      if (receiving.length === 0) continue;
      const kicking = receiving[0]!.side === 0 ? 1 : 0;
      // Every time the receiving team had it, it was already on or behind the goal line where it died.
      const west = dead.spot.x <= GEOMETRY.goalLineWestX, inside = receiving.every((e) => (west ? e.spot.x <= GEOMETRY.goalLineWestX : e.spot.x >= GEOMETRY.goalLineEastX));
      if (!inside) continue;
      downedIn++;
      expect(t.endZoneImpetus, `seed ${seed}`).toBe(kicking);
    }
    expect(downedIn).toBeGreaterThan(0);
  });
  it('gives the same truth at full and at summary detail', () => {
    for (const kind of ['pass', 'punt', 'kickoff'] as const) {
      const s = resolver.simulatePlay(playInput({ kind, seed: 21 })), f = resolver.simulatePlay(playInput({ kind, seed: 21, detail: 'full' }));
      expect(hex(f), kind).toBe(hex(s));
    }
  });
});

describe('tick resolver: engagements (J6.1.2) and nonzero chances (A3 ruling 22)', () => {
  it('opens blocks and lets either man win them', () => {
    let blockerWins = 0, defenderWins = 0, counters = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const r = resolver.simulatePlay(playInput({ kind: seed % 2 ? 'pass' : 'run', seed }));
      for (const e of eventsOf(r.truth, 'contest')) { if (e.winnerId < 200) blockerWins++; else defenderWins++; }
      counters += eventsOf(r.truth, 'detail').filter((e) => e.code === 'interact.counter').length;
    }
    expect(blockerWins).toBeGreaterThan(0);
    expect(defenderWins).toBeGreaterThan(0);
    expect(counters).toBeGreaterThan(0);
  });
  it('lets the weaker side still win a block sometimes', () => {
    // Blockers a third of a standard deviation better than the rush: the rusher must still get home on some seeds.
    const grade = (slot: number): Record<string, number> => (slot < 11
      ? { pass_set: 55, anchor: 55, mirror: 55, hand_use_in_protection: 55 } : { get_off: 50, power_rush: 50, hand_moves: 50, speed_rush_and_bend: 50 });
    let defenderWins = 0, blockerWins = 0;
    for (let seed = 1; seed <= 150; seed++) {
      for (const e of eventsOf(resolver.simulatePlay(playInput({ seed, grade })).truth, 'contest')) { if (e.winnerId >= 200) defenderWins++; else blockerWins++; }
    }
    expect(blockerWins).toBeGreaterThan(defenderWins);
    expect(defenderWins).toBeGreaterThan(0);
  });
  it('holds no tuning number outside its own range and reads each once per table', () => {
    for (const p of PARAMS.params) { expect(p.value).toBeGreaterThanOrEqual(p.min); expect(p.value).toBeLessThanOrEqual(p.max); }
    expect(tickResolverParams(TABLE)).toBe(tickResolverParams(TABLE));
    const t = tableWith({ 'tickResolver.standIn.qbHoldS': 3 });
    expect(tickResolverParams(t)['standIn.qbHoldS']).toBe(3);
    const r = resolver.simulatePlay(playInput({ kind: 'run', seed: 2, params: t }));
    expect(deadBallOf(r.truth).t).toBeLessThanOrEqual(3);
  });
});

describe('tick resolver: speed (P6.1.1)', () => {
  it('resolves a scrimmage play inside the 50 ms budget on average', () => {
    for (let seed = 1; seed <= 20; seed++) resolver.simulatePlay(playInput({ seed: 500 + seed }));
    const n = 100, t0 = performance.now();
    for (let seed = 1; seed <= n; seed++) resolver.simulatePlay(playInput({ kind: seed % 2 ? 'pass' : 'run', seed: 600 + seed }));
    const each = (performance.now() - t0) / n;
    expect(each).toBeLessThan(50);
  });
});
