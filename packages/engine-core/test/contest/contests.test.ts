// Q1.7.1 contest tests and Q1.7.3 rating-response sweeps at the contest layer, for J6.2 to J6.7.
// The target bands these curves must finally sit inside come from J15 rows that are PROVISIONAL
// (Q6.3.1) and need the whole play around the contest, so this file checks what the contest alone
// owns: the base rate at equal grades, the direction and monotonic response to every input, and
// the outcome ranges the leaves state.
import { describe, expect, it } from 'vitest';
import type { ArrivalInputs, ContestedInputs, FumbleInputs, StuntInputs, TackleInputs } from '../../src/contest/index.ts';
import { TICK_S } from '@gm/schema';
import { CONTEST_MATH } from '../../src/contest/index.ts';
import { Z_LADDER, band, contestStream, contests, runEngagement, share } from './helpers.ts';

const { passRush, runBlock, coverage, catchPoint, tackle, ballSecurity } = contests;
const logistic = (x: number) => 1 / (1 + Math.exp(-x));
const TRIALS = 10_000;

function expectMonotone(values: readonly number[], direction: 'up' | 'down', strict: boolean, label: string): void {
  for (let i = 1; i < values.length; i++) {
    const d = (values[i] as number) - (values[i - 1] as number);
    const ok = direction === 'up' ? (strict ? d > 0 : d >= 0) : (strict ? d < 0 : d <= 0);
    if (!ok) throw new Error(`${label}: not monotone ${direction} at step ${i} (${values[i - 1]} then ${values[i]})`);
  }
  expect((values[values.length - 1] as number) !== (values[0] as number), `${label}: flat`).toBe(true);
}

const arrival: ArrivalInputs = { dz: 0, blindside: false, qbMovingAway: false, secondRusherNear: false, releaseInProgress: false };
const stunt: StuntInputs = { zRecognitionMean: 0, zStuntTiming: 0, slideProtection: false, prepared: false };
const tk: TackleInputs = {
  dz: 0, angleQuality: 1, lunging: false, momentumRatio: 1, tacklers: 1, roomToCut: 0, moveWon: false,
  stripAttempt: false, zContactBalance: 0, type: 'headOn',
};
const fum: FumbleInputs = { zSecurity: 0, zHitPower: 0, hitEnergy: 1, blindside: false, stripAttempt: false, secondHitter: false, wet: false, isPasser: false };
const contested: ContestedInputs = { zContestedCatch: 0, zBallSkills: 0, position: 'inPhase', ballLocated: true, placementError: 0, hitAtCatch: false, wet: false };

