import { describe, expect, it } from 'vitest';
import { PerformanceObserver } from 'node:perf_hooks';
import {
  AFTER_WHISTLE_TICKS, MAX_LIVE_TICKS, SLOT_COUNT, SUBSTEPS, TICK_S, TruthEvent, ParamFile,
  type TickStage, type TickWorld,
} from '@gm/schema';
import { createBoundaryWatcher, createHeldBallStage } from '../../src/field/index.ts';
import { createMovement, createPathFollower } from '../../src/kinematics/index.ts';
import { createPerception } from '../../src/perception/index.ts';
import {
  createTickLoop, createTrajectoryRecorder, decodeTrajectory, trajectoryHash, paramTableFromFiles, defineParams,
} from '../../src/tick/index.ts';
import { fixtureWorld, place } from './support.ts';

const NAMES = ['perceive', 'decide', 'move', 'interact', 'detect'] as const;

describe('J1.3.1 tick loop', () => {
  it('runs the stages in order, each for the whole world, with Move in sub-steps', () => {
    const log: string[] = [];
    const stages: TickStage[] = [...NAMES].reverse().map((name) => ({ name, run: (_w: TickWorld, dt: number) => { log.push(`${name}:${dt}`); } }));
    const w = fixtureWorld(), loop = createTickLoop(stages);
    loop.step(w);
    const sub = TICK_S / SUBSTEPS;
    expect(log).toEqual([`perceive:${TICK_S}`, `decide:${TICK_S}`, ...Array.from({ length: SUBSTEPS }, () => `move:${sub}`), `interact:${TICK_S}`, `detect:${TICK_S}`]);
    expect(w.tick).toBe(1);
  });
  it('keeps registration order inside a stage name, so a ball stage follows the players each sub-step', () => {
    const log: string[] = [];
    const mk = (id: string): TickStage => ({ name: 'move', run: () => { log.push(id); } });
    createTickLoop([mk('players'), mk('ball')]).step(fixtureWorld());
    expect(log).toEqual(['players', 'ball', 'players', 'ball']);
  });
  it('ends on the tick the ball is dead and runs the after-whistle ticks only when asked', () => {
    const dead: TickStage = { name: 'detect', run: (w) => { if (w.tick === 7 && w.deadAtTick === null) w.deadAtTick = w.tick; } };
    const plain = fixtureWorld(), r1 = createTickLoop([dead]).run(plain);
    expect(r1).toEqual({ ticksRun: 8, deadAtTick: 7, fault: false });
    const film = fixtureWorld(), rec = createTrajectoryRecorder(), r2 = createTickLoop([dead]).run(film, { observer: rec });
    expect(r2.ticksRun).toBe(8 + AFTER_WHISTLE_TICKS);
    expect(rec.finish().tickCount).toBe(1 + 8 + AFTER_WHISTLE_TICKS);
    expect(createTickLoop([dead]).run(fixtureWorld(), { afterWhistle: true }).ticksRun).toBe(8 + AFTER_WHISTLE_TICKS);
  });
  it('calls begin on every stage once per play and honours stopAt', () => {
    let begun = 0;
    const s = { name: 'decide' as const, begin: () => { begun++; }, run: () => {} };
    const r = createTickLoop([s]).run(fixtureWorld(), { stopAt: (w) => w.tick >= 3 });
    expect(begun).toBe(1);
    expect(r).toEqual({ ticksRun: 3, deadAtTick: null, fault: false });
  });
  it('aborts a live play at the 600-tick limit as an engine fault', () => {
    const w = fixtureWorld(), r = createTickLoop([]).run(w);
    expect(r.fault).toBe(true);
    expect(r.ticksRun).toBe(MAX_LIVE_TICKS);
    const last = w.events[w.events.length - 1]!;
    expect(last.type === 'dead_ball' && last.reason).toBe('engine_fault');
    expect(() => TruthEvent.parse(last)).not.toThrow();
  });
  it('runs the pre-snap phase on negative ticks with the same loop (J1.3.2)', () => {
    const w = fixtureWorld();
    w.tick = -20;
    const snap: TickStage = { name: 'detect', run: (x) => { if (x.tick === 4) x.deadAtTick = 4; } };
    expect(createTickLoop([snap]).run(w).ticksRun).toBe(25);
  });
});

