import { describe, expect, it } from 'vitest';
import { MOVE_MODES, ParamFile, SLOT_COUNT, SUBSTEPS, TICK_S, type TickStage, type TickWorld } from '@gm/schema';
import { DMATH, stream, seedFromNumber } from '../../src/index.ts';
import {
  fitSprint, sprintTimeS, movementParams, cutMultiplier, codZOf, createMovement, createPathFollower, pursuitAim, pickDelayS,
  contactNumbers, simulateSprint, simulateShuttle, fitChangeOfDirectionZ, FORTY_YD, SPLIT_YD, PARAMS, type ContactNumbers, type Waypoint,
} from '../../src/kinematics/index.ts';
import { createTickLoop, createTrajectoryRecorder, decodeTrajectory } from '../../src/tick/index.ts';
import { fixturePlayer, fixtureWorld, place, playX, playY, KP, FP, PARAM_TABLE } from '../tick/support.ts';

const DT = TICK_S / SUBSTEPS;
/** Forty and split pairs across the J2.2.1 range, with split ratios real players show (2.5 to 3.2). */
const SAMPLE: [number, number][] = [];
for (let i = 0; i < 20; i++) { const forty = 4.25 + (1.15 * i) / 19; SAMPLE.push([forty, forty / (2.82 + 0.012 * (i % 7))]); }

function sprintTo(w: TickWorld, slot: number, px: number, py: number, arrival: 'through' | 'arrive' | 'breakdown' = 'through', mode: 'sprint' | 'run' | 'backpedal' | 'shuffle' = 'sprint') {
  const i = w.intents[slot]!;
  i.target = { px, py }; i.moveMode = mode; i.arrival = arrival; i.effort = 1;
}
function speed(w: TickWorld, s: number) { return Math.hypot(w.players.velX[s]!, w.players.velY[s]!); }

describe('J2.2.1 speed and acceleration from timed drills', () => {
  it('exports a valid parameter file', () => { expect(() => ParamFile.parse(PARAMS)).not.toThrow(); });
  it('converges for forties from 4.25 to 5.40 s and reproduces both inputs within 0.02 s', () => {
    for (const [forty, split] of SAMPLE) {
      const fit = fitSprint(forty, split, KP);
      expect(fit.converged).toBe(true);
      expect(Math.abs(sprintTimeS(fit.vMaxYps, fit.tauS, DT, FORTY_YD) - forty)).toBeLessThan(0.02);
      expect(Math.abs(sprintTimeS(fit.vMaxYps, fit.tauS, DT, SPLIT_YD) - split)).toBeLessThan(0.02);
    }
    // The J2.1.2 examples: 4.52 with 1.55 and 5.40 with 1.85 give tau near 0.63 and 0.75 s in the closed form.
    expect(fitSprint(4.52, 1.55, KP).tauS).toBeGreaterThan(0.5); expect(fitSprint(4.52, 1.55, KP).tauS).toBeLessThan(0.75);
    expect(fitSprint(5.4, 1.85, KP).tauS).toBeGreaterThan(fitSprint(4.52, 1.55, KP).tauS);
  });
  it('flags a split the model cannot produce instead of inventing a fit', () => {
    expect(fitSprint(4.5, 0.9, KP).converged).toBe(false);
  });
  it('applies the pads factor and the grade form for change of direction', () => {
    const p = fixturePlayer(1, { codZ: 1 }), m = movementParams(p, KP, FP).movement;
    expect(m.vMaxYps).toBeCloseTo(fitSprint(4.52, 1.55, KP).vMaxYps * 0.97, 9);
    expect(m.aLatYps2).toBeCloseTo(10.5, 9); expect(m.aBrakeYps2).toBeCloseTo(8.8, 9);
    expect(codZOf(m, KP)).toBeCloseTo(1, 9);
    expect(m.bodyRadiusYd).toBeCloseTo(0.42, 9);
    expect(movementParams(fixturePlayer(2, { codZ: 9 }), KP, FP).clamped).toBe(true);
  });
});