describe('Q1.7.3 rating-response sweeps: every grade input, 0 to 100 in steps of 5', () => {
  // [contest and input, response over the z ladder, expected direction]
  const sweeps: [string, (z: number) => number, 'up' | 'down'][] = [
    ['sack: rusher finishing', (z) => passRush.sackProbability({ ...arrival, dz: z }), 'up'],
    ['sack: quarterback escape', (z) => passRush.sackProbability({ ...arrival, dz: -z }), 'down'],
    ['stunt pass-off: blocker recognition', (z) => passRush.stuntCleanProbability({ ...stunt, zRecognitionMean: z }), 'up'],
    ['stunt pass-off: rusher timing', (z) => passRush.stuntCleanProbability({ ...stunt, zStuntTiming: z }), 'down'],
    ['block in space: blocker', (z) => runBlock.spaceBlockProbability({ dz: z, angleQuality: 0.5, closingSpeedExcess: 0, cut: false }), 'up'],
    ['break delay: man coverage', (z) => coverage.breakDelayS({ zCover: z, zRoute: 0, leverage: 0, anticipated: false, bracketed: false, rubDelayS: 0 }), 'down'],
    ['break delay: route running', (z) => coverage.breakDelayS({ zCover: 0, zRoute: z, leverage: 0, anticipated: false, bracketed: false, rubDelayS: 0 }), 'up'],
    ['zone break delay: zone coverage', (z) => coverage.zoneBreakDelayS({ zZone: z, leanS: 0, wrongThreat: false, recognitionDelayS: 0 }), 'down'],
    ['double move bite: discipline', (z) => coverage.doubleMoveBiteProbability(z, 0), 'down'],
    ['double move bite: aggressiveness', (z) => coverage.doubleMoveBiteProbability(0, z), 'up'],
    ['catch radius: length and leaping', (z) => catchPoint.catchRadiusYd(z, false), 'up'],
    ['uncontested catch: hands', (z) => catchPoint.uncontestedCatchProbability({ zHands: z, placementError: 0, hitAtCatch: false, wet: false }), 'up'],
    ['contested catch: receiver', (z) => catchPoint.contestedProbabilities({ ...contested, zContestedCatch: z })[0]!, 'up'],
    ['contested catch: defender ball skills', (z) => catchPoint.contestedProbabilities({ ...contested, zBallSkills: z })[0]!, 'down'],
    ['contested interception: defender ball skills', (z) => catchPoint.contestedProbabilities({ ...contested, zBallSkills: z })[2]!, 'up'],
    ['defender alone: hands', (z) => catchPoint.defenderAloneProbability(z), 'up'],
    ['feet in bounds: body control', (z) => catchPoint.feetInBoundsProbability({ zBodyControl: z, feetRequired: 1, tightness: 0.5 }), 'up'],
    ['survive the ground: hands', (z) => catchPoint.surviveGroundProbability(z, true), 'up'],
    ['tackle: tackler', (z) => tackle.tackleProbability({ ...tk, dz: z }), 'up'],
    ['tackle: carrier', (z) => tackle.tackleProbability({ ...tk, dz: -z }), 'down'],
    ['broken tackle: contact balance', (z) => tackle.brokenProbability(z, 1), 'up'],
    ['pile: carrier power', (z) => tackle.pileMeanYd({ surge: 0, zPower: z, freeDefenders: 0, pushers: 0 }), 'up'],
    ['fumble: ball security', (z) => ballSecurity.fumbleProbability({ ...fum, zSecurity: z }), 'down'],
    ['fumble: hit power', (z) => ballSecurity.fumbleProbability({ ...fum, zHitPower: z }), 'up'],
    ['scoop: hands', (z) => ballSecurity.recoveryProbability('scoop', z, 0), 'up'],
    ['loose-ball contest: hands', (z) => ballSecurity.contestProbabilities([{ arrivalS: 0, zHands: z }, { arrivalS: 0, zHands: 0 }])[0]!, 'up'],
  ];
  for (const [label, fn, direction] of sweeps) {
    it(`${label} moves ${direction} across the whole scale`, () => {
      const values = Z_LADDER.map(fn);
      // A floor (the break delays) may flatten the top of the ladder; everything else is strict.
      expectMonotone(values, direction, !label.includes('delay'), label);
      for (const v of values) expect(Number.isFinite(v)).toBe(true);
    });
  }

  it('engagement win share is monotone in the grade gap for each engagement contest (10,000 trials a step)', () => {
    const rows = [
      ['passBlock edge', passRush.engagement('edge')], ['passBlock interior', passRush.engagement('interior')],
      ['runBlock one-gap', runBlock.engagement('oneGap')], ['runBlock two-gap', runBlock.engagement('twoGap')],
      ['release', coverage.releaseEngagement()],
    ] as const;
    for (const [label, p] of rows) {
      const ladder = [-4, -3, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 3, 4];
      // The same seeds at every step: a larger gap can only move each path up.
      const wins = ladder.map((dz) => share(TRIALS, (i) => runEngagement(p, dz, 0, 25, contestStream(i, label)).a >= 1));
      const losses = ladder.map((dz) => share(TRIALS, (i) => runEngagement(p, dz, 0, 25, contestStream(i, label)).a <= -1));
      expectMonotone(wins, 'up', false, `${label} wins`);
      expectMonotone(losses, 'down', false, `${label} losses`);
      expect(Math.abs(wins[6]! - losses[6]!), `${label} even matchup`).toBeLessThan(0.02);
      expect(wins[12]!).toBeGreaterThan(0.95);
      expect(losses[0]!).toBeGreaterThan(0.95);
    }
  });
});

describe('Q1.7.1 base rates at equal grades (each event contest, 100,000 neutral draws)', () => {
  const N = 100_000;
  const cases: [string, number, (i: number) => boolean][] = [
    ['sack at arrival', logistic(1.4), (i) => passRush.resolveArrival(arrival, contestStream(i, 'sack')) === 'sack'],
    ['clean stunt pass-off', logistic(1.2), (i) => passRush.resolveStunt(stunt, contestStream(i, 'stuntExchange')).outcome === 'clean'],
    ['uncontested catch', logistic(3.0), (i) => catchPoint.resolveUncontested({ zHands: 0, placementError: 0, hitAtCatch: false, wet: false }, contestStream(i, 'catchPoint')) === 'catch'],
    ['tackle made', logistic(1.7), (i) => tackle.resolveTackle(tk, contestStream(i, 'tackle')).outcome === 'made'],
    ['fumble per hit', logistic(-5.0), (i) => ballSecurity.resolveFumble(fum, contestStream(i, 'fumble'))],
    ['fall on the ball', 0.85, (i) => ballSecurity.resolveRecovery('fall', 0, 0, contestStream(i, 'recovery')) === 'recovered'],
    ['scoop', 0.55, (i) => ballSecurity.resolveRecovery('scoop', 0, 0, contestStream(i, 'recovery')) === 'recovered'],
  ];
  for (const [label, want, draw] of cases) {
    it(`${label}: ${(want * 100).toFixed(2)}%`, () => {
      expect(Math.abs(share(N, draw) - want)).toBeLessThan(band(want, N));
    });
  }

  it('the stated anchors hold: about 95% uncontested catch, about 85% even head-on tackle', () => {
    expect(catchPoint.uncontestedCatchProbability({ zHands: 0, placementError: 0, hitAtCatch: false, wet: false })).toBeCloseTo(0.953, 3);
    expect(tackle.tackleProbability(tk)).toBeCloseTo(0.846, 3);
  });
});

