// WP-08 acceptance and contract tests of the reference resolver (J1.6.3, J14.1.2, P6.1.1).
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { ParamFile, RuleKeyManifest, STREAM_SCOPE, deadBallOf, eventsOf, type Side } from '@gm/schema';
import { PARAMS, RULE_KEYS, REFERENCE_RESOLVER, createReferenceResolver, referenceParamTable, FOUL_ROWS } from '../../src/resolver/index.ts';
import {
  FIELD, KICK_KINDS, OFFENSE_KINDS, defenseCall, generated, input, kickCall, offenseCall, problems, returnCall, situation, team,
  type Recorded,
} from './helpers.ts';

const R = REFERENCE_RESOLVER;

describe('reference resolver: contract (J1.6.3, J14.1.2)', () => {
  it('is the resolver with id "reference" and may never produce saved results', () => {
    expect(R.id).toBe('reference');
    expect(R.mayProduceSavedResults).toBe(false);
    expect(createReferenceResolver()).toBe(R);
    expect(R.version).toBe(PARAMS.version);
  });

  it('imports nothing but @gm/schema and its own files (P1.2.1, contract D-07)', () => {
    const dir = new URL('../../src/resolver/', import.meta.url);
    for (const f of readdirSync(dir)) {
      const src = readFileSync(new URL(f, dir), 'utf8');
      for (const m of src.matchAll(/from\s+'([^']+)'/g)) expect(m[1] === '@gm/schema' || m[1]!.startsWith('./'), `${f} imports ${m[1]}`).toBe(true);
    }
  });

  it('has a valid parameter file: unique names, values inside their ranges, a basis and a leaf on every row', () => {
    expect(ParamFile.safeParse(PARAMS).success).toBe(true);
    expect(PARAMS.module).toBe('resolver.reference');
    const names = new Set<string>();
    for (const p of PARAMS.params) {
      expect(names.has(p.name), `duplicate ${p.name}`).toBe(false);
      names.add(p.name);
      expect(p.value >= p.min && p.value <= p.max, `${p.name} outside its range`).toBe(true);
      expect(p.leaf).toMatch(/^[A-Z]\d+\.\d+(\.\d+)?$/);
      expect(p.constrainedBy.length).toBeGreaterThan(0);
    }
  });

  it('declares one rule key per foul type and nothing else', () => {
    expect(RuleKeyManifest.safeParse(RULE_KEYS).success).toBe(true);
    expect(RULE_KEYS.map((k) => k.key)).toEqual(FOUL_ROWS.map((f) => `foul.${f.id}.exists`));
  });

  it('rejects an override of a parameter that does not exist', () => {
    expect(() => referenceParamTable({ 'run.noSuchThing': 1 })).toThrow();
    expect(referenceParamTable({ 'run.shiftYd': 0 }).num('resolverRef.run.shiftYd')).toBe(0);
  });
});

describe('reference resolver: determinism (J13, Q1.3)', () => {
  it('gives the same result for the same input, and reads only the resolver stream scoped by game and play', () => {
    for (let i = 0; i < 300; i++) {
      const g = generated(i, 11);
      const rec: Recorded[] = [];
      const a = R.simulatePlay(input(g.sit, g.calls, { seed: 5, record: rec }));
      const b = R.simulatePlay(input(g.sit, g.calls, { seed: 5 }));
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(rec).toEqual([{ name: 'resolver', scope: [g.sit.gameId, g.sit.playNumber] }]);
      expect(STREAM_SCOPE.resolver).toEqual(['game', 'play']);
    }
  });

  it('changes with the seed, the game and the play number', () => {
    const calls = { snapping: offenseCall(0, 'dropback_pass'), opposing: defenseCall(1) };
    const key = (seed: number, gameId: number, playNumber: number) => {
      let s = '';
      for (let k = 0; k < 20; k++) s += JSON.stringify(R.simulatePlay(input(situation({ gameId, playNumber: playNumber + k }), calls, { seed })).truth.events);
      return s;
    };
    const base = key(1, 1, 1);
    expect(key(2, 1, 1)).not.toBe(base);
    expect(key(1, 2, 1)).not.toBe(base);
    expect(key(1, 1, 100)).not.toBe(base);
  });

  it('does not depend on the order in which plays are resolved', () => {
    const forward: string[] = [];
    const backward: string[] = [];
    for (let i = 0; i < 200; i++) { const g = generated(i, 3); forward[i] = JSON.stringify(R.simulatePlay(input(g.sit, g.calls))); }
    for (let i = 199; i >= 0; i--) { const g = generated(i, 3); backward[i] = JSON.stringify(R.simulatePlay(input(g.sit, g.calls))); }
    expect(backward).toEqual(forward);
  });
});

