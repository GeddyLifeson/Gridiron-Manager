import { describe, expect, it } from 'vitest';
import { PlayerView } from '../../src/perception/view.ts';
import { ParamFile, SLOT_COUNT, type TickStage, type TickWorld } from '@gm/schema';
import {
  createPerception, keyDelayS, attentionCapacity, readThreshold, keyWeight, anticipationChance, coverageRecognitionS, callDeliveryChance,
  landingErrorSdYd, perceptionParams, PARAMS, type EvidenceSource, type Perception, type PerceptionOptions,
} from '../../src/perception/index.ts';
import { createMovement } from '../../src/kinematics/index.ts';
import { createTickLoop } from '../../src/tick/index.ts';
import { fixtureWorld, place, playX, playY, PARAM_TABLE, type WorldSpec } from '../tick/support.ts';

const PP = perceptionParams(PARAM_TABLE);
const VIEWER = 11;
/** The viewer stands at (5, 0) facing the offense (toward -x in the play frame). Everyone else starts far behind him. */
function stage(spec: WorldSpec = {}, options: PerceptionOptions = {}) {
  const w = fixtureWorld(spec), see = createPerception(options);
  for (let s = 0; s < SLOT_COUNT; s++) if (s !== VIEWER) place(w, s, 60 + 2 * s, 0);
  place(w, VIEWER, 5, 0);
  return { w, see };
}
function facing(w: TickWorld, slot: number, playDeg: number) {
  const rad = (playDeg * Math.PI) / 180 + (w.frame.attackDir === 1 ? 0 : Math.PI);
  w.players.headingRad[slot] = Math.atan2(Math.sin(rad), Math.cos(rad)); w.players.gazeRad[slot] = w.players.headingRad[slot]!;
}
/** Runs the loop to `ticks`, calling `each` in the Decide stage (after Perceive) on every tick. */
function runTicks(w: TickWorld, stages: TickStage[], ticks: number, each: (w: TickWorld) => void = () => {}) {
  createTickLoop([...stages, { name: 'decide', run: each }]).run(w, { stopAt: (x) => x.tick >= ticks });
}
/** A point at `deg` off the viewer's gaze (which is toward -x), `r` yards away. */
function offGaze(deg: number, r: number): [number, number] {
  const a = Math.PI - (deg * Math.PI) / 180;
  return [5 + r * Math.cos(a), r * Math.sin(a)];
}
function sprint(w: TickWorld, slot: number, px: number, py: number) {
  const i = w.intents[slot]!; i.target = { px, py }; i.moveMode = 'sprint'; i.arrival = 'through'; i.effort = 1;
}