describe('J2.1 the movement update', () => {
  it('runs a straight forty in the true forty time within 0.03 s through the real update (J2.1.1 acceptance 1, J2.1.2)', () => {
    for (const [forty, split] of SAMPLE) {
      const p = fixturePlayer(1, { fortyS: forty, tenSplitS: split });
      const m = movementParams(p, KP, FP).movement, noPads = { ...m, vMaxYps: m.vMaxYps / KP.padsFactor! };
      const t = simulateSprint(p, noPads, PARAM_TABLE, DMATH, SPLIT_YD, FORTY_YD);
      expect(Math.abs(t.fortyS - forty)).toBeLessThan(0.03);
      expect(Math.abs(t.splitS - split)).toBeLessThan(0.02);
      expect(t.maxSpeedYps).toBeLessThanOrEqual(noPads.vMaxYps);
    }
  });
  it('never lets a player exceed his fresh top speed (J2.1.1 acceptance 2)', () => {
    const w = fixtureWorld({ seed: 4 }), move = createMovement(), rng = stream(seedFromNumber(4), 'resolver', [1, 2]);
    const modes = ['sprint', 'run', 'backpedal', 'shuffle'] as const;
    const decide: TickStage = { name: 'decide', run: (x) => {
      if (x.tick % 7 !== 0) return;
      for (let s = 0; s < SLOT_COUNT; s++) {
        sprintTo(x, s, rng.uniform() * 60 - 10, rng.uniform() * 40 - 20, (['through', 'arrive', 'breakdown'] as const)[rng.int(0, 2)], modes[rng.int(0, 3)]);
        x.players.gazeRad[s] = rng.uniform() * 6 - 3;
      }
    } };
    const check: TickStage = { name: 'detect', run: (x) => { for (let s = 0; s < SLOT_COUNT; s++) expect(speed(x, s)).toBeLessThanOrEqual(x.slots[s]!.movement.vMaxYps + 1e-12); } };
    createTickLoop([decide, move.stage, check]).run(w, { stopAt: (x) => x.tick >= 400 });
  });
  it('stops on a point from full speed within 0.3 yd (J2.3.4)', () => {
    const w = fixtureWorld(), move = createMovement();
    place(w, 0, 0, 0); sprintTo(w, 0, 30, 0, 'arrive');
    createTickLoop([move.stage]).run(w, { stopAt: (x) => x.tick >= 120 });
    expect(Math.hypot(playX(w, 0) - 30, playY(w, 0))).toBeLessThan(0.3);
    expect(speed(w, 0)).toBeLessThan(0.5);
  });
  it('holds breakdown speed at 40% of top speed', () => {
    const w = fixtureWorld(), move = createMovement();
    place(w, 0, 0, 0); sprintTo(w, 0, 25, 0, 'breakdown');
    let atTarget = 0;
    createTickLoop([move.stage]).run(w, { stopAt: (x) => { if (playX(x, 0) > 24.5 && atTarget === 0) atTarget = speed(x, 0); return x.tick >= 60; } });
    const top = w.slots[0]!.movement.vMaxYps;
    expect(atTarget).toBeGreaterThan(0.38 * top); expect(atTarget).toBeLessThan(0.55 * top);
  });
  it('limits the turn at speed to aLat over v and lifts it under the pivot speed (J2.1.3)', () => {
    const w = fixtureWorld(), move = createMovement();
    place(w, 0, 0, 0); w.players.velX[0] = 8; sprintTo(w, 0, 0, 30); // told to turn 90 degrees at 8 yd/s
    move.stage.begin!(w); move.stage.run(w, DT);
    // The change across his velocity in one sub-step is aLat * dt: a turn rate of aLat / v.
    expect(w.players.velY[0]!).toBeGreaterThan(0);
    expect(w.players.velY[0]!).toBeLessThanOrEqual(w.slots[0]!.movement.aLatYps2 * DT + 1e-12);
    expect(w.players.velX[0]!).toBeGreaterThan(7);
    const slow = fixtureWorld(), move2 = createMovement();
    place(slow, 0, 0, 0); slow.players.velX[0] = 1; sprintTo(slow, 0, 0, 30);
    move2.stage.begin!(slow); move2.stage.run(slow, DT);
    expect(Math.abs(slow.players.velX[0]!)).toBeLessThan(1e-9); // pivoted in place
    expect(slow.players.velY[0]! * slow.frame.attackDir).toBeGreaterThan(1);
  });
  it('never lets an equal pursuer catch a carrier running directly away, and lets him with an angle (J2.1.3 acceptance 2)', () => {
    const chase = (py: number) => {
      const w = fixtureWorld(), move = createMovement(), out = new Float64Array(2);
      place(w, 0, 10, 0); place(w, 11, 0, py);
      w.players.velX[0] = w.slots[0]!.movement.vMaxYps * w.frame.attackDir;
      const tgt = { px: 0, py: 0 };
      let caught = false;
      const decide: TickStage = { name: 'decide', run: (x) => {
        sprintTo(x, 0, 200, 0);
        pursuitAim(playX(x, 11), playY(x, 11), x.slots[11]!.movement.vMaxYps, playX(x, 0), playY(x, 0), x.players.velX[0]! * x.frame.attackDir, x.players.velY[0]! * x.frame.attackDir, 4, KP, out);
        tgt.px = out[0]!; tgt.py = out[1]!;
        const i = x.intents[11]!; i.target = tgt; i.moveMode = 'sprint'; i.arrival = 'through'; i.effort = 1;
        if (Math.hypot(playX(x, 0) - playX(x, 11), playY(x, 0) - playY(x, 11)) < 1) caught = true;
      } };
      createTickLoop([decide, move.stage]).run(w, { stopAt: (x) => caught || x.tick >= 80 });
      return caught;
    };
    expect(chase(0)).toBe(false);
    expect(chase(0)).toBe(false);
    // Start level with him downfield and 12 yd to the side of his path: geometry gives the angle.
    const w = fixtureWorld(), move = createMovement(), out = new Float64Array(2);
    place(w, 0, 0, 0); place(w, 11, 30, 12);
    const tgt = { px: 0, py: 0 };
    let caught = false;
    const decide: TickStage = { name: 'decide', run: (x) => {
      sprintTo(x, 0, 200, 0);
      pursuitAim(playX(x, 11), playY(x, 11), x.slots[11]!.movement.vMaxYps, playX(x, 0), playY(x, 0), x.players.velX[0]! * x.frame.attackDir, x.players.velY[0]! * x.frame.attackDir, 4, KP, out);
      tgt.px = out[0]!; tgt.py = out[1]!;
      const i = x.intents[11]!; i.target = tgt; i.moveMode = 'sprint'; i.arrival = 'through'; i.effort = 1;
      if (Math.hypot(playX(x, 0) - playX(x, 11), playY(x, 0) - playY(x, 11)) < 1) caught = true;
    } };
    createTickLoop([decide, move.stage]).run(w, { stopAt: (x) => caught || x.tick >= 80 });
    expect(caught).toBe(true);
  });
  it('slows turning and stopping on poor footing, and forward acceleration by half as much (J2.1.1 step 5)', () => {
    const stopDistance = (footing: number) => {
      const w = fixtureWorld();
      (w as { environment: TickWorld['environment'] }).environment = { ...w.environment, derived: { ...w.environment.derived, footing } };
      const move = createMovement();
      place(w, 0, 0, 0); w.players.velX[0] = 8 * w.frame.attackDir;
      const i = w.intents[0]!; i.target = null; i.targetVelPx = 0; i.targetVelPy = 0; i.moveMode = 'run';
      createTickLoop([move.stage]).run(w, { stopAt: (x) => x.tick >= 40 });
      return playX(w, 0);
    };
    expect(stopDistance(0.7)).toBeGreaterThan(stopDistance(1) * 1.3);
    const tenYards = (footing: number) => {
      const w = fixtureWorld();
      (w as { environment: TickWorld['environment'] }).environment = { ...w.environment, derived: { ...w.environment.derived, footing } };
      const move = createMovement();
      place(w, 0, 0, 0); sprintTo(w, 0, 100, 0);
      let t = 0;
      createTickLoop([move.stage]).run(w, { stopAt: (x) => { if (t === 0 && playX(x, 0) >= 10) t = x.tick; return t > 0; } });
      return t;
    };
    expect(tenYards(0.6)).toBeGreaterThan(tenYards(1));
  });
});