describe('pass rush (J6.2)', () => {
  // One rusher on one blocker: he runs a track to the launch point at his free speed times g(A).
  // FIXTURE geometry (9 yd track, 8 yd/s free speed): placeholders for the test, not football facts.
  function timeHome(dz: number, play: number, help: 'none' | 'double'): number {
    const p = passRush.engagement('edge');
    const s = contestStream(play, 'passBlock');
    let a = passRush.startAdvantage('getOff', 0), dist = 9;
    for (let t = 1; t <= 60; t++) {
      const eps = s.normal();
      if (a > -1) a = CONTEST_MATH.stepEngagement(a, dz + (help === 'double' ? passRush.helpZ('double', t * TICK_S) : 0), p, eps);
      dist -= 8 * passRush.rushSpeedFactor(a) * TICK_S;
      if (dist <= 0) return t * TICK_S;
    }
    return Infinity;
  }
  const homeBy = (dz: number, seconds: number, help: 'none' | 'double' = 'none') => share(5000, (i) => timeHome(dz, i, help) <= seconds);

  it('even a stalemated rusher collapses the pocket, and cumulative pressure rises with time held', () => {
    expect(passRush.rushSpeedFactor(0)).toBe(0.15);
    expect(passRush.rushSpeedFactor(-1)).toBe(1);
    expect(passRush.rushSpeedFactor(1)).toBe(0);
    const curve = [1.5, 2.0, 2.5, 3.0, 3.5, 4.0].map((t) => homeBy(0, t));
    expectMonotone(curve, 'up', false, 'cumulative pressure by time');
  });

  it('a +1 z rusher gets home meaningfully more often than an average one', () => {
    expect(homeBy(-1, 2.7)).toBeGreaterThan(homeBy(0, 2.7) + 0.05);
    expect(homeBy(1, 2.7)).toBeLessThan(homeBy(0, 2.7) - 0.05);
  });

  it('a double team is worth exactly 1.0 z: it slows a +2 z rusher and makes a +1 z rusher an average one', () => {
    const meanTime = (dz: number, help: 'none' | 'double') => {
      let sum = 0;
      for (let i = 0; i < 5000; i++) sum += Math.min(timeHome(dz, i, help), 6);
      return sum / 5000;
    };
    expect(meanTime(-2, 'double')).toBeGreaterThan(meanTime(-2, 'none') + 0.1);
    expect(homeBy(-1, 2.7, 'double')).toBe(homeBy(0, 2.7));
    // J6.2.3's tunable target (a doubled +2 z rusher pressures about as often as an average one) is
    // not asserted: with the starting values he is still a +1 z rusher. Calibration owns that number.
  });

  it('starts: get-off, a beaten set point, late recognition and pass-offs', () => {
    expect(passRush.startAdvantage('getOff', 0)).toBe(0);
    expect(passRush.startAdvantage('getOff', -2)).toBeLessThan(0);
    expect(passRush.startAdvantage('getOff', -99)).toBe(-0.5);
    expect(passRush.startAdvantage('beatSetPoint')).toBe(-0.6);
    expect(passRush.startAdvantage('lateRecognition')).toBe(-0.5);
    expect(passRush.startAdvantage('latePassOff')).toBe(-0.4);
    expect(passRush.startAdvantage('cleanPassOff')).toBe(0);
  });

  it('a counter fires after A stays above 0.4 for 0.5 s and resets A toward 0 when it works', () => {
    let held = 0;
    for (let t = 0; t < 4; t++) held = passRush.counterClock(0.6, held);
    expect(passRush.counterReady(held)).toBe(false);
    held = passRush.counterClock(0.6, held);
    expect(passRush.counterReady(held)).toBe(true);
    expect(passRush.counterClock(0.3, held)).toBe(0);
    const good = share(TRIALS, (i) => passRush.resolveCounter(0.6, 2, contestStream(i, 'move')).won);
    const poor = share(TRIALS, (i) => passRush.resolveCounter(0.6, -2, contestStream(i, 'move')).won);
    expect(good).toBeGreaterThan(poor + 0.2);
    const r = passRush.resolveCounter(0.6, 9, contestStream(1, 'move'));
    expect(r.won ? Math.abs(r.advantage) < 0.6 : r.advantage === 0.6).toBe(true);
  });

  it('stunts beat poor recognition and not a prepared slide (J6.2.2)', () => {
    const poor = passRush.stuntCleanProbability({ ...stunt, zRecognitionMean: -2 });
    const good = passRush.stuntCleanProbability({ zRecognitionMean: 2, zStuntTiming: 0, slideProtection: true, prepared: false });
    expect(poor).toBeCloseTo(0.5, 6);
    expect(good).toBeGreaterThan(0.93);
    expect(passRush.stuntCleanProbability({ ...stunt, prepared: true })).toBeGreaterThan(passRush.stuntCleanProbability(stunt));
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const r = passRush.resolveStunt({ ...stunt, zRecognitionMean: -2 }, contestStream(i, 'stuntExchange'));
      seen.add(r.outcome);
      if (r.outcome === 'clean') expect(r.looperStartAdvantage).toBe(0);
      if (r.outcome === 'late') expect(r.looperStartAdvantage).toBe(-0.4);
      if (r.outcome === 'bust') { expect(r.looperStartAdvantage).toBeNull(); expect(r.looperFreeS).toBeGreaterThanOrEqual(0.4); expect(r.looperFreeS).toBeLessThanOrEqual(0.8); }
    }
    expect([...seen].sort()).toEqual(['bust', 'clean', 'late']);
    expect(passRush.penetratorBonusZ()).toBe(0.3);
  });

  it('help: a double adds 1.0 z while engaged, a chip 0.4 z for 0.5 s and delays the chipper 0.4 to 0.6 s', () => {
    expect(passRush.helpZ('double', 3)).toBe(1.0);
    expect(passRush.helpZ('chip', 0.3)).toBe(0.4);
    expect(passRush.helpZ('chip', 0.5)).toBe(0);
    for (let i = 0; i < 200; i++) {
      const d = passRush.chipReleaseDelayS(contestStream(i, 'passBlock'));
      expect(d).toBeGreaterThanOrEqual(0.4); expect(d).toBeLessThanOrEqual(0.6);
    }
    expect(passRush.slideHelpReady(0.4)).toBe(false);
    expect(passRush.slideHelpReady(0.5)).toBe(true);
  });

  it('pressure, and the arrival draw (J6.2.5)', () => {
    expect(passRush.isPressure(1.9, 5, true)).toBe(true);
    expect(passRush.isPressure(4, 0.5, true)).toBe(true);
    expect(passRush.isPressure(4, 0.7, true)).toBe(false);
    expect(passRush.isPressure(1, 0.1, false)).toBe(false);
    const p0 = passRush.sackProbability(arrival);
    expect(passRush.sackProbability({ ...arrival, blindside: true })).toBeGreaterThan(p0);
    expect(passRush.sackProbability({ ...arrival, qbMovingAway: true })).toBeLessThan(p0);
    expect(passRush.sackProbability({ ...arrival, secondRusherNear: true })).toBeGreaterThan(p0);
    expect(passRush.resolveArrival({ ...arrival, releaseInProgress: true }, contestStream(1, 'sack'))).toBe('hit');
    const outcomes = new Set(Array.from({ length: 500 }, (_, i) => passRush.resolveArrival(arrival, contestStream(i, 'sack'))));
    expect([...outcomes].sort()).toEqual(['escape', 'sack']);
  });
});

