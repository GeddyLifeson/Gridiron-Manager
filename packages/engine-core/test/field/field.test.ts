import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toField, toPlay, TruthEvent, SLOT_COUNT, MOVE_MODES, type TickWorld } from '@gm/schema';
import { stream, seedFromNumber } from '../../src/index.ts';
import {
  fieldGeometry, yardLineName, xOfYardLine, playFrame, landmarkPy, dividerPy, clipPxToEndLine, bodyRadiusYd,
  dist, bearing, relativeAngle, wrapAngle, leverage, cushion, timeToIntercept, nearest, inRect, inPolygon, gapBetween, helpNearby,
  createBoundaryWatcher, createHeldBallStage, isOutOfBounds, crossingFraction, RULE_KEYS, PARAMS,
} from '../../src/field/index.ts';
import { createMovement } from '../../src/kinematics/index.ts';
import { createTickLoop } from '../../src/tick/index.ts';
import { ParamFile, RuleKeyManifest } from '@gm/schema';
import { fixtureRules, fixtureWorld, place, FP } from '../tick/support.ts';

const G = fieldGeometry(fixtureRules());

describe('J1.1.1 field frame from rule keys', () => {
  it('builds every dimension from the rule set', () => {
    expect(G.lengthYd).toBe(120);
    expect(G.widthYd).toBeCloseTo(53.333, 3);
    expect(G.goalLineWestX).toBe(10);
    expect(G.goalLineEastX).toBe(110);
    expect(G.hashSouthY).toBeCloseTo(23.583, 3);
    expect(G.hashNorthY).toBeCloseTo(29.75, 3);
    expect(G.centreY).toBeCloseTo(26.667, 3);
    expect(G.uprightSouthY).toBeCloseTo(23.583, 3);
    expect(G.uprightNorthY).toBeCloseTo(29.75, 3);
    expect(G.crossbarHeightYd).toBeCloseTo(10 / 3, 9);
  });
  it('reads a different hash from a different rule set (acceptance 4)', () => {
    const wide = fieldGeometry(fixtureRules(60));
    expect(wide.hashSouthY).toBeCloseTo(20, 9);
    expect(wide.hashNorthY).toBeCloseTo(33.333, 3);
    const a = playFrame(G, FP, 40, G.hashSouthY, 1, 50), b = playFrame(wide, FP, 40, wide.hashSouthY, 1, 50);
    expect(a.originY).not.toBe(b.originY);
    expect(G.widthYd - a.originY).toBeLessThan(wide.widthYd - b.originY);
  });
  it('converts a spot to a yard-line name and back within 0.01 yd (acceptance 1)', () => {
    for (let x = 10; x <= 110; x += 0.37) expect(xOfYardLine(G, yardLineName(G, x))).toBeCloseTo(x, 2);
    expect(yardLineName(G, 30)).toEqual({ half: 'west', yardLine: 20 });
    expect(yardLineName(G, 90)).toEqual({ half: 'east', yardLine: 20 });
    expect(yardLineName(G, 60).half).toBe('midfield');
  });
  it('puts a kick straight down the centre through the middle of the uprights (acceptance 2)', () => {
    expect(G.centreY - G.uprightSouthY).toBeCloseTo(G.uprightNorthY - G.centreY, 12);
    expect(G.centreY).toBeGreaterThan(G.uprightSouthY);
  });
  it('holds no literal field dimension in the module sources (acceptance 3)', () => {
    const src = fileURLToPath(new URL('../../src', import.meta.url));
    for (const folder of ['field', 'kinematics', 'tick', 'perception']) {
      for (const file of readdirSync(join(src, folder))) {
        const code = readFileSync(join(src, folder, file), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
        expect(code, `${folder}/${file}`).not.toMatch(/53\.3|23\.58|29\.75|26\.6|(?<![\w.])120(?![\w.])/);
      }
    }
  });
  it('exports a valid rule-key manifest and parameter file', () => {
    expect(() => RuleKeyManifest.parse(RULE_KEYS)).not.toThrow();
    expect(() => ParamFile.parse(PARAMS)).not.toThrow();
  });
});

describe('J1.1.2 play frame', () => {
  // J1.1.2 acceptance 1 asks for exact equality. The contract's toPlay and toField subtract and add the
  // origin, which is exact only to the last bit of a double, so this test holds them to 1e-12 yd and the
  // gap is reported to the integrator (the functions live in @gm/schema).
  it('round-trips any point to the last bit (acceptance 1)', () => {
    const rng = stream(seedFromNumber(11), 'resolver', [1, 1]);
    for (const dir of [1, -1] as const) {
      const f = playFrame(G, FP, 42, 23, dir, 42 + 10 * dir);
      for (let i = 0; i < 500; i++) {
        const p = { x: Math.round(rng.uniform() * 12000) / 100, y: Math.round(rng.uniform() * 5333) / 100 };
        const q = toField(f, toPlay(f, p));
        expect(Math.abs(q.x - p.x)).toBeLessThan(1e-12); expect(Math.abs(q.y - p.y)).toBeLessThan(1e-12);
      }
    }
  });
  it('names the wide side, the line to gain and the goal line', () => {
    const east = playFrame(G, FP, 30, G.hashSouthY, 1, 40);
    expect(east.fieldSide).toBe('left'); // ball on the south hash, attacking east: the wide side is north, his left
    expect(east.lineToGainPx).toBe(10); expect(east.goalLinePx).toBe(80);
    const west = playFrame(G, FP, 30, G.hashSouthY, -1, 20);
    expect(west.fieldSide).toBe('right'); expect(west.lineToGainPx).toBe(10); expect(west.goalLinePx).toBe(20);
    expect(playFrame(G, FP, 30, G.centreY + 0.5, 1, 40).fieldSide).toBe('middle');
  });
});

describe('J1.1.3 landmarks', () => {
  it('resolves landmarks on each side inside the field', () => {
    const rules = fixtureRules(), f = playFrame(G, FP, 30, G.hashSouthY, 1, 40);
    for (const name of ['sideline', 'hash', 'uprightNear', 'uprightFar', 'middle'] as const) {
      for (const side of ['left', 'right'] as const) {
        const y = f.originY + landmarkPy(name, side, f, G, rules)! * f.attackDir;
        expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(G.widthYd);
      }
    }
    expect(landmarkPy('sideline', 'left', f, G, rules)).toBeCloseTo(G.widthYd - G.hashSouthY, 9);
    expect(landmarkPy('sideline', 'right', f, G, rules)).toBeCloseTo(-G.hashSouthY, 9);
    expect(landmarkPy('hash', 'right', f, G, rules)).toBeCloseTo(0, 9);
    const flipped = playFrame(G, FP, 30, G.hashSouthY, -1, 20);
    expect(landmarkPy('sideline', 'right', flipped, G, rules)).toBeCloseTo(-(G.widthYd - G.hashSouthY), 9);
    expect(dividerPy(2, 6)).toBe(4);
  });
  it('gives null for the numbers until the rule set has their offsets, never a guess', () => {
    const f = playFrame(G, FP, 30, G.centreY, 1, 40);
    expect(landmarkPy('numbersBottom', 'left', f, G, fixtureRules())).toBeNull();
    const withKey = fixtureRules(70.75, { 'field.numbers_bottom_from_sideline_ft': 30 }); // FIXTURE value
    expect(landmarkPy('numbersBottom', 'right', f, G, withKey)).toBeCloseTo(10 - G.centreY, 9);
  });
  it('cuts an aiming point at the end line less the margin', () => {
    const f = playFrame(G, FP, 100, G.centreY, 1, 110);
    expect(clipPxToEndLine(40, f, G, FP)).toBe(19);
    expect(clipPxToEndLine(12, f, G, FP)).toBe(12);
  });
  it('sizes the body circle from weight (J1.4.1)', () => {
    expect(bodyRadiusYd(200, FP)).toBeCloseTo(0.42, 9);
    expect(bodyRadiusYd(320, FP)).toBeCloseTo(0.492, 9);
  });
});

describe('J1.5.1 geometry helpers', () => {
  it('measures distance, bearing and relative angle, with coincident points safe', () => {
    expect(dist(0, 0, 3, 4)).toBe(5);
    expect(bearing(1, 1, 1, 1)).toBe(0);
    expect(bearing(0, 0, 0, 2)).toBeCloseTo(Math.PI / 2, 9);
    expect(relativeAngle(Math.PI / 2, 0, 0, 5, 0)).toBeCloseTo(-Math.PI / 2, 9);
    expect(relativeAngle(0, 2, 2, 2, 2)).toBe(0);
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 9);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI, 9);
  });
  it('classifies leverage and cushion', () => {
    expect(leverage(8, 10, 0.5)).toBe('inside');
    expect(leverage(12, 10, 0.5)).toBe('outside');
    expect(leverage(10.4, 10, 0.5)).toBe('headUp');
    expect(leverage(-8, -10, 0.5)).toBe('inside');
    expect(leverage(-12, -10, 0.5)).toBe('outside');
    expect(cushion(7, 0)).toBe('over'); expect(cushion(-1, 0)).toBe('under');
  });
  it('solves time to intercept on hand-computed cases', () => {
    expect(timeToIntercept(0, 0, 10, 10, 0, 0, 0)).toBeCloseTo(1, 12);
    expect(timeToIntercept(0, 0, 5, 0, 4, 3, 0)).toBeCloseTo(1, 12); // 3-4-5 triangle
    expect(timeToIntercept(0, 0, 8, 5, 0, 8, 0)).toBe(-1); // equal speed, running directly away
    expect(timeToIntercept(0, 0, 8, 5, 0, 9, 0)).toBe(-1);
    expect(timeToIntercept(0, 0, 8, 5, 5, -8, 0)).toBeGreaterThan(0); // equal speed, with the angle
    expect(timeToIntercept(2, 2, 8, 2, 2, 1, 1)).toBe(0);
  });
  it('finds nearest players, zones, gaps and help', () => {
    const w = fixtureWorld();
    for (let s = 0; s < SLOT_COUNT; s++) { w.players.posX[s] = 200 + s; w.players.posY[s] = 0; }
    w.players.posX[3] = 1; w.players.posX[7] = 2; w.players.posX[9] = 2; w.players.posX[15] = 0.5;
    const mask = new Uint8Array(SLOT_COUNT).fill(1); mask[15] = 0;
    const out = new Int16Array(3), d2 = new Float64Array(3);
    expect(nearest(w.players, 0, 0, mask, 3, out, d2)).toBe(3);
    expect(Array.from(out)).toEqual([3, 7, 9]);
    expect(inRect(1, 1, { minPx: 0, maxPx: 2, minPy: 0, maxPy: 2 })).toBe(true);
    expect(inRect(3, 1, { minPx: 0, maxPx: 2, minPy: 0, maxPy: 2 })).toBe(false);
    expect(inPolygon(1, 1, [0, 4, 0], [0, 0, 4])).toBe(true);
    expect(inPolygon(3, 3, [0, 4, 0], [0, 0, 4])).toBe(false);
    const gap = new Float64Array(3);
    gapBetween(0, 0, 0.4, 2, 0, 0.5, gap);
    expect(gap[0]).toBeCloseTo(1.1, 12); expect(gap[1]).toBe(1); expect(gap[2]).toBe(0);
    gapBetween(0, 0, 0.6, 1, 0, 0.6, gap);
    expect(gap[0]).toBe(0);
    // Help: defender 12, carrier 0 attacking +x at x = 50. Teammates 13 (ahead, near), 14 (behind the carrier), 16 (engaged), 17 (down).
    const team = Array.from({ length: SLOT_COUNT }, (_, s) => (s < 11 ? 0 : 1));
    w.players.posX[0] = 50; w.players.attackDir[0] = 1;
    w.players.posX[12] = 55; w.players.posX[13] = 56; w.players.posX[14] = 49; w.players.posX[16] = 54; w.players.posX[17] = 57;
    w.players.engagement[16] = 0; w.players.moveMode[17] = MOVE_MODES.indexOf('down');
    expect(helpNearby(w.players, team, 12, 0, 8, MOVE_MODES.indexOf('down'))).toBe(1);
  });
});