describe('J3 parameters and formulas', () => {
  it('exports a valid parameter file', () => { expect(() => ParamFile.parse(PARAMS)).not.toThrow(); });
  it('computes the key delay of J3.2.1: 0.25 s at grade 50, 0.20 s at 90, shorter with preparation, longer when tired, floored at 0.10 s', () => {
    expect(keyDelayS(50, 0, 0, 0, 0, PP)).toBeCloseTo(0.25, 12);
    expect(keyDelayS(90, 0, 0, 0, 0, PP)).toBeCloseTo(0.20, 12);
    expect(keyDelayS(50, 1, 0, 0, 0, PP)).toBeCloseTo(0.20, 12);
    expect(keyDelayS(50, 0, 1, 0, 0, PP)).toBeCloseTo(0.28, 12);
    expect(keyDelayS(50, 0, 0, 0.1, 0.05, PP)).toBeCloseTo(0.40, 12);
    expect(keyDelayS(99, 1, 0, -1, 0, PP)).toBe(0.10);
    expect(keyDelayS(1, 0, 1, 5, 0, PP)).toBe(1.5);
    let last = Infinity;
    for (let iss = 1; iss <= 99; iss++) { const d = keyDelayS(iss, 0.3, 0.2, 0, 0, PP); expect(d).toBeLessThan(last); last = d; }
  });
  it('computes attention capacity, thresholds and weights with their clips', () => {
    expect([-4, -2, -1, 0, 1, 2, 4].map((z) => attentionCapacity(z, PP))).toEqual([2, 2, 2, 3, 4, 4, 5]);
    expect(readThreshold(0, 0, PP)).toBeCloseTo(1.5, 12);
    expect(readThreshold(2, 0, PP)).toBeCloseTo(1.8, 12);
    expect(readThreshold(0, 0.5, PP)).toBe(1.0);
    expect(readThreshold(8, -0.5, PP)).toBe(2.2);
    expect(keyWeight(0, PP)).toBeCloseTo(0.6, 12); expect(keyWeight(-5, PP)).toBe(0.3); expect(keyWeight(5, PP)).toBe(0.95);
    expect(anticipationChance(0, 0, 0, PP)).toBeCloseTo(0.10, 12);
    expect(anticipationChance(2, -2, 0.05, PP)).toBeCloseTo(0.43, 12);
    expect(anticipationChance(9, -9, 0.05, PP)).toBe(0.5); expect(anticipationChance(-9, 9, 0, PP)).toBe(0);
    expect(coverageRecognitionS(0, PP)).toBeCloseTo(0.4, 12); expect(coverageRecognitionS(9, PP)).toBe(0.15);
    expect(callDeliveryChance(0, 0, 0, 0, 0, PP)).toBeCloseTo(0.97, 12);
    expect(callDeliveryChance(1, 40, 0, 0, 0, PP)).toBeCloseTo(0.52, 12);
    expect(landingErrorSdYd(0, 0, PP)).toBe(3); expect(landingErrorSdYd(0.3, 0, PP)).toBeCloseTo(1.5, 12); expect(landingErrorSdYd(0.6, 0, PP)).toBe(0);
    expect(landingErrorSdYd(0.5, 2, PP)).toBe(0); // better ball tracking: settled by half the flight
  });
  it('uses the same key delay inside the tick as the formula', () => {
    for (const [rec, prep, fresh, dc, dk] of [[50, 0, 1, 0, 0], [72, 0.4, 0.6, 0.05, 0], [31, 1, 0.1, 0, 0.12], [99, 1, 1, 0, 0]] as const) {
      const { w, see } = stage({ players: () => ({ attributes: { play_recognition: rec }, freshness: fresh }) });
      see.configure(VIEWER, { prep, dComplexityS: dc, dKnowledgeS: dk });
      runTicks(w, [see.stage], 1);
      expect(see.keyDelay(VIEWER)).toBe(keyDelayS(rec, prep, 1 - fresh, dc, dk, PP));
    }
  });
});

