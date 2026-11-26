// J6.5 The catch point: reach test, uncontested catch, the contested softmax, a defender alone at
// the ball, feet in bounds and surviving the ground.
import type { DeterministicMath, RandomStream } from '@gm/schema';
import { CONTEST_MATH, clampProbability, pickOutcome, type ContestNum } from './math.ts';

/** Where the defender is relative to the receiver and the ball as it arrives (J6.5.1 step 3). */
export type DefenderPosition = 'inPhase' | 'undercut' | 'trail';

export interface UncontestedInputs {
  readonly zHands: number;
  /** Ball placement error relative to the catch radius: 0 on target, 1 at the edge of his reach. */
  readonly placementError: number;
  readonly hitAtCatch: boolean;
  readonly wet: boolean;
}

export interface ContestedInputs {
  readonly zContestedCatch: number;
  readonly zBallSkills: number;
  readonly position: DefenderPosition;
  /** The defender located the ball in the air (J3.5.1). */
  readonly ballLocated: boolean;
  readonly placementError: number;
  readonly hitAtCatch: boolean;
  readonly wet: boolean;
}
export type ContestedOutcome = 'catch' | 'breakup' | 'tip' | 'interception';

export interface FeetInputs {
  readonly zBodyControl: number;
  /** Rule value `catch.feet_required`. */
  readonly feetRequired: number;
  /** 0 with room to spare, 1 at the boundary itself. */
  readonly tightness: number;
}

export interface CatchPointContests {
  /** Step 1: catch radius in yards from the length and leaping z. */
  catchRadiusYd(zLengthAndLeaping: number, highBall: boolean): number;
  /** Whether the nearest defender's distance makes this a contested ball. */
  isContested(nearestDefenderYd: number): boolean;
  uncontestedCatchProbability(input: UncontestedInputs): number;
  /** One uniform. A failure is a drop. */
  resolveUncontested(input: UncontestedInputs, stream: RandomStream): 'catch' | 'drop';
  /** Probabilities of catch, breakup, interception, in that order. */
  contestedProbabilities(input: ContestedInputs): number[];
  /** Exactly two uniforms. A tip keeps the ball live in the air (J9) and nearby players re-enter at the reach test. */
  resolveContested(input: ContestedInputs, stream: RandomStream): ContestedOutcome;
  defenderAloneProbability(zHands: number): number;
  /** One uniform. */
  resolveDefenderAlone(zHands: number, stream: RandomStream): 'interception' | 'drop';
  feetInBoundsProbability(input: FeetInputs): number;
  /** One uniform. */
  resolveFeetInBounds(input: FeetInputs, stream: RandomStream): boolean;
  surviveGroundProbability(zHands: number, hitAtCatch: boolean): number;
  /** One uniform. For catches where the receiver is going to the ground. */
  resolveSurviveGround(zHands: number, hitAtCatch: boolean, stream: RandomStream): boolean;
}

export function createCatchPoint(n: ContestNum, math: DeterministicMath): CatchPointContests {
  const radius = n('catch.radiusYd'), radiusPerZ = n('catch.radiusPerZYd'), highBall = n('catch.highBallBonusYd');
  const uncontestedDist = n('catch.uncontestedDistYd');
  const b0 = n('catch.beta0'), gHands = n('catch.hands'), gPlace = n('catch.placement'), gHit = n('catch.hit'), gWet = n('catch.wet');
  const c0 = n('contested.catch0'), cDz = n('contested.catchDz'), cPlace = n('contested.catchPlacement'), cHit = n('contested.catchHit'), cWet = n('contested.catchWet');
  const bIn = n('contested.breakupInPhase'), bUnder = n('contested.breakupUndercut'), bTrail = n('contested.breakupTrail');
  const bBlind = n('contested.breakupBlind'), bDz = n('contested.breakupDz');
  const i0 = n('contested.int0'), iSkill = n('contested.intBallSkills'), iIn = n('contested.intInPhase'), iUnder = n('contested.intUndercut');
  const iTrail = n('contested.intTrail'), iBlind = n('contested.intBlind'), iPlace = n('contested.intPlacement');
  const tipShare = n('contested.tipShare');
  const a0 = n('alone.int0'), aHands = n('alone.intHands');
  const f0 = n('feet.beta0'), fBody = n('feet.bodyControl'), fExtra = n('feet.perExtraFoot'), fTight = n('feet.tightness');
  const g0 = n('ground.beta0'), gGroundHands = n('ground.hands'), gGroundHit = n('ground.hit');

  const uncontestedCatchProbability = (i: UncontestedInputs): number => clampProbability(math.logistic(
    b0 + gHands * i.zHands + gPlace * i.placementError + (i.hitAtCatch ? gHit : 0) + (i.wet ? gWet : 0),
  ));
  const contestedProbabilities = (i: ContestedInputs): number[] => {
    const dz = i.zContestedCatch - i.zBallSkills;
    const blind = i.ballLocated ? 0 : 1;
    const sCatch = c0 + cDz * dz + cPlace * i.placementError + (i.hitAtCatch ? cHit : 0) + (i.wet ? cWet : 0);
    const sBreakup = (i.position === 'inPhase' ? bIn : i.position === 'undercut' ? bUnder : bTrail) + bBlind * blind + bDz * dz;
    const sInt = i0 + iSkill * i.zBallSkills + (i.position === 'inPhase' ? iIn : i.position === 'undercut' ? iUnder : iTrail)
      + iBlind * blind + iPlace * i.placementError;
    return CONTEST_MATH.outcomeProbabilities([sCatch, sBreakup, sInt], math);
  };
  const defenderAloneProbability = (zHands: number): number => clampProbability(math.logistic(a0 + aHands * zHands));
  const feetInBoundsProbability = (i: FeetInputs): number => clampProbability(math.logistic(
    f0 + fBody * i.zBodyControl + fExtra * (i.feetRequired - 1) + fTight * i.tightness,
  ));
  const surviveGroundProbability = (zHands: number, hit: boolean): number =>
    clampProbability(math.logistic(g0 + gGroundHands * zHands + (hit ? gGroundHit : 0)));

  return {
    catchRadiusYd: (z, high) => radius + radiusPerZ * z + (high ? highBall : 0),
    isContested: (nearestDefenderYd) => nearestDefenderYd <= uncontestedDist,
    uncontestedCatchProbability,
    resolveUncontested: (input, stream) => (stream.uniform() < uncontestedCatchProbability(input) ? 'catch' : 'drop'),
    contestedProbabilities,
    resolveContested(input, stream) {
      const u1 = stream.uniform(), u2 = stream.uniform();
      const k = pickOutcome(contestedProbabilities(input), u1);
      if (k === 0) return 'catch';
      if (k === 2) return 'interception';
      return u2 < tipShare ? 'tip' : 'breakup';
    },
    defenderAloneProbability,
    resolveDefenderAlone: (zHands, stream) => (stream.uniform() < defenderAloneProbability(zHands) ? 'interception' : 'drop'),
    feetInBoundsProbability,
    resolveFeetInBounds: (input, stream) => stream.uniform() < feetInBoundsProbability(input),
    surviveGroundProbability,
    resolveSurviveGround: (zHands, hit, stream) => stream.uniform() < surviveGroundProbability(zHands, hit),
  };
}
