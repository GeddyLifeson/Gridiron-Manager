// WP-20 quarterback model: J7 leaf acceptance cases and the Q3.2.1 / Q3.2.2 items this module can show
// on its own. Everyone but the quarterback is a scripted body (helpers.ts); catches are judged by a
// test-only resolver, because the catch point and the dead-ball detector belong to the integration.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TICK_S } from '@gm/schema';
import { DMATH } from '../../src/index.ts';
import * as ball from '../../src/ball/index.ts';
import * as kin from '../../src/kinematics/index.ts';
import * as qb from '../../src/qb/index.ts';
import { FakeView } from '../player-ai/helpers.ts';
import { CONTESTS, P, QB, TABLE, alongRoute, catchChance, line, mean, read, rules, runScene, share, still, target, type SceneSpec } from './helpers.ts';

const BP = ball.ballParams(TABLE);
const N = 200;

// Three covered routes: nobody is worth a throw, so he works the whole progression.
const R1 = [{ px: 0, py: 12 }, { px: 12, py: 12 }], R2 = [{ px: 0, py: -12 }, { px: 10, py: -12 }], R3 = [{ px: 0, py: 5 }, { px: 6, py: 5 }];
const covered = (): Pick<SceneSpec, 'scripts'> => ({
  scripts: {
    1: alongRoute(R1, 6, true), 2: alongRoute(R2, 6, true), 3: alongRoute(R3, 6, true),
    11: alongRoute([{ px: 0.5, py: 12 }, { px: 12.5, py: 12 }], 6, true), 12: alongRoute([{ px: 0.5, py: -12 }, { px: 10.5, py: -12 }], 6, true),
    13: alongRoute([{ px: 0.5, py: 5 }, { px: 6.5, py: 5 }], 6, true),
  },
});
const threeReads = (): qb.QbRead[] => [read(target(1, R1, 1, true), 0.4), read(target(2, R2, 1, true), 0.3), read(target(3, R3, 1, true), 0.2)];

// One receiver running a 12-yard out to the field, a defender trailing by `gap` yards.
const OUT = [{ px: 0, py: 8 }, { px: 12, py: 8 }, { px: 12, py: 22 }];
const outScene = (gap: number): Pick<SceneSpec, 'scripts'> => ({
  scripts: { 1: alongRoute(OUT, 7.5), 11: alongRoute([{ px: -gap, py: 8 }, { px: 12, py: 8 }, { px: 12, py: 22 }].map((q, i) => (i === 0 ? { px: 0, py: 8 - 0.01 } : q)), 7.5 * (1 - gap / 20)) },
});

describe('J7.1.1 the drop', () => {
  for (const drop of qb.DROP_TYPES) {
    it(`${drop}: a grade-50 quarterback is set at the table time, within 0.5 yd of the launch point`, () => {
      const r = runScene({ play: qb.basePlay(QB, drop, threeReads()), noThrow: true, maxTicks: 34, ...covered() });
      expect(r.record.tSetS).toBeCloseTo(P[`drop.${drop}.setS`], 9);
      expect(r.record.setPx).not.toBeNull();
      expect(Math.hypot(r.record.setPx! - r.record.launchPx, r.record.setPy! - r.record.launchPy)).toBeLessThanOrEqual(0.5);
      expect(r.record.launchPx).toBe(-P[`drop.${drop}.depthYd`]);
      // He does not get there early and wait: one second before set he is still short of the spot (deep drops).
      const first = r.quarterback.notes().find((n) => n.note === 'set')!;
      expect(first.tick * TICK_S).toBeCloseTo(r.record.tSetS, 1);
    });
  }
  it('better footwork sets sooner; play action and a bad snap add their time', () => {
    const at = (attrs: Record<string, number>, over: Partial<qb.QbPlay> = {}): number =>
      runScene({ play: { ...qb.basePlay(QB, 'uc5', threeReads()), ...over }, attrs, noThrow: true, maxTicks: 40, ...covered() }).record.tSetS;
    expect(at({ footwork_and_drop: 80 })).toBeLessThan(at({ footwork_and_drop: 20 }));
    expect(at({}, { playActionS: 0.5 })).toBeCloseTo(at({}) + 0.5, 9);
    expect(at({}, { badSnapS: 0.3 })).toBeCloseTo(at({}) + 0.3, 9);
  });
});

describe('J7.2.1 the progression', () => {
  it('with throwing disabled, a grade-50 quarterback reaches read 3 at tSet + 1.1 s (within a tick)', () => {
    // Routes with no break to wait for: the time per read is all that paces him.
    const reads = threeReads().map((r) => ({ ...r, target: { ...r.target, breakIndex: -1 } }));
    const r = runScene({ play: qb.basePlay(QB, 'gun3', reads), noThrow: true, maxTicks: 40, ...covered() });
    expect(r.record.readTicks.length).toBeGreaterThanOrEqual(3);
    expect(r.record.readTicks[0]! * TICK_S).toBeCloseTo(1.5, 9);
    expect(Math.abs(r.record.readTicks[2]! * TICK_S - (1.5 + 1.1))).toBeLessThanOrEqual(TICK_S + 1e-9);
  });
  it('a faster processor reaches read 3 sooner', () => {
    const t3 = (g: number): number => runScene({ play: qb.basePlay(QB, 'gun3', threeReads()), attrs: { processing_speed: g }, noThrow: true, maxTicks: 45, ...covered() }).record.readTicks[2]!;
    expect(t3(80)).toBeLessThan(t3(50));
    expect(t3(50)).toBeLessThan(t3(20));
  });
  it('his eyes go to the read he is on (a signal defenders can read), and the film track records it', () => {
    const r = runScene({ play: qb.basePlay(QB, 'gun3', threeReads()), noThrow: true, maxTicks: 40, ...covered() });
    const tr = r.quarterback.track();
    expect(tr.look[r.record.readTicks[0]! + 1]).toBe(1);
    expect(tr.look[r.record.readTicks[1]! + 1]).toBe(2);
    expect(tr.look[r.record.readTicks[2]! + 1]).toBe(3);
  });
  it('a wrong pre-snap read costs one read time: he restarts on the corrected order', () => {
    const play = { ...qb.basePlay(QB, 'gun3', threeReads()), correctedReads: [threeReads()[1]!, threeReads()[0]!, threeReads()[2]!] };
    const r = runScene({ play, noThrow: true, maxTicks: 40, ...covered() });
    expect(r.record.restarted).toBe(true);
    const tr = r.quarterback.track();
    expect(tr.look[15 + Math.round(P['read.tReadBaseS'] / TICK_S) + 1]).toBe(2);
  });
});