describe('J3.1.1 the perceived world', () => {
  it('equals the true world with zero delay, full attention and no noise (acceptance 1)', () => {
    const w = fixtureWorld({ seed: 3 }), see = createPerception({ test: { fixedDelayS: 0, fullAttention: true, noNoise: true } }), move = createMovement();
    w.ball.kind = 'held'; w.ball.carrierSlot = 0; w.players.hasBall[0] = 1;
    const carry: TickStage = { name: 'detect', run: (x) => { x.ball.x = x.players.posX[0]!; x.ball.y = x.players.posY[0]!; x.ball.velX = x.players.velX[0]!; x.ball.velY = x.players.velY[0]!; } };
    let checked = 0;
    runTicks(w, [see.stage, move.stage, carry], 40, (x) => {
      for (let s = 0; s < SLOT_COUNT; s++) sprint(x, s, 10 + s, (s * 7) % 30 - 15);
      for (let s = 0; s < SLOT_COUNT; s++) {
        const v = see.view(s);
        expect(v.self.px).toBe(playX(x, s)); expect(v.self.py).toBe(playY(x, s));
        for (let e = 0; e < SLOT_COUNT; e++) {
          if (e === s) { expect(v.entity(e)).toBeNull(); continue; }
          const p = v.entity(e)!;
          expect(p.px).toBe(playX(x, e)); expect(p.py).toBe(playY(x, e));
          expect(p.velPx).toBe(x.players.velX[e]! * x.frame.attackDir); expect(p.staleTicks).toBe(0);
          checked++;
        }
        expect(v.ball()!.px).toBe((x.ball.x - x.frame.originX) * x.frame.attackDir);
        expect(v.ballKind()).toBe('held'); expect(v.believedCarrierSlot()).toBe(0);
      }
    });
    expect(checked).toBe(40 * 22 * 21);
  });
  it('reacts exactly 3 ticks later with a uniform 0.3 s delay (acceptance 2)', () => {
    const firstSeen = (delayS: number) => {
      const { w, see } = stage({}, { test: { fixedDelayS: delayS, fullAttention: true, noNoise: true } });
      const move = createMovement();
      place(w, 0, -5, 0);
      let first = -1;
      runTicks(w, [see.stage, move.stage], 30, (x) => {
        if (x.tick >= 10) sprint(x, 0, -5, 30); // the stimulus
        if (first < 0 && see.view(VIEWER).entity(0)!.py !== 0) first = x.tick; // the response
      });
      return first;
    };
    expect(firstSeen(0)).toBe(11);
    expect(firstSeen(0.3) - firstSeen(0)).toBe(3);
    expect(firstSeen(0.25) - firstSeen(0)).toBe(2); // between ticks: interpolated, so half the change shows when the nearer sample has it
    expect(firstSeen(0.2) - firstSeen(0)).toBe(2);
  });
  it('gives rules no path to the true state: the view holds copies only (Q1.4.1)', () => {
    const { w, see } = stage();
    place(w, 0, -5, 0);
    runTicks(w, [see.stage], 3);
    const truth = new Set<unknown>([w, w.players, w.ball, w.slots, w.intents, w.frame, w.situation, w.events]);
    for (const a of Object.values(w.players)) { truth.add(a); truth.add((a as Float64Array).buffer); }
    const seen = new Set<unknown>(), stack: unknown[] = [see.view(VIEWER)];
    while (stack.length > 0) {
      const o = stack.pop();
      if (o === null || typeof o !== 'object' || seen.has(o)) continue;
      seen.add(o);
      expect(truth.has(o)).toBe(false);
      if (ArrayBuffer.isView(o)) { expect(truth.has(o.buffer)).toBe(false); continue; }
      for (const k of Reflect.ownKeys(o)) stack.push((o as Record<PropertyKey, unknown>)[k]);
      stack.push(Object.getPrototypeOf(o));
    }
    // Changing the truth without a Perceive stage changes nothing he knows.
    const before = JSON.stringify(see.view(VIEWER));
    w.players.posX[0] = 1; w.players.velY[0] = 9; w.ball.x = 3; w.ball.kind = 'loose';
    expect(JSON.stringify(see.view(VIEWER))).toBe(before);
    // The view's methods are the contract's and no more.
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(see.view(VIEWER))).sort()).toEqual(
      ['ball', 'ballKind', 'believedCarrierSlot', 'constructor', 'entity', 'heard', 'landingPoint', 'playRead', 'receiverNumber', 'setSide', 'sidelines'].sort());
  });
  it('starts from the pre-snap picture and drops a track not refreshed for 1.5 s (edge cases)', () => {
    const { w, see } = stage();
    const log: (number | null)[] = [];
    runTicks(w, [see.stage], 18, (x) => { const e = see.view(VIEWER).entity(3); log[x.tick] = e === null ? null : e.staleTicks; });
    expect(log[0]).toBe(0); // everyone knows the alignment at the snap
    expect(log[1]).toBe(1); expect(log[15]).toBe(15);
    expect(log[16]).toBeNull(); expect(log[17]).toBeNull();
  });
});

