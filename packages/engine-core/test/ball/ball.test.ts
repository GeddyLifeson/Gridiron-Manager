// WP-16 ball physics and kicking: J9 acceptance cases and the module's own checks.
// Rule values come from the tick test FIXTURE (test/tick/support.ts), not the game's rule data.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NEUTRAL_ENVIRONMENT, ParamFile, RuleKeyManifest, type Environment, type RandomStream, type TickWorld } from '@gm/schema';
import { streamSource, seedFromNumber } from '../../src/index.ts';
import { PARAMS as FIELD_PARAMS, fieldGeometry } from '../../src/field/index.ts';
import { PARAMS as KIN_PARAMS } from '../../src/kinematics/index.ts';
import { PARAMS as PERCEPTION_PARAMS } from '../../src/perception/index.ts';
import { paramTableFromFiles } from '../../src/tick/index.ts';
import * as ball from '../../src/ball/index.ts';
import { fixtureRules, fixtureWorld } from '../tick/support.ts';

const TABLE = paramTableFromFiles([FIELD_PARAMS, KIN_PARAMS, PERCEPTION_PARAMS, ball.PARAMS]);
const P = ball.ballParams(TABLE);
const PRO = fieldGeometry(fixtureRules());
const COLLEGE_SHAPED = fieldGeometry(fixtureRules(60));
const src = (name: string, seed = 1): RandomStream => streamSource(seedFromNumber(seed))('ball', [1, 1, name.length + seed]);
const outdoors = (over: Partial<Environment> = {}): Environment => ({ ...NEUTRAL_ENVIRONMENT, roof: 'open', ...over });
const DEG = ball.DEG;

function pass(dx: number, dy: number, type: ball.TrajectoryType, speed = 26, wind = ball.NO_WIND) {
  return ball.solvePass({
    fromX: 40, fromY: 26, fromH: P['pass.releaseHeightYd']!, toX: 40 + dx, toY: 26 + dy, toH: P['pass.catchHeightYd']!,
    speedYps: speed, type, k: P['pass.dragPerYd']!, wind,
    minLaunchRad: P['pass.minLaunchDeg']! * DEG, maxLaunchRad: P['pass.maxLaunchDeg']! * DEG,
    firmBlend: P['pass.firmBlend']!, touchMaxRad: P['pass.touchMaxDeg']! * DEG,
  });
}

function kickInput(distToPlane: number, over: Partial<ball.PlaceKickInput> = {}): ball.PlaceKickInput {
  const g = over.geometry ?? PRO;
  return {
    geometry: g, environment: NEUTRAL_ENVIRONMENT, holdX: g.lengthYd - distToPlane, holdY: g.centreY, attackDir: 1,
    zLeg: 0, zAccuracy: 0, zComposure: 0, pressure: 0, ...over,
  };
}
const OP = { zSnap: 0, zHold: 0, hurried: false };
const make = (inp: ball.PlaceKickInput): number => ball.estimateMakeChance(inp, OP, P);

