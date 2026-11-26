// J6.6 Tackling: the single tackle attempt and the pile model for short yardage.
import type { DeterministicMath, RandomStream } from '@gm/schema';
import { clamp, clampProbability, lerp, type ContestNum } from './math.ts';

export type TackleType = 'headOn' | 'side' | 'behind';

export interface TackleInputs {
  /** Tackler's tackling z minus the carrier's contact balance (head-on) or elusiveness (in space) z, both effective. */
  readonly dz: number;
  /** 0 (poor angle) to 1 (square). */
  readonly angleQuality: number;
  /** He could not break down (J2.3.4) and lunges: his angle quality is reduced. */
  readonly lunging: boolean;
  /** Carrier's momentum over the tackler's (J2.6.1). 1 is even. */
  readonly momentumRatio: number;
  /** Tacklers arriving within the window of J6.6.1, this one included. At least 1. */
  readonly tacklers: number;
  /** 0 (boxed in) to 1 (open field). */
  readonly roomToCut: number;
  /** The carrier's move (J8) beat this tackler. */
  readonly moveWon: boolean;
  /** The tackler is going for the ball, which lowers his own tackle chance (J6.7.1). */
  readonly stripAttempt: boolean;
  /** Carrier's contact balance z, for the broken-or-missed split. */
  readonly zContactBalance: number;
  readonly type: TackleType;
}
export interface TackleResult {
  readonly outcome: 'made' | 'broken' | 'missed';
  /** Share of his speed the carrier keeps: 0 when tackled, 0.4 to 0.7 through a broken tackle, 1 after a miss. */
  readonly speedKept: number;
  /** Forward progress beyond the contact point after a made tackle, yards. */
  readonly progressYd: number;
}

export interface PileInputs {
  /** Mean A of the playside run blocks at contact (J6.6.2). */
  readonly surge: number;
  readonly zPower: number;
  readonly freeDefenders: number;
  /** Teammates pushing the runner, counted only where the rule set allows it. */
  readonly pushers: number;
}

export interface TackleContests {
  tackleProbability(input: TackleInputs): number;
  brokenProbability(zContactBalance: number, momentumRatio: number): number;
  /** Exactly three uniforms: made, broken-or-missed, then speed loss or progress. */
  resolveTackle(input: TackleInputs, stream: RandomStream): TackleResult;
  /** The pile model replaces the tackle attempt under these conditions (J6.6.2). */
  pileApplies(defendersContacted: number, distanceFromLineYd: number, blockersEngagedBothSides: boolean): boolean;
  /** Mean of the pile's progress before noise and clipping, yards. */
  pileMeanYd(input: PileInputs): number;
  /** One normal. Yards gained in the pile, clipped to the leaf's range. */
  resolvePile(input: PileInputs, stream: RandomStream): number;
}

export function createTackle(n: ContestNum, math: DeterministicMath): TackleContests {
  const b0 = n('tackle.beta0'), b1 = n('tackle.beta1');
  const gAngle = n('tackle.angle'), gMom = n('tackle.momentum'), gHelp = n('tackle.help'), gSpace = n('tackle.space');
  const gMove = n('tackle.move'), gStrip = n('tackle.strip'), lungeLoss = n('tackle.lungeAngleLoss');
  const k0 = n('tackle.brokenBeta0'), kBalance = n('tackle.brokenBalance'), kMom = n('tackle.brokenMomentum');
  const lossMin = n('tackle.brokenSpeedLossMin'), lossMax = n('tackle.brokenSpeedLossMax');
  const progMax = n('tackle.progressMaxYd'), progHead = n('tackle.progressHeadOnYd'), progSide = n('tackle.progressSideYd');
  const progBehind = n('tackle.progressBehindYd'), progMom = n('tackle.progressPerMomentumYd'), progNoise = n('tackle.progressNoiseYd');
  const pBase = n('pile.baseYd'), pSurge = n('pile.surgeYd'), pPower = n('pile.powerYd'), pFree = n('pile.freeDefenderYd');
  const pMin = n('pile.minYd'), pMax = n('pile.maxYd'), pNoise = n('pile.noiseYd'), pPusher = n('pile.pusherYd');
  const trigDefenders = n('pile.triggerDefenders'), trigLos = n('pile.triggerLosYd');

  // The leaf's angle term is centred so that a square, even, one-on-one tackle sits exactly at beta0.
  const tackleProbability = (i: TackleInputs): number => {
    const angle = clamp(i.angleQuality - (i.lunging ? lungeLoss : 0), 0, 1);
    return clampProbability(math.logistic(
      b0 + b1 * i.dz + gAngle * (angle - 1) + gMom * (i.momentumRatio - 1) + gHelp * (i.tacklers - 1)
      + gSpace * i.roomToCut + (i.moveWon ? gMove : 0) + (i.stripAttempt ? gStrip : 0),
    ));
  };
  const brokenProbability = (zContactBalance: number, momentumRatio: number): number =>
    clampProbability(math.logistic(k0 + kBalance * zContactBalance + kMom * (momentumRatio - 1)));
  const pileMeanYd = (i: PileInputs): number => pBase + pSurge * i.surge + pPower * i.zPower + pFree * i.freeDefenders + pPusher * i.pushers;

  return {
    tackleProbability,
    brokenProbability,
    resolveTackle(input, stream) {
      const u1 = stream.uniform(), u2 = stream.uniform(), u3 = stream.uniform();
      if (u1 < tackleProbability(input)) {
        const base = input.type === 'headOn' ? progHead : input.type === 'side' ? progSide : progBehind;
        const progress = base + progMom * (input.momentumRatio - 1) + progNoise * (2 * u3 - 1);
        return { outcome: 'made', speedKept: 0, progressYd: clamp(progress, 0, progMax) };
      }
      if (u2 < brokenProbability(input.zContactBalance, input.momentumRatio)) {
        return { outcome: 'broken', speedKept: 1 - lerp(lossMin, lossMax, u3), progressYd: 0 };
      }
      return { outcome: 'missed', speedKept: 1, progressYd: 0 };
    },
    pileApplies: (defendersContacted, distanceFromLineYd, blockersEngagedBothSides) =>
      defendersContacted >= trigDefenders && distanceFromLineYd <= trigLos && blockersEngagedBothSides,
    pileMeanYd,
    resolvePile: (input, stream) => clamp(pileMeanYd(input) + pNoise * stream.normal(), pMin, pMax),
  };
}