describe('J2.3 move modes', () => {
  function topSpeedIn(mode: 'run' | 'backpedal' | 'shuffle', attributes: Record<string, number> = {}, codZ = 0) {
    const w = fixtureWorld({ players: () => ({ attributes, codZ }) }), move = createMovement();
    place(w, 0, 0, 0); sprintTo(w, 0, 300, 0, 'through', mode);
    createTickLoop([move.stage]).run(w, { stopAt: (x) => x.tick >= 80 });
    return speed(w, 0) / w.slots[0]!.movement.vMaxYps;
  }
  it('caps run, backpedal and shuffle at their fractions of top speed', () => {
    expect(topSpeedIn('run')).toBeCloseTo(0.8, 2);
    expect(topSpeedIn('backpedal')).toBeCloseTo(0.58, 2);
    expect(topSpeedIn('backpedal', { backpedal_and_transition: 70 })).toBeCloseTo(0.64, 2);
    expect(topSpeedIn('backpedal', { backpedal_and_transition: 99 })).toBeCloseTo(0.70, 2);
    expect(topSpeedIn('shuffle')).toBeCloseTo(0.5, 2);
    expect(topSpeedIn('shuffle', {}, 1)).toBeCloseTo(0.54, 2);
  });
  it('faces the play while backpedalling and holds velocity through the 0.30 s transition to a sprint (J2.3.2)', () => {
    const w = fixtureWorld(), move = createMovement();
    place(w, 11, 7, 0); w.players.headingRad[11] = w.frame.attackDir === 1 ? Math.PI : 0;
    sprintTo(w, 11, 60, 0, 'through', 'backpedal');
    const loop = createTickLoop([move.stage]);
    loop.begin(w);
    for (let i = 0; i < 20; i++) loop.step(w);
    expect(Math.abs(Math.abs(w.players.headingRad[11]!) - Math.PI)).toBeLessThan(0.05); // hips still face the offense
    const pedal = speed(w, 11);
    sprintTo(w, 11, 60, 0, 'through', 'sprint');
    loop.step(w);
    expect(move.transitionLeftS(11)).toBeCloseTo(0.30 - TICK_S, 9);
    loop.step(w); loop.step(w);
    expect(speed(w, 11)).toBeCloseTo(pedal, 9); // three ticks: no acceleration yet
    loop.step(w); loop.step(w);
    expect(speed(w, 11)).toBeGreaterThan(pedal + 0.2);
    expect(MOVE_MODES[w.players.moveMode[11]!]).toBe('sprint');
  });
  it('keeps a go route in phase against a 7-yard cushion and loses it from 3 yards with a late turn (J2.3.2 acceptance)', () => {
    const gap = (cushionYd: number, turnWhenCushion: number) => {
      const w = fixtureWorld(), move = createMovement();
      place(w, 0, 0, 10); place(w, 11, cushionYd, 10);
      w.players.headingRad[11] = w.frame.attackDir === 1 ? Math.PI : 0;
      let turned = false, at30 = Number.NaN;
      const decide: TickStage = { name: 'decide', run: (x) => {
        sprintTo(x, 0, 200, 10);
        if (!turned && playX(x, 11) - playX(x, 0) <= turnWhenCushion) turned = true;
        sprintTo(x, 11, 200, 10, 'through', turned ? 'sprint' : 'backpedal');
        if (Number.isNaN(at30) && playX(x, 0) >= 30) at30 = playX(x, 11) - playX(x, 0);
      } };
      createTickLoop([decide, move.stage]).run(w, { stopAt: () => !Number.isNaN(at30) });
      return at30;
    };
    expect(Math.abs(gap(7, 3.5))).toBeLessThan(1);
    expect(gap(3, 0.5)).toBeLessThan(-1);
  });
  it('costs speed to look back more than 90 degrees while running (J2.3.1)', () => {
    const top = (gazeOffset: number) => {
      const w = fixtureWorld(), move = createMovement();
      place(w, 0, 0, 0); sprintTo(w, 0, 300, 0);
      const look: TickStage = { name: 'decide', run: (x) => { x.players.gazeRad[0] = x.players.headingRad[0]! + gazeOffset; } };
      createTickLoop([look, move.stage]).run(w, { stopAt: (x) => x.tick >= 80 });
      return speed(w, 0) / w.slots[0]!.movement.vMaxYps;
    };
    expect(top(1.2)).toBeCloseTo(1, 2);
    expect(top(2.2)).toBeCloseTo(0.95, 2);
  });
});