describe('J3.1.2 field of view and attention', () => {
  it('does not update a player behind him, and picks him up again when the eyes turn (acceptance)', () => {
    const { w, see } = stage(), move = createMovement();
    place(w, 1, 15, 0); // 10 yd behind the viewer
    const py: (number | null)[] = [];
    runTicks(w, [see.stage, move.stage], 40, (x) => {
      sprint(x, 1, 15, 40);
      if (x.tick === 20) see.gazeAtPoint(VIEWER, 15, 10);
      const e = see.view(VIEWER).entity(1); py[x.tick] = e === null ? null : e.py;
    });
    expect(py[10]).toBe(0); // still where he was at the snap, though he has run 5 yd
    expect(py[19]).toBeNull();
    expect(py[32]!).toBeGreaterThan(8); // found again once the head came round
  });
  it('sees central vision exactly and peripheral vision late and offset; nothing outside the peripheral cone', () => {
    const { w, see } = stage();
    const [cx, cy] = offGaze(10, 8), [px, py] = offGaze(60, 8), [ex, ey] = offGaze(95, 8), [bx, by] = offGaze(110, 8);
    place(w, 0, cx, cy); place(w, 1, px, py); place(w, 2, ex, ey); place(w, 3, bx, by);
    const offsets: number[][] = [];
    runTicks(w, [see.stage], 12, (x) => {
      const v = see.view(VIEWER);
      expect(v.entity(0)!.px).toBeCloseTo(cx, 12); expect(v.entity(0)!.py).toBeCloseTo(cy, 12); expect(v.entity(0)!.staleTicks).toBe(0);
      if (x.tick > 0) offsets.push([v.entity(1)!.px - px, v.entity(1)!.py - py]);
      if (x.tick > 0) { expect(v.entity(2)!.staleTicks).toBe(0); expect(v.entity(3)!.staleTicks).toBe(x.tick); }
    });
    const [ox, oy] = offsets[0]!;
    expect(Math.hypot(ox!, oy!)).toBeGreaterThan(0); expect(Math.hypot(ox!, oy!)).toBeLessThan(3);
    for (const o of offsets) { expect(o[0]).toBeCloseTo(ox!, 12); expect(o[1]).toBeCloseTo(oy!, 12); } // one draw, held
  });
  it('widens peripheral vision with play recognition: plus 5 degrees a side per z', () => {
    const tracked = (rec: number, deg: number) => {
      const { w, see } = stage({ players: () => ({ attributes: { play_recognition: rec } }) });
      const [x, y] = offGaze(deg, 8); place(w, 0, x, y);
      runTicks(w, [see.stage], 4);
      return see.view(VIEWER).entity(0)!.staleTicks === 0;
    };
    expect(tracked(50, 98)).toBe(true); expect(tracked(50, 103)).toBe(false);
    expect(tracked(70, 108)).toBe(true); expect(tracked(70, 113)).toBe(false);
    expect(tracked(30, 88)).toBe(true); expect(tracked(30, 93)).toBe(false);
  });
  it('tracks only as many as his capacity, his keys first, then the nearest (acceptance)', () => {
    const count = (processing: number) => {
      const { w, see } = stage({ players: () => ({ attributes: { processing_speed: processing } }) });
      for (let e = 0; e < 7; e++) place(w, e, -5 - e, e - 3);
      runTicks(w, [see.stage], 3);
      return see.attentionCount(VIEWER);
    };
    expect(count(50)).toBe(3); expect(count(70)).toBe(4); expect(count(90)).toBe(5); expect(count(30)).toBe(2);
    const { w, see } = stage();
    for (let e = 0; e < 7; e++) place(w, e, -5 - e, e - 3);
    see.configure(VIEWER, { keys: [6, 5] }); // the two farthest
    runTicks(w, [see.stage], 6);
    const v = see.view(VIEWER);
    expect([0, 1, 2, 3, 4, 5, 6].filter((e) => v.entity(e)!.staleTicks === 0)).toEqual([0, 5, 6]);
    expect(v.entity(1)!.staleTicks).toBe(5);
  });
  it('feels the man he is engaged with whichever way he looks', () => {
    const { w, see } = stage();
    place(w, 4, 5.8, 0); // behind the viewer
    w.players.engagement[4] = 0; w.players.engagement[VIEWER] = 0;
    runTicks(w, [see.stage], 5);
    expect(see.view(VIEWER).entity(4)!.staleTicks).toBe(0);
  });
  it('hides the mesh from a box defender for the occlusion window unless the hidden man is his key', () => {
    const run = (keys: number[]) => {
      const { w, see } = stage();
      place(w, 1, -3, 0);
      see.configure(VIEWER, { keys, boxDefender: true });
      const stale: number[] = [];
      runTicks(w, [see.stage], 9, (x) => { if (x.tick === 0) see.setOcclusion(1, 6); stale[x.tick] = see.view(VIEWER).entity(1)!.staleTicks; });
      return stale;
    };
    expect(run([0])).toEqual([0, 1, 2, 3, 4, 5, 0, 0, 0]);
    expect(run([1])).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
});

describe('J3.2 key reading', () => {
  const KEY = 5;
  const constant = (key: number, flow = 0, side = 1): EvidenceSource => (_w, _s, _k, _d, out) => { out[0] = key; out[1] = side; out[2] = flow; out[3] = side; };
  function readTick(attributes: Record<string, number>, source: EvidenceSource, options: { seed?: number; noNoise?: boolean; ticks?: number; aggression?: number } = {}) {
    const { w, see } = stage({ seed: options.seed ?? 7, players: () => ({ attributes }) }, { evidence: source, test: { noNoise: options.noNoise ?? true } });
    place(w, KEY, -1, 0);
    see.configure(VIEWER, { keys: [KEY], readsKeys: true, aggression: options.aggression ?? 0 });
    let at = -1, first = 'unknown';
    runTicks(w, [see.stage], options.ticks ?? 30, (x) => { const r = see.view(VIEWER).playRead(); if (at < 0 && r.read !== 'unknown') { at = x.tick; first = r.read; } });
    return { at, first, w, see };
  }
  it('accumulates evidence after the key delay and commits at the threshold', () => {
    const r = readTick({}, constant(0.5));
    // Delay 0.25 s: evidence from tick 3, 0.6 * 0.5 a tick with gain 1, threshold 1.5: five ticks.
    expect(r.at).toBeGreaterThanOrEqual(7); expect(r.at).toBeLessThanOrEqual(8);
    expect(r.first).toBe('run');
    expect(r.see.view(VIEWER).playRead()).toEqual({ read: 'run', side: 'left', confidence: 1 });
    const ev = r.w.events.filter((e) => e.type === 'detail');
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ code: 'read_run', playerIds: [r.w.slots[VIEWER]!.playerId] });
    expect(readTick({}, constant(-0.5)).first).toBe('pass');
  });
  it('reads faster with better play recognition, and sooner on an aggressive call (acceptance: the linebacker steps later on play action when disciplined)', () => {
    const avg = readTick({}, constant(0.5)).at, good = readTick({ play_recognition: 80 }, constant(0.5)).at, poor = readTick({ play_recognition: 25 }, constant(0.5)).at;
    expect(good).toBeLessThan(avg); expect(avg).toBeLessThan(poor);
    expect(readTick({}, constant(0.5), { aggression: 0.3 }).at).toBeLessThan(avg);
    expect(readTick({ assignment_discipline: 80 }, constant(0.5)).at).toBeGreaterThanOrEqual(avg);
  });
  it('falls for false flow less with assignment discipline (J3.3.2)', () => {
    // The key says pass, the backfield flow says run, harder.
    const fake = constant(-0.4, 0.9);
    expect(readTick({ assignment_discipline: 20 }, fake).first).toBe('run');
    expect(readTick({ assignment_discipline: 85 }, fake).first).toBe('pass');
  });
  it('makes fewer wrong first reads with better play recognition when the key is faint and noisy', () => {
    const wrong = (rec: number) => {
      let n = 0;
      for (let seed = 1; seed <= 250; seed++) if (readTick({ play_recognition: rec }, constant(0.12), { seed, noNoise: false, ticks: 60 }).first === 'pass') n++;
      return n / 250;
    };
    const poor = wrong(30), good = wrong(70);
    expect(poor).toBeGreaterThan(0.05);
    expect(good).toBeLessThan(poor * 0.6);
  });
  it('takes a fresh key delay to revise a read', () => {
    const flip: EvidenceSource = (w, _s, _k, _d, out) => { out[0] = w.tick < 12 ? 0.5 : -1.5; out[1] = 1; };
    const { w, see } = stage({}, { evidence: flip, test: { noNoise: true } });
    see.configure(VIEWER, { keys: [KEY], readsKeys: true });
    const reads: string[] = [];
    runTicks(w, [see.stage], 30, (x) => { reads[x.tick] = see.view(VIEWER).playRead().read; });
    const crossed = reads.indexOf('pass');
    expect(reads[11]).toBe('run');
    // From +1.5 or more at tick 11, three ticks of -0.9 put him past -1.5 at tick 15 at the latest; the revision lands 3 ticks (0.25 s rounded up) after it crosses.
    expect(crossed).toBeGreaterThanOrEqual(17); expect(crossed).toBeLessThanOrEqual(19);
    expect(w.events.filter((e) => e.type === 'detail').map((e) => (e as { code: string }).code)).toEqual(['read_run', 'read_pass']);
  });
});

