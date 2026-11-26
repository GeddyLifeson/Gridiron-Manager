// J6.7 Ball security: the fumble hazard per hit and the recovery of a loose ball.
// There is no team-culture or coach term anywhere in this file, by ruling (J6.7.1).
import type { DeterministicMath, RandomStream } from '@gm/schema';
import { CONTEST_MATH, clampProbability, pickOutcome, type ContestNum } from './math.ts';

export interface FumbleInputs {
  readonly zSecurity: number;
  readonly zHitPower: number;
  /** Hit energy relative to a typical hit (J2.6.1). 1 is typical. */
  readonly hitEnergy: number;
  /** He did not see the hit coming. */
  readonly blindside: boolean;
  readonly stripAttempt: boolean;
  readonly secondHitter: boolean;
  readonly wet: boolean;
  /** The man hit is a passer holding the ball to throw. */
  readonly isPasser: boolean;
}

export interface RecoveryContender {
  /** Arrival time at the ball, seconds. */
  readonly arrivalS: number;
  readonly zHands: number;
}

export interface BallSecurityContests {
  fumbleProbability(input: FumbleInputs): number;
  /** One uniform. True when the ball comes loose. */
  resolveFumble(input: FumbleInputs, stream: RandomStream): boolean;
  /** Body-to-ball distance within which a player may attempt a recovery (J6.7.2). */
  recoveryReachYd(): number;
  /** Opponents arriving closer together than this contest the ball (J6.7.2). */
  contestWindowS(): number;
  /** `othersInReach` counts the other players within reach of the ball when he attempts it. */
  recoveryProbability(mode: 'fall' | 'scoop', zHands: number, othersInReach: number): number;
  /** One uniform. A failed scoop kicks the ball on; a failed fall leaves it where it is. */
  resolveRecovery(mode: 'fall' | 'scoop', zHands: number, othersInReach: number, stream: RandomStream): 'recovered' | 'kickedOn' | 'stillLoose';
  /** Probability of each contender winning the ball, in the order given. */
  contestProbabilities(contenders: readonly RecoveryContender[]): number[];
  /** One uniform. Index of the contender who gets the ball when opponents arrive together. */
  resolveContest(contenders: readonly RecoveryContender[], stream: RandomStream): number;
}

export function createBallSecurity(n: ContestNum, math: DeterministicMath): BallSecurityContests {
  const b0 = n('fumble.beta0'), gSec = n('fumble.security'), gPower = n('fumble.hitPower'), gEnergy = n('fumble.energy');
  const gBlind = n('fumble.blindside'), gStrip = n('fumble.strip'), gSecond = n('fumble.secondHitter'), gWet = n('fumble.wet'), gPasser = n('fumble.passer');
  const reach = n('recovery.reachYd'), fall = n('recovery.fall'), scoop = n('recovery.scoop'), windowS = n('recovery.contestWindowS');
  const crowd = n('recovery.crowd'), scoopHands = n('recovery.scoopHands'), order = n('recovery.contestOrder'), grade = n('recovery.contestGrade');
  // The leaf gives the base rates as probabilities; the crowd and hands terms act on the logit.
  const fallLogit = math.log(fall / (1 - fall));
  const scoopLogit = math.log(scoop / (1 - scoop));

  const fumbleProbability = (i: FumbleInputs): number => clampProbability(math.logistic(
    b0 + gSec * i.zSecurity + gPower * i.zHitPower + gEnergy * (i.hitEnergy - 1) + (i.blindside ? gBlind : 0)
    + (i.stripAttempt ? gStrip : 0) + (i.secondHitter ? gSecond : 0) + (i.wet ? gWet : 0) + (i.isPasser ? gPasser : 0),
  ));
  const recoveryProbability = (mode: 'fall' | 'scoop', zHands: number, othersInReach: number): number =>
    clampProbability(math.logistic(mode === 'fall' ? fallLogit + crowd * othersInReach : scoopLogit + scoopHands * zHands + crowd * othersInReach));
  const contestProbabilities = (contenders: readonly RecoveryContender[]): number[] => {
    let first = Infinity;
    for (const c of contenders) if (c.arrivalS < first) first = c.arrivalS;
    return CONTEST_MATH.outcomeProbabilities(contenders.map((c) => order * (c.arrivalS - first) + grade * c.zHands), math);
  };

  return {
    fumbleProbability,
    resolveFumble: (input, stream) => stream.uniform() < fumbleProbability(input),
    recoveryReachYd: () => reach,
    contestWindowS: () => windowS,
    recoveryProbability,
    resolveRecovery(mode, zHands, othersInReach, stream) {
      if (stream.uniform() < recoveryProbability(mode, zHands, othersInReach)) return 'recovered';
      return mode === 'scoop' ? 'kickedOn' : 'stillLoose';
    },
    contestProbabilities,
    resolveContest: (contenders, stream) => pickOutcome(contestProbabilities(contenders), stream.uniform()),
  };
}