describe('J7.3 judging open and deciding', () => {
  const ctx = (over: Partial<qb.JudgeContext> = {}): qb.JudgeContext => ({
    p: P, catchPoint: CONTESTS.catchPoint, math: DMATH, value: qb.standInValue(P, 1, 10), releaseS: 0.4, vBallYps: 26, dragPerYd: BP['pass.dragPerYd']!,
    maxRangeYd: 60, accuracySdYd: () => 1, wet: false, allowOutOfRange: false,
    flightS: (d, type) => (d <= 0 ? 0 : ball.solvePassFrom(0, 0, d, 0, 26, type, BP['pass.dragPerYd']!, ball.NO_WIND, BP).flightTimeS),
    heightYd: (d, along, type) => { const sol = ball.solvePassFrom(0, 0, d, 0, 26, type, BP['pass.dragPerYd']!, ball.NO_WIND, BP), v = Math.hypot(sol.vx, sol.vy); const tan = sol.vh / v, h0 = BP['pass.releaseHeightYd']!; return h0 + along * tan - ((h0 + d * tan - BP['pass.catchHeightYd']!) / (d * d)) * along * along; },
    cutShare: (angle) => kin.cutMultiplier(angle, 0, kin.kinParams(TABLE), Math.PI), ...over,
  });
  const t1 = target(1, [{ px: 0, py: 10 }, { px: 30, py: 10 }]);

  it('a throw that may fall incomplete is worth less by the lost down, so a covered throw loses more than an open one', () => {
    const e = (gap: number, cost: number): qb.Estimate => {
      const v = new FakeView(QB).at(-7, 0).see(1, 10, 10, 7, 0).see(11, 10 - gap, 10.5, 7, 0);
      return { ...qb.judgeTarget(v, t1, ctx({ value: { ...qb.standInValue(P, 1, 10), incompleteCost: cost } }), 0, false, qb.newEstimate()) };
    };
    for (const gap of [0.5, 8]) {
      const free = e(gap, 0), paid = e(gap, 0.3);
      expect(paid.pHat).toBe(free.pHat);
      expect(free.v - paid.v).toBeCloseTo(0.3 * (1 - free.pHat - free.iHat), 9);
    }
    expect(e(0.5, 0).v - e(0.5, 0.3).v).toBeGreaterThan(e(8, 0).v - e(8, 0.3).v);
    expect(qb.standInValue(P, 1, 10).incompleteCost).toBe(P['value.incompleteCostEp']);
  });
  it('a closer defender lowers the completion estimate and raises the interception estimate', () => {
    const e = (gap: number): qb.Estimate => {
      const v = new FakeView(QB).at(-7, 0).see(1, 10, 10, 7, 0).see(11, 10 - gap, 10.5, 7, 0);
      return { ...qb.judgeTarget(v, t1, ctx(), 0, false, qb.newEstimate()) };
    };
    // He rates a defender as fast as his receiver, so a man four yards behind is still in the play: eight is out of it.
    expect(e(0.5).pHat).toBeLessThan(e(8).pHat);
    expect(e(0.5).iHat).toBeGreaterThan(e(8).iHat);
    expect(e(0.5).v).toBeLessThan(e(8).v);
  });
  it('Q1.4.1: a defender he is not watching is not in the estimate (he can be baited)', () => {
    const open = new FakeView(QB).at(-7, 0).see(1, 10, 10, 7, 0);
    const shown = new FakeView(QB).at(-7, 0).see(1, 10, 10, 7, 0).see(11, 14, 10, 0, 0);
    const a = qb.judgeTarget(open, t1, ctx(), 0, false, qb.newEstimate()), b = qb.judgeTarget(shown, t1, ctx(), 0, false, qb.newEstimate());
    expect(a.nearestDefender).toBe(-1);
    expect(b.nearestDefender).toBe(11);
    expect(a.pHat).toBeGreaterThan(b.pHat);
    expect(a.iHat).toBeLessThan(b.iHat);
  });
  it('an underneath defender who can meet a firm throw as it comes down blocks it; with room behind him he puts touch on it', () => {
    const far = target(1, [{ px: 0, py: 0.5 }, { px: 40, py: 0.5 }]);
    const lane = new FakeView(QB).at(-7, 0).see(1, 20, 0.5, 0, 0).see(11, 15, 0.3, 0, 0);
    const clear = new FakeView(QB).at(-7, 0).see(1, 20, 0.5, 0, 0).see(11, 8, 9, 0, 0);
    const a = qb.judgeTarget(lane, { ...far, route: [] }, ctx(), 0, false, qb.newEstimate());
    expect(a.trajectory).toBe('touch');
    const b = qb.judgeTarget(clear, { ...far, route: [] }, ctx(), 0, false, qb.newEstimate());
    expect(b.trajectory).not.toBe('touch');
    const tight = new FakeView(QB).at(-7, 0).see(1, 3, 0.5, 0, 0).see(11, 0.5, 0.3, 0, 0);
    const c = qb.judgeTarget(tight, { ...far, route: [] }, ctx(), 0, false, qb.newEstimate());
    expect(c.trajectory).toBe('firm');
    expect(c.pHat).toBeLessThan(b.pHat);
  });
  it('he knows his own receiver brakes into a planted cut and needs time to get going again out of it', () => {
    // A dig: 12 yd up, a square cut in. The legs are the receiver's own numbers (QbTarget), not opponent truth.
    const route = [{ px: 0, py: 10 }, { px: 12, py: 10 }, { px: 12, py: -10 }];
    const legs = { topSpeedYps: 9, accelTauS: 0.9, brakeYps2: 8 };
    const dig = { ...target(1, route, 1), ...legs, cutShare: [1, 0.55, 1] }, rounded = { ...dig, cutShare: [1, 1, 1] };
    const out = new Float64Array(4), at = (t: qb.QbTarget, timeS: number): [number, number] => { qb.walkRoute(t, ctx(), 4, 10, 9, timeS, out); return [out[0]!, out[1]!]; };
    // Before the break both are on the stem, and the man who must plant is already slowing down.
    expect(at(dig, 0.8)[0]).toBeLessThan(at(rounded, 0.8)[0]);
    // After it he is on the new line, behind the man who is imagined turning at full speed.
    const a = at(dig, 2), b = at(rounded, 2);
    expect(a[0]).toBeCloseTo(12, 6); expect(b[0]).toBeCloseTo(12, 6);
    expect(a[1]).toBeGreaterThan(b[1] + 1.5);
    expect(a[1]).toBeLessThan(10);
    // He never leaves the drawn path.
    for (let t = 0; t <= 3; t += 0.25) { const [x, y] = at(dig, t); expect(Math.min(Math.abs(y - 10), Math.abs(x - 12))).toBeLessThan(1e-6); }
  });
  it('the flight time he judges with is the time the ball really takes on that trajectory (J9.1.1)', () => {
    const c = ctx();
    for (const d of [8, 18, 30]) {
      expect(c.flightS(d, 'drive')).toBeLessThan(c.flightS(d, 'firm'));
      expect(c.flightS(d, 'firm')).toBeLessThan(c.flightS(d, 'touch'));
      // The ball leaves his hand at release height and comes down on the catch height.
      for (const type of qb.TRAJECTORIES) { expect(c.heightYd(d, 0, type)).toBeCloseTo(BP['pass.releaseHeightYd']!, 9); expect(c.heightYd(d, d, type)).toBeCloseTo(BP['pass.catchHeightYd']!, 9); }
      expect(c.heightYd(d, d / 2, 'touch')).toBeGreaterThan(c.heightYd(d, d / 2, 'firm'));
    }
  });
  it('a throw past his arm is not on', () => {
    const v = new FakeView(QB).at(-7, 0).see(1, 50, 0, 0, 0);
    expect(qb.judgeTarget(v, { slot: 1, route: [], breakIndex: -1, settles: true }, ctx({ maxRangeYd: 45 }), 0, false, qb.newEstimate()).ok).toBe(false);
    expect(qb.judgeTarget(v, { slot: 1, route: [], breakIndex: -1, settles: true }, ctx({ maxRangeYd: 45, allowOutOfRange: true }), 0, false, qb.newEstimate()).ok).toBe(true);
    const far = qb.judgeTarget(v, { slot: 1, route: [], breakIndex: -1, settles: true }, ctx({ maxRangeYd: 45 }), 0, false, qb.newEstimate());
    expect(far.outOfRange).toBe(true);
    const near = qb.judgeTarget(v, { slot: 1, route: [], breakIndex: -1, settles: true }, ctx({ maxRangeYd: 60 }), 0, false, qb.newEstimate());
    expect([near.ok, near.outOfRange]).toEqual([true, false]);
  });
  it('he does not expect a receiver to run out of bounds: the aim point stays inside the sideline', () => {
    const flat = [{ px: 0, py: 10 }, { px: 3, py: 14 }, { px: 3, py: 40 }];
    const v = new FakeView(QB).at(-5, 0).see(1, 3, 20, 0, 7.5);
    const open = qb.judgeTarget(v, { slot: 1, route: flat, breakIndex: -1, settles: false }, ctx(), 0, false, qb.newEstimate());
    expect(open.aimPy).toBeGreaterThan(26);
    const fenced = qb.judgeTarget(v, { slot: 1, route: flat, breakIndex: -1, settles: false }, ctx({ loPy: -26, hiPy: 26 }), 0, false, qb.newEstimate());
    expect(fenced.aimPy).toBeCloseTo(26 - P['judge.sidelineRoomYd'], 9);
  });
  it('he comes off a receiver who is past his arm at once, and does not wait out the read', () => {
    const reads = threeReads().map((r) => ({ ...r, target: { ...r.target, breakIndex: -1 } }));
    const base = runScene({ play: qb.basePlay(QB, 'gun3', reads), noThrow: true, maxTicks: 40, ...covered() });
    const scripts = { ...covered().scripts, 1: alongRoute([{ px: 75, py: 0 }, { px: 95, py: 0 }], 6, true) };
    const gone = runScene({ play: qb.basePlay(QB, 'gun3', reads), noThrow: true, maxTicks: 40, scripts });
    expect(base.record.readTicks[1]! - base.record.readTicks[0]!).toBeGreaterThanOrEqual(4);
    expect(gone.record.readTicks[1]! - gone.record.readTicks[0]!).toBeLessThanOrEqual(1);
  });
  it('J7.3.1 acceptance: a grade-80 reader estimates completion closer to the truth than a grade-30 reader', () => {
    // Truth is the estimate with no error. Mean absolute error and Brier score against it over 400 looks.
    const src = TABLE.num('qb.judge.sepSdBaseYd');
    expect(src).toBe(P['judge.sepSdBaseYd']);
    const errs = (grade: number): number => {
      const sd = qb.separationSdYd((grade - 50) / 10, P);
      let sum = 0, k = 0;
      for (let i = 0; i < 400; i++) {
        const gap = 0.5 + (i % 8) * 0.4, u1 = ((i * 7919) % 1000 + 0.5) / 1000, u2 = ((i * 104729) % 1000 + 0.5) / 1000;
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        const v = new FakeView(QB).at(-7, 0).see(1, 10, 10, 7, 0).see(11, 10 - gap, 10.3, 7, 0);
        const truth = qb.judgeTarget(v, t1, ctx(), 0, false, qb.newEstimate()).pHat;
        sum += Math.abs(qb.judgeTarget(v, t1, ctx(), z * sd, false, qb.newEstimate()).pHat - truth); k++;
      }
      return sum / k;
    };
    expect(errs(80)).toBeLessThan(errs(30));
  });
  it('J7.3.2: he throws the open man on time and holds the ball when the read is covered', () => {
    const open = runScene({ play: qb.basePlay(QB, 'gun3', [read(target(1, OUT, 1))]), scripts: { 1: alongRoute(OUT, 7.5), 11: still(25, -10) } });
    expect(open.record.throwRecord?.kind).toBe('pass');
    expect(open.record.throwRecord!.targetSlot).toBe(1);
    const pr = open.events.find((e) => e.type === 'pass_release')!;
    expect(pr).toMatchObject({ forward: true, throwaway: false, spike: false, underPressure: false, passerOutsidePocket: false, ballBeyondLine: false, targetId: 101, passerId: 100 });
    expect(open.world.ball.kind).toBe('passInFlight');
    const held = runScene({ attrs: { coverage_reading_post_snap: 99 }, play: qb.basePlay(QB, 'gun3', threeReads()), maxTicks: 30, ...covered() });
    expect(held.record.throwRecord).toBeNull();
  });
  it('J7.3.2 acceptance: a risk-taking quarterback throws into windows a careful one will not, and accepts more interception risk', () => {
    // A defender sits under the out; a second read worth more is still to come. Decision risk 80 against 20, 200 plays each.
    // The out starts 8 yd further inside than `OUT`, so a late throw to it is still to a man in bounds.
    const out = OUT.map((q) => ({ px: q.px, py: q.py - 8 }));
    const scene = (seed: number, g: number) => runScene({
      seed, attrs: { decision_risk: g }, play: qb.basePlay(QB, 'gun3', [read(target(1, out, 1), 0.3), read(target(2, R2, 1, true), 0.6)]), maxTicks: 60,
      scripts: { 1: alongRoute(out, 7.5), 2: alongRoute(R2, 6, true), 12: alongRoute([{ px: 0.5, py: -12 }, { px: 10.5, py: -12 }], 6, true), 11: still(10.5, 9) },
    });
    // The careful one waits for a clean look or pulls it down; the risk-taker lets it go with a defender in the picture.
    const covered = (g: number): number => share(N, (seed) => { const th = scene(seed, g).record.throwRecord; return th !== null && th.kind === 'pass' && th.iHat > 0.05; });
    expect(covered(80)).toBeGreaterThan(covered(20));
    const risk = (g: number): number => mean(N, (seed) => { const th = scene(seed, g).record.throwRecord; return th && th.kind === 'pass' ? th.iHat : 0; });
    expect(risk(80)).toBeGreaterThan(risk(20));
  });
  it('J7.3.3 hot: the ball is out under 1.8 s on at least 90% of plays where he saw the blitz coming', () => {
    const hotRoute = [{ px: 0, py: 4 }, { px: 3, py: 4 }, { px: 5, py: 9 }];
    let seen = 0, quick = 0;
    for (let seed = 1; seed <= N; seed++) {
      const play = { ...qb.basePlay(QB, 'gun3', threeReads()), hot: { rusherSlot: 14, target: target(4, hotRoute), expectedPreSnap: true } };
      const sc = covered().scripts!;
      const r = runScene({ seed, play, maxTicks: 40, scripts: { ...sc, 4: alongRoute(hotRoute, 7) }, chasers: { 14: [1, -5, 7.5, 0] } });
      if (!r.record.hotSeen) continue;
      seen++;
      if (r.record.throwRecord?.hot && r.record.throwRecord.timeS < 1.8) quick++;
    }
    expect(seen).toBeGreaterThan(N / 2);
    expect(quick / seen).toBeGreaterThanOrEqual(0.9);
  });
  it('blitz recognition: a grade-80 quarterback sees the hot more often than a grade-30 one', () => {
    const sees = (g: number): number => share(N, (seed) => runScene({
      seed, attrs: { blitz_recognition: g }, maxTicks: 3, play: { ...qb.basePlay(QB, 'gun3', threeReads()), hot: { rusherSlot: 14, target: target(4, R3), expectedPreSnap: false } }, ...covered(),
    }).record.hotSeen);
    expect(sees(80)).toBeGreaterThan(sees(30));
  });
});