describe('run blocking (J6.3)', () => {
  it('one-gap technique is noisier than two-gap around the stated row', () => {
    expect(runBlock.engagement('oneGap').sigma).toBeGreaterThan(0.4);
    expect(runBlock.engagement('twoGap').sigma).toBeLessThan(0.4);
    expect(runBlock.engagement('oneGap').kappa).toBe(0.8);
    expect(runBlock.engagement('twoGap').lambda).toBe(0.4);
    // More noise means more quick results either way in an even matchup: tackles for loss and creases.
    const decided = (t: 'oneGap' | 'twoGap') => share(TRIALS, (i) => Math.abs(runEngagement(runBlock.engagement(t), 0, 0, 15, contestStream(i, 'runBlock')).a) >= 1);
    expect(decided('oneGap')).toBeGreaterThan(decided('twoGap'));
  });

  it('A drives displacement, gap control and the shed', () => {
    expect(runBlock.displacementYps(0.5)).toBe(0.75);
    expect(runBlock.displacementYps(1)).toBe(1.5);
    expect(runBlock.displacementYps(-0.5)).toBe(0);
    expect(runBlock.controlsGap(true, 0.29)).toBe(true);
    expect(runBlock.controlsGap(true, 0.3)).toBe(false);
    expect(runBlock.controlsGap(false, -0.9)).toBe(false);
    expect(runBlock.shed('oneGap', -1, 1)).toEqual({ side: -1, delayS: 0 });
    expect(runBlock.shed('twoGap', -1, 1).side).toBe(1);
    expect(runBlock.shed('twoGap', -1, 1).delayS).toBeGreaterThan(0);
    expect(runBlock.defenderSpeedFactor(-1)).toBe(1);
    expect(runBlock.defenderSpeedFactor(1)).toBe(0);
  });

  it('a double team moves the defender, and a better anchor holds it longer (J6.3.2)', () => {
    const p = runBlock.engagement('twoGap');
    // Share of doubles that reach the climb threshold inside 1.5 s, by the down lineman's anchor.
    const climbs = (zAnchor: number) => share(TRIALS, (i) => {
      const s = contestStream(i, 'runBlock');
      let a = 0;
      for (let t = 0; t < 15; t++) {
        a = CONTEST_MATH.stepEngagement(a, runBlock.comboZ() - zAnchor, p, s.normal());
        if (runBlock.comboShouldClimb(a, false)) return true;
      }
      return false;
    });
    expect(climbs(2)).toBeLessThan(climbs(-1) - 0.2); // anchor 70 against anchor 40
    expect(runBlock.comboShouldClimb(0, true)).toBe(true);
    expect(runBlock.comboShouldClimb(0.5, false)).toBe(false);
  });

  it('blocks in space: made starts an engagement at +0.3, angle helps, a cut can win at once', () => {
    const base = { dz: 0, angleQuality: 0.5, closingSpeedExcess: 0, cut: false };
    expect(runBlock.spaceBlockProbability({ ...base, angleQuality: 1 })).toBeGreaterThan(runBlock.spaceBlockProbability(base));
    expect(runBlock.spaceBlockProbability({ ...base, closingSpeedExcess: 1 })).toBeLessThan(runBlock.spaceBlockProbability(base));
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const r = runBlock.resolveSpaceBlock({ ...base, cut: true }, contestStream(i, 'blockInSpace'));
      seen.add(r.outcome);
      expect(r.startAdvantage).toBe(r.outcome === 'made' ? 0.3 : null);
    }
    expect([...seen].sort()).toEqual(['made', 'missed', 'quickWin']);
    for (let i = 0; i < 300; i++) expect(runBlock.resolveSpaceBlock(base, contestStream(i, 'blockInSpace')).outcome).not.toBe('quickWin');
  });

  it('line movement sets the starting A by direction against the flow (J6.3.4)', () => {
    expect(runBlock.movementStart('withFlow')).toBe(-0.4);
    expect(runBlock.movementStart('againstFlow')).toBe(0.3);
    const p = runBlock.engagement('oneGap');
    const shed = (a0: number) => share(TRIALS, (i) => runEngagement(p, 0, a0, 15, contestStream(i, 'runBlock')).a <= -1);
    expect(shed(runBlock.movementStart('withFlow'))).toBeGreaterThan(shed(0));
    expect(shed(runBlock.movementStart('againstFlow'))).toBeLessThan(shed(0));
  });
});