describe('J2.4.1 fatigue inside a play', () => {
  it('costs about 0.06 for a 6-second sprint by a 230 lb player of average stamina, and caps a long play at 0.15', () => {
    const w = fixtureWorld({ players: () => ({ weightLb: 230 }) }), move = createMovement();
    place(w, 0, -20, 0); sprintTo(w, 0, 500, 0);
    createTickLoop([move.stage]).run(w, { stopAt: (x) => x.tick >= 60 });
    expect(move.energyCost(0)).toBeGreaterThan(0.045); expect(move.energyCost(0)).toBeLessThan(0.065);
    expect(w.players.fatigueNow[0]).toBeCloseTo(move.energyCost(0), 12);
    const heavy = fixtureWorld({ players: () => ({ weightLb: 320 }) }), move2 = createMovement();
    place(heavy, 0, -20, 0); sprintTo(heavy, 0, 500, 0);
    createTickLoop([move2.stage]).run(heavy, { stopAt: (x) => x.tick >= 60 });
    expect(move2.energyCost(0)).toBeGreaterThan(move.energyCost(0) * 1.3);
  });
  it('slows a tired player: top speed down 10% at full fatigue', () => {
    const w = fixtureWorld({ players: () => ({ freshness: 0.02 }) }), move = createMovement();
    place(w, 0, 0, 0); sprintTo(w, 0, 300, 0);
    createTickLoop([move.stage]).run(w, { stopAt: (x) => x.tick >= 100 });
    expect(move.energyCost(0)).toBeLessThanOrEqual(0.15);
    expect(speed(w, 0) / w.slots[0]!.movement.vMaxYps).toBeCloseTo(0.9, 2);
  });
});