describe('reference resolver: every play kind and kick kind gives a valid truth record', () => {
  const spots = [10.5, 12, 35, 60, 95, 108, 109.5];
  for (const kind of OFFENSE_KINDS) {
    it(`offense kind ${kind}`, () => {
      let n = 0;
      for (const ballX of spots) for (const attackDir of [1, -1] as const) for (let i = 0; i < 150; i++) {
        const sit = situation({ playNumber: ++n, ballX, attackDir, offense: (i % 2) as Side, lineToGainX: Math.min(109.99, Math.max(10.01, ballX + 10 * attackDir)) });
        const off = sit.offense;
        const r = R.simulatePlay(input(sit, { snapping: offenseCall(off, kind), opposing: defenseCall((1 - off) as Side, { rushers: 3 + (i % 5) }) }));
        expect(problems(r), `${kind} at ${ballX} dir ${attackDir} play ${n}`).toEqual([]);
        expect(r.truth.resolverId).toBe('reference');
        expect(r.deltas.length).toBe(22);
      }
    });
  }
  for (const kickKind of KICK_KINDS) {
    it(`kick kind ${kickKind}`, () => {
      let n = 0;
      for (const ballX of spots) for (const attackDir of [1, -1] as const) for (let i = 0; i < 150; i++) {
        const sit = situation({ playNumber: ++n, ballX, attackDir, down: null, distanceYd: null, lineToGainX: null, playKind: 'kickoff' });
        const r = R.simulatePlay(input(sit, { snapping: kickCall(0, kickKind), opposing: returnCall(1) }));
        expect(problems(r), `${kickKind} at ${ballX} dir ${attackDir} play ${n}`).toEqual([]);
        expect(eventsOf(r.truth, 'kick').length).toBe(1);
      }
    });
  }

  it('writes the physical facts and no ruling: a run across the goal line, a kneel, a spike', () => {
    // First and goal at the 1: most runs cross. The record says the ball crossed in possession, not "touchdown".
    let crossed = 0;
    for (let i = 1; i <= 200; i++) {
      const r = R.simulatePlay(input(situation({ playNumber: i, ballX: 109, lineToGainX: 110, goalToGo: true }), { snapping: offenseCall(0, 'run'), opposing: defenseCall(1) }));
      const d = deadBallOf(r.truth);
      if (d.reason === 'ball_across_goal_line_in_possession') {
        crossed++;
        expect(d.spot.x).toBeGreaterThan(110);
        expect(eventsOf(r.truth, 'boundary').some((e) => e.kind === 'ball_crosses_goal_line')).toBe(true);
      }
    }
    expect(crossed).toBeGreaterThan(50);
    const kneel = R.simulatePlay(input(situation(), { snapping: offenseCall(0, 'kneel'), opposing: defenseCall(1) }));
    expect(deadBallOf(kneel.truth).reason).toBe('kneel');
    expect(deadBallOf(kneel.truth).spot.x).toBeLessThan(35);
    const spike = R.simulatePlay(input(situation(), { snapping: offenseCall(0, 'spike'), opposing: defenseCall(1) }));
    expect(deadBallOf(spike.truth).reason).toBe('incomplete_pass');
    expect(eventsOf(spike.truth, 'pass_release')[0]!.spike).toBe(true);
  });

  it('records a ball dead in the end zone with the impetus of the team that put it there', () => {
    // A sack or a loss from the offense's own 1-yard line.
    let seen = 0;
    for (let i = 1; i <= 3000 && seen < 5; i++) {
      const r = R.simulatePlay(input(situation({ playNumber: i, ballX: 10.5 }), { snapping: offenseCall(0, 'dropback_pass'), opposing: defenseCall(1, { rushers: 6 }) }));
      const d = deadBallOf(r.truth);
      if (d.reason === 'ball_dead_in_end_zone') { seen++; expect(r.truth.endZoneImpetus).toBe(0); expect(d.spot.x).toBeLessThan(10); expect(d.side).toBe(0); }
    }
    expect(seen).toBe(5);
    // A kickoff into the end zone: the kicking team's impetus.
    let touchbacks = 0;
    for (let i = 1; i <= 200; i++) {
      const r = R.simulatePlay(input(situation({ playNumber: i, ballX: 45, playKind: 'kickoff', down: null, distanceYd: null, lineToGainX: null, offense: 1 }), { snapping: kickCall(1, 'kickoff'), opposing: returnCall(0) }));
      if (deadBallOf(r.truth).reason === 'ball_dead_in_end_zone') { touchbacks++; expect(r.truth.endZoneImpetus).toBe(1); }
    }
    expect(touchbacks).toBeGreaterThan(10);
  });
});