describe('J7.4 pressure', () => {
  // A free rusher released at `startS`, receivers covered throughout.
  const rushed = (seed: number, startS: number, over: Partial<SceneSpec> = {}): ReturnType<typeof runScene> =>
    runScene({ seed, play: qb.basePlay(QB, 'gun3', threeReads()), maxTicks: 90, chasers: { 14: [1, 4, 7, startS] }, ...covered(), ...over, scripts: { ...covered().scripts!, ...(over.scripts ?? {}) } });

  it('emits one `pressure` event per rusher, then exactly one arrival outcome or a throw', () => {
    const r = rushed(3, 0.5);
    const kinds = r.events.filter((e) => e.type === 'pressure').map((e) => (e as { kind: string }).kind);
    expect(kinds.filter((k) => k === 'pressure').length).toBe(1);
    expect(kinds[0]).toBe('pressure');
    expect(r.record.response).not.toBeNull();
  });
  it('a rusher still locked up at the line is not pressure until he is winning by the felt margin (J6.2.5)', () => {
    const scene = (advantage: number) => runScene({
      play: qb.basePlay(QB, 'uc5', threeReads()), noThrow: true, maxTicks: 4, scripts: { 12: still(0.9, 0.5) },
      setup: (w) => {
        w.contests.push({ type: 'passBlock', offenseSlot: 9, defenseSlot: 12, advantage, startedTick: 0, helperSlots: [], stream: w.streams('contest', [1, 1, 901, 912, 'passBlock']) });
        const i = w.contests.length - 1; (w.players.engagement as Int16Array)[12] = i; (w.players.engagement as Int16Array)[9] = i;
      },
    });
    const pressures = (advantage: number): number => scene(advantage).events.filter((e) => e.type === 'pressure').length;
    expect(pressures(-0.2)).toBe(0);
    expect(pressures(P['pressure.feltAdvantage'] - 0.1)).toBeGreaterThan(0);
  });
  it('PR-3: the sack rate falls as the protection holds longer (free rusher at 0.5, 1.5, 2.5 s; a receiver comes open at 2.6 s)', () => {
    const rate = (startS: number): number => share(N, (seed) => {
      // Receiver 3 loses his man at 2.6 s.
      const r = rushed(seed, startS, { scripts: { 13: (t) => (t < 2.2 ? alongRoute([{ px: 0.5, py: 5 }, { px: 6.5, py: 5 }], 6, true)(t) : [6.5 + (t - 2.2) * 7, 5 - (t - 2.2) * 7]) } });
      return r.record.sack !== null;
    });
    const a = rate(0.5), b = rate(1.5), c = rate(2.5);
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
    expect(a).toBeGreaterThan(0.1);
  });
  it('pocket movement 70 against 30, same free rusher: when he moves in the pocket he is sacked on a smaller share', () => {
    const tally = (g: number): { sackShare: number } => {
      let moved = 0, sacked = 0;
      for (let seed = 1; seed <= 2 * N; seed++) {
        const r = rushed(seed, 1.2, { attrs: { pocket_movement: g }, scripts: { 13: (t) => (t < 2.2 ? alongRoute([{ px: 0.5, py: 5 }, { px: 6.5, py: 5 }], 6, true)(t) : [6.5 + (t - 2.2) * 7, 5 - (t - 2.2) * 7]) } });
        if (r.record.response !== 'pocketMovement') continue;
        moved++;
        if (r.record.sack) sacked++;
      }
      return { sackShare: sacked / moved };
    };
    const hi = tally(70), lo = tally(30);
    expect(hi.sackShare).toBeLessThan(lo.sackShare);
  });
  it('J7.4.1 acceptance: an unseen blindside rusher forces fumbles on a larger share of his sacks than one in his face', () => {
    let bs = 0, bf = 0, fs = 0, ff = 0;
    for (let seed = 1; seed <= 4 * N; seed++) {
      const blind = runScene({ seed, play: qb.basePlay(QB, 'gun3', threeReads()), maxTicks: 60, chasers: { 14: [-12, 3, 7, 0.8] }, hidden: [14], attrs: { pocket_movement: 20 }, ...covered() });
      if (blind.record.sack) { bs++; if (blind.record.sack.fumble) bf++; }
      const front = runScene({ seed, play: qb.basePlay(QB, 'gun3', threeReads()), maxTicks: 60, chasers: { 14: [1, 0.5, 7, 0.8] }, attrs: { pocket_movement: 20 }, ...covered() });
      if (front.record.sack) { fs++; if (front.record.sack.fumble) ff++; }
    }
    expect(bs).toBeGreaterThan(50);
    expect(fs).toBeGreaterThan(50);
    expect(bf / bs).toBeGreaterThan(ff / fs);
  });
  it('a strip-sack emits the fumble and puts the ball on the ground loose', () => {
    for (let seed = 1; seed <= 600; seed++) {
      const r = runScene({ seed, play: qb.basePlay(QB, 'gun3', threeReads()), maxTicks: 60, chasers: { 14: [-12, 3, 7, 0.8] }, hidden: [14], attrs: { pocket_movement: 20, ball_security: 10 }, ...covered() });
      if (!r.record.sack?.fumble) continue;
      expect(r.events.some((e) => e.type === 'fumble')).toBe(true);
      expect(r.world.ball.carrierSlot).toBe(-1);
      expect(r.world.players.hasBall[QB]).toBe(0);
      return;
    }
    throw new Error('no strip-sack in 600 plays');
  });
  it('false pressure: a shaken quarterback who has been hit leaves clean pockets; a composed one never does', () => {
    const left = (composure: number, hits: number): number => share(N, (seed) => runScene({
      seed, attrs: { composure }, play: { ...qb.basePlay(QB, 'gun3', threeReads()), hitsThisGame: hits }, maxTicks: 30, ...covered(),
    }).record.falsePressure);
    expect(left(20, 4)).toBeGreaterThan(0);
    expect(left(60, 4)).toBe(0);
    expect(left(20, 0)).toBe(0);
  });
});

