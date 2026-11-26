// J6.2 Pass rush against pass protection. Advantage A is positive when the blocker is winning.
import { TICK_S } from '@gm/schema';
import type { DeterministicMath, EngagementParams, RandomStream } from '@gm/schema';
import { clamp, clampProbability, lerp, speedFactor, type ContestNum } from './math.ts';

export type RushLane = 'edge' | 'interior';
/** How a pass-block contest begins (J6.2.1, J6.2.2, J6.2.4). */
export type PassBlockStart = 'getOff' | 'beatSetPoint' | 'lateRecognition' | 'cleanPassOff' | 'latePassOff';

export interface StuntInputs {
  /** Mean stunt-recognition z of the two blockers at the exchange. */
  readonly zRecognitionMean: number;
  /** Stunt-timing z of the rushers running the game. */
  readonly zStuntTiming: number;
  readonly slideProtection: boolean;
  /** The offense prepared for this stunt as a tendency this week (D9). */
  readonly prepared: boolean;
}
export interface StuntResult {
  readonly outcome: 'clean' | 'late' | 'bust';
  /** Starting advantage of the looper's new contest, or null on a bust (he is unblocked). */
  readonly looperStartAdvantage: number | null;
  /** On a bust: how long the looper runs free before a blocker can re-engage. 0 otherwise. */
  readonly looperFreeS: number;
  /** On a bust: both blockers took the penetrator. */
  readonly bothTakePenetrator: boolean;
}

export interface ArrivalInputs {
  /** Rusher's finishing (tackling) z minus the quarterback's escape z, both effective. */
  readonly dz: number;
  readonly blindside: boolean;
  readonly qbMovingAway: boolean;
  readonly secondRusherNear: boolean;
  /** The quarterback's release is in progress at the contact time (J7). */
  readonly releaseInProgress: boolean;
}
export type ArrivalOutcome = 'sack' | 'hit' | 'escape';

export interface PassRushContests {
  engagement(lane: RushLane): EngagementParams;
  /** Share of the effective-z difference that drives the engagement (the rating response, fitted apart from the base rate). */
  skillGain(): number;
  /** `g(A)`: the rusher's speed along his track as a share of his free speed (J6.2.1). */
  rushSpeedFactor(advantage: number): number;
  /** Starting A. `getOffDz` is the blocker's get-off z minus the rusher's and is read only for `getOff`. */
  startAdvantage(start: PassBlockStart, getOffDz?: number): number;
  /** Ticks the rusher has now been held above the counter threshold: call once per tick. */
  counterClock(advantage: number, ticksHeld: number): number;
  counterReady(ticksHeld: number): boolean;
  /** One uniform. A counter that works resets A toward 0; the caller then switches the technique row. */
  resolveCounter(advantage: number, zCounter: number, stream: RandomStream): { readonly won: boolean; readonly advantage: number };
  stuntCleanProbability(input: StuntInputs): number;
  /** Exactly three uniforms, whatever the outcome. */
  resolveStunt(input: StuntInputs, stream: RandomStream): StuntResult;
  /** z the blocker gets against the penetrator, who is being run into on purpose (J6.2.2). */
  penetratorBonusZ(): number;
  /** z added to the blocking side by help (J6.2.3). A chip counts only while `elapsedS` is inside its window. */
  helpZ(help: 'double' | 'chip', elapsedS: number): number;
  /** One uniform. Delay on the chipper's own release into his route. */
  chipReleaseDelayS(stream: RandomStream): number;
  /** An uncovered slide-side lineman may double the nearest rusher on his side from this time on. */
  slideHelpReady(elapsedSinceSnapS: number): boolean;
  /** J6.2.5 `pressure`: a free or winning rusher close in distance or time while the quarterback has the ball. */
  isPressure(distanceYd: number, timeToContactS: number, qbHasBall: boolean): boolean;
  sackProbability(input: ArrivalInputs): number;
  /** One uniform. Fires when the rusher's and the quarterback's body circles touch. */
  resolveArrival(input: ArrivalInputs, stream: RandomStream): ArrivalOutcome;
}