/** A small live scene: ten players run paths, one carries the ball, everyone perceives. */
function scene(seed: number, shift = 0) {
  const w = fixtureWorld({ seed, ballX: 40 });
  const move = createMovement(), follow = createPathFollower(move), watch = createBoundaryWatcher(), see = createPerception();
  for (let s = 0; s < 5; s++) {
    follow.setPath(w, s, [{ px: 8 + s, py: -6 + 3 * s + shift, kind: 'through' }, { px: 14 + s, py: 2 * s - 4, kind: 'cut' }, { px: 30, py: 3 * s - 6, kind: 'settle' }]);
    follow.setPath(w, 11 + s, [{ px: 2, py: -6 + 3 * s, kind: 'through' }, { px: 12, py: 0, kind: 'settle' }], s % 2 === 0 ? 'backpedal' : 'run');
    see.configure(11 + s, { keys: [s] });
    see.gazeAtSlot(11 + s, s);
  }
  w.ball.kind = 'held'; w.ball.carrierSlot = 0; w.players.hasBall[0] = 1;
  const decide: TickStage = { name: 'decide', run: (x) => { for (let s = 0; s < SLOT_COUNT; s++) follow.steer(x, s); } };
  const loop = createTickLoop([see.stage, decide, move.stage, createHeldBallStage(), watch.moveStage, watch.detectStage]);
  return { w, loop };
}

describe('J1.6.2 trajectory record', () => {
  it('gives the same trajectory hash for the same inputs and a different one for different inputs', () => {
    const run = (seed: number, shift = 0) => {
      const { w, loop } = scene(seed, shift), rec = createTrajectoryRecorder();
      loop.run(w, { observer: rec, stopAt: (x) => x.tick >= 60 });
      return rec.finish();
    };
    const a = run(3), b = run(3), c = run(3, 0.5);
    expect(trajectoryHash(a)).toBe(trajectoryHash(b));
    expect(Array.from(a.buffer)).toEqual(Array.from(b.buffer));
    expect(trajectoryHash(a)).not.toBe(trajectoryHash(c));
  });
  it('decodes to the recorded positions within 0.005 yd and stays under 40 kB for a 6 s play', () => {
    const { w, loop } = scene(5), rec = createTrajectoryRecorder();
    w.officials.push({ position: 'referee', x: 30, y: 20, gazeRad: 0 }, { position: 'umpire', x: 45, y: 26, gazeRad: 3 });
    const seen: { x: number; y: number; h: number }[] = [];
    const probe = { begin: (x: TickWorld) => { rec.begin(x); seen.push({ x: x.players.posX[2]!, y: x.players.posY[2]!, h: x.players.headingRad[2]! }); },
      afterTick: (x: TickWorld) => { rec.afterTick(x); seen.push({ x: x.players.posX[2]!, y: x.players.posY[2]!, h: x.players.headingRad[2]! }); } };
    loop.run(w, { observer: probe, stopAt: (x) => x.tick >= 60 });
    const record = rec.finish(), frames = decodeTrajectory(record);
    expect(record.buffer.length).toBeLessThan(40_000);
    expect(frames).toHaveLength(61);
    expect(frames[0]!.tick).toBe(0); expect(frames[60]!.tick).toBe(60);
    frames.forEach((f, i) => {
      expect(Math.abs(f.x[2]! - seen[i]!.x)).toBeLessThanOrEqual(0.005 + 1e-9);
      expect(Math.abs(f.y[2]! - seen[i]!.y)).toBeLessThanOrEqual(0.005 + 1e-9);
      const dh = Math.abs(f.headingRad[2]! - seen[i]!.h) % (2 * Math.PI);
      expect(Math.min(dh, 2 * Math.PI - dh)).toBeLessThan(0.002);
      expect(f.officials).toHaveLength(2);
      expect(f.advantage[2]).toBeNull();
    });
    expect(frames[30]!.ball.kind).toBe('held'); expect(frames[30]!.ball.carrierSlot).toBe(0);
    expect(frames[10]!.officials[1]!.x).toBe(45);
    expect(rec.truncated).toBe(false);
  });
  it('records the engagement advantage as a hidden field', () => {
    const w = fixtureWorld(), rec = createTrajectoryRecorder();
    w.contests.push({ type: 'passBlock', offenseSlot: 4, defenseSlot: 15, advantage: -0.37, startedTick: 0, helperSlots: [], stream: w.streams('contest', [1, 1, 104, 115, 'passBlock']) });
    w.players.engagement[4] = 0; w.players.engagement[15] = 0;
    rec.begin(w);
    const f = decodeTrajectory(rec.finish())[0]!;
    expect(f.advantage[4]).toBe(-0.37); expect(f.advantage[15]).toBe(-0.37); expect(f.advantage[5]).toBeNull();
  });
});