describe('J7.5 leaving the pocket', () => {
  it('J7.5.1 acceptance: he scrambles more against man coverage with backs turned than against zone with a spy', () => {
    const deepMan = { 11: line(10, 12, 6, 0), 12: line(10, -12, 6, 0), 13: line(8, 5, 6, 0) };
    const zoneSpy = { 11: still(10, 12), 12: still(10, -12), 13: still(5, 0) };
    const stay = { 1: still(12, 12), 2: still(10, -12), 3: still(6, 5) };
    const runs = (defs: Record<number, (t: number) => readonly [number, number]>): number => share(2 * N, (seed) => runScene({
      seed, attrs: { scramble_and_run_skill: 70 }, play: qb.basePlay(QB, 'gun3', threeReads()), noThrow: true, maxTicks: 70, scripts: { ...stay, ...defs },
    }).record.ran !== null);
    const man = runs(deepMan), zone = runs(zoneSpy);
    expect(man).toBeGreaterThan(zone);
    expect(man).toBeGreaterThan(0.05);
  });
  it('a scramble is reported once and the carrier module is offered the run', () => {
    let offered = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const r = runScene({
        seed, attrs: { scramble_and_run_skill: 95 }, play: { ...qb.basePlay(QB, 'gun3', threeReads()), instructions: { risk: 'normal', scramble: 1, protectBall: false } }, noThrow: true, maxTicks: 70,
        scripts: { 1: still(12, 12), 2: still(10, -12), 3: still(6, 5), 11: line(10, 12, 6, 0), 12: line(10, -12, 6, 0) }, options: { onRun: () => { offered++; return false; } },
      });
      if (r.record.ran === null) continue;
      expect(offered).toBe(1);
      expect(r.record.ran.why).toBe('scramble');
      expect(r.events.filter((e) => e.type === 'detail' && e.code === 'qb.scramble').length).toBe(1);
      // The shared stat code the box score counts scrambles by (contract D-16).
      expect(r.events.filter((e) => e.type === 'detail' && e.code === 'scramble').length).toBe(1);
      expect(r.quarterback.phase()).toBe('run');
      return;
    }
    throw new Error('no scramble in 200 plays');
  });
  it('J7.5.2: a throwaway from the pocket lands near an eligible receiver and is never a grounding hazard', () => {
    let seen = 0;
    for (let seed = 1; seed <= 300 && seen < 20; seed++) {
      const r = runScene({ seed, play: qb.basePlay(QB, 'gun3', threeReads()), maxTicks: 90, chasers: { 14: [1, 4, 7, 1.0] }, ...covered() });
      const th = r.record.throwRecord;
      if (!th || th.kind !== 'throwaway' || r.record.everOutsidePocket) continue;
      seen++;
      expect(r.record.groundingHazard).toBeNull();
      expect(r.events.find((e) => e.type === 'pass_release')).toMatchObject({ throwaway: true, targetId: null });
    }
    expect(seen).toBeGreaterThan(0);
  });
  it('J7.5.2: from the pocket he fires it into the ground at or around a receiver, inside the vicinity, never at catch height', () => {
    let seen = 0;
    for (let seed = 1; seed <= 300 && seen < 20; seed++) {
      const r = runScene({ seed, play: qb.basePlay(QB, 'gun3', threeReads()), maxTicks: 90, chasers: { 14: [1, 4, 7, 1.0] }, ...covered() });
      const th = r.record.throwRecord;
      if (!th || th.kind !== 'throwaway' || r.record.everOutsidePocket) continue;
      seen++;
      expect(th.trajectory).toBe('drive');
      const w = r.world, d = w.frame.attackDir;
      const landPx = (th.landingX - w.frame.originX) * d, landPy = (th.landingY - w.frame.originY) * d;
      let near = Infinity;
      for (const s of [1, 2, 3]) { const a = r.at(s, th.timeS); near = Math.min(near, Math.hypot(a[0] - landPx, a[1] - landPy)); }
      expect(near).toBeLessThanOrEqual(P['throwaway.vicinityYd']);
      // Aimed at the ground: in still air with no aim error it comes down where he aimed.
      expect(Math.hypot(th.landingX - th.aimX, th.landingY - th.aimY)).toBeLessThan(0.1);
    }
    expect(seen).toBeGreaterThan(0);
  });
  it('J7.5.2: once outside the pocket he throws it high out of bounds past the line of scrimmage (Rule 8-2-1 Item 1)', () => {
    let seen = 0;
    for (let seed = 1; seed <= 300 && seen < 10; seed++) {
      // A pocket that does not contain his launch point: he is outside it from the first tick.
      const play = { ...qb.basePlay(QB, 'gun3', threeReads()), pocket: { leftPy: -2, rightPy: -4 } };
      const r = runScene({ seed, play, maxTicks: 90, chasers: { 14: [1, 4, 7, 1.0] }, ...covered() });
      const th = r.record.throwRecord;
      if (!th || th.kind !== 'throwaway') continue;
      seen++;
      expect(r.record.everOutsidePocket).toBe(true);
      expect(th.trajectory).toBe('touch');
      const w = r.world;
      expect(th.landingY < 0 || th.landingY > w.geometry.widthYd).toBe(true);
      expect((th.landingX - w.frame.originX) * w.frame.attackDir).toBeGreaterThanOrEqual(0);
      expect(r.record.groundingHazard).toBeNull();
    }
    expect(seen).toBeGreaterThan(0);
  });
  // Receivers he cannot see and cannot place: no drawn route to project them along (J7.3.1 step 1).
  const unplaced = (): qb.QbRead[] => [read(target(1, []), 0.4), read(target(2, []), 0.3), read(target(3, []), 0.2)];
  it('J7.5.2: with no eligible receiver he can see or place, only a quarterback who does not know the rule throws it away, and that is a hazard', () => {
    let hazards = 0, legal = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const play = { ...qb.basePlay(QB, 'gun3', unplaced()), pocket: { leftPy: 30, rightPy: -30 } };
      const r = runScene({ seed, attrs: { football_intelligence: 5, composure: 5 }, play, maxTicks: 90, chasers: { 14: [1, 4, 7, 1.0] }, hidden: [1, 2, 3], ...covered() });
      const th = r.record.throwRecord;
      if (!th || th.kind !== 'throwaway') continue;
      if (r.record.groundingHazard) { hazards++; expect(r.events.some((e) => e.type === 'detail' && e.code === 'qb.grounding_hazard')).toBe(true); } else legal++;
    }
    expect(hazards).toBeGreaterThan(0);
    const smart = share(200, (seed) => {
      const play = { ...qb.basePlay(QB, 'gun3', unplaced()), pocket: { leftPy: 30, rightPy: -30 } };
      return runScene({ seed, attrs: { football_intelligence: 99, composure: 99 }, play, maxTicks: 90, chasers: { 14: [1, 4, 7, 1.0] }, hidden: [1, 2, 3], ...covered() }).record.groundingHazard !== null;
    });
    expect(smart).toBeLessThan(hazards / 400);
    void legal;
  });
});