describe('J3.4 gaze', () => {
  it('turns the eyes toward a target at the gaze rate, not instantly', () => {
    const { w, see } = stage();
    const start = w.players.gazeRad[VIEWER]!;
    see.gazeAtPoint(VIEWER, 5, 30); // 90 degrees to his side
    const turned: number[] = [];
    runTicks(w, [see.stage], 5, (x) => { let d = Math.abs(x.players.gazeRad[VIEWER]! - start); if (d > Math.PI) d = 2 * Math.PI - d; turned[x.tick] = d; });
    expect(turned[0]).toBeCloseTo(0.6, 9); expect(turned[1]).toBeCloseTo(1.2, 9);
    expect(turned[2]).toBeCloseTo(Math.PI / 2, 6); expect(turned[4]).toBeCloseTo(Math.PI / 2, 6);
  });
  it('starts a player configured with his eyes on the ball looking at it, whichever way his hips face', () => {
    const { w, see } = stage();
    place(w, 0, 5, -20); w.ball.kind = 'held'; w.ball.carrierSlot = 0; w.ball.x = w.players.posX[0]!; w.ball.y = w.players.posY[0]!;
    facing(w, VIEWER, 180);
    see.configure(VIEWER, { gaze: 'ball' });
    runTicks(w, [see.stage], 8);
    const g = w.players.gazeRad[VIEWER]! * w.frame.attackDir;
    expect(Math.abs(Math.abs(g) - Math.PI / 2)).toBeLessThan(0.05);
    see.configure(VIEWER, { gaze: 'hips' });
    const loop = createTickLoop([{ name: 'perceive', run: see.stage.run }]);
    for (let i = 0; i < 8; i++) loop.step(w);
    expect(w.players.gazeRad[VIEWER]).toBeCloseTo(w.players.headingRad[VIEWER]!, 9);
  });
  it('a player told to find a ball he cannot see turns his eyes back to where the play started', () => {
    const { w, see } = stage();
    // The ball is in the air directly behind him: outside his field of view, so he has no ball to look at.
    place(w, VIEWER, 20, 0); facing(w, VIEWER, 0);
    w.ball.kind = 'passInFlight'; w.ball.carrierSlot = -1; w.ball.x = w.frame.originX; w.ball.y = w.frame.originY;
    const start = w.players.gazeRad[VIEWER]!;
    see.gazeAtBall(VIEWER);
    runTicks(w, [see.stage], 3);
    expect(w.players.gazeRad[VIEWER]).not.toBeCloseTo(start, 3);
  });
  it('follows a player as last perceived, and the hips by default', () => {
    const { w, see } = stage();
    place(w, 0, 5, -20);
    facing(w, VIEWER, 180);
    see.gazeAtSlot(VIEWER, 0);
    runTicks(w, [see.stage], 6);
    const g = w.players.gazeRad[VIEWER]! * w.frame.attackDir;
    expect(Math.abs(Math.abs(g) - Math.PI / 2)).toBeLessThan(1e-6);
    see.gazeWithHips(VIEWER);
    const loop = createTickLoop([{ name: 'perceive', run: see.stage.run }]);
    for (let i = 0; i < 6; i++) loop.step(w);
    expect(w.players.gazeRad[VIEWER]).toBeCloseTo(w.players.headingRad[VIEWER]!, 9);
  });
});