describe('release, route and coverage (J6.4)', () => {
  it('the press contest ends at 1.0 s or at the edge of the legal contact zone', () => {
    expect(coverage.releaseOver(0.9, 2, 5)).toBe(false);
    expect(coverage.releaseOver(1.0, 2, 5)).toBe(true);
    expect(coverage.releaseOver(0.4, 5, 5)).toBe(true);
    expect(coverage.releaseOver(0.4, 9, null)).toBe(false); // FIXTURE: a rule set with no contact zone
    expect(coverage.releaseOver(1.0, 9, null)).toBe(true);
  });

  it('maps final A to clean, contested or jam with the stated ranges', () => {
    expect(coverage.releaseOutcome(0.7)).toEqual({ kind: 'clean', delayS: 0, stemPushYd: 0, defenderInTrail: true });
    const even = coverage.releaseOutcome(0);
    expect(even.kind).toBe('contested');
    expect(even.delayS).toBeCloseTo(0.25, 12);
    const jam = coverage.releaseOutcome(-1);
    expect(jam.kind).toBe('jam');
    expect(jam.delayS).toBeCloseTo(0.6, 12);
    expect(jam.stemPushYd).toBeCloseTo(1.5, 12);
    let last = Infinity;
    for (let a = -1; a <= 1.0001; a += 0.01) {
      const o = coverage.releaseOutcome(a);
      expect(o.delayS).toBeLessThanOrEqual(last + 1e-12);
      expect(o.delayS).toBeGreaterThanOrEqual(0); expect(o.delayS).toBeLessThanOrEqual(0.6 + 1e-12);
      expect(o.stemPushYd).toBeGreaterThanOrEqual(0); expect(o.stemPushYd).toBeLessThanOrEqual(1.5 + 1e-12);
      last = o.delayS;
    }
  });

  it('against press the mean delay shrinks as the release grade rises', () => {
    const p = coverage.releaseEngagement();
    const meanDelay = (dz: number) => {
      let sum = 0;
      for (let i = 0; i < TRIALS; i++) sum += coverage.releaseOutcome(runEngagement(p, dz, 0, 10, contestStream(i, 'release')).a).delayS;
      return sum / TRIALS;
    };
    const delays = [-2, -1, 0, 1, 2].map(meanDelay);
    expectMonotone(delays, 'down', true, 'mean release delay by release grade');
    expect(delays[0]!).toBeGreaterThan(0); // press costs time; off coverage skips the contest and costs none
  });

  it('break delay follows the stated form, with its floor, leverage, anticipation and bracket', () => {
    const base = { zCover: 0, zRoute: 0, leverage: 0, anticipated: false, bracketed: false, rubDelayS: 0 };
    expect(coverage.breakDelayS(base)).toBeCloseTo(0.25, 12);
    expect(coverage.breakDelayS({ ...base, zCover: 1, zRoute: 2 })).toBeCloseTo(0.25 - 0.05 + 0.10, 12);
    expect(coverage.breakDelayS({ ...base, zCover: 5 })).toBe(0.08);
    expect(coverage.breakDelayS({ ...base, leverage: 1 })).toBeCloseTo(0.40, 12);
    expect(coverage.breakDelayS({ ...base, leverage: -1 })).toBeLessThan(0.25);
    expect(coverage.breakDelayS({ ...base, leverage: 1, bracketed: true })).toBeCloseTo(0.25, 12);
    expect(coverage.breakDelayS({ ...base, anticipated: true })).toBe(0);
    expect(coverage.breakDelayS({ ...base, rubDelayS: 0.2 })).toBeCloseTo(0.45, 12);
  });

  it('zone break delay follows the stated form, with lean and a wrong read', () => {
    const base = { zZone: 0, leanS: 0, wrongThreat: false, recognitionDelayS: 0.3 };
    expect(coverage.zoneBreakDelayS(base)).toBeCloseTo(0.25, 12);
    expect(coverage.zoneBreakDelayS({ ...base, leanS: -0.5 })).toBeCloseTo(0.15, 12);
    expect(coverage.zoneBreakDelayS({ ...base, leanS: 0.5 })).toBeCloseTo(0.35, 12);
    expect(coverage.zoneBreakDelayS({ ...base, zZone: 9 })).toBe(0.08);
    expect(coverage.zoneBreakDelayS({ ...base, wrongThreat: true })).toBeCloseTo(0.55, 12);
  });

  it('a disciplined defender bites on a double move less often', () => {
    const bites = (zDisc: number) => share(TRIALS, (i) => coverage.resolveDoubleMove(zDisc, 0, contestStream(i, 'separation')));
    expect(bites(2)).toBeLessThan(bites(-2) - 0.3);
  });
});

