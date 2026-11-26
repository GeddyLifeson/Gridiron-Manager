// J6.3 Run blocking against run defense. Advantage A is positive when the blocker is winning.
import type { DeterministicMath, EngagementParams, RandomStream } from '@gm/schema';
import { clampProbability, speedFactor, type ContestNum } from './math.ts';

export type GapTechnique = 'oneGap' | 'twoGap';
/** -1 or +1: a side of the blocker along the line, in whatever lateral convention the caller uses. */
export type LineSide = -1 | 1;

export interface SpaceBlockInputs {
  /** Blocker's grade in space minus the defender's shedding and agility mix, both effective z. */
  readonly dz: number;
  /** 0 (bad angle) to 1 (square on the aiming point). */
  readonly angleQuality: number;
  /** Closing speed relative to a typical one, 0 = typical (J2.6). Faster closings are harder to land. */
  readonly closingSpeedExcess: number;
  /** A cut block, where the rule set allows it at this spot (B8). */
  readonly cut: boolean;
}
export interface SpaceBlockResult {
  /** `quickWin`: a made cut block that puts the defender on the ground at once. */
  readonly outcome: 'made' | 'quickWin' | 'missed';
  /** Starting advantage of the engagement that follows, or null when there is none. */
  readonly startAdvantage: number | null;
}

export interface RunBlockContests {
  engagement(technique: GapTechnique): EngagementParams;
  /** Speed at which the blocker moves the defender along the block's direction (J6.3.1). 0 when A is not positive. */
  displacementYps(advantage: number): number;
  /** `g(A)` for a defender held in a run block. */
  defenderSpeedFactor(advantage: number): number;
  /** A defender controls a gap when his body is in it and the blocker is not winning clearly (J6.3.1). */
  controlsGap(bodyInGap: boolean, advantage: number): boolean;
  /** At A = -1: the side the defender comes free on, and any delay before he can leave. */
  shed(technique: GapTechnique, assignedGapSide: LineSide, ballSide: LineSide): { readonly side: LineSide; readonly delayS: number };
  /** z added to the blocking side while two blockers are on one defender (J6.3.2). */
  comboZ(): number;
  /** The climb rule: the linebacker has committed to the blockers' side, or the double is winning. */
  comboShouldClimb(advantage: number, linebackerCommitted: boolean): boolean;
  /** Starting A after a slant or angle at the snap (J6.3.4 rules 2 and 3). */
  movementStart(direction: 'withFlow' | 'againstFlow'): number;
  spaceBlockProbability(input: SpaceBlockInputs): number;
  /** Exactly two uniforms. */
  resolveSpaceBlock(input: SpaceBlockInputs, stream: RandomStream): SpaceBlockResult;
}

export function createRunBlock(n: ContestNum, math: DeterministicMath): RunBlockContests {
  const kappa = n('runBlock.kappa'), lambda = n('runBlock.lambda'), sigma = n('runBlock.sigma');
  const oneGap: EngagementParams = { kappa, lambda, sigma: sigma * n('runBlock.sigmaOneGapMult') };
  const twoGap: EngagementParams = { kappa, lambda, sigma: sigma * n('runBlock.sigmaTwoGapMult') };
  const displacement = n('runBlock.displacementYps'), gapControlMaxA = n('runBlock.gapControlMaxA');
  const twoGapDelay = n('runBlock.twoGapShedDelayS'), gEven = n('runBlock.gEven'), gWinning = n('runBlock.gWinning');
  const comboZ = n('combo.doubleZ'), climbA = n('combo.climbA');
  const madeStart = n('space.madeStart'), b0 = n('space.beta0'), b1 = n('space.beta1');
  const gAngle = n('space.angle'), gClosing = n('space.closing'), gCut = n('space.cut'), cutQuick = n('space.cutQuickWinShare');
  const withFlow = n('movement.withFlowStart'), againstFlow = n('movement.againstFlowStart');

  const spaceBlockProbability = (i: SpaceBlockInputs): number => clampProbability(math.logistic(
    b0 + b1 * i.dz + gAngle * i.angleQuality + gClosing * i.closingSpeedExcess + (i.cut ? gCut : 0),
  ));

  return {
    engagement: (technique) => (technique === 'oneGap' ? oneGap : twoGap),
    displacementYps: (advantage) => (advantage > 0 ? displacement * (advantage > 1 ? 1 : advantage) : 0),
    defenderSpeedFactor: (advantage) => speedFactor(advantage, 1, gEven, gWinning),
    controlsGap: (bodyInGap, advantage) => bodyInGap && advantage < gapControlMaxA,
    shed: (technique, assignedGapSide, ballSide) => (technique === 'oneGap'
      ? { side: assignedGapSide, delayS: 0 }
      : { side: ballSide, delayS: twoGapDelay }),
    comboZ: () => comboZ,
    comboShouldClimb: (advantage, linebackerCommitted) => linebackerCommitted || advantage > climbA,
    movementStart: (direction) => (direction === 'withFlow' ? withFlow : againstFlow),
    spaceBlockProbability,
    resolveSpaceBlock(input, stream) {
      const u1 = stream.uniform(), u2 = stream.uniform();
      if (u1 >= spaceBlockProbability(input)) return { outcome: 'missed', startAdvantage: null };
      if (input.cut && u2 < cutQuick) return { outcome: 'quickWin', startAdvantage: null };
      return { outcome: 'made', startAdvantage: madeStart };
    },
  };
}