describe('J3.5 the ball', () => {
  it('sees a held ball moving with the man who holds it', () => {
    const { w, see } = stage({}, { test: { fixedDelayS: 0, fullAttention: true, noNoise: true } });
    place(w, 0, -4, 0);
    w.ball.kind = 'held'; w.ball.carrierSlot = 0; w.ball.x = w.players.posX[0]!; w.ball.y = w.players.posY[0]!;
    w.players.velX[0] = 3 * w.frame.attackDir; w.players.velY[0] = -5 * w.frame.attackDir;
    runTicks(w, [see.stage], 3);
    const b = see.view(VIEWER).ball()!;
    expect([b.velPx, b.velPy]).toEqual([3, -5]);
  });
  it('believes the old carrier until the handoff has been seen (J3.5.2)', () => {
    const { w, see } = stage();
    place(w, 0, -4, 0); place(w, 1, -4, 1);
    w.ball.kind = 'held'; w.ball.carrierSlot = 0;
    const believed: number[] = [];
    runTicks(w, [see.stage], 14, (x) => {
      if (x.tick === 5) { x.ball.carrierSlot = 1; x.ball.y = x.players.posY[1]!; }
      believed[x.tick] = see.view(VIEWER).believedCarrierSlot();
    });
    // The change is in the world from tick 6. He sees the ball 0.25 + 0.05 s late: 3 ticks.
    expect(believed.slice(0, 9).every((c) => c === 0)).toBe(true);
    expect(believed[9]).toBe(1);
  });
  it('sees a loose ball at once when near and facing it, 0.2 s late when far, 0.5 s more when not looking (J3.5.2)', () => {
    const seenAt = (px: number, deg: number) => {
      const { w, see } = stage();
      place(w, VIEWER, px, 0); facing(w, VIEWER, deg);
      w.ball.kind = 'held'; w.ball.carrierSlot = 0; w.ball.x = w.frame.originX; w.ball.y = w.frame.originY;
      let at = -1;
      runTicks(w, [see.stage], 30, (x) => { if (x.tick === 5) { x.ball.kind = 'loose'; x.ball.carrierSlot = -1; } if (at < 0 && see.view(VIEWER).ballKind() === 'loose') at = x.tick; });
      return at;
    };
    expect(seenAt(2, 180)).toBe(6);
    expect(seenAt(20, 180)).toBe(6 + 4); // 0.25 + 0.2 = 0.45 s: the state four ticks back
    expect(seenAt(20, 0)).toBe(6 + 9); // 0.95 s
  });
  it('estimates the landing point with an error that shrinks to zero by 60% of the flight, after first seeing the throw (J3.5.1)', () => {
    const { w, see } = stage();
    place(w, 0, -4, 0); place(w, 12, 5, 4); facing(w, 12, 0); // slot 12 is not watching the passer
    const landX = w.frame.originX + 20 * w.frame.attackDir, landY = w.frame.originY + 6 * w.frame.attackDir;
    const out = new Float64Array(2), err: (number | null)[] = [], late: boolean[] = [];
    runTicks(w, [see.stage], 30, (x) => {
      if (x.tick === 5) { x.ball.kind = 'passInFlight'; see.notifyBallInAir(x, 0, landX, landY, 20); }
      err[x.tick] = see.landingEstimate(x, VIEWER, out) ? Math.hypot(out[0]! - 20, out[1]! - 6) : null;
      late[x.tick] = see.landingEstimate(x, 12, out);
      // What he acts on is the same estimate, in his view, from the tick he has one.
      const lp = (see.view(VIEWER) as PlayerView).landingPoint();
      if (x.tick >= 9 && x.tick <= 20) { expect(lp).not.toBeNull(); expect(Math.hypot(lp!.px - out[0]!, lp!.py - out[1]!) >= 0).toBe(true); expect(Math.hypot(lp!.px - 20, lp!.py - 6)).toBeLessThanOrEqual((err[x.tick - 1] ?? Infinity) + 1e-9); }
      if (x.tick <= 6) expect(lp).toBeNull();
    });
    // The ball is caught or down: he has no landing point any more.
    w.ball.kind = 'held'; w.ball.carrierSlot = 0;
    runTicks(w, [see.stage], 1);
    expect((see.view(VIEWER) as PlayerView).landingPoint()).toBeNull();
    // He knows where the sidelines are, in his own frame.
    const sl = (see.view(VIEWER) as PlayerView).sidelines();
    expect(sl.hi - sl.lo).toBeCloseTo(w.geometry.widthYd, 9);
    expect(sl.lo).toBeLessThan(0); expect(sl.hi).toBeGreaterThan(0);
    expect(err[7]).toBeNull(); expect(err[8]).not.toBeNull(); // 0.25 s after release: 3 ticks
    expect(late[9]).toBe(false); expect(late[10]).toBe(true); // 0.2 s more without eyes on the passer
    expect(err[8]!).toBeGreaterThan(0);
    for (let t = 9; t <= 17; t++) expect(err[t]!).toBeLessThan(err[t - 1]!);
    expect(err[17]!).toBeLessThan(1e-12); expect(err[25]!).toBeLessThan(1e-12);
    expect(err[8]! / err[11]!).toBeCloseTo((1 - 3 / 12) / (1 - 6 / 12), 9); // linear in flight fraction
  });
});