describe('J2.5 steering', () => {
  const DIG: Waypoint[] = [{ px: 12, py: 8, kind: 'cut' }, { px: 12, py: -4, kind: 'settle' }];
  function runPath(path: Waypoint[], spec: { fortyS?: number; tenSplitS?: number; codZ?: number } = {}, ticks = 80, attackDir: 1 | -1 = 1, ballX = 35) {
    const w = fixtureWorld({ attackDir, ballX, players: () => spec }), move = createMovement(), follow = createPathFollower(move);
    place(w, 0, 0, 8);
    for (let s = 1; s < SLOT_COUNT; s++) place(w, s, -20, s - 10); // out of the way, the same in the play frame both ways
    follow.setPath(w, 0, path);
    const decide: TickStage = { name: 'decide', run: (x) => { x.players.gazeRad[0] = x.players.headingRad[0]!; if (!follow.steer(x, 0)) { const i = x.intents[0]!; i.target = null; i.targetVelPx = 0; i.targetVelPy = 0; } } };
    let deepest = 0;
    const track: number[][] = [];
    const probe: TickStage = { name: 'detect', run: (x) => { if (playX(x, 0) > deepest) deepest = playX(x, 0); track.push([playX(x, 0), playY(x, 0)]); } };
    const subSpeeds: number[] = [];
    const subProbe: TickStage = { name: 'move', run: (x) => { subSpeeds.push(speed(x, 0)); } };
    createTickLoop([decide, move.stage, subProbe, probe]).run(w, { stopAt: (x) => x.tick >= ticks });
    return { w, deepest, follow, track, subSpeeds };
  }
  it('breaks a 12-yard dig within 0.5 yd of the drawn depth for all speed grades (J2.5.1 acceptance)', () => {
    for (const [forty, split] of SAMPLE.filter((_, i) => i % 3 === 0)) {
      const r = runPath(DIG, { fortyS: forty, tenSplitS: split }, 100);
      expect(Math.abs(r.deepest - 12)).toBeLessThan(0.5);
      expect(r.follow.waypointIndex(0)).toBe(2);
      expect(Math.hypot(playX(r.w, 0) - 12, playY(r.w, 0) + 4)).toBeLessThan(0.3); // settled on the last point
    }
  });
  it('runs each waypoint kind inside the J2 limits (WP-09 acceptance)', () => {
    // through: passes within the 0.6 yd radius without stopping.
    const through = runPath([{ px: 10, py: 9, kind: 'through' }, { px: 25, py: 12, kind: 'through' }], {}, 21);
    let near = 99;
    for (const [x, y] of through.track) near = Math.min(near, Math.hypot(x! - 10, y! - 9));
    expect(near).toBeLessThan(0.6);
    expect(speed(through.w, 0)).toBeGreaterThan(0.8 * through.w.slots[0]!.movement.vMaxYps);
    // cut: at a 90-degree break he is at or under the cut speed (0.55 of top at grade 50), then re-accelerates.
    const cut = runPath(DIG, {}, 100), top = cut.w.slots[0]!.movement.vMaxYps;
    // Sub-step speeds: full speed on the stem, the cut speed at the plant, then back up.
    const stemTop = Math.max(...cut.subSpeeds.slice(0, 40)), low = Math.min(...cut.subSpeeds.slice(10, 50)), lowAt = cut.subSpeeds.indexOf(low, 10);
    expect(stemTop).toBeGreaterThan(0.8 * top);
    expect(low).toBeLessThanOrEqual(0.55 * top + 1e-9);
    expect(low).toBeGreaterThan(0.45 * top);
    expect(Math.max(...cut.subSpeeds.slice(lowAt, lowAt + 12))).toBeGreaterThan(0.65 * top);
    // settle: arrives and stops.
    const settle = runPath([{ px: 9, py: 8, kind: 'settle' }], {}, 60);
    expect(Math.hypot(playX(settle.w, 0) - 9, playY(settle.w, 0) - 8)).toBeLessThan(0.3);
    expect(speed(settle.w, 0)).toBeLessThan(0.5);
  });
  it('gives better change of direction a faster planted cut (J2.1.3)', () => {
    expect(cutMultiplier(0, 0, KP, Math.PI)).toBe(1);
    expect(cutMultiplier(Math.PI / 4, 0, KP, Math.PI)).toBeCloseTo(0.85, 9);
    expect(cutMultiplier(Math.PI / 2, 0, KP, Math.PI)).toBeCloseTo(0.55, 9);
    expect(cutMultiplier(Math.PI * 0.75, 0, KP, Math.PI)).toBeCloseTo(0.30, 9);
    expect(cutMultiplier(Math.PI, 0, KP, Math.PI)).toBeCloseTo(0.15, 9);
    expect(cutMultiplier(Math.PI / 2, 1, KP, Math.PI)).toBeCloseTo(0.59, 9);
    expect(cutMultiplier(Math.PI / 8, 5, KP, Math.PI)).toBe(1);
  });
  it('clips a waypoint outside the field to 1 yd inside (J2.5.1 edge case)', () => {
    const r = runPath([{ px: 5, py: 60, kind: 'settle' }], {}, 80);
    expect(r.w.players.posY[0]!).toBeCloseTo(r.w.geometry.widthYd - 1, 0);
    expect(r.w.players.posY[0]!).toBeLessThan(r.w.geometry.widthYd - 0.7);
  });
  it('runs the same play identically in the play frame at the west 20 attacking east and the east 20 attacking west (J1.1.2 acceptance 2)', () => {
    const a = runPath(DIG, {}, 70, 1, 30), b = runPath(DIG, {}, 70, -1, 90);
    expect(a.track.length).toBe(b.track.length);
    a.track.forEach((p, i) => { expect(Math.abs(p[0]! - b.track[i]![0]!)).toBeLessThan(1e-9); expect(Math.abs(p[1]! - b.track[i]![1]!)).toBeLessThan(1e-9); });
  });
  it('aims a better pursuit grade further ahead of the carrier (J2.5.2)', () => {
    const lo = new Float64Array(2), hi = new Float64Array(2);
    expect(pursuitAim(0, 0, 9, 10, 10, 6, 0, -2, KP, lo)).toBe(true);
    pursuitAim(0, 0, 9, 10, 10, 6, 0, 2, KP, hi);
    expect(hi[0]!).toBeGreaterThan(lo[0]!);
    expect(lo[0]! - 10).toBeCloseTo(((hi[0]! - 10) * 0.36) / 0.84, 9); // q = 0.36 against 0.84
    expect(pursuitAim(0, 0, 5, 10, 0, 9, 0, 0, KP, lo)).toBe(false);
    expect(Array.from(lo)).toEqual([10, 0]);
  });
  it('contacts at least 3 yd sooner with a pursuit grade of 70 than 30 on a sideline run (J2.5.2 acceptance)', () => {
    const contactX = (grade: number) => {
      const w = fixtureWorld({ players: (s) => (s === 11 ? { attributes: { pursuit_angle: grade } } : s === 0 ? { fortyS: 5.0, tenSplitS: 1.75 } : {}) });
      const move = createMovement(), out = new Float64Array(2);
      for (let s = 1; s < SLOT_COUNT; s++) place(w, s, -20, s - 10);
      place(w, 0, 0, 20); place(w, 11, 22, -2);
      w.players.hasBall[0] = 1;
      const z = (grade - 50) / 10, tgt = { px: 0, py: 0 };
      let at = Number.NaN;
      const decide: TickStage = { name: 'decide', run: (x) => {
        sprintTo(x, 0, 200, 20);
        pursuitAim(playX(x, 11), playY(x, 11), x.slots[11]!.movement.vMaxYps, playX(x, 0), playY(x, 0), x.players.velX[0]! * x.frame.attackDir, x.players.velY[0]! * x.frame.attackDir, z, KP, out);
        tgt.px = out[0]!; tgt.py = out[1]!;
        const i = x.intents[11]!; i.target = tgt; i.moveMode = 'sprint'; i.arrival = 'through'; i.effort = 1;
        move.setChase(11, 0);
        if (Number.isNaN(at) && Math.hypot(playX(x, 0) - playX(x, 11), playY(x, 0) - playY(x, 11)) < 1) at = playX(x, 0);
      } };
      createTickLoop([decide, move.stage]).run(w, { stopAt: (x) => !Number.isNaN(at) || x.tick >= 200 });
      return at;
    };
    const poor = contactX(30), good = contactX(70);
    expect(Number.isNaN(poor) || Number.isNaN(good), `30: ${poor}, 70: ${good}`).toBe(false);
    expect(poor - good, `30: ${poor}, 70: ${good}`).toBeGreaterThanOrEqual(3);
  });
  it('clips the pick delay to 0.1 to 0.4 s (J2.5.3)', () => {
    expect(pickDelayS(0, 0, KP)).toBeCloseTo(0.25, 12);
    expect(pickDelayS(2, 0, KP)).toBeCloseTo(0.15, 12);
    expect(pickDelayS(5, -3, KP)).toBe(0.1);
    expect(pickDelayS(-3, 3, KP)).toBe(0.4);
  });
});