describe('the catch point (J6.5)', () => {
  it('reach and the contested threshold', () => {
    expect(catchPoint.catchRadiusYd(0, false)).toBe(1.1);
    expect(catchPoint.catchRadiusYd(2, false)).toBeCloseTo(1.3, 12);
    expect(catchPoint.catchRadiusYd(0, true)).toBeGreaterThan(1.1);
    expect(catchPoint.isContested(1.0)).toBe(true);
    expect(catchPoint.isContested(1.01)).toBe(false);
  });

  it('a bad ball, a hit and a wet ball each lower the uncontested catch chance', () => {
    const base = { zHands: 0, placementError: 0, hitAtCatch: false, wet: false };
    const p0 = catchPoint.uncontestedCatchProbability(base);
    expect(catchPoint.uncontestedCatchProbability({ ...base, placementError: 1 })).toBeCloseTo(logistic(1.8), 9);
    expect(catchPoint.uncontestedCatchProbability({ ...base, hitAtCatch: true })).toBeCloseTo(logistic(2.4), 9);
    expect(catchPoint.uncontestedCatchProbability({ ...base, wet: true })).toBeCloseTo(logistic(2.7), 9);
    expect(p0).toBeCloseTo(logistic(3.0), 9);
  });

  it('contested: an undercutting defender who located the ball has the highest interception chance', () => {
    const int = (c: Partial<ContestedInputs>) => catchPoint.contestedProbabilities({ ...contested, ...c })[2]!;
    expect(int({ position: 'undercut' })).toBeGreaterThan(int({ position: 'inPhase' }));
    expect(int({ position: 'inPhase' })).toBeGreaterThan(int({ position: 'trail' }));
    expect(int({ position: 'undercut' })).toBeGreaterThan(int({ position: 'undercut', ballLocated: false }));
    expect(int({ placementError: 1 })).toBeGreaterThan(int({}));
    const trailBlind = catchPoint.contestedProbabilities({ ...contested, position: 'trail', ballLocated: false });
    expect(trailBlind[0]!).toBeGreaterThan(catchPoint.contestedProbabilities(contested)[0]!);
    for (const pos of ['inPhase', 'undercut', 'trail'] as const) {
      const p = catchPoint.contestedProbabilities({ ...contested, position: pos });
      expect(p[0]! + p[1]! + p[2]!).toBeCloseTo(1, 12);
    }
  });

  it('contested draws produce catch, breakup, tip and interception in the softmax shares', () => {
    const p = catchPoint.contestedProbabilities(contested);
    const counts: Record<string, number> = { catch: 0, breakup: 0, tip: 0, interception: 0 };
    const N = 50_000;
    for (let i = 0; i < N; i++) counts[catchPoint.resolveContested(contested, contestStream(i, 'catchPoint'))]!++;
    expect(Math.abs(counts.catch! / N - p[0]!)).toBeLessThan(band(p[0]!, N));
    expect(Math.abs((counts.breakup! + counts.tip!) / N - p[1]!)).toBeLessThan(band(p[1]!, N));
    expect(Math.abs(counts.interception! / N - p[2]!)).toBeLessThan(band(p[2]!, N));
    expect(counts.tip!).toBeGreaterThan(0);
    expect(counts.tip!).toBeLessThan(counts.breakup!);
  });

  it('defenders alone at the ball drop many; more feet required and a tighter spot lower the in-bounds chance', () => {
    expect(catchPoint.defenderAloneProbability(0)).toBeLessThan(catchPoint.uncontestedCatchProbability({ zHands: 0, placementError: 0, hitAtCatch: false, wet: false }) - 0.3);
    const feet = (feetRequired: number, tightness: number) => catchPoint.feetInBoundsProbability({ zBodyControl: 0, feetRequired, tightness });
    expect(feet(2, 0.5)).toBeLessThan(feet(1, 0.5)); // FIXTURE counts; the rule value comes from `catch.feet_required`
    expect(feet(1, 1)).toBeLessThan(feet(1, 0));
    expect(catchPoint.surviveGroundProbability(0, true)).toBeLessThan(catchPoint.surviveGroundProbability(0, false));
    expect(typeof catchPoint.resolveFeetInBounds({ zBodyControl: 0, feetRequired: 1, tightness: 0 }, contestStream(1, 'catchPoint'))).toBe('boolean');
    expect(['interception', 'drop']).toContain(catchPoint.resolveDefenderAlone(0, contestStream(1, 'catchPoint')));
    expect(typeof catchPoint.resolveSurviveGround(0, false, contestStream(1, 'catchPoint'))).toBe('boolean');
  });
});