describe('J3.6 calls', () => {
  it('delivers a call 0.2 s after it is made, and only to players who got it', () => {
    const { w, see } = stage();
    place(w, 12, 5, 4); place(w, 13, 5, -4);
    const heard: boolean[][] = [];
    let delivered = -1;
    runTicks(w, [see.stage], 8, (x) => {
      if (x.tick === 2) delivered = see.deliverCall(x, VIEWER, [12, 13], 'check_cover_3', 0, 1);
      heard[x.tick] = [see.view(12).heard('check_cover_3'), see.view(13).heard('check_cover_3'), see.view(VIEWER).heard('check_cover_3')];
    });
    expect(delivered).toBe(2); // chance 0.97 - 0.02 + 0.05 = 1
    expect(heard[3]).toEqual([false, false, false]);
    expect(heard[4]).toEqual([true, true, false]);
    expect(() => see.deliverCall(w, VIEWER, [13, 12], 'x', 0, 0)).toThrow(/ascending/);
  });
  it('loses calls to crowd noise and distance at the formula rate, and replays the same', () => {
    const run = (seed: number) => {
      const { w, see } = stage({ seed });
      for (let s = 12; s < 17; s++) place(w, s, 5, 40);
      let got = 0;
      runTicks(w, [see.stage], 100, (x) => { got += see.deliverCall(x, VIEWER, [12, 13, 14, 15, 16], 'alert', 1, 0); });
      return got / 500;
    };
    const rate = run(5);
    expect(rate).toBeGreaterThan(0.45); expect(rate).toBeLessThan(0.59); // formula: 0.97 - 0.25 - 0.20 = 0.52
    expect(run(5)).toBe(rate);
    expect(run(6)).not.toBe(rate);
  });
});