describe('ball parameter file', () => {
  it('is a valid parameter file: unique names, values inside ranges, J9 leaves, a constraint on every row', () => {
    const file = ParamFile.parse(ball.PARAMS);
    expect(new Set(file.params.map((p) => p.name)).size).toBe(file.params.length);
    for (const p of file.params) {
      expect(p.min, p.name).toBeLessThanOrEqual(p.value);
      expect(p.max, p.name).toBeGreaterThanOrEqual(p.value);
      expect(p.leaf, p.name).toMatch(/^J9\.\d\.\d$/);
      expect(p.constrainedBy.length, p.name).toBeGreaterThan(0);
    }
    expect(RuleKeyManifest.parse(ball.RULE_KEYS)).toEqual([]);
  });

  it('has no orphan row: every parameter is read somewhere in the module source', () => {
    const dir = join(__dirname, '../../src/ball');
    const code = readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'params.ts').map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
    const unread = ball.PARAMS.params.map((p) => p.name.slice('ball.'.length)).filter((n) => !code.includes(`'${n}'`));
    expect(unread).toEqual([]);
  });

  it('carries the starting values J9 states', () => {
    const want: Record<string, number> = {
      'pass.releaseHeightYd': 2.2, 'pass.catchHeightYd': 1.6, 'snap.shotgunSpeedYps': 15, 'deflect.speedMin': 0.3,
      'deflect.speedMax': 0.7, 'deflect.angleMaxDeg': 60, 'bounce.sdTumbleDeg': 25, 'bounce.sdSpiralDeg': 12,
      'bounce.rollDecelYps2': 3, 'op.timeS': 1.3, 'op.cleanBeta0': 3.5, 'fg.range50Yd': 58, 'fg.rangePerZYd': 4,
      'fg.rangeSdYd': 3, 'fg.accDecay': 0.12, 'fg.labelAddYd': 17, 'punt.hangMeanS': 4.4,
      'punt.corr': -0.4, 'block.puntSnapS': 0.75, 'block.puntGetOffS': 1.3, 'ko.alongSdYd': 4, 'ko.acrossSdYd': 3,
      'wind.gustAimGain': 0.02,
    };
    for (const [k, v] of Object.entries(want)) expect(P[k], k).toBe(v);
  });

  it('pass drag matches the J9.1.1 rule: a 40 yd throw loses about 15% of its speed to drag', () => {
    expect(Math.abs(1 - Math.exp(-P['pass.dragPerYd']! * 40) - 0.15)).toBeLessThan(0.001);
  });

  it('gravity and the wind unit are exact definitions', () => {
    expect(ball.GRAVITY_YPS2).toBeCloseTo(10.72468, 4);
    expect(ball.MPH_TO_YPS).toBeCloseTo(0.488889, 6);
  });
});

describe('J9.1.1 pass flight', () => {
  it('acceptance 1: with no wind and no error the ball lands within 0.05 yd of the aim point at every depth in range', () => {
    for (const dx of [3, 8, 15, 25, 35, 45]) for (const dy of [-18, 0, 12]) for (const type of ['drive', 'firm', 'touch'] as const) {
      const s = pass(dx, dy, type);
      if (!s.inRange) continue;
      const miss = Math.hypot(s.arrival.x - (40 + dx), s.arrival.y - (26 + dy));
      expect(miss, `${dx},${dy} ${type}`).toBeLessThan(0.05);
      expect(s.arrival.h).toBeCloseTo(P['pass.catchHeightYd']!, 6);
    }
  });

  it('acceptance 2: flight time rises with distance, falls with arm strength, and touch hangs longer than drive', () => {
    let last = 0;
    for (const dx of [5, 10, 20, 30, 40]) {
      const t = pass(dx, 0, 'drive').flightTimeS;
      expect(t).toBeGreaterThan(last);
      last = t;
      expect(pass(dx, 0, 'drive', 29).flightTimeS).toBeLessThan(t);
      expect(pass(dx, 0, 'firm').flightTimeS).toBeGreaterThan(t);
      expect(pass(dx, 0, 'touch').flightTimeS).toBeGreaterThan(pass(dx, 0, 'firm').flightTimeS);
    }
  });

  it('sanity: a 40 yd go ball at grade-50 arm hangs about 1.8 to 2.4 s from drive to touch (J9.1.1 reference 2.1 to 2.6 s)', () => {
    expect(pass(40, 0, 'drive').flightTimeS).toBeGreaterThan(1.6);
    expect(pass(40, 0, 'touch').flightTimeS).toBeLessThan(2.7);
  });

  it('a throw beyond the arm is underthrown to the range limit', () => {
    const s = pass(70, 0, 'touch');
    expect(s.inRange).toBe(false);
    expect(s.arrival.x - 40).toBeLessThan(70);
    expect(s.arrival.x - 40).toBeGreaterThan(40);
  });

  it('acceptance 3: deterministic: the same throw gives bit-identical results', () => {
    expect(pass(27, -9, 'firm')).toEqual(pass(27, -9, 'firm'));
  });

  it('J9.7.1: a headwind shortens and a tailwind lengthens the same throw; a crosswind pushes it', () => {
    const w = 15 * ball.MPH_TO_YPS;
    const still = pass(40, 0, 'drive');
    const fly = (wind: ball.Wind) => {
      const s = ball.airState(40, 26, P['pass.releaseHeightYd']!, still.vx, still.vy, still.vh);
      return ball.flyToHeight(s, P['pass.dragPerYd']!, wind, P['pass.catchHeightYd']!)!;
    };
    expect(fly({ x: -w, y: 0 }).x).toBeLessThan(still.arrival.x - 0.5);
    expect(fly({ x: w, y: 0 }).x).toBeGreaterThan(still.arrival.x + 0.5);
    expect(fly({ x: 0, y: w }).y).toBeGreaterThan(26.3);
  });

  it('indoors there is no wind, and air density scales drag', () => {
    expect(ball.windFromEnvironment({ ...NEUTRAL_ENVIRONMENT, windMph: 20 })).toEqual(ball.NO_WIND);
    const thin = { ...NEUTRAL_ENVIRONMENT, derived: { ...NEUTRAL_ENVIRONMENT.derived, airDensity: 0.86 } };
    expect(ball.airDrag(0.004, thin)).toBeCloseTo(0.00344, 8);
  });
});