describe('J2.5.3 traffic and spacing', () => {
  it('keeps upright, unengaged players at least half the sum of their radii apart while 22 converge on one point', () => {
    const w = fixtureWorld(), move = createMovement();
    for (let s = 0; s < SLOT_COUNT; s++) sprintTo(w, s, 0, 0, 'arrive');
    let closest = 99;
    const check: TickStage = { name: 'detect', run: (x) => {
      for (let a = 0; a < SLOT_COUNT; a++) for (let b = a + 1; b < SLOT_COUNT; b++) {
        const d = Math.hypot(x.players.posX[a]! - x.players.posX[b]!, x.players.posY[a]! - x.players.posY[b]!);
        const need = 0.5 * (x.slots[a]!.movement.bodyRadiusYd + x.slots[b]!.movement.bodyRadiusYd);
        closest = Math.min(closest, d - need);
      }
    } };
    createTickLoop([move.stage, check]).run(w, { stopAt: (x) => x.tick >= 120 });
    expect(closest).toBeGreaterThanOrEqual(-1e-9);
  });
  it('holds the lower-priority player and takes 30% of his speed; the ball carrier keeps his line', () => {
    const w = fixtureWorld(), move = createMovement();
    place(w, 0, 0, 0); place(w, 11, 6, 0);
    w.players.hasBall[0] = 1; w.players.velX[0] = 6 * w.frame.attackDir; w.players.velX[11] = -6 * w.frame.attackDir;
    sprintTo(w, 0, 30, 0); sprintTo(w, 11, -30, 0);
    createTickLoop([move.stage]).run(w, { stopAt: (x) => x.tick >= 6 });
    expect(Math.abs(playY(w, 0))).toBeLessThan(0.6);
    expect(playX(w, 0)).toBeGreaterThan(2.5); // the carrier kept going
    expect(speed(w, 11)).toBeLessThan(6);
  });
  it('lets a blocker and his defender touch without the wash (they are in a contest)', () => {
    const w = fixtureWorld(), move = createMovement();
    place(w, 4, 0, 0); place(w, 15, 0.5, 0);
    w.players.engagement[4] = 0; w.players.engagement[15] = 0;
    sprintTo(w, 4, 5, 0); sprintTo(w, 15, -5, 0);
    createTickLoop([move.stage]).run(w, { stopAt: (x) => x.tick >= 2 });
    expect(MOVE_MODES[w.players.moveMode[4]!]).toBe('engaged');
    expect(Math.abs(playX(w, 4) - playX(w, 15))).toBeLessThan(0.5);
  });
});