describe('receiver numbers and determinism', () => {
  it('numbers eligible receivers from the sideline in on each side of the ball at the snap (J4.1.2)', () => {
    const { w, see } = stage();
    place(w, 1, -1, 20); place(w, 2, -1, 12); place(w, 3, -3, 6); place(w, 4, -1, -15); place(w, 5, -1, -4); place(w, 6, -1, 9);
    for (const s of [1, 2, 3, 4, 5]) w.players.eligible[s] = 1;
    runTicks(w, [see.stage], 1);
    const v = see.view(VIEWER);
    expect([1, 2, 3, 4, 5, 6].map((s) => v.receiverNumber(s))).toEqual([1, 2, 3, 1, 2, 0]);
  });
  it('numbers them again at the snap, from where they lined up and not from the huddle', () => {
    const { w, see } = stage();
    for (const s of [1, 2, 3]) { w.players.eligible[s] = 1; place(w, s, -8, 0.5 * s); }
    w.tick = -30;
    const loop = createTickLoop([see.stage]);
    loop.begin(w);
    loop.step(w);
    expect([1, 2, 3].map((s) => see.view(VIEWER).receiverNumber(s))).toEqual([3, 2, 1]);
    place(w, 1, -1, 20); place(w, 2, -1, 12); place(w, 3, -1, -9);
    while (w.tick < 1) loop.step(w);
    expect([1, 2, 3].map((s) => see.view(VIEWER).receiverNumber(s))).toEqual([1, 2, 1]);
  });
  function trace(seed: number) {
    const w = fixtureWorld({ seed }), see = createPerception(), move = createMovement(), out: string[] = [];
    for (let s = 11; s < SLOT_COUNT; s++) { see.configure(s, { keys: [s - 11] }); see.gazeAtSlot(s, s - 11); }
    runTicks(w, [see.stage, move.stage], 25, (x) => {
      for (let s = 0; s < 11; s++) sprint(x, s, 20, s * 4 - 20);
      out.push(JSON.stringify([see.view(11), see.view(15), see.view(3)]));
    });
    return out;
  }
  it('gives the same perceived worlds for the same seed and different ones for another', () => {
    const a = trace(11), b = trace(11), c = trace(12);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});