describe('J9.1.2 snaps and exchanges', () => {
  it('a 5 yd shotgun snap takes about 0.35 s and arrives at hand height', () => {
    const { launch, timeS } = ball.shotgunSnap(40, 26, 35, 26, P);
    expect(timeS).toBeCloseTo(0.333, 2);
    const a = ball.flyToHeight(ball.airState(launch.x, launch.y, launch.h, launch.vx, launch.vy, launch.vh), P['pass.dragPerYd']!, ball.NO_WIND, launch.h - 1e-6)!;
    expect(a.x).toBeCloseTo(35, 0);
  });

  it('a handoff needs both players within 0.8 yd and lasts 2 ticks', () => {
    expect(ball.handoffWindow(0.7, P)).toEqual({ possible: true, ticks: 2 });
    expect(ball.handoffWindow(1.0, P).possible).toBe(false);
  });

  it('solvePassFrom uses the release and catch heights of J9.1.1', () => {
    const s = ball.solvePassFrom(40, 26, 60, 30, 26, 'firm', P['pass.dragPerYd']!, ball.NO_WIND, P);
    expect(s.arrival.h).toBeCloseTo(1.6, 6);
    expect(ball.passLaunch(40, 26, s, P).h).toBe(2.2);
  });
});

describe('J9.2.1 deflections', () => {
  it('a deflection keeps 0.3 to 0.7 of the speed, turns at most 60 degrees, adds lift, and draws 6 raw values', () => {
    for (let i = 0; i < 300; i++) {
      const rng = src('defl', i);
      const s = ball.airState(0, 0, 2, 20, 0, 1);
      const before = rng.draws;
      ball.deflect(s, rng, P);
      expect(rng.draws - before).toBe(6);
      const r = Math.hypot(s.vx, s.vy) / 20;
      expect(r).toBeGreaterThanOrEqual(0.3 - 1e-9);
      expect(r).toBeLessThanOrEqual(0.7 + 1e-9);
      expect(Math.abs(Math.atan2(s.vy, s.vx))).toBeLessThanOrEqual(60 * DEG + 1e-9);
      expect(s.vh).toBeGreaterThan(0);
    }
  });

  it('batting: drive throws are batted more than touch throws, and nothing above reach is batted', () => {
    const lane = (t: ball.TrajectoryType) => { const s = pass(25, 0, t); return ball.batLane(40, 26, 2.2, s.vx, s.vy, s.vh, 41.5, 26, P); };
    const reach = 2.9;
    const drive = lane('drive'), touch = lane('touch');
    expect(ball.batChance(1, drive.overlap, drive.heightYd, reach, P)).toBeGreaterThan(ball.batChance(1, touch.overlap, touch.heightYd, reach, P));
    expect(ball.batChance(1, 1, 3.5, reach, P)).toBe(0);
    expect(ball.handsUpChance(1, P)).toBeGreaterThan(ball.handsUpChance(-1, P));
  });
});