describe('J7.6 the throw', () => {
  const outPlay = (): qb.QbPlay => qb.basePlay(QB, 'gun3', [read(target(1, OUT, 1))]);
  it('release takes 0.40 s at grade 50 and less for a quicker release', () => {
    const lag = (g: number): number => {
      const r = runScene({ attrs: { release_time: g }, play: outPlay(), scripts: { 1: alongRoute(OUT, 7.5) } });
      const decided = r.quarterback.notes().find((n) => n.note === 'throw')!;
      return r.record.throwRecord!.tick - decided.tick;
    };
    expect(lag(50)).toBe(4);
    expect(lag(95)).toBeLessThan(lag(50));
    expect(lag(5)).toBeGreaterThan(lag(50));
  });
  it('DP-1 direction: the same quarterback misses by more, and completes less, the deeper the throw', () => {
    const at = (depth: number): { miss: number; p: number } => {
      const route: { px: number; py: number }[] = [];
      let miss = 0, p = 0;
      for (let seed = 1; seed <= N; seed++) {
        const r = runScene({ seed, play: qb.basePlay(QB, 'gun3', [read(target(1, route))]), scripts: { 1: still(depth, 8) }, maxTicks: 80 });
        miss += r.record.throwRecord!.missYd; p += catchChance(r, []).p;
      }
      return { miss: miss / N, p: p / N };
    };
    const s = at(5), m = at(15), d = at(28);
    expect(s.miss).toBeLessThan(m.miss);
    expect(m.miss).toBeLessThan(d.miss);
    expect(s.p).toBeGreaterThan(m.p);
    expect(m.p).toBeGreaterThan(d.p);
  });
  it('accuracy: grade 80 completes more intermediate throws than grade 30', () => {
    const comp = (g: number): number => mean(N, (seed) => catchChance(runScene({ seed, attrs: { accuracy_intermediate: g }, play: outPlay(), scripts: { 1: alongRoute(OUT, 7.5) } }), []).p);
    expect(comp(80)).toBeGreaterThan(comp(30));
  });
  it('J7.6.1 acceptance: arm strength 70 completes more 15-yard outs to the far sideline than arm strength 40', () => {
    // The corner breaks on the ball from 5 yards off at the release; a faster ball gives him less time.
    const far = [{ px: 0, py: 12 }, { px: 15, py: 12 }, { px: 15, py: 27 }];
    const comp = (g: number): number => mean(N, (seed) => {
      const r = runScene({ seed, attrs: { arm_strength: g }, qbAt: [-5, -8], play: qb.basePlay(QB, 'gun3', [read(target(1, far, 1))]), scripts: { 1: alongRoute(far, 7.5) }, maxTicks: 80 });
      const th = r.record.throwRecord;
      if (!th || th.kind !== 'pass') return 0;
      const closes = 7.5 * Math.max(th.flightS - 0.3, 0);
      const cp = CONTESTS.catchPoint, c = catchChance(r, []);
      if (c.p === 0) return 0;
      const sep = Math.max(9 - closes, 0);
      return cp.isContested(sep) ? cp.contestedProbabilities({ zContestedCatch: 0, zBallSkills: 0, position: 'inPhase', ballLocated: true, placementError: 0.5, hitAtCatch: false, wet: false })[0]! : c.p;
    });
    expect(comp(70)).toBeGreaterThan(comp(40));
    const flight = (g: number): number => runScene({ attrs: { arm_strength: g }, qbAt: [-5, -8], play: qb.basePlay(QB, 'gun3', [read(target(1, far, 1))]), scripts: { 1: alongRoute(far, 7.5) }, maxTicks: 80 }).record.throwRecord!.flightS;
    expect(flight(70)).toBeLessThan(flight(40));
  });
  it('J7.1.2 acceptance: an anticipating quarterback releases before the break; one without waits for it', () => {
    const when = (g: number): number => runScene({ attrs: { anticipation: g }, play: qb.basePlay(QB, 'gunQuick', [read(target(1, OUT, 1))]), scripts: { 1: alongRoute(OUT, 7.5) } }).record.throwRecord!.timeS;
    expect(when(90)).toBeLessThan(when(10));
  });
  it('the ball flies under the ball module and lands where the release event said', () => {
    const r = runScene({ play: outPlay(), scripts: { 1: alongRoute(OUT, 7.5) }, stopAtThrow: false, maxTicks: 80 });
    const th = r.record.throwRecord!, g = ball.ballFlight(r.world).grounded;
    expect(g).not.toBeNull();
    // The event's landing spot is at catch height; the ground is a few feet further along the flight.
    expect(Math.hypot(g!.x - th.landingX, g!.y - th.landingY)).toBeLessThan(4);
  });
});