export function createPassRush(n: ContestNum, math: DeterministicMath): PassRushContests {
  const edge: EngagementParams = { kappa: n('passBlock.kappa'), lambda: n('passBlock.lambda'), sigma: n('passBlock.sigma') };
  const interior: EngagementParams = { kappa: n('passBlock.interior.kappa'), lambda: n('passBlock.interior.lambda'), sigma: n('passBlock.interior.sigma') };
  const skillGain = n('passBlock.skillGain');
  const gLosing = n('passBlock.gLosing'), gEven = n('passBlock.gEven'), gWinning = n('passBlock.gWinning');
  const counterThreshold = n('passBlock.counterThreshold'), counterHoldS = n('passBlock.counterHoldS');
  const counterBeta0 = n('passBlock.counterBeta0'), counterBeta1 = n('passBlock.counterBeta1'), counterResidual = n('passBlock.counterResidual');
  const startBeatSetPoint = n('passBlock.startBeatSetPoint'), getOffGain = n('passBlock.getOffGain'), getOffCap = n('passBlock.getOffCap');
  const lateEngageStart = n('blitz.lateEngageStart');
  const sBeta0 = n('stunt.beta0'), sRecog = n('stunt.recognition'), sTiming = n('stunt.timing'), sSlide = n('stunt.slide'), sPrepared = n('stunt.prepared');
  const sLateStart = n('stunt.lateStart'), sFreeMin = n('stunt.bustFreeMinS'), sFreeMax = n('stunt.bustFreeMaxS');
  const sPenetrator = n('stunt.penetratorBonusZ'), sLateShare = n('stunt.lateShareOfFailed'), sBothShare = n('stunt.bothTakePenetratorShare');
  const doubleZ = n('help.doubleZ'), chipZ = n('help.chipZ'), chipDurationS = n('help.chipDurationS');
  const chipDelayMin = n('help.chipDelayMinS'), chipDelayMax = n('help.chipDelayMaxS'), slideS = n('help.slideLookForWorkS');
  const pressureDist = n('pressure.distYd'), pressureTime = n('pressure.timeS');
  const kBeta0 = n('sack.beta0'), kBeta1 = n('sack.beta1'), kBlind = n('sack.blindside'), kAway = n('sack.movingAway'), kSecond = n('sack.secondRusher');

  const stuntCleanProbability = (i: StuntInputs): number => clampProbability(math.logistic(
    sBeta0 + sRecog * i.zRecognitionMean + sTiming * i.zStuntTiming + (i.slideProtection ? sSlide : 0) + (i.prepared ? sPrepared : 0),
  ));
  const sackProbability = (i: ArrivalInputs): number => clampProbability(math.logistic(
    kBeta0 + kBeta1 * i.dz + (i.blindside ? kBlind : 0) + (i.qbMovingAway ? kAway : 0) + (i.secondRusherNear ? kSecond : 0),
  ));

  return {
    engagement: (lane) => (lane === 'interior' ? interior : edge),
    skillGain: () => skillGain,
    rushSpeedFactor: (advantage) => speedFactor(advantage, gLosing, gEven, gWinning),
    startAdvantage(start, getOffDz = 0) {
      switch (start) {
        case 'getOff': return clamp(getOffGain * getOffDz, -getOffCap, getOffCap);
        case 'beatSetPoint': return startBeatSetPoint;
        case 'lateRecognition': return lateEngageStart;
        case 'latePassOff': return sLateStart;
        case 'cleanPassOff': return 0;
      }
    },
    counterClock: (advantage, ticksHeld) => (advantage > counterThreshold ? ticksHeld + 1 : 0),
    counterReady: (ticksHeld) => ticksHeld * TICK_S >= counterHoldS - 1e-9,
    resolveCounter(advantage, zCounter, stream) {
      const won = stream.uniform() < clampProbability(math.logistic(counterBeta0 + counterBeta1 * zCounter));
      return { won, advantage: won ? advantage * counterResidual : advantage };
    },
    stuntCleanProbability,
    resolveStunt(input, stream) {
      const u1 = stream.uniform(), u2 = stream.uniform(), u3 = stream.uniform();
      if (u1 < stuntCleanProbability(input)) return { outcome: 'clean', looperStartAdvantage: 0, looperFreeS: 0, bothTakePenetrator: false };
      if (u2 < sLateShare) return { outcome: 'late', looperStartAdvantage: sLateStart, looperFreeS: 0, bothTakePenetrator: false };
      // The second draw's unused upper range decides the kind of bust; the third sets the free time.
      const both = (u2 - sLateShare) / (1 - sLateShare) < sBothShare;
      return { outcome: 'bust', looperStartAdvantage: null, looperFreeS: lerp(sFreeMin, sFreeMax, u3), bothTakePenetrator: both };
    },
    penetratorBonusZ: () => sPenetrator,
    helpZ: (help, elapsedS) => (help === 'double' ? doubleZ : elapsedS < chipDurationS ? chipZ : 0),
    chipReleaseDelayS: (stream) => lerp(chipDelayMin, chipDelayMax, stream.uniform()),
    slideHelpReady: (elapsedSinceSnapS) => elapsedSinceSnapS >= slideS,
    isPressure: (distanceYd, timeToContactS, qbHasBall) => qbHasBall && (distanceYd <= pressureDist || timeToContactS < pressureTime),
    sackProbability,
    resolveArrival(input, stream) {
      const u = stream.uniform();
      // A release already in progress is a hit as he throws; J7 orders the release and contact ticks (J6.2.5 edge case).
      if (input.releaseInProgress) return 'hit';
      return u < sackProbability(input) ? 'sack' : 'escape';
    },
  };
}