describe('J9.3.1 bounces and rolls', () => {
  const ctx = (over: Partial<ball.BounceContext> = {}): ball.BounceContext => ({ artificial: false, wet: false, spiral: false, bias: 0, highHop: false, ...over });
  const meanRetained = (c: ball.BounceContext) => {
    let sum = 0;
    for (let i = 0; i < 2000; i++) { const s = ball.airState(0, 0, 0, 10, 0, -8); ball.bounce(s, c, src('b', i), P); sum += s.vx; }
    return sum / 2000 / 10;
  };

  it('a bounce draws 8 raw values and keeps 0.2 to 0.8 of forward speed on grass with no bias', () => {
    for (let i = 0; i < 200; i++) {
      const rng = src('bounce', i), s = ball.airState(0, 0, 0, 10, 0, -8);
      ball.bounce(s, ctx(), rng, P);
      expect(rng.draws).toBe(8);
      const r = Math.hypot(s.vx, s.vy) / 10;
      expect(r).toBeGreaterThanOrEqual(0.2 - 1e-9);
      expect(r).toBeLessThanOrEqual(0.8 + 1e-9);
      expect(s.vh).toBeGreaterThan(0);
    }
  });

  it('turf keeps more forward speed, a wet surface rebounds lower, and a pin punt checks up', () => {
    expect(meanRetained(ctx({ artificial: true }))).toBeGreaterThan(meanRetained(ctx()));
    expect(meanRetained(ctx({ bias: P['punt.pinBias']! }))).toBeLessThan(meanRetained(ctx({ bias: P['punt.normalBias']! })));
    let dry = 0, wet = 0;
    for (let i = 0; i < 500; i++) {
      const a = ball.airState(0, 0, 0, 10, 0, -8), b = ball.airState(0, 0, 0, 10, 0, -8);
      ball.bounce(a, ctx(), src('r', i), P); ball.bounce(b, ctx({ wet: true }), src('r', i), P);
      dry += a.vh; wet += b.vh;
    }
    expect(wet).toBeLessThan(dry);
  });

  it('a spiral landing at a shallow angle scatters less than a tumbling ball', () => {
    const spread = (spiral: boolean) => {
      let ss = 0;
      for (let i = 0; i < 2000; i++) { const s = ball.airState(0, 0, 0, 15, 0, -3); ball.bounce(s, ctx({ spiral }), src('sp', i), P); const a = Math.atan2(s.vy, s.vx); ss += a * a; }
      return Math.sqrt(ss / 2000) / DEG;
    };
    expect(spread(true)).toBeLessThan(15);
    expect(spread(false)).toBeGreaterThan(20);
  });

  it('a rolling ball decelerates at 3 yd/s^2 and stops where the stopping distance says', () => {
    const s = ball.airState(0, 0, 0, 3, 0, 0);
    let steps = 0;
    while (!ball.roll(s, ball.FLIGHT_DT_S, P)) steps++;
    expect(Math.abs(s.x - 1.5)).toBeLessThan(0.1);
    expect(steps).toBeLessThan(25);
  });
});

describe('J9.4.1 the operation', () => {
  it('draws 10 raw values; non-clean operations are a small share at grade 50; wet and cold make it worse', () => {
    const env = NEUTRAL_ENVIRONMENT;
    let bad = 0;
    for (let i = 0; i < 20000; i++) {
      const rng = src('op', i);
      const o = ball.resolveOperation(rng, { ...OP, environment: env }, P);
      expect(rng.draws).toBe(10);
      if (o.quality !== 'clean') { bad++; if (o.quality === 'bad') { expect(o.errorMult).toBeGreaterThanOrEqual(1.5); expect(o.errorMult).toBeLessThanOrEqual(3); } }
    }
    expect(bad / 20000).toBeGreaterThan(0.01);
    expect(bad / 20000).toBeLessThan(0.05);
    const clean = ball.cleanOperationChance({ ...OP, environment: env }, P);
    expect(ball.cleanOperationChance({ ...OP, environment: outdoors({ precip: 'rain', tempF: 30 }) }, P)).toBeLessThan(clean);
    expect(ball.cleanOperationChance({ ...OP, hurried: true, environment: env }, P)).toBeLessThan(clean);
  });

  it('the labelled distance is line of scrimmage plus 17 whatever the hold depth', () => {
    expect(ball.labelledFieldGoalDistance(30, P)).toBe(47);
  });
});