describe('J7.6 edge cases: the pump fake and the ball batted at the line', () => {
  // A defender sits under the out where the ball comes down, so the throw is not on; nothing else to look at.
  // (A man who stands 12 yd short of the catch is no longer "on the throw": a firm ball is far over his head there.)
  const sat = (seed: number, attrs: Record<string, number>, over: Partial<SceneSpec> = {}) => runScene({
    seed, attrs, play: qb.basePlay(QB, 'gun3', [read(target(1, OUT, 1), 0.3), read(target(2, R2, 1, true), 0.9)]), maxTicks: 40, noThrow: true,
    scripts: { 1: alongRoute(OUT, 7.5), 2: alongRoute(R2, 6, true), 12: alongRoute([{ px: 0.5, py: -12 }, { px: 10.5, py: -12 }], 6, true), 11: still(10.5, 21) }, ...over,
  });
  it('he pump-fakes a defender sitting on the throw at most once a play, and a better ball handler does it more', () => {
    const used = (g: number): number => share(N, (seed) => {
      const r = sat(seed, { play_fake_and_ball_handling: g });
      expect(r.record.pumps.length).toBeLessThanOrEqual(1);
      return r.record.pumps.length === 1;
    });
    const hi = used(90), lo = used(10);
    expect(hi).toBeGreaterThan(lo);
    expect(lo).toBeGreaterThan(0);
    expect(hi).toBeLessThan(1);
  });
  it('a pump fake costs the release time, reports the cue, and leaves him with the ball on the same read', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const cues: [number, number][] = [];
      const r = sat(seed, { play_fake_and_ball_handling: 90 }, { options: { onPumpFake: (_w, _s, x, y) => { cues.push([x, y]); } } });
      if (r.record.pumps.length === 0) continue;
      const at = r.record.pumps[0]!.tick, tr = r.quarterback.track();
      expect(cues.length).toBe(1);
      expect(r.events.filter((e) => e.type === 'detail' && e.code === 'qb.pump_fake').length).toBe(1);
      expect(r.events.some((e) => e.type === 'pass_release')).toBe(false);
      const pumpCode = qb.QB_PHASES.indexOf('pump');
      let ticks = 0;
      for (let k = at; k < tr.ticks; k++) if (tr.phase[k] === pumpCode) ticks++;
      expect(ticks).toBe(Math.round(P['throw.releaseBaseS'] / TICK_S));
      expect(tr.look[at + ticks + 1]).toBe(1);
      expect(r.world.ball.carrierSlot).toBe(QB);
      return;
    }
    throw new Error('no pump fake in 100 plays');
  });

  // A quick throw straight ahead with a rusher standing in the lane 2 yards in front of him.
  const quick = [{ px: 0, py: 0 }, { px: 6, py: 0 }];
  const lane = (seed: number, defAt: readonly [number, number], batting = 50) => runScene({
    seed, play: qb.basePlay(QB, 'gunQuick', [read(target(1, quick, -1, true))]), maxTicks: 30, stopAtThrow: true,
    players: (s) => (s === 14 ? { attributes: { batting_passes: batting } } : {}),
    scripts: { 1: still(6, 0), 14: still(defAt[0], defAt[1]) }, hidden: [14],
  });
  it('a rusher in the lane bats some passes; one out of the lane bats none; a better batter bats more', () => {
    const rate = (defAt: readonly [number, number], batting = 50): number => share(2 * N, (seed) => lane(seed, defAt, batting).record.throwRecord?.battedBySlot === 14);
    const inLane = rate([-3, 0.2]);
    expect(inLane).toBeGreaterThan(0.02);
    expect(inLane).toBeLessThan(0.6);
    expect(rate([-3, 4])).toBe(0);
    expect(rate([-3, 0.2], 90)).toBeGreaterThan(rate([-3, 0.2], 10));
  });
  it('a batted pass is reported, keeps flying as a forward pass, and no longer goes where it was thrown', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const r = lane(seed, [-3, 0.2]);
      if (r.record.throwRecord?.battedBySlot !== 14) continue;
      const ev = r.events.find((e) => e.type === 'detail' && e.code === 'qb.pass_batted');
      expect(ev).toMatchObject({ playerIds: [114, 100] });
      expect(r.world.ball.kind).toBe('passInFlight');
      expect(r.world.ball.passForward).toBe(true);
      const clean = lane(seed, [-3, 9]);
      expect(Math.hypot(r.world.ball.velX, r.world.ball.velY)).toBeLessThan(Math.hypot(clean.world.ball.velX, clean.world.ball.velY));
      return;
    }
    throw new Error('no batted pass in 400 plays');
  });
});