describe('P6.3.1 no allocation in the tick', () => {
  // The rule: no object is allocated inside the tick loop. What can be measured from outside is heap
  // growth per tick. A JavaScript engine boxes a floating-point number when it crosses a call it did not
  // inline, so the loop is not at zero: the residue is a few hundred boxed numbers per tick, mostly
  // around the dmath trigonometry (not this module's file). This test holds that residue under a
  // ceiling, and proves the instrument sees a real leak of one small object per player per tick.
  const CEILING_BYTES_PER_TICK = 16_000;
  function bytesPerTick(step: () => void): number {
    const bursts: number[] = [];
    for (let b = 0; b < 40; b++) {
      const before = process.memoryUsage().heapUsed;
      for (let i = 0; i < 200; i++) step();
      const d = (process.memoryUsage().heapUsed - before) / 200;
      if (d >= 0) bursts.push(d); // a burst with a collection inside reads negative and is dropped
    }
    bursts.sort((a, b) => a - b);
    return bursts[bursts.length >> 1]!;
  }
  it('keeps heap growth of movement, boundaries, perception and recording under the ceiling, with no garbage-collection storm', async () => {
    let collections = 0;
    const obs = new PerformanceObserver((list) => { collections += list.getEntries().length; });
    obs.observe({ entryTypes: ['gc'] });
    const settle = () => new Promise((r) => setTimeout(r, 30));
    const { w, loop } = scene(9), rec = createTrajectoryRecorder();
    // Players shuttle for ever, so every code path stays hot and no event fires.
    const far: TickStage = { name: 'decide', run: (x) => { for (let s = 5; s < 11; s++) { const i = x.intents[s]!; i.moveMode = 'run'; i.effort = 0.5; i.targetVelPx = (x.tick >> 4) % 2 === 0 ? 2 : -2; } } };
    const live = createTickLoop([...loop.stages, far]);
    live.begin(w); rec.begin(w);
    let n = 0;
    const step = () => { live.step(w); if (++n % 500 === 0) rec.begin(w); else rec.afterTick(w); };
    for (let i = 0; i < 20_000; i++) step(); // warm up: the optimizer allocates while it compiles
    const quiet = bytesPerTick(step);
    await settle(); collections = 0;
    for (let i = 0; i < 20_000; i++) step();
    await settle();
    const quietCollections = collections;
    const sink: { x: number; y: number }[] = [];
    const leaky = createTickLoop([...loop.stages, far, { name: 'detect', run: (x) => { sink.length = 0; for (let s = 0; s < SLOT_COUNT; s++) sink.push({ x: x.players.posX[s]!, y: x.players.posY[s]! }); } }]);
    for (let i = 0; i < 5_000; i++) leaky.step(w);
    const leak = bytesPerTick(() => leaky.step(w));
    obs.disconnect();
    expect(quiet).toBeLessThan(CEILING_BYTES_PER_TICK);
    expect(leak - quiet).toBeGreaterThan(300); // one small object per player per tick is visible
    expect(quietCollections).toBeLessThan(40); // 20,000 ticks: about 330 plays' worth
  });
});

describe('parameter files', () => {
  it('builds a table and refuses unknown or duplicate names', () => {
    const file = defineParams('demo', '1', [['x', 2, 0, 5, 'yd', 'assumption', 'J0', 'none']]);
    expect(() => ParamFile.parse(file)).not.toThrow();
    const t = paramTableFromFiles([file]);
    expect(t.num('demo.x')).toBe(2); expect(t.has('demo.y')).toBe(false);
    expect(() => t.num('demo.y')).toThrow();
    expect(() => paramTableFromFiles([file, file])).toThrow();
  });
});