describe('J9.4.2 make model', () => {
  it('make chance falls with distance and lands near the pro table for a grade-50 kicker (selection not modelled here)', () => {
    let last = 1;
    for (const d of [20, 30, 40, 45, 50, 55, 60]) { const m = make(kickInput(d)); expect(m).toBeLessThan(last); last = m; }
    // Pro 2022 to 2024 (J9.4.2): 97.7% to 29 yd, 93.6% at 30 to 39 (labelled). Labelled 35 = 35 yd to the plane here.
    expect(make(kickInput(25))).toBeGreaterThan(0.95);
    expect(make(kickInput(35))).toBeGreaterThan(0.88);
    expect(make(kickInput(35))).toBeLessThan(0.99);
  });

  it('acceptance 2: crosswind, headwind and cold lower the make rate; a hash is harder than the middle at short range', () => {
    const base = make(kickInput(48));
    expect(make(kickInput(48, { environment: outdoors({ windMph: 15, windDirDeg: 90 }) }))).toBeLessThan(base);
    expect(make(kickInput(48, { environment: outdoors({ windMph: 15, windDirDeg: 180 }) }))).toBeLessThan(base);
    expect(make(kickInput(48, { environment: outdoors({ windMph: 15, windDirDeg: 0 }) }))).toBeGreaterThan(base);
    const cold = outdoors({ tempF: 25, derived: { ...NEUTRAL_ENVIRONMENT.derived, kickDistance: 0.95 } });
    expect(make(kickInput(48, { environment: cold }))).toBeLessThan(base);
    expect(make(kickInput(30, { holdY: PRO.hashNorthY }))).toBeLessThan(make(kickInput(30)));
  });

  it('acceptance 3: the same kick from the hash is harder under college-shaped hashes, by geometry alone', () => {
    const pro = make(kickInput(30, { holdY: PRO.hashNorthY }));
    const college = make(kickInput(30, { geometry: COLLEGE_SHAPED, holdY: COLLEGE_SHAPED.hashNorthY }));
    expect(college).toBeLessThan(pro);
  });

  it('J9.7.1 acceptance: 45 to 54 yd make rate falls across 0, 10 and 20 mph crosswind', () => {
    const at = (mph: number) => [45, 48, 51, 54].reduce((s, d) => s + make(kickInput(d, { environment: outdoors({ windMph: mph, windDirDeg: 90 }) })), 0);
    expect(at(10)).toBeLessThan(at(0));
    expect(at(20)).toBeLessThan(at(10));
  });

  it('J9.7.1 check value: a 45 yd field goal drifts 1.5 to 2.5 yd per 10 mph of crosswind', () => {
    const still: RandomStream = { normal: () => 0, uniform: () => 0.5 } as unknown as RandomStream;
    const k = ball.resolvePlaceKick(still, kickInput(45, { environment: outdoors({ windMph: 10, windDirDeg: 90 }) }), { timeS: 1.3, quality: 'clean', errorMult: 1 }, P);
    const drift = k.atPlane!.y - PRO.centreY;
    expect(drift).toBeGreaterThan(1.5);
    expect(drift).toBeLessThan(2.5);
  });

  it('the live kick agrees with the analytic estimate (Monte Carlo of 6,000 kicks at 47 yd)', () => {
    const inp = kickInput(47, { holdY: PRO.hashSouthY });
    let good = 0;
    for (let i = 0; i < 6000; i++) {
      const rng = src('fg', i);
      const op = ball.resolveOperation(rng, { ...OP, environment: inp.environment }, P);
      if (op.quality === 'bobble') continue;
      const k = ball.resolvePlaceKick(rng, inp, op, P);
      expect(rng.draws).toBe(18);
      if (k.result === 'good') good++;
    }
    expect(Math.abs(good / 6000 - make(inp))).toBeLessThan(0.03);
  });

  it('results are named from the kicker\'s side: a kick pulled to his left is wide left in either direction', () => {
    const still = (n: number): RandomStream => ({ normal: (() => { let i = 0; return () => (i++ === 0 ? 0 : n); })(), uniform: () => 0.5 }) as unknown as RandomStream;
    const clean = { timeS: 1.3, quality: 'clean' as const, errorMult: 1 };
    expect(ball.resolvePlaceKick(still(4), kickInput(40), clean, P).result).toBe('wide_left');
    const west = { ...kickInput(40), holdX: 40, attackDir: -1 as const };
    expect(ball.resolvePlaceKick(still(4), west, clean, P).result).toBe('wide_left');
    expect(ball.resolvePlaceKick(still(-4), west, clean, P).result).toBe('wide_right');
  });
});