describe('J7.7.1 the mesh read', () => {
  const meshPlay = (onCrash: 'keep' | 'throw' = 'keep'): qb.QbPlay => ({
    ...qb.basePlay(QB, 'gunQuick', []), kind: 'mesh', eligible: [3],
    mesh: { keySlot: 15, backSlot: 5, startS: 0.3, endS: 0.8, onCrash, ...(onCrash === 'throw' ? { throwTarget: target(3, [{ px: 0, py: 6 }, { px: 5, py: 6 }]) } : {}) },
  });
  const back = { 5: line(-5, 1.5, 0, -1.2, 0, 1) };
  it('the key crashes: he keeps and runs. The key stays home: he gives, and the back has the ball', () => {
    const keep = runScene({ play: meshPlay(), scripts: { ...back, 15: line(1, -6, -5, 4) }, maxTicks: 14 });
    expect(keep.record.mesh).toMatchObject({ decision: 'keep', correct: true, ambiguous: false });
    expect(keep.record.ran?.why).toBe('keep');
    expect(keep.events.some((e) => e.type === 'exchange' && e.kind === 'fake')).toBe(true);
    const give = runScene({ play: meshPlay(), scripts: { ...back, 15: line(1, -6, 0, -3) }, maxTicks: 20 });
    expect(give.record.mesh).toMatchObject({ decision: 'give', correct: true });
    expect(give.world.ball.carrierSlot).toBe(5);
    expect(give.world.players.hasBall[5]).toBe(1);
    expect(give.world.players.hasBall[QB]).toBe(0);
    expect(give.events.some((e) => e.type === 'exchange' && e.kind === 'handoff')).toBe(true);
    expect(give.events.some((e) => e.type === 'possession')).toBe(true);
  });
  it('a run-pass option throws the attached route when the conflict defender comes down', () => {
    const r = runScene({ play: meshPlay('throw'), scripts: { ...back, 3: still(5, 6), 15: line(4, 6, -5, -4) }, maxTicks: 30 });
    expect(r.record.mesh?.decision).toBe('throw');
    expect(r.record.throwRecord?.targetSlot).toBe(3);
  });
  it('J7.7.1 edge case: the exchange is fumbled more often when the decision is late, and the ball is then loose', () => {
    const fumbled = (key: (t: number) => readonly [number, number]): number => share(5 * N, (seed) =>
      runScene({ seed, attrs: { play_fake_and_ball_handling: 15 }, play: meshPlay(), scripts: { ...back, 15: key }, maxTicks: 20 }).record.mesh?.fumbled === true);
    const late = fumbled(line(1, -6, -0.3, 0.2)), clean = fumbled(line(1, -6, 0, -3));
    expect(late).toBeGreaterThan(clean);
    expect(late).toBeGreaterThan(0);
    for (let seed = 1; seed <= 1000; seed++) {
      const r = runScene({ seed, attrs: { play_fake_and_ball_handling: 15 }, play: meshPlay(), scripts: { ...back, 15: line(1, -6, -0.3, 0.2) }, maxTicks: 20 });
      if (!r.record.mesh?.fumbled) continue;
      expect(r.record.mesh.late).toBe(true);
      expect(r.events.some((e) => e.type === 'fumble')).toBe(true);
      expect(r.world.ball.kind).toBe('loose');
      expect(r.world.players.hasBall[QB]).toBe(0);
      expect(r.record.ran).toBeNull();
      return;
    }
    throw new Error('no fumbled exchange in 1000 plays');
  });
  it('J7.7.1 acceptance: against a slow-playing key, a grade-70 reader is right more often than a grade-40 one', () => {
    const right = (g: number): number => share(2 * N, (seed) => runScene({ seed, attrs: { play_recognition: g }, play: meshPlay(), scripts: { ...back, 15: line(1, -6, -0.3, 0.2) }, maxTicks: 12 }).record.mesh?.correct === true);
    expect(right(70)).toBeGreaterThan(right(40));
  });
});

describe('the designed handoff (kind `handoff`): no read, he meets the back and gives', () => {
  const give = (over: Partial<qb.Handoff> = {}): qb.QbPlay => ({ ...qb.basePlay(QB, 'gunQuick', []), kind: 'handoff', eligible: [3], handoff: { backSlot: 5, meet: null, ...over } });
  const back = { 5: line(-5, 1.5, 0, -1.2, 0, 1) };
  it('a handoff play needs its handoff, to a teammate who is not himself', () => {
    expect(qb.qbPlayProblems({ ...give(), handoff: null })).toContain('a handoff play needs its handoff');
    expect(qb.qbPlayProblems({ ...give(), handoff: { backSlot: QB, meet: null } })).toContain('handoff: the back must be a teammate');
    expect(qb.qbPlayProblems(give())).toEqual([]);
  });
  it('he gives whatever the end does: a crashing end changes nothing, and no mesh read is on the record', () => {
    for (const end of [line(1, -6, -5, 4), line(1, -6, 0, -3), line(1, -6, -0.3, 0.2)]) {
      const r = runScene({ play: give(), scripts: { ...back, 15: end }, maxTicks: 20 });
      expect(r.record.handoff).toMatchObject({ given: true, fumbled: false });
      expect(r.record.mesh).toBeNull();
      expect(r.record.ran).toBeNull();
      expect(r.world.ball.carrierSlot).toBe(5);
      expect(r.world.players.hasBall[5]).toBe(1);
      expect(r.world.players.hasBall[QB]).toBe(0);
      expect(r.events.filter((e) => e.type === 'exchange').map((e) => (e as { kind: string }).kind)).toEqual(['handoff']);
      expect(r.events.some((e) => e.type === 'possession')).toBe(true);
    }
  });
  it('he goes to a drawn meeting point to give it', () => {
    const r = runScene({ play: give({ meet: { px: -3, py: 2 } }), scripts: { 5: still(-3, 2.6) }, maxTicks: 30 });
    expect(r.record.handoff?.given).toBe(true);
    expect(r.record.handoff!.tick).toBeGreaterThan(1);
  });
  it('a poor ball handler sometimes puts it on the ground, and the ball is then loose', () => {
    const fumbles = (g: number): number => share(5 * N, (seed) => runScene({ seed, attrs: { play_fake_and_ball_handling: g }, play: give(), scripts: back, maxTicks: 20 }).record.handoff?.fumbled === true);
    expect(fumbles(15)).toBeGreaterThan(0);
    expect(fumbles(15)).toBeGreaterThan(fumbles(85));
    for (let seed = 1; seed <= 2000; seed++) {
      const r = runScene({ seed, attrs: { play_fake_and_ball_handling: 15 }, play: give(), scripts: back, maxTicks: 20 });
      if (!r.record.handoff?.fumbled) continue;
      expect(r.record.handoff.given).toBe(false);
      expect(r.events.some((e) => e.type === 'fumble')).toBe(true);
      expect(r.world.ball.kind).toBe('loose');
      expect(r.world.players.hasBall[QB]).toBe(0);
      return;
    }
    throw new Error('no fumbled handoff in 2000 plays');
  });
  it('a back who never arrives: after the give-up time he keeps it and runs', () => {
    const r = runScene({ play: give(), scripts: { 5: still(-5, 12) }, maxTicks: 40 });
    expect(r.record.handoff).toMatchObject({ given: false, fumbled: false });
    expect(r.record.handoff!.tick * TICK_S).toBeGreaterThanOrEqual(P['handoff.giveUpS']);
    expect(r.record.ran?.why).toBe('keep');
    expect(r.world.players.hasBall[QB]).toBe(1);
  });
});