describe('tackling (J6.6)', () => {
  it('each context input moves the tackle chance the way the leaf says', () => {
    const p0 = tackle.tackleProbability(tk);
    const p = (c: Partial<TackleInputs>) => tackle.tackleProbability({ ...tk, ...c });
    expect(p({ angleQuality: 0.4 })).toBeLessThan(p0);
    expect(p({ lunging: true })).toBeLessThan(p0);
    expect(p({ momentumRatio: 1.5 })).toBeLessThan(p0);
    expect(p({ momentumRatio: 0.7 })).toBeGreaterThan(p0);
    expect(p({ tacklers: 2 })).toBeGreaterThan(p0);
    expect(p({ roomToCut: 1 })).toBeLessThan(p0);
    expect(p({ moveWon: true })).toBeLessThan(p0);
    expect(p({ stripAttempt: true })).toBeLessThan(p0);
  });

  it('outcomes: made with 0 to 3 yd of progress, broken with 30 to 60% of speed lost, or missed at full speed', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) {
      const r = tackle.resolveTackle({ ...tk, dz: -1, roomToCut: 1 }, contestStream(i, 'tackle'));
      seen.add(r.outcome);
      if (r.outcome === 'made') { expect(r.speedKept).toBe(0); expect(r.progressYd).toBeGreaterThanOrEqual(0); expect(r.progressYd).toBeLessThanOrEqual(3); }
      if (r.outcome === 'broken') { expect(r.speedKept).toBeGreaterThanOrEqual(0.4 - 1e-12); expect(r.speedKept).toBeLessThanOrEqual(0.7 + 1e-12); }
      if (r.outcome === 'missed') expect(r.speedKept).toBe(1);
    }
    expect([...seen].sort()).toEqual(['broken', 'made', 'missed']);
  });

  it('heavy runners fall forward, and a tackle from behind gives up more than a head-on stop', () => {
    const mean = (c: Partial<TackleInputs>) => {
      let sum = 0, k = 0;
      for (let i = 0; i < TRIALS; i++) {
        const r = tackle.resolveTackle({ ...tk, dz: 3, ...c }, contestStream(i, 'tackle'));
        if (r.outcome === 'made') { sum += r.progressYd; k++; }
      }
      return sum / k;
    };
    expect(mean({ momentumRatio: 1.5 })).toBeGreaterThan(mean({ momentumRatio: 1 }) + 0.3);
    expect(mean({ type: 'behind' })).toBeGreaterThan(mean({ type: 'side' }));
    expect(mean({ type: 'side' })).toBeGreaterThan(mean({ type: 'headOn' }));
  });

  it('a strip attempt trades tackle chance for fumble chance (J6.7.1)', () => {
    expect(tackle.tackleProbability({ ...tk, stripAttempt: true })).toBeLessThan(tackle.tackleProbability(tk));
    expect(ballSecurity.fumbleProbability({ ...fum, stripAttempt: true })).toBeGreaterThan(ballSecurity.fumbleProbability(fum));
  });

  it('the pile model: when it applies, its stated mean, its clip, and its response to the line', () => {
    expect(tackle.pileApplies(2, 0.8, true)).toBe(true);
    expect(tackle.pileApplies(1, 0.8, true)).toBe(false);
    expect(tackle.pileApplies(2, 1.5, true)).toBe(false);
    expect(tackle.pileApplies(2, 0.8, false)).toBe(false);
    expect(tackle.pileMeanYd({ surge: 0.5, zPower: 1, freeDefenders: 1, pushers: 0 })).toBeCloseTo(0.5 + 0.6 + 0.3 - 0.5, 12);
    expect(tackle.pileMeanYd({ surge: 0, zPower: 0, freeDefenders: 0, pushers: 2 })).toBeGreaterThan(0.5);
    const convert = (surge: number) => share(TRIALS, (i) => {
      const y = tackle.resolvePile({ surge, zPower: 0, freeDefenders: 0, pushers: 0 }, contestStream(i, 'pile'));
      expect(y).toBeGreaterThanOrEqual(-1); expect(y).toBeLessThanOrEqual(3);
      return y >= 1;
    });
    const rates = [-0.6, -0.3, 0, 0.3, 0.6].map(convert);
    expectMonotone(rates, 'up', true, '1 yard to go conversion by line surge');
    expect(rates[4]! - rates[2]!).toBeGreaterThan(0.2); // a winning line converts noticeably more
  });
});