describe('J9.4.3 blocks', () => {
  it('punt operation is 2.05 s at grade 50 and faster with better grades; the race margin reads the operation time', () => {
    expect(ball.puntOperationTimeS(0, 0, P)).toBeCloseTo(2.05, 10);
    expect(ball.puntOperationTimeS(1, 1, P)).toBeCloseTo(1.99, 10);
    expect(ball.blockTimeMarginS(1.3, 1.45)).toBeCloseTo(0.15, 10);
    expect(ball.blockPointYd('field_goal', P)).toBe(7.5);
    expect(ball.blockPointYd('punt', P)).toBe(9);
  });
});

describe('J9.5.1 punts', () => {
  const draws = (inp: Partial<ball.PuntInput> = {}, n = 5000) => {
    const out: ball.PuntDraw[] = [];
    for (let i = 0; i < n; i++) {
      const rng = src('punt', i);
      out.push(ball.resolvePunt(rng, { zLeg: 0, zHang: 0, zDirectional: 0, type: 'distance', pressure: 0, ...inp }, P));
      expect(rng.draws).toBe(20);
    }
    return out;
  };
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  it('a punt that would carry past the pin target is shortened and hung higher (short field)', () => {
    const far = draws(), near = draws({ toGoalYd: 45 });
    const m = (xs: { distYd: number; shank: boolean }[]) => mean(xs.filter((x) => !x.shank).map((x) => x.distYd));
    expect(m(near)).toBeLessThan(45 - P['punt.pinTargetYd']! + 1);
    expect(m(near)).toBeLessThan(m(far) - 8);
    expect(m(draws({ toGoalYd: 90 }))).toBeCloseTo(m(far), 6);
  });
  it('grade-50 open-field distance punts average about 48.5 yd gross and 4.4 s hang, negatively correlated, about 2% shanks', () => {
    const d = draws();
    const clean = d.filter((x) => !x.shank);
    expect(mean(clean.map((x) => x.distYd))).toBeCloseTo(48.5, 0);
    expect(mean(clean.map((x) => x.hangS))).toBeCloseTo(4.4, 1);
    const md = mean(clean.map((x) => x.distYd)), mh = mean(clean.map((x) => x.hangS));
    const cov = mean(clean.map((x) => (x.distYd - md) * (x.hangS - mh)));
    expect(cov).toBeLessThan(0);
    const shanks = d.length - clean.length;
    expect(shanks / d.length).toBeGreaterThan(0.01);
    expect(shanks / d.length).toBeLessThan(0.04);
  });

  it('leg and hang grades move the means; pressure raises shanks; pin punts are shorter and higher', () => {
    expect(mean(draws({ zLeg: 1 }, 2000).map((x) => x.distYd))).toBeGreaterThan(mean(draws({}, 2000).map((x) => x.distYd)) + 1.5);
    expect(draws({ pressure: 1 }, 3000).filter((x) => x.shank).length).toBeGreaterThan(draws({}, 3000).filter((x) => x.shank).length);
    const pin = draws({ type: 'pin' }, 2000);
    expect(mean(pin.map((x) => x.distYd))).toBeLessThan(38);
    expect(pin[0]!.bias).toBeLessThan(0);
  });

  it('the launch lands at the drawn distance after the drawn hang in still air', () => {
    const d: ball.PuntDraw = { distYd: 47, hangS: 4.5, latYd: 0, shank: false, bias: 0.3, spiral: true };
    const l = ball.puntLaunch(30, 26, 1, d, 0, P);
    const a = ball.flyToHeight(ball.airState(30, 26, l.startH, l.vx, l.vy, l.vh), P['punt.dragPerYd']!, ball.NO_WIND, 0)!;
    expect(a.x - 30).toBeCloseTo(47, 1);
    expect(a.t).toBeCloseTo(4.5, 1);
    // A 15 mph headwind shortens it.
    const into = ball.flyToHeight(ball.airState(30, 26, l.startH, l.vx, l.vy, l.vh), P['punt.dragPerYd']!, { x: -15 * ball.MPH_TO_YPS, y: 0 }, 0)!;
    expect(into.x - 30).toBeLessThan(44);
  });
});