describe('J7.8 clock plays and free plays', () => {
  it('kneel: the ball is live 2.0 s and he ends 1 yard behind where he took the snap', () => {
    const r = runScene({ play: { ...qb.basePlay(QB, 'uc3', []), kind: 'kneel', underCenter: true }, maxTicks: 40 });
    expect(r.record.kneel).not.toBeNull();
    expect(r.record.kneel!.tick * TICK_S).toBeCloseTo(2.0, 9);
    const px = (r.record.kneel!.x - r.world.frame.originX) * r.world.frame.attackDir;
    expect(Math.abs(px - -2)).toBeLessThan(0.3);
    expect(r.world.deadAtTick).toBe(r.record.kneel!.tick);
    expect(r.record.groundingHazard).toBeNull();
  });
  it('kneel: a defender who reaches him first ends it as a kneel-down, never a sack', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const r = runScene({ seed, play: { ...qb.basePlay(QB, 'uc3', []), kind: 'kneel', underCenter: true }, chasers: { 13: [1, 0, 8, 0] }, maxTicks: 40 });
      expect(r.record.sack, `seed ${seed}`).toBeNull();
      expect(r.record.kneel, `seed ${seed}`).not.toBeNull();
      expect(r.record.kneel!.tick * TICK_S).toBeLessThan(2.0);
      expect(r.events.some((e) => e.type === 'pressure' && e.kind === 'sack')).toBe(false);
    }
  });
  it('spike: legal under centre and never a grounding hazard; from the shotgun under a rule that requires under centre it is a hazard', () => {
    const uc = runScene({ play: { ...qb.basePlay(QB, 'uc3', []), kind: 'spike', underCenter: true }, maxTicks: 30, stopAtThrow: false });
    expect(uc.events.find((e) => e.type === 'pass_release')).toMatchObject({ spike: true, forward: true, throwaway: false });
    expect(uc.record.groundingHazard).toBeNull();
    expect(uc.record.throwRecord!.timeS).toBeLessThanOrEqual(0.6);
    expect(ball.ballFlight(uc.world).grounded).not.toBeNull();
    const gun = runScene({ play: { ...qb.basePlay(QB, 'gunQuick', []), kind: 'spike', underCenter: false }, maxTicks: 30 });
    expect(gun.record.groundingHazard).not.toBeNull();
    const allowed = runScene({ play: { ...qb.basePlay(QB, 'gunQuick', []), kind: 'spike', underCenter: false }, maxTicks: 30, rules: rules({ spikeNeedsUnderCenter: false }) });
    expect(allowed.record.groundingHazard).toBeNull();
  });
  it('sneak: he goes straight ahead as a runner at once', () => {
    const r = runScene({ play: { ...qb.basePlay(QB, 'uc3', []), kind: 'sneak', underCenter: true }, maxTicks: 8 });
    expect(r.record.ran).toMatchObject({ tick: 0, why: 'sneak' });
    expect((r.world.players.posX[QB]! - r.world.frame.originX) * r.world.frame.attackDir).toBeGreaterThan(-1);
  });
  it('J7.8.2 acceptance: on a recognised free play his throws travel at least twice as far in the air', () => {
    const deep = [{ px: 0, py: -10 }, { px: 45, py: -10 }], shortR = [{ px: 0, py: 8 }, { px: 5, py: 8 }];
    const reads = (): qb.QbRead[] => [read(target(1, shortR, 1, true), 0.2), read(target(2, deep), 0.1)];
    const air = (free: boolean): number => mean(N, (seed) => {
      const r = runScene({
        seed, attrs: { football_intelligence: 90 }, play: { ...qb.basePlay(QB, 'gun3', reads()), freePlay: free }, maxTicks: 60,
        scripts: { 1: alongRoute(shortR, 7, true), 2: alongRoute(deep, 8), 12: alongRoute([{ px: 1.5, py: -10.5 }, { px: 46.5, py: -10.5 }], 8) },
      });
      const th = r.record.throwRecord;
      return th && th.kind === 'pass' ? (th.landingX - r.world.frame.originX) * r.world.frame.attackDir : null;
    });
    const normal = air(false), free = air(true);
    expect(free).toBeGreaterThanOrEqual(2 * normal);
  });
  it('no free play inside two minutes', () => {
    const r = runScene({ attrs: { football_intelligence: 99 }, play: { ...qb.basePlay(QB, 'gun3', threeReads()), freePlay: true }, maxTicks: 3, ...covered(), setup: (w) => { (w.situation as { insideTwoMinute: boolean }).insideTwoMinute = true; } });
    expect(r.record.freePlaySeen).toBe(false);
  });
  it('Hail Mary: he holds for the receivers to get there, then throws to the landmark as far as his arm allows', () => {
    const go = [{ px: 0, py: 10 }, { px: 45, py: 2 }];
    const play: qb.QbPlay = { ...qb.basePlay(QB, 'gun3', [read(target(1, go))]), kind: 'hailMary', landmark: { px: 45, py: 0 } };
    const r = runScene({ play, scripts: { 1: alongRoute(go, 8.5, true) }, maxTicks: 80 });
    const th = r.record.throwRecord!;
    expect(th.kind).toBe('pass');
    expect(th.trajectory).toBe('touch');
    expect(th.timeS).toBeGreaterThan(3.5);
    expect((th.aimX - r.world.frame.originX) * r.world.frame.attackDir).toBeCloseTo(45, 6);
  });
});

describe('determinism and what he may read', () => {
  it('the same seed gives the same play, event for event', () => {
    const run = (seed: number) => {
      const r = runScene({ seed, play: qb.basePlay(QB, 'gun3', threeReads()), maxTicks: 90, chasers: { 14: [1, 4, 7, 1.0] }, ...covered() });
      return JSON.stringify([r.events, r.record, r.quarterback.notes()]);
    };
    for (const seed of [1, 2, 3, 4, 5]) expect(run(seed)).toBe(run(seed));
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map(run)).size).toBeGreaterThan(1);
  });
  it('takes a fixed block of draws at the start and exactly four per tick with the ball, whatever he decides', () => {
    const counted = (spec: Partial<SceneSpec>): number => {
      let draws = 0, ticksHeld = 0;
      const r = runScene({
        play: qb.basePlay(QB, 'gun3', threeReads()), maxTicks: 25, noThrow: true, ...covered(), ...spec,
        setup: (w) => {
          const streams = w.streams;
          (w as { streams: typeof streams }).streams = (name, scope) => {
            const s = streams(name, scope);
            if (name !== 'qb') return s;
            return { ...s, uniform: () => { draws++; return s.uniform(); }, normal: () => { draws++; return s.normal(); } };
          };
        },
      });
      ticksHeld = r.ticks;
      return draws - qb.QB_BEGIN_UNIFORMS - qb.QB_BEGIN_NORMALS - qb.QB_TICK_UNIFORMS * ticksHeld;
    };
    expect(counted({})).toBe(0);
    expect(counted({ chasers: { 14: [-3, 6, 7, 0.5] } })).toBeLessThanOrEqual(0);
  });
  it('Q1.4.1 audit: judging and the formulas never touch the world; the stage reads opponents\' truth only in the named places', () => {
    const dir = join(__dirname, '../../src/qb');
    for (const f of ['judge.ts', 'formulas.ts', 'play.ts']) {
      const code = readFileSync(join(dir, f), 'utf8');
      expect(code.includes('TickWorld'), f).toBe(false);
      expect(/\bplayers\.(pos|vel)/.test(code), f).toBe(false);
    }
    // In stage.ts, truth positions of other slots are read through playX/playY and `pl.`: list the functions that do.
    const stage = readFileSync(join(dir, 'stage.ts'), 'utf8');
    const fns = stage.split(/\n  function /).slice(1).map((b) => ({ name: b.slice(0, b.indexOf('(')), body: b }));
    const truthReaders = fns.filter((f) => /playX\(w, (?!s\b)|playY\(w, (?!s\b)|pl\.(posX|posY|velX|velY)\[(?!s\])/.test(f.body)).map((f) => f.name).sort();
    expect(truthReaders).toEqual(['batAtLine', 'doThrow', 'handoffStep', 'interactRun', 'meshStep', 'pitchStep', 'pocketMove', 'respond', 'sense']);
  });
  it('refuses a play it cannot run', () => {
    const q = qb.createQuarterback({ view: () => new FakeView(QB), contests: CONTESTS });
    expect(() => q.setPlay({ ...qb.basePlay(QB, 'gun3', []) })).toThrow(/at least one read/);
    expect(() => q.setPlay({ ...qb.basePlay(QB, 'gun3', threeReads()), kind: 'hailMary' })).toThrow(/landmark/);
    expect(() => q.setPlay(null)).not.toThrow();
  });
});