describe('J2.6.1 momentum at contact', () => {
  const out: ContactNumbers = { closingSpeedYps: 0, momentumRatio: 0, hitEnergy: 0, blindside: false };
  it('computes closing speed, momentum ratio, hit energy and the blindside flag', () => {
    contactNumbers(0, 0, 6, 0, 220, 0, 3, 0, -4, 0, 200, KP, out);
    expect(out.closingSpeedYps).toBe(10);
    expect(out.momentumRatio).toBeCloseTo((220 * 6) / (200 * 4), 12);
    expect(out.hitEnergy).toBeCloseTo(((220 * 200) / 420) * 100, 9);
    expect(out.blindside).toBe(false);
    contactNumbers(0, 0, 6, 0, 220, Math.PI, 3, 0, -4, 0, 200, KP, out);
    expect(out.blindside).toBe(true); // looking the other way
    const heavy = { ...out };
    contactNumbers(0, 0, 6, 0, 240, 0, 3, 0, -4, 0, 200, KP, heavy);
    expect(heavy.momentumRatio).toBeGreaterThan((220 * 6) / (200 * 4));
  });
});

describe('J2.7.1 drill reproduction', () => {
  it('fits change of direction so the simulated 20-yard shuttle matches the listed time within 0.08 s', () => {
    for (const listed of [3.9, 4.05, 4.2]) {
      const p = fixturePlayer(1, { shuttleS: listed });
      const z = fitChangeOfDirectionZ(p, PARAM_TABLE, DMATH);
      const t = simulateShuttle(p, movementParams(p, KP, FP, z).movement, PARAM_TABLE, DMATH);
      expect(Math.abs(t - listed), `listed ${listed}, z ${z}, simulated ${t}`).toBeLessThan(0.08);
    }
    expect(fitChangeOfDirectionZ(fixturePlayer(2, { codZ: 0.7 }), PARAM_TABLE, DMATH)).toBe(0.7);
    // A listed time the model cannot run at this straight-line speed returns the end of the range, not a made-up fit.
    expect(fitChangeOfDirectionZ(fixturePlayer(3, { shuttleS: 5.5 }), PARAM_TABLE, DMATH)).toBe(-4);
  });
  it('makes better change of direction run a faster shuttle', () => {
    const p = fixturePlayer(1);
    const t = (z: number) => simulateShuttle(p, movementParams(p, KP, FP, z).movement, PARAM_TABLE, DMATH);
    expect(t(1.5)).toBeLessThan(t(0)); expect(t(0)).toBeLessThan(t(-1.5));
  });
});

describe('same inputs, same trajectory', () => {
  it('reproduces a recorded play bit for bit', () => {
    const run = () => {
      const w = fixtureWorld({ seed: 2 }), move = createMovement(), follow = createPathFollower(move), rec = createTrajectoryRecorder();
      for (let s = 0; s < SLOT_COUNT; s++) follow.setPath(w, s, [{ px: 6 + (s % 5), py: (s % 7) - 3, kind: 'cut' }, { px: 20 - s, py: 10 - s, kind: 'settle' }]);
      const decide: TickStage = { name: 'decide', run: (x) => { for (let s = 0; s < SLOT_COUNT; s++) follow.steer(x, s); } };
      createTickLoop([decide, move.stage]).run(w, { observer: rec, stopAt: (x) => x.tick >= 50 });
      return rec.finish();
    };
    const a = run(), b = run();
    expect(Array.from(a.buffer)).toEqual(Array.from(b.buffer));
    expect(decodeTrajectory(a)).toHaveLength(51);
  });
});