describe('ball security (J6.7)', () => {
  it('each condition raises the fumble hazard, and the hazard has no other inputs', () => {
    const p0 = ballSecurity.fumbleProbability(fum);
    expect(p0).toBeCloseTo(logistic(-5), 9);
    for (const k of ['blindside', 'stripAttempt', 'secondHitter', 'wet', 'isPasser'] as const) {
      expect(ballSecurity.fumbleProbability({ ...fum, [k]: true }), k).toBeGreaterThan(p0);
    }
    expect(ballSecurity.fumbleProbability({ ...fum, hitEnergy: 2 })).toBeGreaterThan(p0);
    // The hazard reads the carrier, the hitter and conditions only: no team or coach term (J6.7.1).
    expect(Object.keys(fum).sort()).toEqual(['blindside', 'hitEnergy', 'hitPower', 'isPasser', 'secondHitter', 'security', 'stripAttempt', 'wet']
      .map((k) => (k === 'hitPower' ? 'zHitPower' : k === 'security' ? 'zSecurity' : k)).sort());
  });

  it('recovery: falling on it beats scooping, crowds make both harder, a failed scoop kicks the ball on', () => {
    expect(ballSecurity.recoveryReachYd()).toBe(0.8);
    expect(ballSecurity.contestWindowS()).toBe(0.3);
    expect(ballSecurity.recoveryProbability('fall', 0, 0)).toBeCloseTo(0.85, 9);
    expect(ballSecurity.recoveryProbability('scoop', 0, 0)).toBeCloseTo(0.55, 9);
    expect(ballSecurity.recoveryProbability('fall', 0, 3)).toBeLessThan(0.85);
    expect(ballSecurity.recoveryProbability('scoop', 0, 2)).toBeLessThan(0.55);
    const fails = new Set<string>();
    for (let i = 0; i < 500; i++) {
      fails.add(`scoop:${ballSecurity.resolveRecovery('scoop', 0, 0, contestStream(i, 'recovery'))}`);
      fails.add(`fall:${ballSecurity.resolveRecovery('fall', 0, 2, contestStream(i, 'recovery'))}`);
    }
    expect([...fails].sort()).toEqual(['fall:recovered', 'fall:stillLoose', 'scoop:kickedOn', 'scoop:recovered']);
  });

  it('when opponents arrive together, the earlier man is favoured and equal arrivals split evenly', () => {
    const even = ballSecurity.contestProbabilities([{ arrivalS: 1, zHands: 0 }, { arrivalS: 1, zHands: 0 }]);
    expect(even[0]).toBeCloseTo(0.5, 12);
    const early = ballSecurity.contestProbabilities([{ arrivalS: 1.0, zHands: 0 }, { arrivalS: 1.2, zHands: 0 }, { arrivalS: 1.3, zHands: 0 }]);
    expect(early[0]!).toBeGreaterThan(early[1]!);
    expect(early[1]!).toBeGreaterThan(early[2]!);
    const firstWins = share(TRIALS, (i) => ballSecurity.resolveContest([{ arrivalS: 1.0, zHands: 0 }, { arrivalS: 1.2, zHands: 0 }], contestStream(i, 'recovery')) === 0);
    const want = ballSecurity.contestProbabilities([{ arrivalS: 1.0, zHands: 0 }, { arrivalS: 1.2, zHands: 0 }])[0]!;
    expect(Math.abs(firstWins - want)).toBeLessThan(band(want, TRIALS));
  });
});

describe('determinism (J13)', () => {
  it('the same stream key gives the same result, and each resolve takes a fixed number of draws', () => {
    // A uniform is two raw outputs and a normal is four (J13.1.1).
    const draws: [string, number, (s: ReturnType<typeof contestStream>) => unknown][] = [
      ['counter', 2, (s) => passRush.resolveCounter(0.6, 0, s)],
      ['stunt', 6, (s) => passRush.resolveStunt(stunt, s)],
      ['chip delay', 2, (s) => passRush.chipReleaseDelayS(s)],
      ['arrival', 2, (s) => passRush.resolveArrival(arrival, s)],
      ['arrival during release', 2, (s) => passRush.resolveArrival({ ...arrival, releaseInProgress: true }, s)],
      ['space block', 4, (s) => runBlock.resolveSpaceBlock({ dz: 0, angleQuality: 0.5, closingSpeedExcess: 0, cut: true }, s)],
      ['double move', 2, (s) => coverage.resolveDoubleMove(0, 0, s)],
      ['uncontested', 2, (s) => catchPoint.resolveUncontested({ zHands: 0, placementError: 0, hitAtCatch: false, wet: false }, s)],
      ['contested', 4, (s) => catchPoint.resolveContested(contested, s)],
      ['defender alone', 2, (s) => catchPoint.resolveDefenderAlone(0, s)],
      ['feet', 2, (s) => catchPoint.resolveFeetInBounds({ zBodyControl: 0, feetRequired: 1, tightness: 0 }, s)],
      ['ground', 2, (s) => catchPoint.resolveSurviveGround(0, false, s)],
      ['tackle', 6, (s) => tackle.resolveTackle(tk, s)],
      ['pile', 4, (s) => tackle.resolvePile({ surge: 0, zPower: 0, freeDefenders: 0, pushers: 0 }, s)],
      ['fumble', 2, (s) => ballSecurity.resolveFumble(fum, s)],
      ['recovery', 2, (s) => ballSecurity.resolveRecovery('scoop', 0, 0, s)],
      ['loose-ball contest', 2, (s) => ballSecurity.resolveContest([{ arrivalS: 0, zHands: 0 }, { arrivalS: 0.1, zHands: 0 }], s)],
    ];
    for (const [label, count, fn] of draws) {
      for (let play = 0; play < 50; play++) {
        const a = contestStream(play, label), b = contestStream(play, label);
        expect(fn(a), label).toEqual(fn(b));
        expect(a.draws, label).toBe(count);
      }
    }
  });
});