describe('reference resolver: illegal or odd inputs still run (validators report, never refuse)', () => {
  it('plays with nine, twelve or no players named, and with ids missing from the team', () => {
    const few = offenseCall(0, 'run'); few.players = few.players.slice(0, 9);
    const many = defenseCall(1); many.players = [...many.players, { playerId: 240, role: 'X12' }];
    const none = offenseCall(0, 'dropback_pass', { players: [] });
    const strangers = offenseCall(0, 'dropback_pass', { players: [{ playerId: 9001, role: 'QB' }, { playerId: 9002, role: 'X' }] });
    for (let i = 1; i <= 200; i++) {
      for (const snapping of [few, none, strangers]) {
        const r = R.simulatePlay(input(situation({ playNumber: i }), { snapping, opposing: many }));
        expect(problems(r)).toEqual([]);
      }
    }
    const r = R.simulatePlay(input(situation(), { snapping: few, opposing: many }));
    expect(r.deltas.length).toBe(9 + 12);
  });

  it('runs an offense call on a kick down and a kick call against a defense', () => {
    for (let i = 1; i <= 100; i++) {
      const a = R.simulatePlay(input(situation({ playNumber: i, playKind: 'kickoff', down: null, distanceYd: null, lineToGainX: null }), { snapping: offenseCall(0, 'run'), opposing: returnCall(1) }));
      const b = R.simulatePlay(input(situation({ playNumber: i, down: 4 }), { snapping: kickCall(0, 'punt'), opposing: defenseCall(1) }));
      expect(problems(a)).toEqual([]);
      expect(problems(b)).toEqual([]);
    }
  });

  it('refuses only an input no play could come from: a team with nobody dressed', () => {
    const empty = { ...team(0), players: [] };
    expect(() => R.simulatePlay(input(situation(), { snapping: offenseCall(0, 'run', { players: [] }), opposing: defenseCall(1) }, { teams: [empty, team(1)] }))).toThrow(/no dressed players/);
  });
});

describe('reference resolver: WP-08 acceptance', () => {
  // P6.1.1 has no row for the reference resolver. The full engine may spend 2 s on a game of about 170
  // snaps, which is about 12 ms a snap. This test holds the reference resolver to 1 ms a play on
  // average, an Assumption chosen to sit far inside that row; measured cost is about 0.03 ms.
  const BUDGET_MS_PER_PLAY = 1;
  const PLAYS = 10_000;

  it(`resolves ${PLAYS} plays from generated situations: all valid, inside the budget`, () => {
    const inputs = [];
    for (let i = 0; i < PLAYS; i++) { const g = generated(i, 2026); inputs.push(input(g.sit, g.calls, { seed: 2026 })); }
    const start = performance.now();
    const results = inputs.map((x) => R.simulatePlay(x));
    const elapsed = performance.now() - start;
    let bad = 0;
    const reasons = new Set<string>();
    for (let i = 0; i < PLAYS; i++) {
      const p = problems(results[i]!);
      if (p.length) { bad++; if (bad <= 3) console.error(inputs[i]!.calls.snapping, p); }
      reasons.add(deadBallOf(results[i]!.truth).reason);
    }
    expect(bad).toBe(0);
    expect(elapsed / PLAYS).toBeLessThan(BUDGET_MS_PER_PLAY);
    // The generated set reaches every way a play of this resolver can end.
    for (const reason of ['down_by_contact', 'runner_out_of_bounds', 'kneel', 'incomplete_pass', 'ball_across_goal_line_in_possession',
      'ball_dead_in_end_zone', 'kick_through_uprights', 'kick_failed', 'fair_catch', 'kick_recovered_by_kickers', 'ball_out_of_bounds']) {
      expect(reasons.has(reason), `no play ended by ${reason}`).toBe(true);
    }
    expect(FIELD.lengthYd).toBe(120);
  });
});