describe('J1.5.2 boundaries and planes', () => {
  function runner(w: TickWorld, slot: number, px: number, py: number) {
    const i = w.intents[slot]!;
    i.target = { px, py }; i.moveMode = 'sprint'; i.arrival = 'through'; i.effort = 1;
  }
  function loop() {
    const move = createMovement(), watch = createBoundaryWatcher();
    return createTickLoop([move.stage, createHeldBallStage(), watch.moveStage, watch.detectStage]);
  }
  it('rules a runner across the goal line at the interpolated time, not the next tick (J1.3.1 acceptance 2)', () => {
    const w = fixtureWorld({ ballX: 105, distanceYd: 5 });
    place(w, 0, 0, 0); w.players.velX[0] = 8; w.ball.kind = 'held'; w.ball.carrierSlot = 0; w.players.hasBall[0] = 1;
    runner(w, 0, 30, 0);
    loop().run(w, { stopAt: (x) => x.tick >= 12 });
    const goal = w.events.filter((e) => e.type === 'boundary' && e.kind === 'ball_crosses_goal_line');
    expect(goal).toHaveLength(1);
    const e = goal[0]!;
    expect(() => TruthEvent.parse(e)).not.toThrow();
    expect(e.type === 'boundary' && e.spot.x).toBe(110);
    expect(e.type === 'boundary' && e.playerId).toBe(100);
    // The ball is 0.3 yd ahead of the body (J1.5.2): it needs 4.7 yd at a little over 8 yd/s.
    expect(e.t).toBeGreaterThan(0.45); expect(e.t).toBeLessThan(0.6);
    expect(Math.round(e.t * 10) / 10).not.toBe(e.t); // between ticks
    // The line to gain is the goal line here, reached at the same instant; time order then kind is stable.
    expect(w.events.filter((x) => x.type === 'boundary' && x.kind === 'ball_reaches_line_to_gain')).toHaveLength(1);
  });
  it('orders a step on the sideline before the ball reaching the goal line by interpolated time', () => {
    const w = fixtureWorld({ ballX: 108, ballY: 1.2, distanceYd: 2 });
    place(w, 0, 0, 0); w.ball.kind = 'held'; w.ball.carrierSlot = 0; w.players.hasBall[0] = 1;
    w.players.velX[0] = 5; w.players.velY[0] = -6;
    runner(w, 0, 6, -7.2);
    loop().run(w, { stopAt: (x) => x.tick >= 6 });
    const kinds = w.events.filter((e) => e.type === 'boundary').map((e) => (e.type === 'boundary' ? e.kind : ''));
    expect(kinds.slice(0, 2)).toEqual(['player_out_of_bounds', 'ball_out_of_bounds']);
    expect(kinds.indexOf('player_out_of_bounds')).toBeLessThan(kinds.indexOf('ball_crosses_goal_line') === -1 ? 99 : kinds.indexOf('ball_crosses_goal_line'));
    expect(w.players.wentOob[0]).toBe(1);
    const times = w.events.map((e) => e.t);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
  it('uses the body circle less a foot allowance for the sideline', () => {
    expect(isOutOfBounds(50, 0.3, 0.42, 120, 160 / 3, 0.15)).toBe(false);
    expect(isOutOfBounds(50, 0.27, 0.42, 120, 160 / 3, 0.15)).toBe(true);
    expect(isOutOfBounds(119.8, 20, 0.42, 120, 160 / 3, 0.15)).toBe(true);
    expect(crossingFraction(2, 0, 0.5)).toBe(0.75);
  });
  it('reports a loose ball going out of bounds', () => {
    const w = fixtureWorld();
    w.ball.kind = 'loose'; w.ball.x = 50; w.ball.y = 0.4;
    const watch = createBoundaryWatcher();
    const roll = { name: 'move' as const, run: (x: TickWorld, dt: number) => { x.ball.y -= 6 * dt; } };
    createTickLoop([roll, watch.moveStage, watch.detectStage]).run(w, { stopAt: (x) => x.tick >= 3 });
    const out = w.events.filter((e) => e.type === 'boundary' && e.kind === 'ball_out_of_bounds');
    expect(out).toHaveLength(1);
    expect(out[0]!.type === 'boundary' && out[0]!.playerId).toBeNull();
    expect(out[0]!.t).toBeCloseTo(0.07, 2);
  });
});