describe('J9.6 kickoffs and onside kicks', () => {
  it('placement scatters about 4 yd along and 3 across at grade 50 and is capped by the leg; 12 raw draws', () => {
    const along: number[] = [], across: number[] = [];
    for (let i = 0; i < 4000; i++) {
      const rng = src('ko', i);
      const d = ball.resolveKickoff(rng, { zLeg: 3, zPlacement: 0, type: 'deep', targetAlongYd: 60, targetLatYd: 0 }, P);
      expect(rng.draws).toBe(12);
      along.push(d.alongYd - 60); across.push(d.latYd);
    }
    const sd = (xs: number[]) => Math.sqrt(xs.reduce((a, b) => a + b * b, 0) / xs.length);
    expect(sd(along)).toBeCloseTo(4, 0);
    expect(sd(across)).toBeCloseTo(3, 0);
    const weak = ball.resolveKickoff(src('ko', 1), { zLeg: -3, zPlacement: 0, type: 'deep', targetAlongYd: 80, targetLatYd: 0 }, P);
    expect(weak.alongYd).toBeLessThan(75);
  });

  it('onside: three outcomes, ideal hops more likely with skill; 6 raw draws', () => {
    const share = (z: number) => {
      let ideal = 0;
      for (let i = 0; i < 3000; i++) {
        const rng = src('onside', i);
        const o = ball.resolveOnside(rng, 35, 26, 1, z, 0, P);
        expect(rng.draws).toBe(6);
        if (o.quality === 'ideal') { ideal++; expect(o.highHop).toBe(true); expect(o.launch.vh).toBeLessThan(0); }
      }
      return ideal / 3000;
    };
    expect(share(1.5)).toBeGreaterThan(share(-1.5));
  });
});

describe('ball tick stages', () => {
  const world = (env: Environment = NEUTRAL_ENVIRONMENT): TickWorld => {
    const w = fixtureWorld({ params: TABLE, ballX: 40 });
    if (env !== NEUTRAL_ENVIRONMENT) (w as { environment: Environment }).environment = env;
    return w;
  };
  const run = (w: TickWorld, stages: ball.BallStages, maxTicks: number, until: (w: TickWorld) => boolean) => {
    stages.move.begin?.(w);
    for (let t = 0; t < maxTicks; t++) {
      w.tick = t;
      for (let s = 0; s < 2; s++) stages.move.run(w, ball.FLIGHT_DT_S);
      stages.detect.run(w, 0.1);
      if (until(w)) return t;
    }
    return -1;
  };

  it('a pass flown by the stage reaches catch height where the solver said', () => {
    const w = world(), st = ball.createBallStages();
    const s = pass(30, 8, 'firm');
    ball.launchSnap(w, 5, { x: 40, y: 26, h: 0.3, vx: -15, vy: 0, vh: 0 }, P);
    expect(w.ball.flightIndex).toBe(0);
    w.ball.kind = 'held'; w.ball.carrierSlot = 0;
    ball.launchPass(w, 0, { x: 40, y: 26, h: P['pass.releaseHeightYd']!, vx: s.vx, vy: s.vy, vh: s.vh }, true, P);
    expect(w.ball.flightIndex).toBe(1);
    let px = 0, py = 0, ph = 0, found = false;
    st.move.begin?.(w);
    for (let i = 0; i < 200 && !found; i++) {
      px = w.ball.x; py = w.ball.y; ph = w.ball.heightYd;
      w.tick = Math.floor(i / 2);
      st.move.run(w, ball.FLIGHT_DT_S);
      if (w.ball.velHeight < 0 && ph > 1.6 && w.ball.heightYd <= 1.6) found = true;
    }
    expect(found).toBe(true);
    const f = (ph - 1.6) / (ph - w.ball.heightYd);
    expect(Math.hypot(px + (w.ball.x - px) * f - s.arrival.x, py + (w.ball.y - py) * f - s.arrival.y)).toBeLessThan(0.02);
  });

  it('a grounded forward pass is dead at the landing spot', () => {
    const w = world(), st = ball.createBallStages();
    ball.launchPass(w, 0, { x: 40, y: 26, h: 2.2, vx: 15, vy: 0, vh: -2 }, true, P);
    run(w, st, 20, (x) => x.ball.kind === 'dead');
    expect(w.ball.kind).toBe('dead');
    expect(ball.ballFlight(w).grounded).not.toBeNull();
  });

  it('a punt emits its kick event at launch and a landed event where it predicted, then bounces to rest', () => {
    const w = world(outdoors({ windMph: 12, windDirDeg: 30 })), st = ball.createBallStages();
    const rng = ball.beginKickFlight(w);
    const d = ball.resolvePunt(rng, { zLeg: 0, zHang: 0, zDirectional: 0, type: 'distance', pressure: 0 }, P);
    const l = ball.puntLaunch(30, 26, 1, d, 0, P);
    ball.launchKick(w, { kickKind: 'punt', kickerSlot: 9, launch: { x: 30, y: 26, h: l.startH, vx: l.vx, vy: l.vy, vh: l.vh }, kPerYd: P['punt.dragPerYd']!, spiral: d.spiral, bias: d.bias, highHop: false, crossedLine: true });
    const kick = w.events.find((e) => e.type === 'kick')!;
    expect(kick.type).toBe('kick');
    run(w, st, 150, (x) => ball.ballFlight(x).atRest);
    const landed = w.events.find((e) => e.type === 'kick_touch');
    expect(landed && landed.type === 'kick_touch' && landed.kind).toBe('landed');
    if (kick.type === 'kick' && landed?.type === 'kick_touch') {
      expect(Math.abs(landed.spot.x - kick.landingSpot.x)).toBeLessThan(0.05);
      expect(Math.abs(landed.spot.y - kick.landingSpot.y)).toBeLessThan(0.05);
      expect(Math.abs(landed.t - kick.hangTimeS)).toBeLessThan(0.02);
    }
    expect(w.ball.kind).toBe('loose');
    expect(ball.ballFlight(w).atRest).toBe(true);
  });

  it('every loose ball is at rest within 12 s', () => {
    for (let seed = 1; seed < 30; seed++) {
      const w = world(), st = ball.createBallStages();
      ball.beginLoose(w, 3, { x: 40, y: 26, h: 1, vx: 9 + seed / 5, vy: 3, vh: 4 }, P);
      w.ball.flightIndex = seed; // vary the stream
      const t = run(w, st, 130, (x) => ball.ballFlight(x).atRest);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(120);
    }
  });

  it('the same play replays bit-identically', () => {
    const once = () => {
      const w = world(outdoors({ windMph: 8, windDirDeg: 200 })), st = ball.createBallStages();
      ball.beginLoose(w, 3, { x: 40, y: 26, h: 1, vx: 12, vy: -2, vh: 5 }, P);
      run(w, st, 60, () => false);
      return [w.ball.x, w.ball.y, w.ball.heightYd, w.ball.velX, ball.ballFlight(w).bounces];
    };
    expect(once()).toEqual(once());
  });
});
